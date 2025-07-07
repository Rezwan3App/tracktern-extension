// Configuration and Airtable API integration
class TrackternJobSaver {
  constructor() {
    this.isInitialized = false;
    this.config = null;
    this.init();
  }

  async init() {
    try {
      await this.loadConfiguration();
      this.setupEventListeners();
      await this.initializeFlow();
      this.isInitialized = true;
    } catch (error) {
      console.error('Initialization error:', error);
      this.showError('Failed to initialize extension');
    }
  }

  setupEventListeners() {
    document.getElementById('connect-airtable')?.addEventListener('click', () => this.startAirtableConnection());
    document.getElementById('save-job')?.addEventListener('click', () => this.saveJob());
    document.getElementById('try-again')?.addEventListener('click', () => this.retryConnection());
    document.getElementById('manual-entry')?.addEventListener('click', () => this.toggleManualEntry());
  }

  async loadConfiguration() {
    try {
      const result = await chrome.storage.sync.get(['airtableConfig']);
      this.config = result.airtableConfig;
    } catch (error) {
      console.error('Error loading config:', error);
    }
  }

  async initializeFlow() {
    if (!this.config?.patToken) {
      this.showConnectScreen();
    } else {
      await this.loadJobAndShowForm();
    }
  }

  showConnectScreen() {
    document.body.innerHTML = `
      <div class="connect-screen">
        <div class="logo">
          <h2>🎯 Tracktern Job Saver</h2>
          <p>Save job listings to Airtable instantly</p>
        </div>
        
        <div class="connect-section">
          <button id="connect-airtable" class="primary-btn">
            Connect to Airtable
          </button>
          <p class="help-text">We'll guide you through a quick setup</p>
        </div>
        
        <div class="manual-section">
          <button id="manual-entry" class="secondary-btn">
            I have a Personal Access Token
          </button>
        </div>
        
        <div id="status" class="status"></div>
      </div>
    `;
    this.setupEventListeners();
  }

