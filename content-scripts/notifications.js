class NotificationSystem {
  constructor() {
    this.container = null;
    this.seenEmails = new Set();
    this.seenPhones = new Set();
    this.activeNotifications = [];
    this.maxNotifications = 3;
    this.debug = true;
    this.observer = null; // Added for MutationObserver
    this.mutationDebounceTimer = null; // Added for debouncing observer events, rate limit in easy words :P
    this.notificationTimeouts = new Set(); // Track timeouts for cleanup
    this.init();
  }

  init() {
    if (!this.container) {
      this.container = document.createElement("div");
      this.container.className = "notification-container";
      document.body.appendChild(this.container);
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = chrome.runtime.getURL("styles/notifications.css");
      document.head.appendChild(link);
    }

    // Setup MutationObserver
    this.observer = new MutationObserver((mutationsList, observer) => {
      clearTimeout(this.mutationDebounceTimer);
      this.mutationDebounceTimer = setTimeout(() => {
        if (this.debug) {
          console.log(
            "NotificationSystem: DOM changed, notifying background script."
          );
        }
        chrome.runtime.sendMessage(
          { action: "domMutationObserved" },
          (response) => {
            if (chrome.runtime.lastError) {
              console.warn(
                "NotificationSystem: Error sending domMutationObserved message:",
                chrome.runtime.lastError.message
              );
            }
          }
        );
      }, 100); // Debounce for 100ms - much faster response
    });

    this.observer.observe(document.body, {
      childList: true, // Listen to additions or removals of child nodes
      subtree: true, // Extend to all descendants of document.body
      characterData: true, // Listen to changes in text content of nodes
    });
  }
  createParticles(element, type) {
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    for (let i = 0; i < 8; i++) {
      const particle = document.createElement("div");
      particle.className = `particle ${type}`;

      const angle = (i / 8) * Math.PI * 2;
      const distance = 50 + Math.random() * 40;
      const dx = Math.cos(angle) * distance;
      const dy = Math.sin(angle) * distance;

      particle.style.cssText = `
        left: ${centerX}px;
        top: ${centerY}px;
        --dx: ${dx}px;
        --dy: ${dy}px;
      `;

      document.body.appendChild(particle);
      const timeoutId = setTimeout(() => {
        if (particle.parentNode) {
          particle.remove();
        }
      }, 1800);

      this.notificationTimeouts.add(timeoutId);
    }
  }
  show(content, type) {
    if (this.debug) {
      console.log(
        `NotificationSystem: Showing ${type} notification for: ${content}`
      );
    }

    if (this.activeNotifications.length >= this.maxNotifications) {
      const oldest = this.activeNotifications.shift();
      this.removeNotification(oldest);
    }
    const notification = document.createElement("div");
    notification.className = `notification ${type}`;

    // just in case someone tried XSS :P
    const sanitizedContent = content.replace(/[<>&"']/g, function (match) {
      const escapeMap = {
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&#x27;",
      };
      return escapeMap[match];
    });

    notification.innerHTML = `
      <div class="notification-title">${type === "email" ? "📧 New Email" : "📞 New Phone"
      }</div>
      <div class="notification-content">${sanitizedContent}</div>
    `;

    this.container.appendChild(notification);
    this.activeNotifications.push(notification);
    this.createParticles(notification, type);

    const timeoutId = setTimeout(() => {
      this.removeNotification(notification);
    }, 6000);

    this.notificationTimeouts.add(timeoutId);
  }
  removeNotification(notification) {
    if (notification && notification.parentNode) {
      notification.classList.add("fadeOut");
      const timeoutId = setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
        this.activeNotifications = this.activeNotifications.filter(
          (n) => n !== notification
        );
      }, 500); //  fadeout animation duration

      this.notificationTimeouts.add(timeoutId);
    }
  }
  showValidated(emails, phones) {
    if (this.debug) {
      // console.log(`NotificationSystem: showValidated called with:`, {
      //   emails,
      //   phones,
      // });
    }

    // Ensure arrays are valid
    const validEmails = Array.isArray(emails) ? emails : [];
    const validPhones = Array.isArray(phones) ? phones : [];

    const contactsToShow = [];
    validEmails.forEach((email) => {
      if (!this.seenEmails.has(email)) {
        this.seenEmails.add(email);
        contactsToShow.push({ type: "email", content: email });
      }
    });

    validPhones.forEach((phone) => {
      if (!this.seenPhones.has(phone)) {
        this.seenPhones.add(phone);
        contactsToShow.push({ type: "phone", content: phone });
      }
    });
    contactsToShow.forEach((contact, index) => {
      if (index === 0) {
        this.show(contact.content, contact.type);
      } else {
        const timeoutId = setTimeout(() => {
          this.show(contact.content, contact.type);
        }, index * 50);
        this.notificationTimeouts.add(timeoutId);
      }
    });
  }
  checkNew(emails, phones) {
    const validEmails = Array.isArray(emails) ? emails : [];
    const validPhones = Array.isArray(phones) ? phones : [];

    const newContacts = [];

    validEmails.forEach((email) => {
      if (!this.seenEmails.has(email)) {
        this.seenEmails.add(email);
        newContacts.push({ content: email, type: "email" });
      }
    });

    validPhones.forEach((phone) => {
      if (!this.seenPhones.has(phone)) {
        this.seenPhones.add(phone);
        newContacts.push({ content: phone, type: "phone" });
      }
    });
    newContacts.forEach((contact, index) => {
      if (index === 0) {
        this.show(contact.content, contact.type);
      } else {
        const timeoutId = setTimeout(() => {
          this.show(contact.content, contact.type);
        }, index * 50);
        this.notificationTimeouts.add(timeoutId);
      }
    });
  }

  cleanup() {
    this.notificationTimeouts.forEach((timeout) => clearTimeout(timeout));
    this.notificationTimeouts.clear();

    if (this.mutationDebounceTimer) {
      clearTimeout(this.mutationDebounceTimer);
      this.mutationDebounceTimer = null;
    }

    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }

    this.activeNotifications.forEach((notification) => {
      if (notification && notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    });
    this.activeNotifications = [];

    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
      this.container = null;
    }
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "showValidatedContacts") {
    if (window.notificationSystem) {
      window.notificationSystem.showValidated(message.emails, message.phones);
      sendResponse({ status: "Notifications shown" });
    } else {
      sendResponse({ status: "Error: Notification system not found" });
    }
    return true;
  }
});

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    if (!window.notificationSystem) {
      window.notificationSystem = new NotificationSystem();
    }
  });
} else {
  if (!window.notificationSystem) {
    window.notificationSystem = new NotificationSystem();
  }
}

window.addEventListener("beforeunload", () => {
  if (window.notificationSystem) {
    window.notificationSystem.cleanup();
  }
});
