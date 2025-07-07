document.addEventListener('DOMContentLoaded', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      function: scrapeJobInfo,
      args: [tabs[0].url]
    }, (injectionResults) => {
      if (injectionResults && injectionResults[0].result) {
        const data = injectionResults[0].result;
        document.getElementById('title').value = data.title || '';
        document.getElementById('company').value = data.company || '';
        document.getElementById('description').value = data.description || '';
        document.getElementById('url').value = tabs[0].url;
      }
    });
  });
});

function scrapeJobInfo(url) {
  const getText = (selectors) => {
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el && el.innerText.trim()) return el.innerText.trim();
    }
    return '';
  };

  const title = getText(['h1', '.topcard__title', '[data-qa="posting-title"]']);

  let description = '';
  const descEl = document.querySelector('.description, [data-qa="job-description"], article, section');
  if (descEl) {
    const text = descEl.innerText.trim();
    const split = text.split(/Description/i);
    if (split.length > 1) {
      description = split[1].split('Share this job')[0].trim();
    } else {
      description = text.split('Share this job')[0].trim(); // fallback
    }
  }

  let company = '';
  const logoSibling = document.querySelector('img + div, .logo + div, .posting-title + div');
  if (logoSibling) {
    const strong = logoSibling.querySelector('strong, h3, span');
    if (strong && strong.innerText.trim()) {
      company = strong.innerText.trim();
    }
  }

  if (!company) {
    company = getText([
      '.topcard__org-name-link',
      '.topcard__flavor',
      '[data-company-name]',
      '[class*="company"]'
    ]);
  }

  if (!company && url.includes('workable.com')) {
    const match = url.match(/workable\.com\/([^/]+)/);
    if (match) company = match[1].replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  return { title, company, description };
}











