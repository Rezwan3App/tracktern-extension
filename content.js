chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  if (req.type === "extract_job") {
    const title = document.querySelector("h1")?.innerText || "";
    const company = document.querySelector("a[href*='company'], .company, .jobsearch-InlineCompanyRating")?.innerText || "";
    const description = document.querySelector("div.description, .description, [class*='jobDescription']")?.innerText || "";
    
    sendResponse({
      title,
      company,
      description
    });
  }
});
