const { validate } = await import("./validate.js");

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
  /(?:[-!#-'*+\/-9=?A-Z^-~]+(?:\.[-!#-'*+\/-9=?A-Z^-~]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+[A-Z]{2,63}|\[(?:(?:IPv6:[A-F0-9:.]+)|(?:\d{1,3}\.){3}\d{1,3})\])/gi;
const MAILTO_REGEX = /^mailto:/i;

const TEL_REGEX = /<a[^>]+href=["']tel:([^"']+)["'][^>]*>/gi;
const IND_REGEX = /(?:\+91|91|0)[\s-]?[6-9]\d{9}/g;
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
  const rgxmails = pageContent.match(EMAIL_REGEX) || [];

  // not requierd for a normal website as regex does it in ms, practically a mainstream never sends like a 100mb in single pageload for the source code so regex would work fine over mailto in this case:
  const dom = new DOMParser().parseFromString(pageContent, "text/html");
  const mailto = [...dom.querySelectorAll("a[href^='mailto:']")].map((a) =>
    a.getAttribute("href").replace(MAILTO_REGEX, "")
  );

  return [[...new Set(mailto)], [...new Set(rgxmails)]];
}

// needs regex fix and better logic for parsing phones
async function getPhones(pageContent) {
  const indNums = pageContent.match(IND_REGEX) || [];

  const telNums = [...pageContent.matchAll(TEL_REGEX)].map((m) => m[1].trim());

  // handle other international formats and other indian formats if missed any

  return [[...new Set(telNums)], [...new Set(indNums)]];
}

(async () => {
  const content = await getPageContent();
  const [autoEmails, regexEmails] = await getEmails(content);
  const [autoPhones, regexPhones] = await getPhones(content);

  console.log("All emails:", autoEmails, regexEmails);
  console.log("All phones:", autoPhones, regexPhones);

  const validEmails = new Set(autoEmails);
  const validPhones = new Set(autoPhones);

  const emailResults = await Promise.all(
    regexEmails.map((e) => validate(e, "email").catch(() => null))
  );
  emailResults
    .filter((r) => r?.Items?.[0]?.ResponseCode === "Valid")
    .forEach((r) => validEmails.add(r.Items[0].EmailAddress));

  const phoneResults = await Promise.all(
    regexPhones.map((p) => validate(p, "phone").catch(() => null))
  );
  phoneResults
    .filter((r) => r?.Items?.[0]?.IsValid === "Yes")
    .forEach((r) => validPhones.add(r.Items[0].PhoneNumber));

  // Sample output of PCA api ->

  // {"Items":[{"PhoneNumber":"+448797834589","RequestProcessed":true,"IsValid":"No","NetworkCode":"","NetworkName":"","NetworkCountry":"","NationalFormat":"0879 783 4589","CountryPrefix":44,"NumberType":"Unknown"}]}

  // {"Items":[{"ResponseCode":"Valid","ResponseMessage":"Email address was fully validated","EmailAddress":"0xdf.223@gmail.com","UserAccount":"0xdf.223","Domain":"gmail.com","IsDisposableOrTemporary":false,"IsComplainerOrFraudRisk":false,"Duration":0}]}

  console.log("valid emails: ", validEmails);
  console.log("valid phones: ", validPhones);
})();
