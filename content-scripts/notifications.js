class NotificationSystem {
  constructor() {
    this.container = null;
    this.seenEmails = new Set();
    this.seenPhones = new Set();
    this.activeNotifications = [];
    this.maxNotifications = 3;
    this.debug = true;
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
      setTimeout(() => particle.remove(), 1800);
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

    notification.innerHTML = `
      <div class="notification-title">${
        type === "email" ? "📧 New Email" : "📞 New Phone"
      }</div>
      <div class="notification-content">${content}</div>
    `;

    this.container.appendChild(notification);
    this.activeNotifications.push(notification);
    this.createParticles(notification, type);

    setTimeout(() => {
      this.removeNotification(notification);
    }, 6000);
  }

  removeNotification(notification) {
    if (notification && notification.parentNode) {
      notification.classList.add("fadeOut");
      setTimeout(() => {
        if (notification.parentNode) {
          notification.remove();
        }
        const index = this.activeNotifications.indexOf(notification);
        if (index > -1) {
          this.activeNotifications.splice(index, 1);
        }
      }, 500);
    }
  }
  showValidated(emails, phones) {
    if (this.debug) {
      console.log(`NotificationSystem: showValidated called with:`, {
        emails,
        phones,
      });
    }

    const newContacts = [];

    emails.forEach((email) => {
      if (!this.seenEmails.has(email)) {
        this.seenEmails.add(email);
        newContacts.push({ content: email, type: "email" });
      } else if (this.debug) {
        console.log(`NotificationSystem: Email already seen: ${email}`);
      }
    });

    phones.forEach((phone) => {
      if (!this.seenPhones.has(phone)) {
        this.seenPhones.add(phone);
        newContacts.push({ content: phone, type: "phone" });
      } else if (this.debug) {
        console.log(`NotificationSystem: Phone already seen: ${phone}`);
      }
    });

    newContacts.forEach((contact, index) => {
      setTimeout(() => {
        this.show(contact.content, contact.type);
      }, index * 800);
    });
  }
  checkNew(emails, phones) {
    const newContacts = [];

    emails.forEach((email) => {
      if (!this.seenEmails.has(email)) {
        this.seenEmails.add(email);
        newContacts.push({ content: email, type: "email" });
      }
    });

    phones.forEach((phone) => {
      if (!this.seenPhones.has(phone)) {
        this.seenPhones.add(phone);
        newContacts.push({ content: phone, type: "phone" });
      }
    });

    newContacts.forEach((contact, index) => {
      setTimeout(() => {
        this.show(contact.content, contact.type);
      }, index * 800);
    });
  }
}

window.notificationSystem = new NotificationSystem();
