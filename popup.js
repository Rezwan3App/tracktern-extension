class TrackternJobSaver {
  constructor() {
    this.init();
  }

  async init() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const currentUrl = tabs[0]?.url || '';
      if (this.isUnsupportedDomain(currentUrl)) {
        this.showUnsupportedSite();
        return;
      }
      this.showJobList();
    } catch (error) {
      console.error('TrackternJobSaver: Initialization error:', error);
      this.showError('Failed to initialize extension');
    }
  }

  async loadJobAndShowForm() {
    this.showStatus('Extracting job information...', 'info');

    try {
      const jobData = await this.scrapeCurrentPage();
      if (jobData.blocked) {
        this.showUnsupportedSite();
        return;
      }
      this.showJobForm(jobData);
    } catch (error) {
      console.error('Scraping error:', error);
      this.showJobForm({});
    }
  }

  isUnsupportedDomain(url) {
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      const blockedDomain = String.fromCharCode(
        108, 105, 110, 107, 101, 100, 105, 110, 46, 99, 111, 109
      );
      return hostname === blockedDomain || hostname.endsWith(`.${blockedDomain}`);
    } catch (error) {
      return false;
    }
  }

  async scrapeCurrentPage() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const currentTab = tabs[0];
    const currentUrl = currentTab?.url || '';

    if (this.isUnsupportedDomain(currentUrl)) {
      return { blocked: true, url: currentUrl };
    }

    const results = await chrome.scripting.executeScript({
      target: { tabId: currentTab.id },
      function: () => {
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

        const extractSalaryText = () => {
          const text = document.body?.innerText || '';
          if (!text) return '';
          const patterns = [
            /\$\s?\d{2,3}\s?k\s*(?:-\s*\$\s?\d{2,3}\s?k)?/i,
            /\$\s?\d{1,3}(?:,\d{3})+\s*(?:-\s*\$\s?\d{1,3}(?:,\d{3})+)?/i,
            /\$\s?\d+(?:\.\d+)?\s*\/\s*hr/i,
            /\$\s?\d+(?:\.\d+)?\s*\/\s*hour/i
          ];
          for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match) {
              return match[0].replace(/\s+/g, ' ').trim();
            }
          }
          return '';
        };

        const isLikelyCompanyText = (text, el) => {
          if (!text) return false;
          const normalized = text.trim();
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
              trimmed.length < 20
            );
          });

          text = filteredLines.join('\n');
          return text.replace(/\s+/g, ' ').trim();
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

    if (results && results[0]?.result) {
      return {
        ...results[0].result,
        url: currentUrl
      };
    }

    return {};
  }

  showUnsupportedSite() {
    document.body.innerHTML = `
      <div class="container">
        <div class="header">
          <h3>TrackFlow</h3>
          <div class="subtitle">Site not supported</div>
        </div>
        <div class="job-form">
          <div class="status error">
            <p>This site is not supported.</p>
            <p>Please open another job site to save a listing.</p>
          </div>
          <div class="button-group">
            <button type="button" id="show-list" class="btn btn-secondary">
              Show Saved Jobs
            </button>
          </div>
        </div>
      </div>
    `;

    document.getElementById('show-list')?.addEventListener('click', () => this.showJobList());
  }

  showJobForm(jobData = {}) {
    const hasData = jobData.title || jobData.company || jobData.description;

    document.body.innerHTML = `
      <div class="container">
        <div class="header">
          <div class="brand">
            <img src="icons/icon32.png" alt="TrackFlow" class="brand-icon" />
            <span class="brand-name">TrackFlow</span>
          </div>
          <button type="button" id="back-to-list" class="btn btn-secondary btn-small">Back</button>
        </div>

        <div class="job-form">
          ${!hasData ? `
            <div class="status info form-notice">
              <p>Could not auto-detect job information on this page.</p>
              <p>You can manually enter the details below.</p>
            </div>
          ` : ''}

          <form id="job-form">
            <div class="field">
              <label>Job Title</label>
              <input type="text" id="job-title" value="${jobData.title || ''}" placeholder="Enter job title">
            </div>

            <div class="field">
              <label>Company</label>
              <input type="text" id="company" value="${jobData.company || ''}" placeholder="Enter company name">
            </div>

            <div class="field">
              <label>Description</label>
              <textarea id="description" placeholder="Enter job description">${jobData.description || ''}</textarea>
            </div>

            <div class="field">
              <label>URL</label>
              <input type="url" id="job-url" value="${jobData.url || ''}" placeholder="Job URL">
            </div>

            <div class="field">
              <label>Salary</label>
              <input type="text" id="salary" value="${jobData.salary || ''}" placeholder="e.g., $120k - $140k">
            </div>

          <div class="button-group">
            <button type="button" id="save-job" class="btn btn-primary">
              Save Job
            </button>
            <button type="button" id="show-list" class="btn btn-secondary">
              Show List
            </button>
          </div>
          </form>

          <div id="status" class="status"></div>

          <div class="footer">
            <button id="rescrape" class="btn btn-secondary">Re-scan</button>
          </div>
        </div>
      </div>
    `;

    document.getElementById('save-job')?.addEventListener('click', () => this.saveJob());
    document.getElementById('show-list')?.addEventListener('click', () => this.showJobList());
    document.getElementById('rescrape')?.addEventListener('click', () => this.loadJobAndShowForm());
    document.getElementById('back-to-list')?.addEventListener('click', () => this.showJobList());
  }

  async saveJob() {
    const jobData = {
      'TrackTern': document.getElementById('job-title')?.value.trim(),
      'Company': document.getElementById('company')?.value.trim(),
      'Description': document.getElementById('description')?.value.trim(),
      'URL': document.getElementById('job-url')?.value.trim(),
      'Salary': document.getElementById('salary')?.value.trim(),
      'Date Added': new Date().toISOString().split('T')[0],
      'Status': 'Applied'
    };

    if (!jobData['TrackTern']) {
      this.showStatus('Please enter a job title', 'error');
      return;
    }

    if (!jobData['Company']) {
      this.showStatus('Please enter a company name', 'error');
      return;
    }

    if (!jobData['Description']) {
      this.showStatus('Please enter a job description', 'error');
      return;
    }

    if (!jobData['URL']) {
      this.showStatus('Please enter a job URL', 'error');
      return;
    }

    try {
      const existingJobs = await this.getLocalJobs();
      const isDuplicate = existingJobs.some(job => job.fields['URL'] === jobData['URL']);

      if (isDuplicate) {
        const confirmed = confirm('This job has already been saved. Save it again?');
        if (!confirmed) {
          return;
        }
      }
    } catch (error) {
      console.error('Error checking for duplicates:', error);
    }

    await this.saveJobLocally(jobData);
  }

  async saveJobLocally(jobData) {
    this.showStatus('Saving job locally...', 'info');

    try {
      const result = await chrome.storage.local.get(['savedJobs']);
      const savedJobs = result.savedJobs || [];

      const newJob = {
        id: Date.now().toString(),
        fields: jobData,
        createdTime: new Date().toISOString()
      };

      savedJobs.unshift(newJob);
      await chrome.storage.local.set({ savedJobs });

      this.showStatus('Job saved successfully!', 'success');

      setTimeout(() => {
        this.showJobList();
      }, 1000);
    } catch (error) {
      console.error('Local save error:', error);
      this.showStatus(`Save failed: ${error.message}`, 'error');
    }
  }

  async showJobList() {
    this.showStatus('Loading your saved jobs...', 'info');

    try {
      const jobs = await this.getLocalJobs();
      const jobCount = jobs.length;
      const statuses = ['Applied', 'Interview', 'Rejected'];
      const counts = {};
      statuses.forEach(s => (counts[s] = 0));
      jobs.forEach(j => {
        const st = j.fields['Status'] || 'Applied';
        if (counts[st] !== undefined) counts[st]++;
      });
      const currentFilter = this.currentStatusFilter || 'All';
      const filteredJobs = currentFilter === 'All'
        ? jobs
        : jobs.filter(job => (job.fields['Status'] || 'Applied') === currentFilter);

      document.body.innerHTML = `
        <div class="dashboard">
          <header class="top-bar">
            <div class="brand">
              <img src="icons/icon32.png" alt="TrackFlow" class="brand-icon" />
              <span class="brand-name">TrackFlow</span>
            </div>
            <div class="top-actions">
              <span id="export-csv" class="icon-button" aria-label="Export">⬇️</span>
              <span id="settings" class="icon-button" aria-label="Settings">⚙️</span>
            </div>
          </header>

          <button id="add-current-job" class="btn btn-primary add-job">
            Add New Job
          </button>

          <section class="status-strip">
            ${['All', ...statuses].map((s, idx) => `
              <button class="status-pill ${s === currentFilter ? 'active' : ''}" type="button" data-status="${s}">
                ${s}${s === 'All' ? `: ${jobCount}` : `: ${counts[s]}`}
              </button>
            `).join('')}
          </section>

          <section class="job-list">
            ${filteredJobs.length === 0 ? `
              <div class="empty-state">
                <p>No jobs found for this status.</p>
              </div>
            ` : filteredJobs.map(job => `
              <div class="job-card" data-job-id="${job.id}" data-job-url="${job.fields['URL'] || ''}">
                <div class="job-row">
                  <div class="job-title">${job.fields['TrackTern'] || 'Untitled'}</div>
                  <div class="job-date">${this.formatRelativeDate(job.fields['Date Added'])}</div>
                </div>
                <div class="job-company">
                  ${job.fields['Company'] || 'Unknown Company'} • ${job.fields['Location'] || 'Job Board'}
                </div>
                <div class="job-status-row">
                  <span class="status-badge">${job.fields['Status'] || 'Applied'}</span>
                  ${job.fields['Salary'] ? `<span class="salary-badge">💵 ${job.fields['Salary']}</span>` : ''}
                </div>
                <button class="btn btn-icon delete-job" data-job-id="${job.id}" aria-label="Delete job">×</button>
              </div>
            `).join('')}
          </section>

          <div id="status" class="status"></div>
        </div>
      `;

      document.getElementById('add-current-job')?.addEventListener('click', () => this.loadJobAndShowForm());
      document.getElementById('export-csv')?.addEventListener('click', () => this.exportToCSV(jobs));
      document.getElementById('settings')?.addEventListener('click', () => this.showSettings());
      document.querySelectorAll('.status-pill').forEach(pill => {
        pill.addEventListener('click', e => {
          const status = e.currentTarget.getAttribute('data-status') || 'All';
          this.currentStatusFilter = status;
          this.showJobList();
        });
      });
      document.querySelectorAll('.delete-job').forEach(btn =>
        btn.addEventListener('click', e => {
          e.stopPropagation();
          const id = e.currentTarget.getAttribute('data-job-id');
          this.deleteJob(id);
        })
      );
      document.querySelectorAll('.job-card').forEach(card => {
        card.addEventListener('click', () => {
          const url = card.getAttribute('data-job-url');
          if (url) {
            chrome.tabs.create({ url });
          }
        });
      });

      this.showStatus('', 'info');
    } catch (error) {
      console.error('Error loading job list:', error);
      this.showStatus(`Failed to load jobs: ${error.message}`, 'error');
    }
  }

  async getLocalJobs() {
    try {
      const result = await chrome.storage.local.get(['savedJobs']);
      return result.savedJobs || [];
    } catch (error) {
      console.error('Error getting local jobs:', error);
      return [];
    }
  }

  formatRelativeDate(dateString) {
    if (!dateString) return 'No date';
    const parsed = new Date(dateString);
    if (Number.isNaN(parsed.getTime())) return 'No date';

    const diffMs = Date.now() - parsed.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays <= 0) return 'Today';
    if (diffDays === 1) return '1d ago';
    if (diffDays < 7) return `${diffDays}d ago`;
    const diffWeeks = Math.floor(diffDays / 7);
    if (diffWeeks === 1) return '1w ago';
    if (diffWeeks < 5) return `${diffWeeks}w ago`;
    const diffMonths = Math.floor(diffDays / 30);
    if (diffMonths === 1) return '1mo ago';
    if (diffMonths < 12) return `${diffMonths}mo ago`;
    const diffYears = Math.floor(diffDays / 365);
    return diffYears === 1 ? '1y ago' : `${diffYears}y ago`;
  }

  async exportToCSV(jobs) {
    const headers = ['TrackFlow', 'Company', 'Status', 'Date Added', 'URL'];
    const rows = jobs.map(job => [
      job.fields['TrackTern'] || '',
      job.fields['Company'] || '',
      job.fields['Status'] || '',
      job.fields['Date Added'] || '',
      job.fields['URL'] || ''
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(field => `"${(field || '').replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `job-tracker-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();

    URL.revokeObjectURL(url);
    this.showStatus('CSV exported successfully!', 'success');
  }

  showSettings() {
    document.body.innerHTML = `
      <div class="settings-screen">
        <div class="header">
          <h3>Settings</h3>
        </div>

        <div class="settings-list">
          <div class="setting-item">
            <div class="setting-label">Storage Type</div>
            <div class="setting-value">Local Storage</div>
          </div>
          <div class="setting-item">
            <div class="setting-label">Data Location</div>
            <div class="setting-value">This browser only</div>
          </div>
        </div>

        <div class="settings-actions">
          <button id="clear-local-data" class="danger-btn">
            Clear All Local Data
          </button>
        </div>

        <div id="status" class="status"></div>

        <div class="footer">
          <button id="back-to-list" class="secondary-btn">Back to Job List</button>
        </div>
      </div>
    `;

    document.getElementById('clear-local-data')?.addEventListener('click', () => this.clearLocalData());
    document.getElementById('back-to-list')?.addEventListener('click', () => this.showJobList());
  }

  async clearLocalData() {
    if (confirm('Delete all saved jobs? This cannot be undone.')) {
      await chrome.storage.local.remove(['savedJobs']);
      this.showStatus('All local data cleared', 'success');
      setTimeout(() => {
        this.showJobList();
      }, 1000);
    }
  }

  async deleteJob(jobId) {
    if (!confirm('Delete this job?')) return;
    const result = await chrome.storage.local.get(['savedJobs']);
    const jobs = (result.savedJobs || []).filter(j => j.id !== jobId);
    await chrome.storage.local.set({ savedJobs: jobs });
    this.showStatus('Job deleted', 'success');
    this.showJobList();
  }

  async updateJobStatus(jobId, status) {
    const result = await chrome.storage.local.get(['savedJobs']);
    const jobs = result.savedJobs || [];
    const job = jobs.find(j => j.id === jobId);
    if (job) {
      job.fields['Status'] = status;
      await chrome.storage.local.set({ savedJobs: jobs });
    }
    this.showJobList();
  }

  showStatus(message, type = 'info') {
    const statusEl = document.getElementById('status');
    if (statusEl) {
      statusEl.textContent = message;
      statusEl.className = `status ${type}`;
      if (type === 'success') {
        setTimeout(() => (statusEl.textContent = ''), 3000);
      }
    }
  }

  showError(message) {
    this.showStatus(message, 'error');
  }
}

const styles = `
  :root {
    --primary: #007bff;
    --primary-dark: #0069d9;
    --text: #111827;
    --muted: #6b7280;
    --border: #e5e7eb;
    --surface: #ffffff;
    --surface-alt: #f9fafb;
  }

  * {
    box-sizing: border-box;
  }

  body {
    width: 380px;
    height: auto;
    max-height: 600px;
    margin: 0;
    padding: 0 0 20px;
    font-family: 'Inter', -apple-system, sans-serif;
    background: var(--surface-alt);
    color: var(--text);
    border: 2px solid #111827;
    overflow-y: hidden;
  }

  .job-form, .settings-screen {
    padding: 20px;
  }

  .dashboard {
    background: var(--surface-alt);
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .top-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .brand-icon {
    width: 22px;
    height: 22px;
  }

  .brand-name {
    font-size: 16px;
    font-weight: 600;
    color: var(--text);
  }

  .top-actions {
    display: flex;
    gap: 10px;
  }

  .icon-button {
    font-size: 16px;
    color: #9ca3af;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
  }

  .icon-button:hover {
    color: #6b7280;
  }

  .add-job {
    margin: 0 16px 8px;
    border-radius: 6px;
    box-shadow: none;
  }

  .add-job:hover {
    transform: scale(0.98);
  }

  .status-strip {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    padding-bottom: 8px;
    margin-bottom: 4px;
  }

  .status-strip::-webkit-scrollbar {
    height: 6px;
  }

  .status-strip::-webkit-scrollbar-thumb {
    background: #d1d5db;
    border-radius: 999px;
  }

  .status-pill {
    border-radius: 999px;
    padding: 6px 12px;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--muted);
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
  }

  .status-pill.active {
    background: var(--primary);
    border-color: var(--primary);
    color: #ffffff;
  }

  .list-spacer {
    height: 8px;
  }

  .job-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
    overflow-y: auto;
    padding-right: 4px;
    max-height: 360px;
  }

  .job-card {
    background: var(--surface);
    border-radius: 8px;
    padding: 16px;
    border: 1px solid var(--border);
    box-shadow: none;
    transition: transform 0.2s ease;
    position: relative;
    cursor: pointer;
  }

  .job-card:hover {
    transform: translateY(-2px);
  }

  .job-row {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    align-items: flex-start;
    padding-right: 32px;
  }

  .job-title {
    font-size: 14px;
    font-weight: 700;
    line-height: 1.3;
    color: var(--text);
    display: -webkit-box;
    -webkit-line-clamp: 1;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .job-company {
    font-size: 12px;
    color: #6b7280;
    margin: 6px 0 8px;
  }

  .job-date {
    font-size: 11px;
    color: #9ca3af;
  }

  .job-status-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .status-badge {
    background: #eff6ff;
    color: #2563eb;
    font-size: 11px;
    padding: 4px 8px;
    border-radius: 12px;
    display: inline-block;
    font-weight: 600;
  }

  .salary-badge {
    background: #ecfdf3;
    color: #047857;
    font-size: 11px;
    padding: 4px 8px;
    border-radius: 12px;
    display: inline-block;
    font-weight: 600;
  }

  .btn {
    border: none;
    cursor: pointer;
    font-weight: 600;
    font-size: 13px;
    transition: background 0.2s ease, color 0.2s ease, transform 0.2s ease;
  }

  .btn-pill {
    border-radius: 999px;
    padding: 10px 16px;
  }

  .btn-full {
    width: 100%;
  }

  .btn-primary {
    background: #2563eb;
    color: #ffffff;
    border-radius: 6px;
    font-weight: 500;
  }

  .btn-primary:hover {
    background: #1d4ed8;
  }

  .btn-secondary {
    background: #ffffff;
    color: #374151;
    border: 1px solid var(--border);
    border-radius: 6px;
    font-weight: 500;
  }

  .btn-secondary:hover {
    background: #f3f4f6;
  }

  .btn-small {
    padding: 6px 10px;
    font-size: 12px;
  }

  .btn-ghost {
    background: transparent;
    color: var(--primary);
    border: 1px solid rgba(0, 123, 255, 0.2);
  }

  .btn-ghost:hover {
    background: rgba(0, 123, 255, 0.08);
  }

  .btn-icon {
    width: 24px;
    height: 24px;
    border-radius: 999px;
    background: transparent;
    color: #9ca3af;
    border: 1px solid transparent;
    font-size: 16px;
    line-height: 1;
    position: absolute;
    top: 10px;
    right: 10px;
  }

  .delete-job {
    opacity: 0;
  }

  .job-card:hover .delete-job {
    opacity: 1;
  }

  .delete-job:hover {
    color: #ef4444;
    background: rgba(239, 68, 68, 0.12);
  }

  .empty-state {
    text-align: center;
    padding: 32px 20px;
    color: var(--muted);
    background: var(--surface-alt);
    border-radius: 12px;
  }

  .status {
    margin-top: 12px;
    padding: 10px;
    border-radius: 10px;
    font-size: 13px;
    text-align: center;
  }

  .status:empty {
    display: none;
  }

  .status.info {
    background: #e9f2ff;
    color: #1d4ed8;
  }

  .status.success {
    background: #ecfdf3;
    color: #047857;
  }

  .status.error {
    background: #fef2f2;
    color: #b91c1c;
  }

  .field {
    margin-bottom: 15px;
  }

  .field label {
    display: block;
    margin-bottom: 6px;
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
  }

  .field input, .field textarea {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: 10px;
    font-size: 13px;
    font-family: inherit;
  }

  .field textarea {
    height: 90px;
    resize: vertical;
  }

  .button-group {
    display: flex;
    gap: 10px;
    margin-top: 8px;
  }

  .button-group .btn {
    padding: 10px 14px;
  }

  .form-notice {
    margin-bottom: 16px;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
    background: #111827;
    color: #ffffff;
    padding: 12px 14px;
    border-radius: 8px;
  }

  .header h3 {
    margin: 0;
    color: #ffffff;
    font-size: 16px;
    font-weight: 700;
  }

  .header .subtitle {
    font-size: 12px;
    color: #cbd5f5;
  }

  .header .brand {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .header .brand-icon {
    width: 20px;
    height: 20px;
  }

  .header .brand-name {
    font-size: 16px;
    font-weight: 600;
    color: #ffffff;
  }

  .settings-list {
    margin: 20px 0;
  }

  .setting-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 0;
    border-bottom: 1px solid var(--border);
  }

  .setting-item:last-child {
    border-bottom: none;
  }

  .setting-label {
    font-size: 14px;
    color: var(--text);
    font-weight: 600;
  }

  .setting-value {
    font-size: 13px;
    color: var(--muted);
    max-width: 150px;
    text-align: right;
    word-break: break-word;
  }

  .settings-actions {
    margin: 20px 0;
  }

  .danger-btn {
    background: #ef4444;
    color: white;
    border: none;
    padding: 12px 20px;
    border-radius: 999px;
    font-weight: 600;
    cursor: pointer;
    width: 100%;
    font-size: 14px;
  }
`;

const styleSheet = document.createElement('style');
styleSheet.textContent = styles;
document.head.appendChild(styleSheet);

document.addEventListener('DOMContentLoaded', () => {
  new TrackternJobSaver();
});
