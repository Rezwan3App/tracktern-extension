// Configuration and Airtable API integration
class TrackternJobSaver {
  constructor() {
    this.isInitialized = false;
    this.config = null;
    this.init();
  }

  async init() {
    console.log('TrackternJobSaver: Initializing...');
    
    try {
      console.log('TrackternJobSaver: Loading configuration...');
      await this.loadConfiguration();
      
      console.log('TrackternJobSaver: Setting up event listeners...');
      this.setupEventListeners();
      
      console.log('TrackternJobSaver: Loading job form...');
      // Always start by scraping and showing job form
      await this.loadJobAndShowForm();
      
      this.isInitialized = true;
      console.log('TrackternJobSaver: Initialization complete!');
    } catch (error) {
      console.error('TrackternJobSaver: Initialization error:', error);
      this.showError('Failed to initialize extension');
    }
  }

  setupEventListeners() {
    // Dynamic event listeners will be set up in each screen
  }

  async loadConfiguration() {
    try {
      const result = await chrome.storage.sync.get(['airtableConfig']);
      this.config = result.airtableConfig;
    } catch (error) {
      console.error('Error loading config:', error);
    }
  }

  async loadJobAndShowForm() {
    this.showStatus('Extracting job information...', 'info');
    
    try {
      const jobData = await this.scrapeCurrentPage();
      this.showJobForm(jobData);
    } catch (error) {
      console.error('Scraping error:', error);
      this.showJobForm({}); // Show empty form
    }
  }

  async scrapeCurrentPage() {
    console.log('TrackternJobSaver: Starting scrapeCurrentPage...');
    
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const currentTab = tabs[0];
      
      console.log('TrackternJobSaver: Current tab:', currentTab.url);
      
      const results = await chrome.scripting.executeScript({
        target: { tabId: currentTab.id },
        function: this.extractJobInfo,
        args: []
      });

      console.log('TrackternJobSaver: Script execution results:', results);

      if (results && results[0]?.result) {
        const jobData = {
          ...results[0].result,
          url: currentTab.url,
          domain: new URL(currentTab.url).hostname
        };
        console.log('TrackternJobSaver: Final job data:', jobData);
        return jobData;
      }
    } catch (error) {
      console.error('TrackternJobSaver: Scraping failed:', error);
    }
    