  async startAirtableConnection() {
    this.showStatus('Opening Airtable setup...', 'info');
    
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
        <h3>Quick Airtable Setup</h3>
        
        <div class="steps">
          <div class="step">
            <span class="step-number">1</span>
            <div class="step-content">
              <strong>Create Personal Access Token</strong>
              <p>Click "Create new token" on the Airtable page that just opened</p>
            </div>
          </div>
          
          <div class="step">
            <span class="step-number">2</span>
            <div class="step-content">
              <strong>Set Permissions</strong>
              <p>Enable: data.records:read, data.records:write, schema.bases:read</p>
            </div>
          </div>
          
          <div class="step">
            <span class="step-number">3</span>
            <div class="step-content">
              <strong>Copy & Paste Token</strong>
              <div class="token-input">
                <input type="password" id="pat-input" placeholder="Paste your token here" />
                <button id="verify-token" class="primary-btn">Connect</button>
              </div>
            </div>
          </div>
        </div>
        
        <div id="status" class="status"></div>
        
        <div class="help-section">
          <button id="try-again" class="secondary-btn">Start Over</button>
        </div>
      </div>
    `;
    
    this.setupEventListeners();
    document.getElementById('verify-token')?.addEventListener('click', () => this.verifyAndSetupAirtable());
  }

  async verifyAndSetupAirtable() {
    const token = document.getElementById('pat-input')?.value.trim();
    
    if (!token) {
      this.showStatus('Please paste your Personal Access Token', 'error');
      return;
    }

    this.showStatus('Verifying token and setting up your workspace...', 'info');

    try {
      // Test token and get available bases
      const bases = await this.getAirtableBases(token);
      
      // Look for existing job tracking base or create new one
      let baseId = await this.findOrCreateJobBase(token, bases);
      
      // Ensure table structure exists
      await this.ensureTableStructure(token, baseId);
      
      // Save configuration
      await this.saveConfiguration(token, baseId);
      
      this.showStatus('Setup complete! Loading job form...', 'success');
      
      setTimeout(() => {
        this.loadJobAndShowForm();
      }, 1000);
      
    } catch (error) {
      console.error('Setup error:', error);
      this.showStatus(`Setup failed: ${error.message}`, 'error');
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
      base.name.toLowerCase().includes('application')
    );

    if (jobBase) {
      return jobBase.id;
    }

    // Create new base
    return await this.createJobTrackingBase(token);
  }

  async createJobTrackingBase(token) {
    // Note: Airtable API doesn't allow base creation via REST API
    // We'll guide user to create it manually or use existing base
    throw new Error('Please create a base in Airtable first, then try again');
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
    
    // Find or use first table
    let table = schema.tables.find(t => 
      t.name.toLowerCase().includes('job') || 
      t.name.toLowerCase().includes('application')
    ) || schema.tables[0];

    if (!table) {
      throw new Error('No tables found in base');
    }

    return table.name;
  }

  async saveConfiguration(token, baseId) {
    const config = {
      patToken: token,
      baseId: baseId,
      tableName: 'Jobs', // Default table name
      setupDate: new Date().toISOString()
    };

    await chrome.storage.sync.set({ airtableConfig: config });
    this.config = config;
  }

  async loadJobAndShowForm() {
    this.showStatus('Loading job information...', 'info');
    
    try {
      const jobData = await this.scrapeCurrentPage();
      this.showJobForm(jobData);
    } catch (error) {
      console.error('Scraping error:', error);
      this.showJobForm({}); // Show empty form
    }
  }

  async scrapeCurrentPage() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const currentTab = tabs[0];
      
      const results = await chrome.scripting.executeScript({
        target: { tabId: currentTab.id },
        function: this.extractJobInfo,
        args: []
      });

      if (results && results[0]?.result) {
        return {
          ...results[0].result,
          url: currentTab.url,
          domain: new URL(currentTab.url).hostname
        };
      }
    } catch (error) {
      console.error('Scraping failed:', error);
    }
    
    return {};
  }

  // This function runs in the page context
  extractJobInfo() {
    const selectors = {
      title: [
        'h1',
        '[data-qa="posting-title"]',
        '.topcard__title',
        '.jobsearch-JobInfoHeader-title',
        '.job-title',
        '[class*="job-title"]',
        '[class*="posting-title"]'
      ],
      company: [
        '[data-qa="posting-company"]',
        '.topcard__org-name-link',
        '.topcard__flavor',
        '.jobsearch-InlineCompanyRating',
        '[data-company-name]',
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
          if (text && text.length > 0 && text.length < 200) {
            return text;
          }
        }
      }
      return '';
    };

    const getLongTextFromSelectors = (selectorList) => {
      for (const selector of selectorList) {
        const el = document.querySelector(selector);
        if (el) {
          let text = el.innerText?.trim() || '';
          
          // Clean up description text
          text = text.replace(/Share this job.*$/i, '');
          text = text.replace(/Apply now.*$/i, '');
          text = text.replace(/Show more.*$/i, '');
          
          if (text.length > 50) {
            return text.length > 500 ? text.substring(0, 500) + '...' : text;
          }
        }
      }
      return '';
    };

    return {
      title: getTextFromSelectors(selectors.title),
      company: getTextFromSelectors(selectors.company),
      description: getLongTextFromSelectors(selectors.description),
      scrapedAt: new Date().toISOString()
    };
  }

  showJobForm(jobData = {}) {
    document.body.innerHTML = `
      <div class="job-form">
        <div class="header">
          <h3>💼 Save Job Listing</h3>
          <div class="domain">${jobData.domain || 'Unknown site'}</div>
        </div>
        
        <form id="job-form">
          <div class="field">
            <label>Job Title</label>
            <input type="text" id="job-title" value="${jobData.title || ''}" placeholder="Job title">
          </div>
          
          <div class="field">
            <label>Company</label>
            <input type="text" id="company" value="${jobData.company || ''}" placeholder="Company name">
          </div>
          
          <div class="field">
            <label>Description</label>
            <textarea id="description" placeholder="Job description">${jobData.description || ''}</textarea>
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
          <button id="try-again" class="secondary-btn">↻ Rescrape</button>
          <span class="separator">•</span>
          <button onclick="this.showConnectScreen()" class="link-btn">Settings</button>
        </div>
      </div>
    `;
    
    this.setupEventListeners();
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
    const url = `https://api.airtable.com/v0/${this.config.baseId}/${encodeURIComponent(this.config.tableName || 'Jobs')}`;
    
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

  retryConnection() {
    this.config = null;
    chrome.storage.sync.remove('airtableConfig');
    this.showConnectScreen();
  }

  toggleManualEntry() {
    this.showSetupInstructions();
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
    width: 350px;
    min-height: 400px;
    margin: 0;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #f8f9fa;
  }
  
  .connect-screen, .setup-screen, .job-form {
    padding: 20px;
  }
  
  .logo h2 {
    margin: 0 0 5px 0;
    color: #2d3748;
    font-size: 18px;
  }
  
  .logo p {
    margin: 0 0 20px 0;
    color: #718096;
    font-size: 14px;
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
  
  .help-text {
    font-size: 12px;
    color: #718096;
    text-align: center;
    margin: 10px 0;
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
  }
  
  .step-content p {
    margin: 0;
    font-size: 13px;
    color: #4a5568;
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
  }
  
  .domain {
    font-size: 12px;
    color: #718096;
    background: #edf2f7;
    padding: 4px 8px;
    border-radius: 4px;
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
    height: 60px;
    resize: vertical;
  }
  
  .footer {
    display: flex;
    align-items: center;
    justify-content: center;
    margin-top: 20px;
    padding-top: 15px;
    border-top: 1px solid #e2e8f0;
    gap: 10px;
  }
  
  .link-btn {
    background: none;
    border: none;
    color: #3182ce;
    cursor: pointer;
    font-size: 12px;
  }
  
  .separator {
    color: #cbd5e0;
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
document.addEventListener('DOMContentLoaded', () => {
  new TrackternJobSaver();
});











