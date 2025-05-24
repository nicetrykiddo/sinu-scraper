import { validate } from "./validate.js";

const EMAIL_REGEX =
  /(?:[-!#-'*+\/-9=?A-Z^-~]+(?:\.[-!#-'*+\/-9=?A-Z^-~]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+[A-Z]{2,63}|\[(?:(?:IPv6:[A-F0-9:.]+)|(?:\d{1,3}\.){3}\d{1,3})\])/gi;
const MAILTO_REGEX = /^mailto:/i;
const TEL_REGEX = /<a[^>]+href=["']tel:([^"']+)["'][^>]*>/gi;
const IND_REGEX = /(?:\+91|91|0)[\s-]?[6-9]\d{9}/g;

const validationCache = new Map();
const tabValidatedContacts = new Map();

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

async function injectNotificationSystem(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content-scripts/notifications.js"],
    });
  } catch (error) {
    console.error("Error injecting notification system:", error);
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

async function scanPage(tabId) {
  try {
    console.log(`Scanning page for tab ${tabId}`);
    const content = await getPageContent(tabId);
    if (!content) {
      console.log(`No content found for tab ${tabId}`);
      return;
    }

    if (!tabValidatedContacts.has(tabId)) {
      tabValidatedContacts.set(tabId, { emails: new Set(), phones: new Set() });
    }
    const tabContacts = tabValidatedContacts.get(tabId);

    const [autoEmails, regexEmails] = getEmails(content);
    const [autoPhones, regexPhones] = getPhones(content);

    const allEmails = [...new Set([...autoEmails, ...regexEmails])];
    const allPhones = [...new Set([...autoPhones, ...regexPhones])];

    const newEmails = allEmails.filter(
      (email) => !tabContacts.emails.has(email)
    );
    const newPhones = allPhones.filter(
      (phone) => !tabContacts.phones.has(phone)
    );

    if (newEmails.length === 0 && newPhones.length === 0) {
      console.log("No new contacts found");
      return;
    }

    console.log(`New emails to validate: ${newEmails}`);
    console.log(`New phones to validate: ${newPhones}`);

    const validatedEmails = [];
    const validatedPhones = [];

    for (const email of newEmails) {
      try {
        if (autoEmails.includes(email)) {
          validatedEmails.push(email);
          tabContacts.emails.add(email);
          console.log(`Auto-validated email: ${email}`);
        } else {
          console.log(`Validating email: ${email}`);
          const result = await getCachedValidation(email, "email");
          if (result?.Items?.[0]?.ResponseCode === "Valid") {
            const validEmail = result.Items[0].EmailAddress;
            validatedEmails.push(validEmail);
            tabContacts.emails.add(validEmail);
            console.log(`Validated email: ${validEmail}`);
          } else {
            console.log(`Email validation failed for: ${email}`);
          }
        }
      } catch (error) {
        console.error(`Error validating email ${email}:`, error);
      }
    }

    for (const phone of newPhones) {
      try {
        if (autoPhones.includes(phone)) {
          validatedPhones.push(phone);
          tabContacts.phones.add(phone);
          console.log(`Auto-validated phone: ${phone}`);
        } else {
          console.log(`Validating phone: ${phone}`);
          const result = await getCachedValidation(phone, "phone");
          if (result?.Items?.[0]?.IsValid === "Yes") {
            const validPhone = result.Items[0].PhoneNumber;
            validatedPhones.push(validPhone);
            tabContacts.phones.add(validPhone);
            console.log(`Validated phone: ${validPhone}`);
          } else {
            console.log(`Phone validation failed for: ${phone}`);
          }
        }
      } catch (error) {
        console.error(`Error validating phone ${phone}:`, error);
      }
    }

    console.log(`Final validated emails: ${validatedEmails}`);
    console.log(`Final validated phones: ${validatedPhones}`);

    if (validatedEmails.length > 0 || validatedPhones.length > 0) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          func: (emails, phones) => {
            if (window.notificationSystem) {
              console.log("Showing notifications for:", { emails, phones });
              window.notificationSystem.showValidated(emails, phones);
            } else {
              console.log("Notification system not found");
            }
          },
          args: [validatedEmails, validatedPhones],
        });
      } catch (error) {
        console.error("Error showing notifications:", error);
      }
    } else {
      console.log("No validated contacts to show notifications for");
    }
  } catch (error) {
    console.error(`Error scanning page for tab ${tabId}:`, error);
  }
}

const activeTabScans = new Map();

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (
    changeInfo.status === "complete" &&
    tab.url &&
    !tab.url.startsWith("chrome://") &&
    !tab.url.startsWith("chrome-extension://")
  ) {
    console.log(`Tab updated: ${tab.url}`);

    try {
      if (activeTabScans.has(tabId)) {
        clearInterval(activeTabScans.get(tabId));
      }

      await injectNotificationSystem(tabId);

      setTimeout(() => scanPage(tabId), 1000);

      const intervalId = setInterval(() => scanPage(tabId), 5000);
      activeTabScans.set(tabId, intervalId);
    } catch (error) {
      console.error(`Error setting up tab monitoring for ${tabId}:`, error);
    }
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
      console.log(`Tab activated: ${tab.url}`);
      await injectNotificationSystem(activeInfo.tabId);
      setTimeout(() => scanPage(activeInfo.tabId), 500);
    }
  } catch (error) {
    console.error(
      `Error handling tab activation for ${activeInfo.tabId}:`,
      error
    );
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (activeTabScans.has(tabId)) {
    clearInterval(activeTabScans.get(tabId));
    activeTabScans.delete(tabId);
  }
  if (tabValidatedContacts.has(tabId)) {
    tabValidatedContacts.delete(tabId);
  }
});

// Message handler for popup requests
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "getValidatedContacts") {
    const tabId = message.tabId;
    const tabContacts = tabValidatedContacts.get(tabId);

    if (tabContacts) {
      sendResponse({
        emails: Array.from(tabContacts.emails),
        phones: Array.from(tabContacts.phones),
      });
    } else {
      sendResponse({ emails: [], phones: [] });
    }

    return true; // Keep the message channel open for async response
  }
});
