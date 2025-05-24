(() => {
  let cachedContacts = null;
  let currentTabId = null;

  function displayContacts(emails, phones) {
    const emailListElement = document.getElementById("email-list");
    const phoneListElement = document.getElementById("phone-list");

    if (!emailListElement || !phoneListElement) {
      console.error("Required DOM elements not found");
      return;
    }

    emailListElement.innerHTML = "";
    phoneListElement.innerHTML = "";
    const emailHeader = document.querySelector("h2:first-of-type");
    if (emailHeader) {
      const emailCount = Array.isArray(emails) ? emails.length : 0;
      // Use textContent for safety, then add count span
      emailHeader.textContent = "Email Addresses ";
      const countSpan = document.createElement("span");
      countSpan.className = "count";
      countSpan.textContent = String(emailCount);
      emailHeader.appendChild(countSpan);
    }

    const phoneHeader = document.querySelector("h2:last-of-type");
    if (phoneHeader) {
      const phoneCount = Array.isArray(phones) ? phones.length : 0;
      // Use textContent for safety, then add count span
      phoneHeader.textContent = "Phone Numbers ";
      const countSpan = document.createElement("span");
      countSpan.className = "count";
      countSpan.textContent = String(phoneCount);
      phoneHeader.appendChild(countSpan);
    }

    if (Array.isArray(emails) && emails.length > 0) {
      emails.forEach((email) => {
        const li = document.createElement("li");
        li.textContent = String(email);
        li.addEventListener("click", () => copyToClipboard(String(email)));
        emailListElement.appendChild(li);
      });
    } else {
      const li = document.createElement("li");
      li.textContent = "No emails found on this page";
      li.className = "no-contacts";
      emailListElement.appendChild(li);
    }

    if (Array.isArray(phones) && phones.length > 0) {
      phones.forEach((phone) => {
        const li = document.createElement("li");
        li.textContent = String(phone);
        li.addEventListener("click", () => copyToClipboard(String(phone)));
        phoneListElement.appendChild(li);
      });
    } else {
      const li = document.createElement("li");
      li.textContent = "No phone numbers found on this page";
      li.className = "no-contacts";
      phoneListElement.appendChild(li);
    }
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      showToast(`Copied: ${text}`);
    } catch (error) {
      console.error("Failed to copy to clipboard:", error);
      showToast("Failed to copy to clipboard");
    }
  }

  function showToast(message) {
    const existingToast = document.querySelector(".toast");
    if (existingToast) {
      existingToast.remove();
    }

    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => toast.classList.add("show"), 100);

    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  }
  async function getCurrentTabContacts() {
    try {
      if (cachedContacts && currentTabId) {
        return cachedContacts;
      }

      const tabs = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!tabs || tabs.length === 0) {
        return { emails: [], phones: [] };
      }

      const tabId = tabs[0].id;
      if (currentTabId !== tabId) {
        cachedContacts = null;
        currentTabId = tabId;
      }

      if (cachedContacts) {
        return cachedContacts;
      }

      const response = await chrome.runtime.sendMessage({
        action: "getValidatedContacts",
      });

      const result = response || {};
      cachedContacts = {
        emails: Array.isArray(result.emails) ? result.emails : [],
        phones: Array.isArray(result.phones) ? result.phones : [],
      };

      return cachedContacts;
    } catch (error) {
      console.error("Error getting validated contacts from background:", error);
      if (error.message.includes("Receiving end does not exist")) {
        showToast(
          "Extension service is initializing. Please try again shortly."
        );
      }
      return { emails: [], phones: [] };
    }
  }
  async function refreshContacts() {
    cachedContacts = null;
    const contacts = await getCurrentTabContacts();
    displayContacts(contacts.emails, contacts.phones);
  }
  async function init() {
    await refreshContacts();
  }
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === "local") {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (chrome.runtime.lastError) {
          console.error(
            "Error querying tabs:",
            chrome.runtime.lastError.message
          );
          return;
        }
        if (tabs && tabs.length > 0) {
          const activeTabId = tabs[0].id;
          if (changes[`contacts_${activeTabId}`]) {
            cachedContacts = null;
            refreshContacts();
          }
        }
      });
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
