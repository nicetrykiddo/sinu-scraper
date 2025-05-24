import { validate } from "./validate.js";

const EMAIL_REGEX =
  /(?:[-!#-'*+\/-9=?A-Z^-~]+(?:\.[-!#-'*+\/-9=?A-Z^-~]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+[A-Z]{2,63}|\[(?:(?:IPv6:[A-F0-9:.]+)|(?:\d{1,3}\.){3}\d{1,3})\])/gi;
const TEL_REGEX = /<a[^>]+href=["']tel:([^"']+)["'][^>]*>/gi;
const IND_REGEX = /(?:\+91|91|0)[\s-]?[6-9]\d{9}/g;

const validationCache = new Map();
const tabScanState = new Map(); // stores scan state for each tab { scanning: false, pendingScan: false }

async function getCachedValidation(item, type) {
  const cacheKey = `${type}:${item}`;
  if (validationCache.has(cacheKey)) {
    return validationCache.get(cacheKey);
  }

  try {
    const result = await validate(item, type);
    validationCache.set(cacheKey, result);
    return result;
  } catch (error) {
    console.error(`${type} validation error for ${item}:`, error);
    return null;
  }
}

async function injectNotification(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => !!window.notificationSystem,
    });
    if (results && results[0] && results[0].result) {
      return;
    }
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content-scripts/notifications.js"],
    });
  } catch (error) {
    if (
      error.message.includes("Cannot access a chrome:// URL") ||
      error.message.includes("Cannot access a chrome-extension:// URL")
    ) {
    } else if (error.message.includes("No tab with id")) {
    } else {
      console.error(
        `Failed to inject notification script in tab ${tabId}:`,
        error
      );
    }
  }
}

async function getPageContent(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => document.body.innerHTML,
    });
    return results?.[0]?.result;
  } catch (error) {
    console.error("Error getting page content:", error);
    return null;
  }
}

