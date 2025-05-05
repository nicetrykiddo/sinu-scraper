(() => {
  console.log("ok");
})();

async function currentTab() {
  let queryOptions = { active: true, currentWindow: true };
  const tabs = await chrome.tabs.query(queryOptions);
  return tabs[0];
}

async function downloadFile(data, filename) {
  // cuz i like debugging this way and its not nodejs where i could use fs.writeFileSync
  chrome.downloads.download(
    {
      url: URL.createObjectURL(new Blob([data], { type: "text/html" })),
      filename: filename,
      saveAs: false,
    },
    (downloadId) => {
      if (chrome.runtime.lastError) {
        console.error("Download failed:", chrome.runtime.lastError);
      }
    }
  );
}

async function getPageContent() {
  const tab = await currentTab();

  if (tab?.id) {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => document.body.innerHTML, // outerHTML also works just fine here...
      });

      if (results && results[0] && results[0].result) {
        await downloadFile(JSON.stringify(results), "test.html");
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

getPageContent();
