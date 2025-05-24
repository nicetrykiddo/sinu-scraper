(() => {
  console.log("popup loaded");
  function displayContacts(validEmails, validPhones) {
    const emailListElement = document.getElementById("email-list");
    const phoneListElement = document.getElementById("phone-list");

    emailListElement.innerHTML = "";
    phoneListElement.innerHTML = "";

    const emailHeader = document.querySelector("h2:first-of-type");
    if (emailHeader) {
      const emailCount = validEmails ? validEmails.length : 0;
      emailHeader.innerHTML = `Email Addresses <span class="count">${emailCount}</span>`;
    }

    const phoneHeader = document.querySelector("h2:last-of-type");
    if (phoneHeader) {
      const phoneCount = validPhones ? validPhones.length : 0;
      phoneHeader.innerHTML = `Phone Numbers <span class="count">${phoneCount}</span>`;
    }

    if (validEmails && validEmails.length > 0) {
      validEmails.forEach((email) => {
        const li = document.createElement("li");
        li.textContent = email;
        li.title = `:D`;
        li.addEventListener("click", () => copyToClipboard(email));
        emailListElement.appendChild(li);
      });
    } else {
      const li = document.createElement("li");
      li.textContent = "No emails found on this page";
      li.className = "no-contacts";
      emailListElement.appendChild(li);
    }

    if (validPhones && validPhones.length > 0) {
      validPhones.forEach((phone) => {
        const li = document.createElement("li");
        li.textContent = phone;
        li.title = `:)`;
        li.addEventListener("click", () => copyToClipboard(phone));
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
      const [activeTab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      if (!activeTab) {
        console.log("No active tab found");
        return { emails: [], phones: [] };
      }

      const response = await chrome.runtime.sendMessage({
        action: "getValidatedContacts",
        tabId: activeTab.id,
      });

      return response || { emails: [], phones: [] };
    } catch (error) {
      console.error("Error getting validated contacts:", error);
      return { emails: [], phones: [] };
    }
  }

  async function refreshContacts() {
    const contacts = await getCurrentTabContacts();
    displayContacts(contacts.emails, contacts.phones);
  }

  async function init() {
    await refreshContacts();

    setInterval(refreshContacts, 2000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