function getEmails(pageContent) {
  const rgxmails = pageContent.match(EMAIL_REGEX) || [];

  const mailtoMatches =
    pageContent.match(/href=["']mailto:([^"']+)["']/gi) || [];
  const mailto = mailtoMatches.map((match) =>
    match.replace(/href=["']mailto:/, "").replace(/["']$/, "")
  );

  return [[...new Set(mailto)], [...new Set(rgxmails)]];
}

function getPhones(pageContent) {
  const indNums = pageContent.match(IND_REGEX) || [];
  const telNums = [...pageContent.matchAll(TEL_REGEX)].map((m) => m[1].trim());
  return [[...new Set(telNums)], [...new Set(indNums)]];
}

async function scanPage(tabId, isMutationScan = false) {
  if (!tabId) {
    return;
  }

  let currentScanState = tabScanState.get(tabId) || {
    scanning: false,
    pendingScan: false,
  };

  if (currentScanState.scanning) {
    currentScanState.pendingScan = true;
    tabScanState.set(tabId, currentScanState);
    return;
  }

  currentScanState.scanning = true;
  tabScanState.set(tabId, currentScanState);

  try {
    await injectNotification(tabId);

    const pageContent = await getPageContent(tabId);
    if (!pageContent) {
      return;
    }

    const [mailtoEmails, regexEmails] = getEmails(pageContent);
    const [telPhones, indPhones] = getPhones(pageContent);
    const allEmails = [...new Set([...mailtoEmails, ...regexEmails])];
    const allPhones = [...new Set([...telPhones, ...indPhones])];

    const validatedEmailsFromDOM = [];
    const validatedPhonesFromDOM = [];

    const validateAndNotify = async (item, type) => {
      const validationResult = await getCachedValidation(item, type);
      if (
        (type === "email" &&
          validationResult?.Items?.[0]?.ResponseCode === "Valid") ||
        (type === "phone" && validationResult?.Items?.[0]?.IsValid === "Yes")
      ) {
        if (type === "email") {
          validatedEmailsFromDOM.push(item);
        } else {
          validatedPhonesFromDOM.push(item);
        }

        try {
          chrome.tabs.sendMessage(tabId, {
            action: "showValidatedContacts",
            emails: type === "email" ? [item] : [],
            phones: type === "phone" ? [item] : [],
          });
        } catch (error) {
          console.error(
            `Error sending immediate notification for ${item}:`,
            error
          );
        }
      }
    };

    const validationPromises = [
      ...allEmails.map((email) => validateAndNotify(email, "email")),
      ...allPhones.map((phone) => validateAndNotify(phone, "phone")),
    ];

    await Promise.all(validationPromises);
    if (
      validatedEmailsFromDOM.length > 0 ||
      validatedPhonesFromDOM.length > 0
    ) {
      const storedContacts = await chrome.storage.local.get([
        `contacts_${tabId}`,
      ]);
      const existingContacts = storedContacts[`contacts_${tabId}`] || {
        emails: [],
        phones: [],
      };

      const updatedEmails = [
        ...new Set([...existingContacts.emails, ...validatedEmailsFromDOM]),
      ];
      const updatedPhones = [
        ...new Set([...existingContacts.phones, ...validatedPhonesFromDOM]),
      ];

      await chrome.storage.local.set({
        [`contacts_${tabId}`]: {
          emails: updatedEmails,
          phones: updatedPhones,
        },
      });
    }
  } catch (error) {
    console.error(`Error scanning page for tab ${tabId}:`, error);
  } finally {
    currentScanState = tabScanState.get(tabId) || {
      scanning: false,
      pendingScan: false,
    };
    currentScanState.scanning = false;
    if (currentScanState.pendingScan) {
      currentScanState.pendingScan = false;
      tabScanState.set(tabId, currentScanState);
      scanPage(tabId, true);
    }
    tabScanState.set(tabId, currentScanState);
  }
}

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (
    changeInfo.status === "complete" &&
    tab.url &&
    !tab.url.startsWith("chrome://") &&
    !tab.url.startsWith("chrome-extension://")
  ) {
    await scanPage(tabId);
  } else if (changeInfo.status === "loading") {
    tabScanState.delete(tabId);
  }
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (
      tab.url &&
      !tab.url.startsWith("chrome://") &&
      !tab.url.startsWith("chrome-extension://")
    ) {
      await scanPage(activeInfo.tabId);
    }
  } catch (error) {
    console.error("Error in onActivated listener:", error);
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  if (tabScanState.has(tabId)) {
    tabScanState.delete(tabId);
  }
  await chrome.storage.local.remove([`contacts_${tabId}`]);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "getValidatedContacts") {
    if (sender.tab && sender.tab.id) {
      chrome.storage.local.get([`contacts_${sender.tab.id}`], (result) => {
        if (chrome.runtime.lastError) {
          console.error(
            "Error retrieving contacts from storage:",
            chrome.runtime.lastError.message
          );
          sendResponse({ emails: [], phones: [] });
          return;
        }
        const contacts = result[`contacts_${sender.tab.id}`] || {
          emails: [],
          phones: [],
        };
        sendResponse(contacts);
      });
    } else {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs.length > 0 && tabs[0].id) {
          chrome.storage.local.get([`contacts_${tabs[0].id}`], (result) => {
            if (chrome.runtime.lastError) {
              console.error(
                "Error retrieving contacts for active tab:",
                chrome.runtime.lastError.message
              );
              sendResponse({ emails: [], phones: [] });
              return;
            }
            const contacts = result[`contacts_${tabs[0].id}`] || {
              emails: [],
              phones: [],
            };
            sendResponse(contacts);
          });
        } else {
          console.warn(
            "Background: Could not determine active tab for getValidatedContacts."
          );
          sendResponse({ emails: [], phones: [] });
        }
      });
    }
    return true;
  } else if (message.action === "domMutationObserved") {
    if (sender.tab && sender.tab.id) {
      scanPage(sender.tab.id, true);
    }
    sendResponse({ status: "Mutation received" });
    return true;
  }
  return false;
});
