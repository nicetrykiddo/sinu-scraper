import { validate } from "./validate.js";

const EMAIL_REGEX =
  /(?:[-!#-'*+\/-9=?A-Z^-~]+(?:\.[-!#-'*+\/-9=?A-Z^-~]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+[A-Z]{2,63}|\[(?:(?:IPv6:[A-F0-9:.]+)|(?:\d{1,3}\.){3}\d{1,3})\])/gi;
const TEL_REGEX = /<a[^>]+href=["']tel:([^"']+)["'][^>]*>/gi;
const IND_REGEX = /(?:\+91|91|0)[\s-]?[6-9]\d{9}/g;

const validCache = new Map();
const tabState = new Map();

async function getCacheValid(item, type) {
  const key = `${type}:${item}`;
  if (validCache.has(key)) {
    return validCache.get(key);
  }
  try {
    const res = await validate(item, type);
    validCache.set(key, res);
    return res;
  } catch (e) {
    return null;
  }
}

async function injectNotify(tabId) {
  try {
    const res = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => !!window.notificationSystem,
    });
    if (res && res[0] && res[0].result) return;
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content-scripts/notifications.js"],
    });
  } catch (e) { }
}

async function injectNav(tabId) {
  try {
    const res = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => window.navHelper instanceof Object,
    });
    if (res && res[0] && res[0].result) return true;
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content-scripts/navigate.js"],
    });
    return true;
  } catch (e) {
    return false;
  }
}

async function getPage(tabId) {
  try {
    const res = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => document.body.innerHTML,
    });
    return res?.[0]?.result;
  } catch (e) {
    return null;
  }
}

function getEmails(content) {
  const emails = content.match(EMAIL_REGEX) || [];
  const mailto = (content.match(/href=["']mailto:([^"']+)["']/gi) || []).map(
    (m) => m.replace(/href=["']mailto:/, "").replace(/["']$/, "")
  );
  return [[...new Set(mailto)], [...new Set(emails)]];
}

function getPhones(content) {
  const indNums = content.match(IND_REGEX) || [];
  const telNums = [...content.matchAll(TEL_REGEX)].map((m) => m[1].trim());
  return [[...new Set(telNums)], [...new Set(indNums)]];
}

async function scan(tabId, isMut = false) {
  if (!tabId) return;

  let state = tabState.get(tabId) || { scan: false, pending: false };
  if (state.scan) {
    state.pending = true;
    tabState.set(tabId, state);
    return;
  }
  state.scan = true;
  tabState.set(tabId, state);

  try {
    await injectNotify(tabId);
    await injectNav(tabId);
    const content = await getPage(tabId);
    if (!content) return;

    const [mailtoEmails, regexEmails] = getEmails(content);
    const [telPhones, indPhones] = getPhones(content);
    const allEmails = [...new Set([...mailtoEmails, ...regexEmails])];
    const allPhones = [...new Set([...telPhones, ...indPhones])];
    const validEmails = [];
    const validPhones = [];

    const validateAndNotify = async (item, type) => {
      const res = await getCacheValid(item, type);
      if (
        (type === "email" && res?.Items?.[0]?.ResponseCode === "Valid") ||
        (type === "phone" && res?.Items?.[0]?.IsValid === "Yes")
      ) {
        if (type === "email") validEmails.push(item);
        else validPhones.push(item);
        try {
          chrome.tabs.sendMessage(tabId, {
            action: "showValidatedContacts",
            emails: type === "email" ? [item] : [],
            phones: type === "phone" ? [item] : [],
          });
        } catch (e) { }
      }
    };

    const promises = [
      ...allEmails.map((email) => validateAndNotify(email, "email")),
      ...allPhones.map((phone) => validateAndNotify(phone, "phone")),
    ];
    await Promise.all(promises);

    if (validEmails.length > 0 || validPhones.length > 0) {
      const stored = await chrome.storage.local.get([`contacts_${tabId}`]);
      const existing = stored[`contacts_${tabId}`] || {
        emails: [],
        phones: [],
      };
      const updatedEmails = [...new Set([...existing.emails, ...validEmails])];
      const updatedPhones = [...new Set([...existing.phones, ...validPhones])];
      await chrome.storage.local.set({
        [`contacts_${tabId}`]: { emails: updatedEmails, phones: updatedPhones },
      });
    }
  } catch (e) {
  } finally {
    state = tabState.get(tabId) || { scan: false, pending: false };
    state.scan = false;
    if (state.pending) {
      state.pending = false;
      tabState.set(tabId, state);
      scan(tabId, true);
    }
    tabState.set(tabId, state);
  }
}

chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (
    info.status === "complete" &&
    tab.url &&
    !tab.url.startsWith("chrome://") &&
    !tab.url.startsWith("chrome-extension://")
  ) {
    await scan(tabId);
  } else if (info.status === "loading") {
    tabState.delete(tabId);
  }
});

