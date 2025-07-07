// Configuration and Airtable API integration
class AirtableJobSaver {
  constructor() {
    this.config = null;
    this.initializeUI();
    this.loadConfiguration();
  }

  async initializeUI() {
    // Event listeners
    document.getElementById('save-config').addEventListener('click', () => this.saveConfiguration());
    document.getElementById('save').addEventListener('click', () => this.saveJob());
    document.getElementById('settings').addEventListener('click', () => this.toggleSettings());

    // Auto-scrape job info when popup opens
    this.scrapeJobInfo();
  }

  async loadConfiguration() {
    try {
      const result = await chrome.storage.sync.get(['airtableConfig']);
      this.config = result.airtableConfig;
      
      if (!this.config || !this.config.patToken || !this.config.baseId || !this.config.tableName) {
        this.showConfigSection();
      } else {
        this.hideConfigSection();
      }
    } catch (error) {
      console.error('Error loading configuration:', error);
      this.showStatus('Error loading configuration', 'error');
    }
  }

  async saveConfiguration() {
    const patToken = document.getElementById('pat-token').value.trim();
    const baseId = document.getElementById('base-id').value.trim();
    const tableName = document.getElementById('table-name').value.trim();

    if (!patToken || !baseId || !tableName) {
      this.showStatus('Please fill in all configuration fields', 'error');
      return;
    }

    // Validate base ID format
    if (!baseId.startsWith('app') || baseId.length !== 17) {
      this.showStatus('Base ID should start with "app" and be 17 characters long', 'error');
      return;
    }

    const config = { patToken, baseId, tableName };
    
    try {
      // Test the configuration
      await this.testAirtableConnection(config);
      
      // Save if test passes
      await chrome.storage.sync.set({ airtableConfig: config });
      this.config = config;
      this.hideConfigSection();
      this.showStatus('Configuration saved successfully!', 'success');
    } catch (error) {
      console.error('Configuration test failed:', error);
      this.showStatus(`Configuration test failed: ${error.message}`, 'error');
    }
  }

  async testAirtableConnection(config) {
    const url = `https://api.airtable.com/v0/${config.baseId}/${encodeURIComponent(config.tableName)}?maxRecords=1`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.patToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`);
    }
  }

  async scrapeJobInfo() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const results = await chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        function: this.scrapeJobInfoFunction,
        args: [tabs[0].url]
      });

      if (results && results[0].result) {
        const data = results[0].result;
        document.getElementById('title').value = data.title || '';
        document.getElementById('company').value = data.company || '';
        document.getElementById('description').value = data.description || '';
        document.getElementById('url').value = tabs[0].url;
      }
    } catch (error) {
      console.error('Error scraping job info:', error);
    }
  }

  scrapeJobInfoFunction(url) {
    const getText = (selectors) => {
      for (const selector of selectors) {
        const el = document.querySelector(selector);
        if (el && el.innerText.trim()) return el.innerText.trim();
      }
      return '';
    };

    const title = getText(['h1', '.topcard__title', '[data-qa="posting-title"]', '.job-title', '.jobsearch-JobInfoHeader-title']);

    let description = '';
    const descEl = document.querySelector('.description, [data-qa="job-description"], article, section, .jobsearch-jobDescriptionText');
    if (descEl) {
      const text = descEl.innerText.trim();
      const split = text.split(/Description/i);
      if (split.length > 1) {
        description = split[1].split('Share this job')[0].trim();
      } else {
        description = text.split('Share this job')[0].trim();
      }
      // Limit description length
      if (description.length > 500) {
        description = description.substring(0, 500) + '...';
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
        '[class*="company"]',
        '.jobsearch-InlineCompanyRating'
      ]);
    }

    if (!company && url.includes('workable.com')) {
      const match = url.match(/workable\.com\/([^/]+)/);
      if (match) company = match[1].replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }

    return { title, company, description };
  }

  async saveJob() {
    if (!this.config) {
      this.showStatus('Please configure Airtable settings first', 'error');
      this.showConfigSection();
      return;
    }

    const title = document.getElementById('title').value.trim();
    const company = document.getElementById('company').value.trim();
    const description = document.getElementById('description').value.trim();
    const url = document.getElementById('url').value.trim();

    if (!title && !company && !url) {
      this.showStatus('Please fill in at least one field', 'error');
      return;
    }

    this.showStatus('Saving to Airtable...', 'info');

    try {
      await this.createAirtableRecord({
        'Job Title': title,
        'Company': company,
        'Description': description,
        'URL': url,
        'Date Added': new Date().toISOString().split('T')[0]
      });

      this.showStatus('Job saved successfully!', 'success');
      
      // Clear form
      setTimeout(() => {
        document.getElementById('title').value = '';
        document.getElementById('company').value = '';
        document.getElementById('description').value = '';
        document.getElementById('url').value = '';
      }, 1000);

    } catch (error) {
      console.error('Error saving job:', error);
      this.showStatus(`Error saving job: ${error.message}`, 'error');
    }
  }

  async createAirtableRecord(fields) {
    const url = `https://api.airtable.com/v0/${this.config.baseId}/${encodeURIComponent(this.config.tableName)}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.patToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fields: fields
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  }

  toggleSettings() {
    const configSection = document.getElementById('config-section');
    if (configSection.style.display === 'none') {
      this.showConfigSection();
    } else {
      this.hideConfigSection();
    }
  }

  showConfigSection() {
    document.getElementById('config-section').style.display = 'block';
    
    // Load existing values if available
    if (this.config) {
      document.getElementById('base-id').value = this.config.baseId || '';
      document.getElementById('table-name').value = this.config.tableName || '';
      // Don't pre-fill PAT for security
    }
  }

  hideConfigSection() {
    document.getElementById('config-section').style.display = 'none';
  }

  showStatus(message, type = 'info') {
    const statusEl = document.getElementById('status');
    statusEl.textContent = message;
    statusEl.style.color = type === 'error' ? '#ff4444' : 
                          type === 'success' ? '#44ff44' : '#666';
    
    // Clear status after 3 seconds for non-error messages
    if (type !== 'error') {
      setTimeout(() => {
        statusEl.textContent = '';
      }, 3000);
    }
  }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new AirtableJobSaver();
});











