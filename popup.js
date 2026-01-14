class TrackternJobSaver {
  constructor() {
    this.init();
  }

  async init() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const currentUrl = tabs[0]?.url || '';
      if (this.isLinkedInUrl(currentUrl)) {
        this.showLinkedInBlocked();
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
        this.showLinkedInBlocked();
        return;
      }
      this.showJobForm(jobData);
    } catch (error) {
      console.error('Scraping error:', error);
      this.showJobForm({});
    }
  }

  isLinkedInUrl(url) {
    return /(^|\/\/)(www\.)?linkedin\.com\//i.test(url || '');
  }

  async scrapeCurrentPage() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const currentTab = tabs[0];
    const currentUrl = currentTab?.url || '';

    if (this.isLinkedInUrl(currentUrl)) {
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

        const getTextFromSelectors = (selectorList) => {
          for (const selector of selectorList) {
            const elements = document.querySelectorAll(selector);
            for (const el of elements) {
              const text = el.innerText?.trim();
              if (text && text.length > 2 && text.length < 300) {
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

        let result = {
          title: getTextFromSelectors(selectors.title),
          company: getTextFromSelectors(selectors.company),
          description: getDescriptionText(selectors.description)
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

  showLinkedInBlocked() {
    document.body.innerHTML = `
      <div class="container">
        <div class="header">
          <h3>TrackTern</h3>
          <div class="subtitle">LinkedIn is not supported</div>
        </div>
        <div class="job-form">
          <div class="status error">
            <p>Job capture is disabled on linkedin.com.</p>
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
          <h3>TrackTern</h3>
          <div class="subtitle">Save a job listing</div>
        </div>

        <div class="job-form">
          ${!hasData ? `
            <div class="status info">
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
  }

  async saveJob() {
    const jobData = {
      'TrackTern': document.getElementById('job-title')?.value.trim(),
      'Company': document.getElementById('company')?.value.trim(),
      'Description': document.getElementById('description')?.value.trim(),
      'URL': document.getElementById('job-url')?.value.trim(),
      'Date Added': new Date().toISOString().split('T')[0],
      'Status': 'To Apply'
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
      const statuses = ['To Apply', 'Applied', 'Interview', 'Rejected', 'Offer'];
      const counts = {};
      statuses.forEach(s => (counts[s] = 0));
      jobs.forEach(j => {
        const st = j.fields['Status'] || 'To Apply';
        if (counts[st] !== undefined) counts[st]++;
      });

      document.body.innerHTML = `
        <div class="job-list-screen">
          <div class="job-list-header">
            <div class="job-stats">
              <div class="job-count">${jobCount} job${jobCount !== 1 ? 's' : ''} saved</div>
              <div class="storage-type">Local Storage</div>
            </div>
            <div class="status-counters">
              ${statuses.map(s => `<span class="chip">${counts[s]} ${s}</span>`).join('')}
            </div>
          </div>

          <div class="actions">
            <button id="add-current-job" class="btn btn-primary">
              Add New Job
            </button>
            <button id="refresh-list" class="btn btn-secondary">
              Refresh
            </button>
          </div>

          <div class="job-list">
            ${jobs.length === 0 ? `
              <div class="empty-state">
                <p>No jobs saved yet. Start by adding your first!</p>
              </div>
            ` : jobs.map(job => `
              <div class="job-item" data-job-id="${job.id}">
                <div class="job-header">
                  <div class="job-title">${job.fields['TrackTern'] || 'Untitled'}</div>
                  <button class="btn btn-danger delete-job" data-job-id="${job.id}">x</button>
                </div>
                <div class="job-company">${job.fields['Company'] || 'Unknown Company'}</div>
                <div class="job-status-row">
                  <select class="status-select" data-job-id="${job.id}">
                    ${statuses.map(s => `<option value="${s}" ${s === (job.fields['Status'] || 'To Apply') ? 'selected' : ''}>${s}</option>`).join('')}
                  </select>
                  <div class="job-date">${job.fields['Date Added'] ? new Date(job.fields['Date Added']).toLocaleDateString() : 'No date'}</div>
                </div>
                ${job.fields['URL'] ? `<a href="${job.fields['URL']}" target="_blank" class="job-link">View Job</a>` : ''}
              </div>
            `).join('')}
          </div>

          <div id="status" class="status"></div>

          <div class="footer">
            <button id="export-csv" class="btn btn-secondary">Export CSV</button>
            <button id="settings" class="btn btn-secondary">Settings</button>
          </div>
        </div>
      `;

      document.getElementById('add-current-job')?.addEventListener('click', () => this.loadJobAndShowForm());
      document.getElementById('refresh-list')?.addEventListener('click', () => this.showJobList());
      document.getElementById('export-csv')?.addEventListener('click', () => this.exportToCSV(jobs));
      document.getElementById('settings')?.addEventListener('click', () => this.showSettings());
      document.querySelectorAll('.delete-job').forEach(btn =>
        btn.addEventListener('click', e => {
          const id = e.currentTarget.getAttribute('data-job-id');
          this.deleteJob(id);
        })
      );
      document.querySelectorAll('.status-select').forEach(sel =>
        sel.addEventListener('change', e => {
          const id = e.currentTarget.getAttribute('data-job-id');
          const val = e.currentTarget.value;
          this.updateJobStatus(id, val);
        })
      );

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

  async exportToCSV(jobs) {
    const headers = ['TrackTern', 'Company', 'Status', 'Date Added', 'URL'];
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
  body {
    width: 380px;
    min-height: 450px;
    margin: 0;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #f8f9fa;
  }

  .job-form, .job-list-screen, .settings-screen {
    padding: 20px;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
    border-bottom: 1px solid #e2e8f0;
    padding-bottom: 15px;
  }

  .header h3 {
    margin: 0;
    color: #2d3748;
    font-size: 16px;
  }

  .header .subtitle {
    font-size: 11px;
    color: #718096;
  }

  .field {
    margin-bottom: 15px;
  }

  .field label {
    display: block;
    margin-bottom: 4px;
    font-size: 13px;
    font-weight: 500;
    color: #4a5568;
  }

  .field input, .field textarea {
    width: 100%;
    padding: 8px;
    border: 1px solid #cbd5e0;
    border-radius: 4px;
    font-size: 13px;
    box-sizing: border-box;
  }

  .field textarea {
    height: 80px;
    resize: vertical;
  }

  .btn {
    padding: 8px 16px;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
  }

  .btn-primary {
    background: #3182ce;
    color: white;
  }

  .btn-secondary {
    background: #e2e8f0;
    color: #4a5568;
  }

  .btn-danger {
    background: #e53e3e;
    color: white;
    padding: 4px 8px;
    font-size: 14px;
    border-radius: 4px;
    min-width: 24px;
    height: 24px;
  }

  .button-group {
    display: flex;
    gap: 10px;
    margin-top: 8px;
  }

  .footer {
    display: flex;
    align-items: center;
    justify-content: center;
    margin-top: 20px;
    padding-top: 15px;
    border-top: 1px solid #e2e8f0;
  }

  .status {
    margin: 10px 0;
    padding: 8px;
    border-radius: 4px;
    font-size: 13px;
    text-align: center;
  }

  .status.info {
    background: #bee3f8;
    color: #2a69ac;
  }

  .status.success {
    background: #c6f6d5;
    color: #25855a;
  }

  .status.error {
    background: #fed7d7;
    color: #c53030;
  }

  .job-count {
    font-size: 11px;
    color: #718096;
    background: #edf2f7;
    padding: 3px 6px;
    border-radius: 3px;
  }

  .actions {
    display: flex;
    gap: 8px;
    margin-bottom: 15px;
  }

  .job-list {
    max-height: 300px;
    overflow-y: auto;
  }

  .job-item {
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 12px;
    margin-bottom: 8px;
  }

  .job-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 6px;
  }

  .job-title {
    font-weight: 600;
    color: #2d3748;
    font-size: 14px;
    line-height: 1.3;
    flex: 1;
    margin-right: 8px;
  }

  .job-company {
    color: #4a5568;
    font-size: 13px;
    margin-bottom: 4px;
  }

  .job-status-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
  }

  .status-select {
    flex: 1;
    padding: 4px 8px;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    font-size: 12px;
    background: white;
    color: #4a5568;
  }

  .job-date {
    color: #718096;
    font-size: 11px;
    margin-bottom: 6px;
  }

  .job-link {
    color: #3182ce;
    text-decoration: none;
    font-size: 11px;
    font-weight: 500;
  }

  .empty-state {
    text-align: center;
    padding: 40px 20px;
    color: #718096;
  }

  .settings-list {
    margin: 20px 0;
  }

  .setting-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 0;
    border-bottom: 1px solid #e2e8f0;
  }

  .setting-item:last-child {
    border-bottom: none;
  }

  .setting-label {
    font-size: 14px;
    color: #4a5568;
    font-weight: 500;
  }

  .setting-value {
    font-size: 13px;
    color: #718096;
    max-width: 150px;
    text-align: right;
    word-break: break-all;
  }

  .settings-actions {
    margin: 20px 0;
  }

  .danger-btn {
    background: #e53e3e;
    color: white;
    border: none;
    padding: 12px 20px;
    border-radius: 8px;
    font-weight: 600;
    cursor: pointer;
    width: 100%;
    font-size: 14px;
  }

  .storage-type {
    font-size: 10px;
    color: #718096;
    background: #edf2f7;
    padding: 2px 6px;
    border-radius: 3px;
    margin-top: 2px;
  }

  .status-counters {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 4px;
  }

  .chip {
    font-size: 10px;
    padding: 2px 6px;
    border-radius: 3px;
    font-weight: 500;
    color: white;
    background: #718096;
  }
`;

const styleSheet = document.createElement('style');
styleSheet.textContent = styles;
document.head.appendChild(styleSheet);

document.addEventListener('DOMContentLoaded', () => {
  new TrackternJobSaver();
});