    console.log('TrackternJobSaver: Returning empty data');
    return {};
  }

  // This function runs in the page context
  extractJobInfo() {
    console.log('Tracktern: Starting job extraction on', window.location.href);
    
    // Quick test - return test data first
    return {
      title: 'TEST TITLE',
      company: 'TEST COMPANY',
      description: 'TEST DESCRIPTION'
    };
    
    const selectors = {
      title: [
        // LinkedIn 2024 selectors
        '.job-details-jobs-unified-top-card__job-title a',
        '.job-details-jobs-unified-top-card__job-title',
        '.jobs-unified-top-card__job-title a',
        '.jobs-unified-top-card__job-title',
        '.jobs-details__main-content h1',
        '.t-24.t-bold.jobs-unified-top-card__job-title',
        '.artdeco-entity-lockup__title',
        // Generic job selectors
        'h1',
        '[data-qa="posting-title"]',
        '.topcard__title',
        '.jobsearch-JobInfoHeader-title', 
        '.job-title',
        '[class*="job-title"]',
        '[class*="posting-title"]',
        '.posting-headline__position',
        '.t-24', 
        'article h1',
        '[data-test="job-title"]',
        '.position-title',
        '.job-post-title'
      ],
      company: [
        // LinkedIn 2024 selectors
        '.job-details-jobs-unified-top-card__company-name a',
        '.job-details-jobs-unified-top-card__company-name',
        '.jobs-unified-top-card__company-name a',
        '.jobs-unified-top-card__company-name',
        '.jobs-unified-top-card__subtitle-primary-grouping a',
        '.artdeco-entity-lockup__subtitle',
        // Generic company selectors
        '[data-qa="posting-company"]',
        '.topcard__org-name-link',
        '.topcard__flavor', 
        '.jobsearch-InlineCompanyRating',
        '[data-company-name]',
        '[class*="company"]',
        'a[href*="/company/"]',
        '.company-name',
        '[data-test="company-name"]',
        '.employer',
        '.job-company'
      ],
      description: [
        // LinkedIn 2024 selectors
        '.jobs-description-content__text',
        '.jobs-description__content',
        '.jobs-box__html-content',
        '.jobs-description',
        // Generic description selectors
        '[data-qa="job-description"]',
        '.description',
        '.jobsearch-jobDescriptionText',
        '[class*="job-description"]', 
        '[class*="description"]',
        '.job-description-content',
        'article',
        'section',
        '[data-test="job-description"]',
        '.job-details',
        '.job-description',
        '.job-content'
      ]
    };

    const getTextFromSelectors = (selectorList, fieldName) => {
      console.log(`Tracktern: Looking for ${fieldName} with selectors:`, selectorList);
      
      for (const selector of selectorList) {
        const elements = document.querySelectorAll(selector);
        console.log(`Tracktern: Selector "${selector}" found ${elements.length} elements`);
        
        for (const el of elements) {
          const text = el.innerText?.trim();
          if (text && text.length > 2 && text.length < 300) {
            console.log(`Tracktern: Found ${fieldName}:`, text);
            return text;
          }
        }
      }
      console.log(`Tracktern: No ${fieldName} found`);
      return '';
    };

    const getLongTextFromSelectors = (selectorList, fieldName) => {
      console.log(`Tracktern: Looking for ${fieldName} with selectors:`, selectorList);
      
      for (const selector of selectorList) {
        const el = document.querySelector(selector);
        if (el) {
          let text = el.innerText?.trim() || '';
          
          // Clean up description text
          text = text.replace(/Share this job.*$/i, '');
          text = text.replace(/Apply now.*$/i, '');
          text = text.replace(/Show more.*$/i, '');
          text = text.replace(/Show less.*$/i, '');
          text = text.replace(/See more jobs like this.*$/i, '');
          
          if (text.length > 50) {
            const finalText = text.length > 1000 ? text.substring(0, 1000) + '...' : text;
            console.log(`Tracktern: Found ${fieldName}:`, finalText.substring(0, 100) + '...');
            return finalText;
          }
        }
      }
      console.log(`Tracktern: No ${fieldName} found`);
      return '';
    };

    let result = {
      title: getTextFromSelectors(selectors.title, 'title'),
      company: getTextFromSelectors(selectors.company, 'company'),
      description: getLongTextFromSelectors(selectors.description, 'description'),
      scrapedAt: new Date().toISOString()
    };

    // Fallback: if nothing found, try generic approach
    if (!result.title && !result.company && !result.description) {
      console.log('Tracktern: No data found with selectors, trying aggressive fallback...');
      
      // Try to find the largest heading as title
      const headings = document.querySelectorAll('h1, h2, h3, .title, [class*="title"], [class*="job"]');
      for (const heading of headings) {
        const text = heading.innerText?.trim();
        if (text && text.length > 5 && text.length < 200 && !text.includes('©') && !text.includes('Sign in')) {
          result.title = text;
          console.log('Tracktern: Found title via fallback:', text);
          break;
        }
      }
      
      // Try to find company in page title, URLs, or anywhere on page
      const pageTitle = document.title;
      if (pageTitle) {
        const companyMatch = pageTitle.match(/at\s+([^|•-]+)/i) || 
                           pageTitle.match(/\|\s*([^|•-]+)/i) ||
                           pageTitle.match(/•\s*([^|•-]+)/i) ||
                           pageTitle.match(/-\s*([^|•-]+)/i);
        if (companyMatch) {
          result.company = companyMatch[1].trim();
          console.log('Tracktern: Found company via page title:', result.company);
        }
      }
      
      // Try URL-based extraction
      const url = window.location.href;
      if (url.includes('linkedin.com')) {
        // Extract from LinkedIn URL patterns
        const linkedinMatch = url.match(/\/company\/([^\/]+)/);
        if (linkedinMatch && !result.company) {
          result.company = linkedinMatch[1].replace(/-/g, ' ');
          console.log('Tracktern: Found company via LinkedIn URL:', result.company);
        }
      }
      
      // Last resort: scan all text for job-like patterns
      if (!result.title) {
        const allText = document.body.innerText;
        const jobTitlePatterns = [
          /Job Title:\s*([^\n]+)/i,
          /Position:\s*([^\n]+)/i,
          /Role:\s*([^\n]+)/i
        ];
        
        for (const pattern of jobTitlePatterns) {
          const match = allText.match(pattern);
          if (match) {
            result.title = match[1].trim();
            console.log('Tracktern: Found title via text pattern:', result.title);
            break;
          }
        }
      }
    }

    console.log('Tracktern: Final extraction result:', result);
    return result;
  }

  showJobForm(jobData = {}) {
    const hasData = jobData.title || jobData.company || jobData.description;
    
    document.body.innerHTML = `
      <div class="job-form">
        <div class="header">
          <h3>💼 Job Details</h3>
          <div class="domain">${jobData.domain || 'Current page'}</div>
        </div>
        
        ${!hasData ? `
          <div class="no-data-notice">
            <p>⚠️ Couldn't auto-detect job information on this page.</p>
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
          
          <button type="button" id="save-job" class="primary-btn">
            Save to Airtable
          </button>
        </form>
        
        <div id="status" class="status"></div>
        
        <div class="footer">
          <button id="rescrape" class="secondary-btn">↻ Re-scan page</button>
        </div>
      </div>
    `;
    
    // Set up event listeners
    document.getElementById('save-job')?.addEventListener('click', () => this.handleSaveToAirtable());
    document.getElementById('rescrape')?.addEventListener('click', () => this.loadJobAndShowForm());
  }

  async handleSaveToAirtable() {
    // Check if we have Airtable config
    if (!this.config?.patToken) {
      this.startAirtableSetup();
      return;
    }

    // We have config, save directly
    await this.saveJob();
  }

  startAirtableSetup() {
    this.showStatus('Setting up Airtable connection...', 'info');
    
    // Open Airtable PAT creation page
    chrome.tabs.create({
      url: 'https://airtable.com/create/tokens',
      active: true
    });

    // Show instructions
    this.showSetupInstructions();
  }

  showSetupInstructions() {
    document.body.innerHTML = `
      <div class="setup-screen">
        <h3>Connect to Airtable</h3>
        <p class="setup-intro">We need to connect to your Airtable account to save jobs.</p>
        
        <div class="steps">
          <div class="step">
            <span class="step-number">1</span>
            <div class="step-content">
              <strong>Create Personal Access Token</strong>
              <p>On the Airtable page that just opened, click "Create new token"</p>
            </div>
          </div>
          
          <div class="step">
            <span class="step-number">2</span>
            <div class="step-content">
              <strong>Set Permissions</strong>
              <p>Enable these scopes:</p>
              <ul>
                <li>data.records:read</li>
                <li>data.records:write</li>
                <li>schema.bases:read</li>
              </ul>
            </div>
          </div>
          
          <div class="step">
            <span class="step-number">3</span>
            <div class="step-content">
              <strong>Paste Your Token</strong>
              <div class="token-input">
                <input type="password" id="pat-input" placeholder="Paste your Personal Access Token here" />
                <button id="verify-token" class="primary-btn">Connect</button>
              </div>
            </div>
          </div>
        </div>
        
        <div id="status" class="status"></div>
        
        <div class="footer">
          <button id="back-to-job" class="secondary-btn">← Back to job form</button>
        </div>
      </div>
    `;
    
    // Set up event listeners
    document.getElementById('verify-token')?.addEventListener('click', () => this.verifyAndSetupAirtable());
    document.getElementById('back-to-job')?.addEventListener('click', () => this.loadJobAndShowForm());
  }

  async verifyAndSetupAirtable() {
    const token = document.getElementById('pat-input')?.value.trim();
    
    if (!token) {
      this.showStatus('Please paste your Personal Access Token', 'error');
      return;
    }

    this.showStatus('Verifying token and setting up workspace...', 'info');

    try {
      // Test token and get available bases
      const bases = await this.getAirtableBases(token);
      
      // Look for existing job tracking base or use first base
      let baseId = await this.findOrCreateJobBase(token, bases);
      
      // Ensure table structure exists
      await this.ensureTableStructure(token, baseId);
      
      // Save configuration
      await this.saveConfiguration(token, baseId);
      
      this.showStatus('✅ Connected! Saving your job...', 'success');
      
      // Go back to form and auto-save
      setTimeout(async () => {
        await this.loadJobAndShowForm();
        // Auto-save after connection
        setTimeout(() => {
          this.saveJob();
        }, 500);
      }, 1000);
      
    } catch (error) {
      console.error('Setup error:', error);
      this.showStatus(`❌ Setup failed: ${error.message}`, 'error');
    }
  }

  async getAirtableBases(token) {
    const response = await fetch('https://api.airtable.com/v0/meta/bases', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Invalid token: ${response.status}`);
    }

    const data = await response.json();
    return data.bases || [];
  }

  async findOrCreateJobBase(token, bases) {
    // Look for existing base with job-related name
    const jobBase = bases.find(base => 
      base.name.toLowerCase().includes('job') || 
      base.name.toLowerCase().includes('career') ||
      base.name.toLowerCase().includes('application') ||
      base.name.toLowerCase().includes('track')
    );

    if (jobBase) {
      return jobBase.id;
    }

    // Use first available base
    if (bases.length > 0) {
      return bases[0].id;
    }

    throw new Error('No bases found. Please create a base in Airtable first.');
  }

  async ensureTableStructure(token, baseId) {
    // Get base schema to check existing tables
    const schemaResponse = await fetch(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!schemaResponse.ok) {
      throw new Error('Could not access base schema');
    }

    const schema = await schemaResponse.json();
    
    // Find job-related table or use first table
    let table = schema.tables.find(t => 
      t.name.toLowerCase().includes('job') || 
      t.name.toLowerCase().includes('application') ||
      t.name.toLowerCase().includes('position')
    ) || schema.tables[0];

    if (!table) {
      throw new Error('No tables found in base');
    }

    return table.name;
  }

  async saveConfiguration(token, baseId) {
    const tableName = await this.ensureTableStructure(token, baseId);
    
    const config = {
      patToken: token,
      baseId: baseId,
      tableName: tableName,
      setupDate: new Date().toISOString()
    };

    await chrome.storage.sync.set({ airtableConfig: config });
    this.config = config;
  }

  async saveJob() {
    const jobData = {
      'Job Title': document.getElementById('job-title')?.value.trim(),
      'Company': document.getElementById('company')?.value.trim(), 
      'Description': document.getElementById('description')?.value.trim(),
      'URL': document.getElementById('job-url')?.value.trim(),
      'Date Added': new Date().toISOString().split('T')[0],
      'Status': 'To Apply'
    };

    if (!jobData['Job Title'] && !jobData['Company']) {
      this.showStatus('Please enter at least a job title or company', 'error');
      return;
    }

    this.showStatus('Saving to Airtable...', 'info');

    try {
      await this.createRecord(jobData);
      this.showStatus('✅ Job saved successfully!', 'success');
      
      // Auto-close after success
      setTimeout(() => {
        window.close();
      }, 1500);
      
    } catch (error) {
      console.error('Save error:', error);
      this.showStatus(`❌ Save failed: ${error.message}`, 'error');
    }
  }

  async createRecord(fields) {
    const url = `https://api.airtable.com/v0/${this.config.baseId}/${encodeURIComponent(this.config.tableName)}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.patToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ fields })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `HTTP ${response.status}`);
    }

    return response.json();
  }

  showStatus(message, type = 'info') {
    const statusEl = document.getElementById('status');
    if (statusEl) {
      statusEl.textContent = message;
      statusEl.className = `status ${type}`;
      
      if (type === 'success') {
        setTimeout(() => statusEl.textContent = '', 3000);
      }
    }
  }

  showError(message) {
    this.showStatus(message, 'error');
  }
}

// CSS Styles
const styles = `
  body {
    width: 380px;
    min-height: 450px;
    margin: 0;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #f8f9fa;
  }
  
  .job-form, .setup-screen {
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
  
  .domain {
    font-size: 11px;
    color: #718096;
    background: #edf2f7;
    padding: 3px 6px;
    border-radius: 3px;
  }
  
  .no-data-notice {
    background: #fef5e7;
    border: 1px solid #f6ad55;
    border-radius: 6px;
    padding: 12px;
    margin-bottom: 15px;
  }
  
  .no-data-notice p {
    margin: 4px 0;
    font-size: 13px;
    color: #c05621;
  }
  
  .setup-intro {
    color: #4a5568;
    font-size: 14px;
    margin-bottom: 20px;
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
  
  .primary-btn {
    background: #3182ce;
    color: white;
    border: none;
    padding: 12px 20px;
    border-radius: 8px;
    font-weight: 600;
    cursor: pointer;
    width: 100%;
    margin-bottom: 10px;
    font-size: 14px;
  }
  
  .primary-btn:hover {
    background: #2c5aa0;
  }
  
  .secondary-btn {
    background: #e2e8f0;
    color: #4a5568;
    border: none;
    padding: 8px 16px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
  }
  
  .footer {
    display: flex;
    align-items: center;
    justify-content: center;
    margin-top: 20px;
    padding-top: 15px;
    border-top: 1px solid #e2e8f0;
  }
  
  .steps {
    margin: 20px 0;
  }
  
  .step {
    display: flex;
    margin-bottom: 20px;
    align-items: flex-start;
  }
  
  .step-number {
    background: #3182ce;
    color: white;
    border-radius: 50%;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: bold;
    margin-right: 12px;
    flex-shrink: 0;
  }
  
  .step-content strong {
    display: block;
    margin-bottom: 4px;
    color: #2d3748;
    font-size: 14px;
  }
  
  .step-content p {
    margin: 4px 0;
    font-size: 13px;
    color: #4a5568;
  }
  
  .step-content ul {
    margin: 8px 0;
    padding-left: 16px;
  }
  
  .step-content li {
    font-size: 12px;
    color: #4a5568;
    margin: 2px 0;
  }
  
  .token-input {
    display: flex;
    gap: 8px;
    margin-top: 8px;
  }
  
  .token-input input {
    flex: 1;
    padding: 8px;
    border: 1px solid #cbd5e0;
    border-radius: 4px;
    font-size: 12px;
  }
  
  .token-input button {
    padding: 8px 16px;
    font-size: 12px;
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
`;

// Inject styles
const styleSheet = document.createElement('style');
styleSheet.textContent = styles;
document.head.appendChild(styleSheet);

// Initialize app when DOM is ready
console.log('TrackternJobSaver: Script loaded, waiting for DOM...');

document.addEventListener('DOMContentLoaded', () => {
  console.log('TrackternJobSaver: DOM ready, creating instance...');
  new TrackternJobSaver();
});











