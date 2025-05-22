(() => {
  console.log("ok");
})();

/**
 * refer https://datatracker.ietf.org/doc/rfc5322/
 *
 * emailRegex - A practical one, covers 99% emails
 * EMAIL_REGEX - A more complete one, covers 100% emails
 *
 * phoneRegex
 * PHONE_REGEX
 */
const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const EMAIL_REGEX =
  /^(?:[-!#-'*+\/-9=?A-Z^-~]+(?:\.[-!#-'*+\/-9=?A-Z^-~]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+[A-Z]{2,63}|\[(?:(?:IPv6:[A-F0-9:.]+)|(?:\d{1,3}\.){3}\d{1,3})\])$/i;

// const phoneRegextest = /\b(?:\+|00)?[ ()+.-]*(?:\d[ ()+.-]*){10}\b/g;
// const phoneRegex =
//   /(?=(?:.*\d){10}(?!.*\d))(?:\+|00)[0-9]{1,3}(?:[ \-.]?\(?0\)?[0-9]{1,4})*(?:[ \-.]?[0-9]+)+(?:\s*(?:x|ext|extension)\s*\d{1,5})?/gi;

// const PHONE_REGEX =
//   /^((\+ ?)?(\(\d{1,5}\)[ \-.]?)?\d+([ \-.]?\d+)*)(\s*(?:x|ext)\s*\d{1,5})?$/;

async function currentTab() {
  let queryOptions = { active: true, currentWindow: true };
  const tabs = await chrome.tabs.query(queryOptions);
  return tabs[0];
}

// async function downloadFile(data, filename) {
//   // debugging
//   chrome.downloads.download(
//     {
//       url: URL.createObjectURL(new Blob([data], { type: "text/html" })),
//       filename: filename,
//       saveAs: false,
//     },
//     (downloadId) => {
//       if (chrome.runtime.lastError) {
//         console.error("Download failed:", chrome.runtime.lastError);
//       }
//     }
//   );
// }

async function getPageContent() {
  const tab = await currentTab();

  if (tab?.id) {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => document.body.innerHTML, // outerHTML also works just fine here...
      });
      if (results && results[0] && results[0].result) {
        // await downloadFile(JSON.stringify(results), "test.html");
        // await downloadFile(JSON.stringify(results[0].result), "test.html");
        return results[0].result;
      } else {
        console.error("error with webpage result.");
      }
    } catch (error) {
      console.error("Error with the try block:", error);
    }
  } else {
    console.error("error with active tab.");
  }
}

async function getEmails(pageContent) {
  const emails = pageContent.match(emailRegex);

  // not requierd for a normal website as regex does it in ms, practically a mainstream never sends like a 100mb in single pageload for the source code so regex would work fine over mailto:
  const mewdom = new DOMParser();
  const doc = mewdom.parseFromString(pageContent, "text/html");
  const mailtoLinks = doc.querySelectorAll("a[href^='mailto:']");
  const mailtoEmails = [];
  mailtoLinks.forEach((link) => {
    const email = link.getAttribute("href").replace("mailto:", "");
    if (emailRegex.test(email)) {
      mailtoEmails.push(email);
    }
  });

  if (emails) {
    const uniqueEmails = [...new Set(emails)];
    console.log("unique emails: ", uniqueEmails);
  } else {
    console.log("no emails");
  }

  if (mailtoEmails) {
    const uniqueMailto = [...new Set(mailtoEmails)];
    console.log("mailto: ", uniqueMailto);
  } else {
    console.log("no mailto emails");
  }
}

async function getPhones(pageContent) {
  const regex = /<a[^>]+href=["']tel:([^"']+)["'][^>]*>/gi;
  const telNumbers = [];
  let match;
  while ((match = regex.exec(pageContent)) !== null) {
    telNumbers.push(match[1].trim());
  }

  // indian numbers
  const indRegex = /(?:\+91|91|0)[\s-]?[6-9]\d{9}/g;
  const indNumbers = [...new Set(pageContent.match(indRegex) || [])];

  if (indNumbers) {
    console.log("indian numbers: ", [...indNumbers]);
  } else {
    console.log("no indian numbers");
  }

  console.log("tel numbers: ", [...telNumbers]);

  // handle other international formats and other indian formats if missed any
}

(async () => {
  const content = await getPageContent();
  getEmails(content);
  getPhones(content);
})();
