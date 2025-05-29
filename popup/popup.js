(() => {
  let cache = null;
  let tabId = null;

  function display(emails, phones, links) {
    // elements
    const emailEl = document.getElementById("email-list");
    const phoneEl = document.getElementById("phone-list");
    const linkEl = document.getElementById("link-list");

    if (!emailEl || !phoneEl || !linkEl) return;

    emailEl.innerHTML = "";
    phoneEl.innerHTML = "";
    linkEl.innerHTML = "";

    const emailH = document.querySelector("h2:nth-of-type(1)");
    if (emailH) {
      const count = emailH.querySelector(".count");
      if (count) count.textContent = Array.isArray(emails) ? emails.length : 0;
    }
    if (Array.isArray(emails) && emails.length > 0) {
      emails.forEach((email) => {
        const li = document.createElement("li");
        li.textContent = email;
        li.addEventListener("click", () => copy(email, "Email"));
        emailEl.appendChild(li);
      });
    } else {
      emailEl.appendChild(noDataLi("No emails found"));
    }

    const phoneH = document.querySelector("h2:nth-of-type(2)");
    if (phoneH) {
      const count = phoneH.querySelector(".count");
      if (count) count.textContent = Array.isArray(phones) ? phones.length : 0;
    }
    if (Array.isArray(phones) && phones.length > 0) {
      phones.forEach((phone) => {
        const li = document.createElement("li");
        li.textContent = phone;
        li.addEventListener("click", () => copy(phone, "Phone"));
        phoneEl.appendChild(li);
      });
    } else {
      phoneEl.appendChild(noDataLi("No phone numbers found"));
    }

    const linkH = document.querySelector("h2:nth-of-type(3)");
    const linkCount = document.getElementById("link-count");

    if (linkH) {
      const count = linkH.querySelector(".count");
      if (count) count.textContent = Array.isArray(links) ? links.length : 0;
    }
    if (linkCount) {
      linkCount.textContent = `Found ${Array.isArray(links) ? links.length : 0
        } links`;
    }

    if (Array.isArray(links) && links.length > 0) {
      links.forEach((lnk) => {
        const li = document.createElement("li");
        const a = document.createElement("a");
        a.href = lnk.url;
        a.textContent = lnk.text || lnk.url;
        a.title = `URL: ${lnk.url}\nKeywords: ${lnk.matchedKeywords.join(
          ", "
        )}`;
        a.target = "_blank";
        li.appendChild(a);
        linkEl.appendChild(li);
      });
    } else {
      linkEl.appendChild(noDataLi("No contact links found"));
    }
  }

  function noDataLi(txt) {
    const li = document.createElement("li");
    li.textContent = txt;
    li.className = "no-contacts";
    return li;
  }

  async function copy(txt, type = "Text") {
    try {
      await navigator.clipboard.writeText(txt);
      toast(`${type} copied: ${txt}`);
    } catch (e) {
      toast("Failed to copy");
    }
  }

  function toast(msg) {
    const oldToast = document.querySelector(".toast");
    if (oldToast) oldToast.remove();

    const el = document.createElement("div");
    el.className = "toast show";
    el.textContent = msg;
    document.body.appendChild(el);

    setTimeout(() => {
      el.classList.remove("show");
      setTimeout(() => el.remove(), 300);
    }, 2000);
  }

  async function getData() {
    try {
      const tabs = await new Promise((res) =>
        chrome.tabs.query({ active: true, currentWindow: true }, res)
      );
      if (!tabs || tabs.length === 0 || !tabs[0].id)
        return { emails: [], phones: [], links: [] };
      tabId = tabs[0].id;

      const contacts = await new Promise((res) => {
        chrome.runtime.sendMessage(
          { action: "getValidatedContacts" },
          (resp) => {
            if (chrome.runtime.lastError) res({ emails: [], phones: [] });
            else res(resp || { emails: [], phones: [] });
          }
        );
      });

      const linkKey = `contactLinks_${tabId}`;
      const linkStore = await new Promise((res) => {
        chrome.storage.local.get(linkKey, (result) => {
          if (chrome.runtime.lastError) res({});
          else res(result);
        });
      });

      const links = linkStore[linkKey]?.links || [];
      cache = {
        emails: contacts.emails || [],
        phones: contacts.phones || [],
        links,
      };
      return cache;
    } catch (e) {
      return { emails: [], phones: [], links: [] };
    }
  }

  async function refresh() {
    const data = await getData();
    display(data.emails, data.phones, data.links);
  }

  async function saveToDashboard() {
    if (!cache || !tabId) {
      console.error('Cannot save: cache or tabId is missing', { cache, tabId });
      return;
    }

    const saveBtn = document.getElementById('save-to-dashboard');
    if (!saveBtn) {
      console.error('Save button not found in DOM');
      return;
    }

    try {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';
      saveBtn.classList.add('saving');

      // Get current tab info
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tabs || tabs.length === 0) {
        throw new Error('No active tab found');
      }
      const currentTab = tabs[0];
      console.log('Current tab info:', currentTab);

      // Prepare data according to new schema
      const contactData = {
        sourceUrl: currentTab.url,
        phone: cache.phones || [],
        email: cache.emails || [],
        otherLinks: cache.links || []
      };

      console.log('Sending data to save:', contactData);

      // Save to dashboard
      const response = await chrome.runtime.sendMessage({
        action: 'saveToDashboard',
        data: contactData
      });

      console.log('Save response:', response);

      if (response.success) {
        saveBtn.textContent = 'Saved!';
        saveBtn.classList.remove('saving');
        saveBtn.classList.add('saved');
        toast('All contacts saved successfully');
      } else {
        const errorMessage = response.error || 'Failed to save contacts';
        console.error('Save failed:', errorMessage);
        saveBtn.textContent = 'Save Failed';
        saveBtn.classList.remove('saving');
        saveBtn.classList.add('error');
        toast(errorMessage);
      }

      // Reset button after 2 seconds
      setTimeout(() => {
        saveBtn.textContent = 'Save to Dashboard';
        saveBtn.classList.remove('saved', 'error');
        saveBtn.disabled = false;
      }, 2000);

    } catch (error) {
      console.error('Error in saveToDashboard:', error);
      saveBtn.textContent = 'Save Failed';
      saveBtn.classList.remove('saving');
      saveBtn.classList.add('error');
      toast(error.message || 'Failed to save contacts');

      setTimeout(() => {
        saveBtn.textContent = 'Save to Dashboard';
        saveBtn.classList.remove('error');
        saveBtn.disabled = false;
      }, 2000);
    }
  }

  function initPopup() {
    refresh();
    setupToggle();

    // Setup save to dashboard button
    const saveBtn = document.getElementById('save-to-dashboard');
    if (saveBtn) {
      saveBtn.addEventListener('click', saveToDashboard);
    }

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && tabId) {
        const contactsKey = `contacts_${tabId}`;
        const linksKey = `contactLinks_${tabId}`;
        if (changes[contactsKey] || changes[linksKey]) refresh();
      }
    });
  }

  function setupToggle() {
    const toggle = document.getElementById("highlight-toggle");
    if (!toggle) return;

    chrome.storage.local.get(["highlightEnabled"], (res) => {
      toggle.checked = res.highlightEnabled !== false;
    });

    toggle.addEventListener("change", async () => {
      const enabled = toggle.checked;
      await chrome.storage.local.set({ highlightEnabled: enabled });
      try {
        const tabs = await new Promise((res) =>
          chrome.tabs.query({ active: true, currentWindow: true }, res)
        );
        if (tabs && tabs.length > 0 && tabs[0].id) {
          chrome.tabs.sendMessage(tabs[0].id, {
            action: "toggleHighlighting",
            enabled,
          });
        }
      } catch (e) { }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initPopup);
  } else {
    initPopup();
  }
})();