chrome.tabs.onActivated.addListener(async (active) => {
  try {
    const tab = await chrome.tabs.get(active.tabId);
    if (
      tab.url &&
      !tab.url.startsWith("chrome://") &&
      !tab.url.startsWith("chrome-extension://")
    ) {
      await scan(active.tabId);
    }
  } catch (e) { }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  if (tabState.has(tabId)) tabState.delete(tabId);
  await chrome.storage.local.remove([
    `contacts_${tabId}`,
    `contactLinks_${tabId}`,
  ]);
});

chrome.runtime.onMessage.addListener((msg, sender, sendRes) => {
  if (msg.action === "getValidatedContacts") {
    const id = sender.tab?.id;
    if (id) {
      chrome.storage.local.get([`contacts_${id}`], (res) => {
        if (chrome.runtime.lastError) {
          sendRes({ emails: [], phones: [] });
          return;
        }
        sendRes(res[`contacts_${id}`] || { emails: [], phones: [] });
      });
    } else {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs.length > 0 && tabs[0].id) {
          chrome.storage.local.get([`contacts_${tabs[0].id}`], (res) => {
            if (chrome.runtime.lastError) {
              sendRes({ emails: [], phones: [] });
              return;
            }
            sendRes(
              res[`contacts_${tabs[0].id}`] || { emails: [], phones: [] }
            );
          });
        } else {
          sendRes({ emails: [], phones: [] });
        }
      });
    }
    return true;
  } else if (msg.action === "domMutationObserved") {
    if (sender.tab?.id) {
      // Check server status when mutation is observed
      fetch('http://localhost:3000/start')
        .then(response => response.json())
        .then(data => {
          if (data.status === 'success') {
            scan(sender.tab.id, true);
          }
        })
        .catch(error => {
          console.error('Server status check failed:', error);
        });
    }
    sendRes({ status: "Mutation received" });
    return true;
  } else if (msg.action === "storeContactLinks") {
    if (sender.tab?.id && msg.links) {
      const key = `contactLinks_${sender.tab.id}`;
      const data = {
        links: msg.links,
        url: msg.currentUrl,
        timestamp: new Date().toISOString(),
      };
      chrome.storage.local.set({ [key]: data }, () => {
        if (chrome.runtime.lastError)
          sendRes({ success: false, error: chrome.runtime.lastError.message });
        else sendRes({ success: true });
      });
    } else {
      sendRes({ success: false, error: "Invalid message payload" });
    }
    return true;
  } else if (msg.action === "saveToDashboard") {
    if (msg.data && msg.data.type && msg.data.value && msg.data.sourceUrl) {
      // Add website metadata
      const contactData = {
        ...msg.data,
        website: {
          url: msg.data.sourceUrl,
          title: sender.tab?.title || '',
          favicon: sender.tab?.favIconUrl || ''
        }
      };

      // Save to MongoDB via API
      fetch('http://localhost:3000/rest/api/contacts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(contactData)
      })
        .then(response => response.json())
        .then(data => {
          if (data.success) {
            sendRes({ success: true, data: data.data });
          } else {
            sendRes({ success: false, error: data.error || 'Failed to save contact' });
          }
        })
        .catch(error => {
          console.error('Error saving to MongoDB:', error);
          sendRes({ success: false, error: error.message });
        });
    } else {
      sendRes({ success: false, error: "Invalid contact data" });
    }
    return true;
  } else if (msg.action === "getSavedContacts") {
    const type = msg.type; // Optional type filter
    const url = type
      ? `http://localhost:3000/rest/api/contacts/${type}`
      : 'http://localhost:3000/rest/api/contacts';

    fetch(url)
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          sendRes({ success: true, data: data.data });
        } else {
          sendRes({ success: false, error: data.error });
        }
      })
      .catch(error => {
        console.error('Error fetching contacts:', error);
        sendRes({ success: false, error: error.message });
      });
    return true;
  }
  return false;
});
