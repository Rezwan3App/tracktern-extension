const BLOCKED_DOMAIN = String.fromCharCode(
  108, 105, 110, 107, 101, 100, 105, 110, 46, 99, 111, 109
);

const MENU_ID = 'trackflow_save_job';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: 'Save to TrackFlow',
    contexts: ['page']
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID) return;
  if (!tab?.id || !tab?.url) return;
  if (isBlockedDomain(tab.url)) return;

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const blockedPhrases = [
          "kathryn's story",
          'our story',
          'company story',
          'employee story',
          'people story',
          'success story',
          'view all jobs',
          'see all jobs',
          'benefits',
          'culture',
          'life at',
          'about us',
          'who we are'
        ];

        const isBlockedText = (text) => {
          if (!text) return false;
          const normalized = text.trim().toLowerCase();
          return blockedPhrases.some(phrase => normalized.includes(phrase));
        };

        const selectors = {
          title: [
            'h1',
            '[data-qa="posting-title"]',
            '.topcard__title',
            '.jobsearch-JobInfoHeader-title',
            '.job-title',
            '[class*="job-title"]',
            '.posting-headline__position'
          ],
          company: [
            '[data-qa="posting-company"]',
            '.topcard__org-name-link',
            '.jobsearch-InlineCompanyRating',
            '.company-name',
            '[class*="company"]',
            'a[href*="/company/"]'
          ],
          description: [
            '[data-qa="job-description"]',
            '.description',
            '.jobsearch-jobDescriptionText',
            '[class*="job-description"]',
            '[class*="description"]',
            'article',
            'section'
          ]
        };

        const isLikelyCompanyText = (text, el) => {
          if (!text) return false;
          const normalized = text.trim();
          if (isBlockedText(normalized)) return false;
          if (normalized.length < 2 || normalized.length > 200) return false;
          if (el?.closest('footer, nav, header')) return false;
          if (el?.closest('[class*="share"], [class*="social"], [aria-label*="share"], [aria-label*="follow"]')) {
            return false;
          }
          const href = el?.getAttribute?.('href') || '';
          if (href.startsWith('mailto:') || href.startsWith('tel:')) return false;
          return true;
        };

        const getCompanyFromStructuredData = () => {
          const scripts = document.querySelectorAll('script[type="application/ld+json"]');
          for (const script of scripts) {
            try {
              const data = JSON.parse(script.textContent || '');
              const items = Array.isArray(data) ? data : [data];
              for (const item of items) {
                const postings = item['@type'] === 'JobPosting' ? [item] : item['@graph'];
                if (!postings) continue;
                const list = Array.isArray(postings) ? postings : [postings];
                for (const post of list) {
                  if (post && post['@type'] === 'JobPosting') {
                    const org = post.hiringOrganization || post.organization || post.publisher;
                    const name = typeof org === 'string' ? org : org?.name;
                    if (name && name.trim().length > 1) {
                      return name.trim();
                    }
                  }
                }
              }
            } catch (error) {
              continue;
            }
          }
          return '';
        };

        const getTextFromSelectors = (selectorList, fieldName) => {
          for (const selector of selectorList) {
            const elements = document.querySelectorAll(selector);
            for (const el of elements) {
              const text = el.innerText?.trim();
              if (!text) continue;
              if (isBlockedText(text)) continue;
              if (fieldName === 'company') {
                if (isLikelyCompanyText(text, el)) {
                  return text;
                }
              } else if (text.length > 2 && text.length < 300) {
                return text;
              }
            }
          }
          return '';
        };

        const cleanDescriptionText = (text) => {
          if (!text) return '';
          text = text.replace(/Share this job.*$/i, '');
          text = text.replace(/Apply now.*$/i, '');
          text = text.replace(/Show more.*$/i, '');
          text = text.replace(/Show less.*$/i, '');
          text = text.replace(/See more jobs like this.*$/i, '');
          text = text.replace(/Apply for this job.*$/i, '');
          text = text.replace(/Easy Apply.*$/i, '');
          text = text.replace(/Quick Apply.*$/i, '');
          text = text.replace(/Report this job.*$/i, '');
          text = text.replace(/Save this job.*$/i, '');
          text = text.replace(/Job ID.*$/i, '');
          text = text.replace(/\d+\s+applicants.*$/i, '');
          text = text.replace(/Posted.*ago.*$/i, '');
          text = text.replace(/Reposted.*ago.*$/i, '');
          text = text.replace(/Over \d+.*applicants.*$/i, '');
          text = text.replace(/Promoted by.*$/i, '');
          text = text.replace(/Actively reviewing.*$/i, '');
          text = text.replace(/.*Reposted.*ago.*$/i, '');
          text = text.replace(/.*ago.*Over.*applicants.*$/i, '');
          text = text.replace(/.*·.*applicants.*$/i, '');
          text = text.replace(/\d+\s+days?\s+ago.*$/i, '');
          text = text.replace(/\d+\s+weeks?\s+ago.*$/i, '');
          text = text.replace(/\d+\s+months?\s+ago.*$/i, '');

          const lines = text.split('\n');
          const filteredLines = lines.filter(line => {
            const trimmed = line.trim().toLowerCase();
            return !(
              trimmed.includes('applicants') ||
              trimmed.includes('promoted by') ||
              trimmed.includes('actively reviewing') ||
              trimmed.includes('reposted') ||
              /^[a-z\s,]+,\s+[a-z]{2}$/i.test(trimmed) ||
              trimmed.match(/^\d+\s+(day|week|month)s?\s+ago/) ||
              trimmed.length < 20 ||
              isBlockedText(trimmed)
            );
          });

          text = filteredLines.join('\n');
          return text.replace(/\s+/g, ' ').trim();
        };

        const getDescriptionAfterHeadings = () => {
          const descriptionHeadings = [
            'about', 'about the job', 'about this job', 'about the role',
            'job description', 'job summary', 'description', 'overview',
            'responsibilities', 'role description', 'position summary', 'the role'
          ];

          const allHeadings = document.querySelectorAll(
            'h1, h2, h3, h4, h5, h6, [class*="heading"], [class*="title"], .font-weight-bold, strong'
          );

          for (const heading of allHeadings) {
            const headingText = heading.innerText?.trim().toLowerCase();
            if (headingText && descriptionHeadings.some(desc => headingText.includes(desc))) {
              let description = '';
              let nextElement = heading.nextElementSibling;
              let attempts = 0;
              while (nextElement && attempts < 5) {
                const text = nextElement.innerText?.trim();
                if (text && text.length > 20) {
                  description += text + ' ';
                  if (description.length > 200) break;
                }
                nextElement = nextElement.nextElementSibling;
                attempts++;
              }
              if (description.trim().length > 50) {
                return description.trim().length > 1000
                  ? description.trim().substring(0, 1000) + '...'
                  : description.trim();
              }
            }
          }
          return '';
        };

        const getDescriptionText = (selectorList) => {
          const smartDescription = getDescriptionAfterHeadings();
          if (smartDescription) {
            return smartDescription;
          }
          for (const selector of selectorList) {
            const el = document.querySelector(selector);
            if (el) {
              let text = el.innerText?.trim() || '';
              text = cleanDescriptionText(text);
              if (text.length > 50) {
                return text.length > 800 ? text.substring(0, 800) + '...' : text;
              }
            }
          }
          return '';
        };

        const extractSalaryText = () => {
          const text = document.body?.innerText || '';
          if (!text) return '';
          const patterns = [
            /\$\s?\d{2,3}\s?k\s*(?:-\s*\$\s?\d{2,3}\s?k)?(?:\s*(?:\/|per)\s*(?:year|yr|annual|annually))?/i,
            /\$\s?\d{1,3}(?:,\d{3})+\s*(?:-\s*\$\s?\d{1,3}(?:,\d{3})+)?(?:\s*(?:\/|per)\s*(?:year|yr|annual|annually))?/i,
            /\$\s?\d+(?:\.\d+)?\s*(?:\/|per)\s*(?:hour|hr)/i,
            /\$\s?\d+(?:\.\d+)?\s*(?:\/|per)\s*(?:week|wk)/i,
            /\$\s?\d+(?:\.\d+)?\s*(?:\/|per)\s*(?:month|mo)/i
          ];

          const unitMap = [
            { re: /\b(per|\/)\s*(year|yr|annual|annually)\b/i, suffix: '/yr' },
            { re: /\b(per|\/)\s*(hour|hr)\b/i, suffix: '/hr' },
            { re: /\b(per|\/)\s*(week|wk)\b/i, suffix: '/wk' },
            { re: /\b(per|\/)\s*(month|mo)\b/i, suffix: '/mo' }
          ];

          for (const pattern of patterns) {
            const match = pattern.exec(text);
            if (!match) continue;
            let salaryText = match[0].replace(/\s+/g, ' ').trim();
            if (/(\/|per)\s*(year|yr|annual|annually|hour|hr|week|wk|month|mo)/i.test(salaryText)) {
              return salaryText;
            }

            const windowStart = Math.max(0, match.index - 40);
            const windowEnd = Math.min(text.length, match.index + salaryText.length + 40);
            const context = text.slice(windowStart, windowEnd);
            for (const unit of unitMap) {
              if (unit.re.test(context)) {
                return `${salaryText} ${unit.suffix}`;
              }
            }

            return salaryText;
          }
          return '';
        };

        const structuredCompany = getCompanyFromStructuredData();
        let result = {
          title: getTextFromSelectors(selectors.title, 'title'),
          company: structuredCompany || getTextFromSelectors(selectors.company, 'company'),
          description: getDescriptionText(selectors.description),
          salary: extractSalaryText()
        };

        if (!result.title) {
          const headings = document.querySelectorAll('h1, h2, h3');
          for (const heading of headings) {
            const text = heading.innerText?.trim();
            if (text && text.length > 5 && text.length < 200 && !text.includes('Sign in')) {
              result.title = text;
              break;
            }
          }
        }

        if (!result.company) {
          const pageTitle = document.title;
          const companyMatch = pageTitle.match(/at\s+([^|•-]+)/i) || pageTitle.match(/\|\s*([^|•-]+)/i);
          if (companyMatch) {
            result.company = companyMatch[1].trim();
          }
        }

        return result;
      }
    });

    const jobData = results?.[0]?.result;
    if (!jobData) return;

    const record = {
      id: Date.now().toString(),
      fields: {
        TrackTern: jobData.title || '',
        Company: jobData.company || '',
        Description: jobData.description || '',
        URL: tab.url,
        Salary: jobData.salary || '',
        'Date Added': new Date().toISOString().split('T')[0],
        Status: 'Applied'
      },
      createdTime: new Date().toISOString()
    };

    const result = await chrome.storage.local.get(['savedJobs']);
    const savedJobs = result.savedJobs || [];
    savedJobs.unshift(record);
    await chrome.storage.local.set({ savedJobs });
  } catch (error) {
    console.error('TrackFlow quick save failed:', error);
  }
});

function isBlockedDomain(url) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname === BLOCKED_DOMAIN || hostname.endsWith(`.${BLOCKED_DOMAIN}`);
  } catch (error) {
    return false;
  }
}
