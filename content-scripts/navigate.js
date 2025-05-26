class NavigationHelper {
  constructor() {
    this.kw = [];
    this.found = new Set();
    this.hl = new Set();
    this.hlOn = true;
    this.timer = null;
    this.init();
  }
  async init() {
    try {
      const r = await chrome.storage.local.get(["highlightEnabled"]);
      this.hlOn = r.highlightEnabled !== false;
    } catch (e) {
      this.hlOn = true;
    }
    await this.loadKw();
    this.scan();
    this.setupObs();
  }
  async loadKw() {
    const defaultKeywords = [
      "contact",
      "about",
      "sponsor",
      "partner",
      "career",
      "business",
      "support",
      "press",
      "media",
      "advertise",
    ];
    try {
      const url = chrome.runtime.getURL("keywords.txt");
      const res = await fetch(url);
      if (!res.ok) {
        this.kw = defaultKeywords;
        return;
      }
      const txt = await res.text();
      const processedKw = txt
        .split("\n")
        .map((l) => l.trim().toLowerCase())
        .filter((l) => l && !l.startsWith("//"));

      if (processedKw.length > 0) {
        this.kw = processedKw;
      } else {
        this.kw = defaultKeywords;
      }
    } catch (e) {
      this.kw = defaultKeywords;
    }
  }
  resolveURL(href) {
    if (!href || typeof href !== "string") return null;
    try {
      if (
        href.startsWith("mailto:") ||
        href.startsWith("tel:") ||
        href.startsWith("javascript:") ||
        href.startsWith("#")
      ) {
        return null;
      }
      return new URL(href, window.location.origin).href;
    } catch (e) {
      return null;
    }
  }
  scan(isRe = false) {
    const links = document.querySelectorAll("a[href]");
    const newLnk = [];

    links.forEach((el) => {
      const href = el.getAttribute("href");
      const txt = el.textContent.toLowerCase().trim();
      const url = this.resolveURL(href);

      if (!url || this.found.has(url)) return;

      const matchedKw = [];
      const lowerUrl = url.toLowerCase();
      for (const k of this.kw) {
        if (txt.includes(k) || lowerUrl.includes(k)) {
          matchedKw.push(k);
        }
      }

      if (matchedKw.length > 0) {
        this.found.add(url);
        newLnk.push({
          url: url,
          text: el.textContent.trim(),
          originalHref: href,
          matchedKeywords: matchedKw,
        });
        this.highlight(el);
      }
    });

    if (newLnk.length > 0) {
      this.store(newLnk);
    }
  }

  highlight(el) {
    if (!this.hlOn) return;

    el.style.border = "2px solid orange";
    el.style.boxShadow = "0 0 5px orange";
    el.title = "Potential Contact link (xddd)";
    this.hl.add(el);
  }

  removeHighlight(el) {
    el.style.border = "";
    el.style.boxShadow = "";
    this.hl.delete(el);
  }

  store(lnks) {
    chrome.runtime.sendMessage(
      {
        action: "storeContactLinks",
        links: lnks,
        currentUrl: window.location.href,
      },
      (res) => {
        if (chrome.runtime.lastError) {
        } else if (res && !res.success) {
        }
      }
    );
  }

  setupObs() {
    const obs = new MutationObserver((muts) => {
      for (const mut of muts) {
        if (mut.type === "childList" && mut.addedNodes.length > 0) {
          let hasAnchor = false;
          for (const node of mut.addedNodes) {
            if (
              node.nodeName === "A" ||
              (node.querySelector && node.querySelector("a"))
            ) {
              hasAnchor = true;
              break;
            }
          }
          if (hasAnchor) {
            clearTimeout(this.timer);
            this.timer = setTimeout(() => {
              this.scan(true);
            }, 500);
            break;
          }
        }
      }
    });

    obs.observe(document.body, { childList: true, subtree: true });
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendRes) => {
  if (msg.action === "toggleHighlighting") {
    if (window.navHelper) {
      window.navHelper.hlOn = msg.enabled;

      if (msg.enabled) {
        document.querySelectorAll("a[href]").forEach((lnk) => {
          if (lnk.title === "Potential opportunity link (SinuScraper)") {
            window.navHelper.highlight(lnk);
          }
        });
      } else {
        window.navHelper.hl.forEach((el) => {
          window.navHelper.removeHighlight(el);
        });
      }
    }
    sendRes({ success: true });
    return true;
  }
});

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    if (!window.navHelper) {
      window.navHelper = new NavigationHelper();
    }
  });
} else {
  if (!window.navHelper) {
    window.navHelper = new NavigationHelper();
  }
}
