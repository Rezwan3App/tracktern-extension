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
      
      // If configured, show job list. If not, load job and show form
      if (this.config?.patToken) {
        console.log('TrackternJobSaver: Configuration found, showing job list...');
        await this.showJobList();
      } else {
        console.log('TrackternJobSaver: No configuration, loading job form...');
        await this.loadJobAndShowForm();
      }
      
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
      if (!this.config) {
        // First run – default to local storage mode
        this.config = {
          storageType: 'local',
          setupDate: new Date().toISOString()
        };
        await chrome.storage.sync.set({ airtableConfig: this.config });
      }
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
        function: () => {
          console.log('Tracktern: Job extraction starting on', window.location.href);
          
          const selectors = {
            title: [
              'h1', '.job-details-jobs-unified-top-card__job-title', '.jobs-unified-top-card__job-title',
              '[data-qa="posting-title"]', '.topcard__title', '.jobsearch-JobInfoHeader-title',
              '.job-title', '[class*="job-title"]', '.posting-headline__position'
            ],
            company: [
              '.job-details-jobs-unified-top-card__company-name', '.jobs-unified-top-card__company-name',
              '[data-qa="posting-company"]', '.topcard__org-name-link', '.jobsearch-InlineCompanyRating',
              '.company-name', '[class*="company"]', 'a[href*="/company/"]'
            ],
            description: [
              '.jobs-description-content__text', '.jobs-description__content', '.jobs-box__html-content',
              '[data-qa="job-description"]', '.description', '.jobsearch-jobDescriptionText',
              '[class*="job-description"]', '[class*="description"]', 'article', 'section'
            ]
          };

          const getTextFromSelectors = (selectorList) => {
            for (const selector of selectorList) {
              const elements = document.querySelectorAll(selector);
              for (const el of elements) {
                const text = el.innerText?.trim();
                if (text && text.length > 2 && text.length < 300) {
                  console.log('Tracktern: Found text with', selector, ':', text);
                  return text;
                }
              }
            }
            return '';
          };

          const getDescriptionText = (selectorList) => {
            // First try smart description detection based on headings
            const smartDescription = getDescriptionAfterHeadings();
            if (smartDescription) {
              return smartDescription;
            }
            
            // Fallback to selector-based approach
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
          
          const getDescriptionAfterHeadings = () => {
            console.log('Tracktern: Looking for description after headings...');
            
            // Look for common job description headings
            const descriptionHeadings = [
              'about', 'about the job', 'about this job', 'about the role', 'about this role',
              'job description', 'job summary', 'description', 'overview', 'what you\'ll do',
              'responsibilities', 'role description', 'position summary', 'the role',
              'what we\'re looking for', 'role overview', 'position overview'
            ];
            
            // Find all headings on the page
            const allHeadings = document.querySelectorAll('h1, h2, h3, h4, h5, h6, [class*="heading"], [class*="title"], .font-weight-bold, strong');
            
            for (const heading of allHeadings) {
              const headingText = heading.innerText?.trim().toLowerCase();
              
              if (headingText && descriptionHeadings.some(desc => headingText.includes(desc))) {
                console.log('Tracktern: Found description heading:', headingText);
                
                // Try multiple strategies to get content after this heading
                let description = '';
                
                // Strategy 1: Next sibling elements
                let nextElement = heading.nextElementSibling;
                let attempts = 0;
                while (nextElement && attempts < 5) {
                  const text = nextElement.innerText?.trim();
                  if (text && text.length > 20) {
                    description += text + ' ';
                    if (description.length > 200) break; // Got enough content
                  }
                  nextElement = nextElement.nextElementSibling;
                  attempts++;
                }
                
                // Strategy 2: Look for content in parent container after heading
                if (!description || description.length < 100) {
                  const parent = heading.parentElement;
                  if (parent) {
                    const parentText = parent.innerText?.trim();
                    if (parentText) {
                      // Extract text after the heading text
                      const headingIndex = parentText.toLowerCase().indexOf(headingText);
                      if (headingIndex !== -1) {
                        const afterHeading = parentText.substring(headingIndex + headingText.length).trim();
                        if (afterHeading.length > description.length) {
                          description = afterHeading;
                        }
                      }
                    }
                  }
                }
                
                // Strategy 3: Look for following paragraphs in same container
                if (!description || description.length < 100) {
                  const container = heading.closest('div, section, article');
                  if (container) {
                    const paragraphs = container.querySelectorAll('p, div');
                    let foundHeading = false;
                    
                    for (const para of paragraphs) {
                      if (foundHeading) {
                        const text = para.innerText?.trim();
                        if (text && text.length > 20) {
                          description += text + ' ';
                          if (description.length > 300) break;
                        }
                      } else if (para.contains(heading) || para === heading) {
                        foundHeading = true;
                      }
                    }
                  }
                }
                
                if (description.trim().length > 50) {
                  const cleaned = cleanDescriptionText(description.trim());
                  console.log('Tracktern: Found description after heading:', cleaned.substring(0, 100) + '...');
                  return cleaned.length > 1000 ? cleaned.substring(0, 1000) + '...' : cleaned;
                }
              }
            }
            
            console.log('Tracktern: No description found after headings');
            return '';
          };
          
          const cleanDescriptionText = (text) => {
            if (!text) return '';
            
            // Remove common unwanted content
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
            text = text.replace(/New York, NY.*$/i, '');
            text = text.replace(/.*Reposted.*ago.*$/i, '');
            text = text.replace(/.*ago.*Over.*applicants.*$/i, '');
            text = text.replace(/.*·.*applicants.*$/i, '');
            text = text.replace(/\d+\s+days?\s+ago.*$/i, '');
            text = text.replace(/\d+\s+weeks?\s+ago.*$/i, '');
            text = text.replace(/\d+\s+months?\s+ago.*$/i, '');
            
            // Remove lines that are just metadata (location, posting date, etc.)
            const lines = text.split('\n');
            const filteredLines = lines.filter(line => {
              const trimmed = line.trim().toLowerCase();
              return !(
                trimmed.includes('applicants') ||
                trimmed.includes('promoted by') ||
                trimmed.includes('actively reviewing') ||
                trimmed.includes('reposted') ||
                /^[a-z\s,]+,\s+[a-z]{2}$/i.test(trimmed) || // Location format like "New York, NY"
                trimmed.match(/^\d+\s+(day|week|month)s?\s+ago/) ||
                trimmed.length < 20 // Very short lines are likely metadata
              );
            });
            
            text = filteredLines.join('\n');
            
            // Clean up multiple spaces and newlines
            text = text.replace(/\s+/g, ' ').trim();
            
            return text;
          };

          let result = {
            title: getTextFromSelectors(selectors.title),
            company: getTextFromSelectors(selectors.company),
            description: getDescriptionText(selectors.description)
          };

          // Fallback for title
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

          // Fallback for company from page title  
          if (!result.company) {
            const pageTitle = document.title;
            const companyMatch = pageTitle.match(/at\s+([^|•-]+)/i) || pageTitle.match(/\|\s*([^|•-]+)/i);
            if (companyMatch) {
              result.company = companyMatch[1].trim();
            }
          }

          console.log('Tracktern: Final result:', result);
          return result;
        }
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
      
      // If looking for description, try smart heading-based detection first
      if (fieldName === 'description') {
        const smartDescription = getDescriptionAfterHeadings();
        if (smartDescription) {
          return smartDescription;
        }
      }
      
      for (const selector of selectorList) {
        const el = document.querySelector(selector);
        if (el) {
          let text = el.innerText?.trim() || '';
          text = cleanDescriptionText(text);
          
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
    
    const getDescriptionAfterHeadings = () => {
      console.log('Tracktern: Looking for description after headings...');
      
      // Look for common job description headings
      const descriptionHeadings = [
        'about', 'about the job', 'about this job', 'about the role', 'about this role',
        'job description', 'job summary', 'description', 'overview', 'what you\'ll do',
        'responsibilities', 'role description', 'position summary', 'the role',
        'what we\'re looking for', 'role overview', 'position overview'
      ];
      
      // Find all headings on the page
      const allHeadings = document.querySelectorAll('h1, h2, h3, h4, h5, h6, [class*="heading"], [class*="title"], .font-weight-bold, strong');
      
      for (const heading of allHeadings) {
        const headingText = heading.innerText?.trim().toLowerCase();
        
        if (headingText && descriptionHeadings.some(desc => headingText.includes(desc))) {
          console.log('Tracktern: Found description heading:', headingText);
          
          // Try multiple strategies to get content after this heading
          let description = '';
          
          // Strategy 1: Next sibling elements
          let nextElement = heading.nextElementSibling;
          let attempts = 0;
          while (nextElement && attempts < 5) {
            const text = nextElement.innerText?.trim();
            if (text && text.length > 20) {
              description += text + ' ';
              if (description.length > 200) break; // Got enough content
            }
            nextElement = nextElement.nextElementSibling;
            attempts++;
          }
          
          // Strategy 2: Look for content in parent container after heading
          if (!description || description.length < 100) {
            const parent = heading.parentElement;
            if (parent) {
              const parentText = parent.innerText?.trim();
              if (parentText) {
                // Extract text after the heading text
                const headingIndex = parentText.toLowerCase().indexOf(headingText);
                if (headingIndex !== -1) {
                  const afterHeading = parentText.substring(headingIndex + headingText.length).trim();
                  if (afterHeading.length > description.length) {
                    description = afterHeading;
                  }
                }
              }
            }
          }
          
          // Strategy 3: Look for following paragraphs in same container
          if (!description || description.length < 100) {
            const container = heading.closest('div, section, article');
            if (container) {
              const paragraphs = container.querySelectorAll('p, div');
              let foundHeading = false;
              
              for (const para of paragraphs) {
                if (foundHeading) {
                  const text = para.innerText?.trim();
                  if (text && text.length > 20) {
                    description += text + ' ';
                    if (description.length > 300) break;
                  }
                } else if (para.contains(heading) || para === heading) {
                  foundHeading = true;
                }
              }
            }
          }
          
          if (description.trim().length > 50) {
            const cleaned = cleanDescriptionText(description.trim());
            console.log('Tracktern: Found description after heading:', cleaned.substring(0, 100) + '...');
            return cleaned.length > 1000 ? cleaned.substring(0, 1000) + '...' : cleaned;
          }
        }
      }
      
      console.log('Tracktern: No description found after headings');
      return '';
    };
    
    const cleanDescriptionText = (text) => {
      if (!text) return '';
      
      // Remove common unwanted content
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
      text = text.replace(/New York, NY.*$/i, '');
      text = text.replace(/.*Reposted.*ago.*$/i, '');
      text = text.replace(/.*ago.*Over.*applicants.*$/i, '');
      text = text.replace(/.*·.*applicants.*$/i, '');
      text = text.replace(/\d+\s+days?\s+ago.*$/i, '');
      text = text.replace(/\d+\s+weeks?\s+ago.*$/i, '');
      text = text.replace(/\d+\s+months?\s+ago.*$/i, '');
      
      // Remove lines that are just metadata (location, posting date, etc.)
      const lines = text.split('\n');
      const filteredLines = lines.filter(line => {
        const trimmed = line.trim().toLowerCase();
        return !(
          trimmed.includes('applicants') ||
          trimmed.includes('promoted by') ||
          trimmed.includes('actively reviewing') ||
          trimmed.includes('reposted') ||
          /^[a-z\s,]+,\s+[a-z]{2}$/i.test(trimmed) || // Location format like "New York, NY"
          trimmed.match(/^\d+\s+(day|week|month)s?\s+ago/) ||
          trimmed.length < 20 // Very short lines are likely metadata
        );
      });
      
      text = filteredLines.join('\n');
      
      // Clean up multiple spaces and newlines
      text = text.replace(/\s+/g, ' ').trim();
      
      return text;
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
          <h3>TrackTern Version 1.0</h3>
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
            <label>TrackTern</label>
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
            Save Job
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
    await this.saveJob();
  }

  showSmartSetup() {
    this.showStatus('Choose how you want to save your jobs...', 'info');
    
    document.body.innerHTML = `
      <div class="setup-screen">
        <h3>� Choose Your Storage Method</h3>
        <p class="setup-intro">Pick the option that works best for you:</p>
        
        <div class="storage-options">
          <div class="storage-option" id="local-storage">
            <div class="option-icon">💾</div>
            <div class="option-content">
              <h4>Local Storage (Recommended)</h4>
              <p>Save jobs in your browser - simple and instant</p>
              <ul>
                <li>✅ No setup required</li>
                <li>✅ Works offline</li>
                <li>✅ Export to CSV anytime</li>
                <li>⚠️ Data stays on this device only</li>
              </ul>
              <button class="primary-btn">Use Local Storage</button>
            </div>
          </div>
          
          <div class="storage-option" id="airtable-sync">
            <div class="option-icon">☁️</div>
            <div class="option-content">
              <h4>Airtable Sync (Advanced)</h4>
              <p>Cloud sync with powerful database features</p>
              <ul>
                <li>✅ Access from anywhere</li>
                <li>✅ Advanced filtering & views</li>
                <li>✅ Share with team</li>
                <li>⚠️ Requires Airtable account setup</li>
              </ul>
              <button class="secondary-btn">Setup Airtable</button>
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
    document.getElementById('local-storage')?.querySelector('button')?.addEventListener('click', () => this.setupLocalStorage());
    document.getElementById('airtable-sync')?.querySelector('button')?.addEventListener('click', () => this.showAirtableOptions());
    document.getElementById('back-to-job')?.addEventListener('click', () => this.loadJobAndShowForm());
  }

  async setupLocalStorage() {
    this.showStatus('Setting up local storage...', 'info');
    
    // Configure for local storage
    const config = {
      storageType: 'local',
      setupDate: new Date().toISOString()
    };

    await chrome.storage.sync.set({ airtableConfig: config });
    this.config = config;
    
    this.showStatus('✅ Local storage ready! You can now save jobs.', 'success');
    
    setTimeout(() => {
      this.showJobList();
    }, 1500);
  }

  showAirtableOptions() {
    document.body.innerHTML = `
      <div class="setup-screen">
        <h3>☁️ Airtable Setup</h3>
        <p class="setup-intro">Choose your Airtable setup method:</p>
        
        <div class="setup-options">
          <button id="use-template" class="primary-btn">
            📋 Use Our Template (Easy)
          </button>
          <p class="help-text">Copy our pre-made Job Tracker base to your account</p>
          
          <div class="divider">or</div>
          
          <button id="manual-setup" class="secondary-btn">
            🔧 Connect Existing Base
          </button>
          <p class="help-text">Use your own Airtable base</p>
        </div>
        
        <div id="status" class="status"></div>
        
        <div class="footer">
          <button id="back-to-storage" class="secondary-btn">← Back to storage options</button>
        </div>
      </div>
    `;
    
    // Set up event listeners
    document.getElementById('use-template')?.addEventListener('click', () => this.startTemplateSetup());
    document.getElementById('manual-setup')?.addEventListener('click', () => this.startManualSetup());
    document.getElementById('back-to-storage')?.addEventListener('click', () => this.showSmartSetup());
  }

  startTemplateSetup() {
    this.showStatus('Opening Airtable base creation...', 'info');
    
    // Open Airtable base creation since we can't share a template easily
    chrome.tabs.create({
      url: 'https://airtable.com/create/base',
      active: true
    });

    this.showTemplateInstructions();
  }

  showTemplateInstructions() {
    document.body.innerHTML = `
      <div class="setup-screen">
        <h3>📋 Create Job Tracker Base</h3>
        
        <div class="steps">
          <div class="step">
            <span class="step-number">1</span>
            <div class="step-content">
              <strong>Create New Base</strong>
              <p>On the page that opened, click "Start from scratch"</p>
              <p>Name it "Job Tracker" or similar</p>
            </div>
          </div>
          
          <div class="step">
            <span class="step-number">2</span>
            <div class="step-content">
              <strong>Recommended Columns</strong>
              <p>Add these columns to your table:</p>
              <ul>
                <li><strong>TrackTern</strong> (Single line text)</li>
                <li><strong>Company</strong> (Single line text)</li>
                <li><strong>Description</strong> (Long text)</li>
                <li><strong>URL</strong> (URL)</li>
                <li><strong>Status</strong> (Single select: To Apply, Applied, Interview, Rejected)</li>
                <li><strong>Date Added</strong> (Date)</li>
              </ul>
            </div>
          </div>
          
          <div class="step">
            <span class="step-number">3</span>
            <div class="step-content">
              <strong>Create Access Token</strong>
              <p>Go to <a href="https://airtable.com/create/tokens" target="_blank">airtable.com/create/tokens</a></p>
              <p>Create token with these scopes:</p>
              <ul>
                <li>✓ data.records:read</li>
                <li>✓ data.records:write</li>
                <li>✓ schema.bases:read</li>
              </ul>
              <p>Select your Job Tracker base in "Base Access"</p>
            </div>
          </div>
          
          <div class="step">
            <span class="step-number">4</span>
            <div class="step-content">
              <strong>Connect Extension</strong>
              <div class="token-input">
                <input type="password" id="pat-input" placeholder="Paste your Personal Access Token" />
                <button id="connect-template" class="primary-btn">Connect</button>
              </div>
            </div>
          </div>
        </div>
        
        <div id="status" class="status"></div>
        
        <div class="footer">
          <button id="try-local" class="secondary-btn">← Use Local Storage Instead</button>
        </div>
      </div>
    `;
    
    document.getElementById('connect-template')?.addEventListener('click', () => this.connectAutoSetup());
    document.getElementById('try-local')?.addEventListener('click', () => this.setupLocalStorage());
  }

  async startAutoSetup() {
    this.showStatus('Opening Airtable for auto-setup...', 'info');
    
    // Open Airtable to create new base
    chrome.tabs.create({
      url: 'https://airtable.com/create/base',
      active: true
    });

    this.showAutoSetupInstructions();
  }

  showAutoSetupInstructions() {
    document.body.innerHTML = `
      <div class="setup-screen">
        <h3>🎯 Quick Setup Instructions</h3>
        
        <div class="steps">
          <div class="step">
            <span class="step-number">1</span>
            <div class="step-content">
              <strong>Create New Base</strong>
              <p>On the Airtable page that opened, click "Start from scratch" or use any template</p>
              <p>Name it something like "Job Tracker" or "Job Applications"</p>
            </div>
          </div>
          
          <div class="step">
            <span class="step-number">2</span>
            <div class="step-content">
              <strong>Create Access Token</strong>
              <p>Go to <a href="https://airtable.com/create/tokens" target="_blank">airtable.com/create/tokens</a></p>
              <p><strong>Required scopes:</strong></p>
              <ul>
                <li>✓ data.records:read</li>
                <li>✓ data.records:write</li>
                <li>✓ schema.bases:read</li>
              </ul>
              <p><strong>Add base access:</strong> Select your new Job Tracker base</p>
            </div>
          </div>
          
          <div class="step">
            <span class="step-number">3</span>
            <div class="step-content">
              <strong>Connect Extension</strong>
              <div class="token-input">
                <input type="password" id="pat-input" placeholder="Paste your Personal Access Token here" />
                <button id="connect-auto" class="primary-btn">Connect & Setup</button>
              </div>
            </div>
          </div>
        </div>
        
        <div id="status" class="status"></div>
        
        <div class="troubleshooting">
          <details>
            <summary>🔧 Troubleshooting</summary>
            <div class="troubleshoot-content">
              <p><strong>Common Issues:</strong></p>
              <ul>
                <li><strong>401 Error:</strong> Token is invalid or expired - create a new one</li>
                <li><strong>403 Error:</strong> Missing required scopes - check all three checkboxes</li>
                <li><strong>No bases found:</strong> Make sure to grant base access when creating token</li>
                <li><strong>Token format:</strong> Should start with "pat" and be ~50 characters</li>
              </ul>
              <p><strong>Need help?</strong> Check the browser console (F12) for detailed error messages.</p>
            </div>
          </details>
        </div>
        
        <div class="footer">
          <button id="back-to-options" class="secondary-btn">← Back to options</button>
        </div>
      </div>
    `;
    
    document.getElementById('connect-auto')?.addEventListener('click', () => this.connectAutoSetup());
    document.getElementById('back-to-options')?.addEventListener('click', () => this.showSmartSetup());
  }

  async connectAutoSetup() {
    const token = document.getElementById('pat-input')?.value.trim();
    
    if (!token) {
      this.showStatus('Please paste your Personal Access Token', 'error');
      return;
    }

    if (!token.startsWith('pat')) {
      this.showStatus('Invalid token format. Personal Access Tokens should start with "pat"', 'error');
      return;
    }

    this.showStatus('Testing token and finding your bases...', 'info');

    try {
      // Get all bases 
      const bases = await this.getAirtableBases(token);
      
      if (bases.length === 0) {
        throw new Error('No bases found in your Airtable account. Please create a base first.');
      }

      this.showStatus('Found ' + bases.length + ' base(s). Setting up job tracker...', 'info');

      // Look for job-related base, otherwise use the most recently created one
      let jobBase = bases.find(base => 
        base.name.toLowerCase().includes('job') || 
        base.name.toLowerCase().includes('application') ||
        base.name.toLowerCase().includes('tracker') ||
        base.name.toLowerCase().includes('career')
      );

      // If no job-related base found, use the first one
      if (!jobBase) {
        jobBase = bases[0];
        console.log('Tracktern: No job-related base found, using:', jobBase.name);
      }

      console.log('Tracktern: Using base:', jobBase.name, jobBase.id);

      await this.saveConfiguration(token, jobBase.id);
      
      this.showStatus('✅ Connected successfully! Ready to save jobs.', 'success');
      
      // Go to job list after successful setup
      setTimeout(() => {
        this.showJobList();
      }, 1500);
      
    } catch (error) {
      console.error('Auto-setup error:', error);
      this.showStatus(`❌ ${error.message}`, 'error');
    }
  }

  startManualSetup() {
    this.showSetupInstructions();
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
        <h3>🔧 Manual Airtable Setup</h3>
        <p class="setup-intro">Connect to your existing Airtable base manually.</p>
        
        <div class="steps">
          <div class="step">
            <span class="step-number">1</span>
            <div class="step-content">
              <strong>Create Personal Access Token</strong>
              <p><a href="https://airtable.com/create/tokens" target="_blank">Go to airtable.com/create/tokens</a></p>
              <p>Click "Create new token" and give it a name like "Job Tracker Extension"</p>
            </div>
          </div>
          
          <div class="step">
            <span class="step-number">2</span>
            <div class="step-content">
              <strong>Set Required Permissions</strong>
              <p><strong>Scopes (check these boxes):</strong></p>
              <ul>
                <li>✓ data.records:read</li>
                <li>✓ data.records:write</li>
                <li>✓ schema.bases:read</li>
              </ul>
              <p><strong>Base Access:</strong> Select the base you want to use for job tracking</p>
            </div>
          </div>
          
          <div class="step">
            <span class="step-number">3</span>
            <div class="step-content">
              <strong>Connect Extension</strong>
              <div class="token-input">
                <input type="password" id="pat-input" placeholder="Paste your Personal Access Token here" />
                <button id="verify-token" class="primary-btn">Test & Connect</button>
              </div>
              <p class="help-text">Token should start with "pat" and be about 50+ characters long</p>
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
    console.log('Tracktern: Testing Airtable token...');
    
    if (!token || token.length < 10) {
      throw new Error('Token appears to be invalid (too short)');
    }

    try {
      const response = await fetch('https://api.airtable.com/v0/meta/bases', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      console.log('Tracktern: Airtable API response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Tracktern: Airtable API error:', errorData);
        
        if (response.status === 401) {
          throw new Error('Invalid token. Please check that your Personal Access Token is correct and has the required permissions.');
        } else if (response.status === 403) {
          throw new Error('Token does not have required permissions. Please ensure you have enabled: data.records:read, data.records:write, schema.bases:read');
        } else {
          throw new Error(`API Error ${response.status}: ${errorData.error?.message || 'Unknown error'}`);
        }
      }

      const data = await response.json();
      console.log('Tracktern: Found', data.bases?.length || 0, 'bases');
      return data.bases || [];
      
    } catch (error) {
      if (error.message.includes('fetch')) {
        throw new Error('Network error. Please check your internet connection.');
      }
      throw error;
    }
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
    console.log('Tracktern: Getting base schema for', baseId);
    
    try {
      // Get base schema to check existing tables
      const schemaResponse = await fetch(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!schemaResponse.ok) {
        const errorData = await schemaResponse.json().catch(() => ({}));
        throw new Error(`Could not access base schema: ${schemaResponse.status} ${errorData.error?.message || ''}`);
      }

      const schema = await schemaResponse.json();
      console.log('Tracktern: Found', schema.tables?.length || 0, 'tables in base');
      
      if (!schema.tables || schema.tables.length === 0) {
        throw new Error('No tables found in base. Please create at least one table in your Airtable base.');
      }
      
      // Find job-related table or use first table
      let table = schema.tables.find(t => 
        t.name.toLowerCase().includes('job') || 
        t.name.toLowerCase().includes('application') ||
        t.name.toLowerCase().includes('position') ||
        t.name.toLowerCase().includes('tracker') ||
        t.name.toLowerCase().includes('career')
      );

      if (!table) {
        table = schema.tables[0];
        console.log('Tracktern: No job-related table found, using first table:', table.name);
      } else {
        console.log('Tracktern: Found job-related table:', table.name);
      }

      return table.name;
      
    } catch (error) {
      console.error('Tracktern: Error getting table structure:', error);
      throw error;
    }
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
      'TrackTern': document.getElementById('job-title')?.value.trim(),
      'Company': document.getElementById('company')?.value.trim(), 
      'Description': document.getElementById('description')?.value.trim(),
      'URL': document.getElementById('job-url')?.value.trim(),
      'Date Added': new Date().toISOString().split('T')[0],
      'Status': 'To Apply'
    };

    if (!jobData['TrackTern'] && !jobData['Company']) {
      this.showStatus('Please enter at least a job title or company', 'error');
      return;
    }

    // Check storage type
    if (this.config?.storageType === 'local') {
      await this.saveJobLocally(jobData);
    } else {
      await this.saveJobToAirtable(jobData);
    }
  }

  async saveJobLocally(jobData) {
    this.showStatus('Saving job locally...', 'info');

    try {
      // Get existing jobs from local storage
      const result = await chrome.storage.local.get(['savedJobs']);
      const savedJobs = result.savedJobs || [];
      
      // Add new job with unique ID
      const newJob = {
        id: Date.now().toString(),
        fields: jobData,
        createdTime: new Date().toISOString()
      };
      
      savedJobs.unshift(newJob); // Add to beginning
      
      // Save back to storage
      await chrome.storage.local.set({ savedJobs });
      
      this.showStatus('✅ Job saved locally!', 'success');
      
      setTimeout(() => {
        this.showJobList();
      }, 1500);
      
    } catch (error) {
      console.error('Local save error:', error);
      this.showStatus(`❌ Save failed: ${error.message}`, 'error');
    }
  }

  async saveJobToAirtable(jobData) {
    this.showStatus('Saving to Airtable...', 'info');

    try {
      await this.createRecord(jobData);
      this.showStatus('✅ Job saved to Airtable!', 'success');
      
      setTimeout(() => {
        this.showJobList();
      }, 1500);
      
    } catch (error) {
      console.error('Airtable save error:', error);
      this.showStatus(`❌ Save failed: ${error.message}`, 'error');
    }
  }

  async showJobList() {
    this.showStatus('Loading your saved jobs...', 'info');
    
    try {
      const jobs = await this.getJobList();
      const jobCount = jobs.length;
      const statuses = ['To Apply','Applied','Interview','Rejected','Offer'];
      const counts = {};
      statuses.forEach(s=>counts[s]=0);
      jobs.forEach(j=>{const st=j.fields['Status']||'To Apply'; if(counts[st]!==undefined) counts[st]++;});
      
      document.body.innerHTML = `
        <div class="job-list-screen">
                                      <div class="header">
            <h3>TrackTern</h3>
            <div class="storage-info">
              <div class="job-count">${jobCount} job${jobCount !== 1 ? 's' : ''} saved</div>
              <div class="status-counters">
                ${statuses.map(s=>`<span class="chip chip-${s.toLowerCase().replace(/\s/g,'-')}">${counts[s]} ${s}</span>`).join('')}
              </div>
              <div class="storage-type">${this.config?.storageType === 'local' ? '💾 Local' : '☁️ Airtable'}</div>
            </div>
          </div>
          
          <div class="actions">
            <button id="add-current-job" class="primary-btn">
              ➕ Add New Job
            </button>
            <button id="refresh-list" class="secondary-btn">
              ↻ Refresh
            </button>
          </div>
          
          <div class="job-list">
            ${jobs.length === 0 ? `
              <div class="empty-state">
                <p>🎯 No jobs saved yet!</p>
                <p>Click "Add New Job" to start tracking your applications.</p>
              </div>
            ` : jobs.map(job => `
              <div class="job-item" data-job-id="${job.id}">
                <div class="job-header">
                  <div class="job-title">${job.fields['TrackTern'] || 'Untitled'}</div>
                  <button class="delete-job" data-job-id="${job.id}">🗑️</button>
                </div>
                <div class="job-company">${job.fields['Company'] || 'Unknown Company'}</div>
                <div class="job-status-row">
                  <select class="status-select" data-job-id="${job.id}">
                    ${['To Apply','Applied','Interview','Rejected','Offer'].map(s=>`<option value="${s}" ${s=== (job.fields['Status']||'To Apply') ? 'selected':''}>${s}</option>`).join('')}
                  </select>
                  <div class="job-date">${job.fields['Date Added'] ? new Date(job.fields['Date Added']).toLocaleDateString() : 'No date'}</div>
                </div>
                ${job.fields['URL'] ? `<a href="${job.fields['URL']}" target="_blank" class="job-link">🔗 View Job</a>` : ''}
              </div>
            `).join('')}
          </div>
          
          <div id="status" class="status"></div>
          
          <div class="footer">
            <button id="export-csv" class="secondary-btn">📊 Export CSV</button>
            <button id="settings" class="secondary-btn">⚙️ Settings</button>
          </div>
        </div>
      `;
      
      // Set up event listeners
      document.getElementById('add-current-job')?.addEventListener('click', () => this.loadJobAndShowForm());
      document.getElementById('refresh-list')?.addEventListener('click', () => this.showJobList());
      document.getElementById('export-csv')?.addEventListener('click', () => this.exportToCSV(jobs));
      document.getElementById('settings')?.addEventListener('click', () => this.showSettings());
      document.querySelectorAll('.delete-job').forEach(btn=>btn.addEventListener('click',e=>{const id=e.currentTarget.getAttribute('data-job-id');this.deleteJob(id);}));
      document.querySelectorAll('.status-select').forEach(sel=>sel.addEventListener('change',e=>{const id=e.currentTarget.getAttribute('data-job-id');const val=e.currentTarget.value;this.updateJobStatus(id,val);}));
      
      // Clear status after showing list
      this.showStatus('', 'info');
      
    } catch (error) {
      console.error('Error loading job list:', error);
      this.showStatus(`❌ Failed to load jobs: ${error.message}`, 'error');
    }
  }

  async getJobList() {
    return await this.getLocalJobs();
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

  async getAirtableJobs() {
    if (!this.config?.patToken || !this.config?.baseId) {
      throw new Error('Airtable configuration not found');
    }

    const response = await fetch(
      `https://api.airtable.com/v0/${this.config.baseId}/${encodeURIComponent(this.config.tableName)}?sort%5B0%5D%5Bfield%5D=Date%20Added&sort%5B0%5D%5Bdirection%5D=desc`,
      {
        headers: {
          'Authorization': `Bearer ${this.config.patToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to fetch jobs');
    }

    const data = await response.json();
    return data.records || [];
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
    this.showStatus('✅ CSV exported successfully!', 'success');
  }

  showSettings() {
    const isLocal = this.config?.storageType === 'local';
    
    document.body.innerHTML = `
      <div class="settings-screen">
        <div class="header">
          <h3>⚙️ Settings</h3>
        </div>
        
        <div class="settings-list">
          <div class="setting-item">
            <div class="setting-label">Storage Type</div>
            <div class="setting-value">${isLocal ? '💾 Local Storage' : '☁️ Airtable'}</div>
          </div>
          
          ${isLocal ? `
            <div class="setting-item">
              <div class="setting-label">Data Location</div>
              <div class="setting-value">This browser only</div>
            </div>
          ` : `
            <div class="setting-item">
              <div class="setting-label">Airtable Base ID</div>
              <div class="setting-value">${this.config?.baseId || 'Not configured'}</div>
            </div>
            
            <div class="setting-item">
              <div class="setting-label">Connection Status</div>
              <div class="setting-value">${this.config?.patToken ? '✅ Connected' : '❌ Not connected'}</div>
            </div>
          `}
        </div>
        
        <div class="settings-actions">
          ${isLocal ? `
            <button id="switch-to-airtable" class="primary-btn">
              ☁️ Switch to Airtable
            </button>
            <button id="clear-local-data" class="danger-btn">
              🗑️ Clear All Local Data
            </button>
          ` : `
            <button id="reconnect" class="primary-btn">
              🔄 Reconnect Airtable
            </button>
            <button id="switch-to-local" class="secondary-btn">
              💾 Switch to Local Storage
            </button>
            <button id="clear-config" class="danger-btn">
              🗑️ Clear Configuration
            </button>
          `}
        </div>
        
        <div id="status" class="status"></div>
        
        <div class="footer">
          <button id="back-to-list" class="secondary-btn">← Back to Job List</button>
        </div>
      </div>
    `;
    
    // Set up event listeners based on storage type
    if (isLocal) {
      document.getElementById('switch-to-airtable')?.addEventListener('click', () => this.showSmartSetup());
      document.getElementById('clear-local-data')?.addEventListener('click', () => this.clearLocalData());
    } else {
      document.getElementById('reconnect')?.addEventListener('click', () => this.showSmartSetup());
      document.getElementById('switch-to-local')?.addEventListener('click', () => this.setupLocalStorage());
      document.getElementById('clear-config')?.addEventListener('click', () => this.clearConfiguration());
    }
    
    document.getElementById('back-to-list')?.addEventListener('click', () => this.showJobList());
  }

  async clearLocalData() {
    if (confirm('Are you sure you want to delete all your saved jobs? This cannot be undone.')) {
      await chrome.storage.local.remove(['savedJobs']);
      this.showStatus('✅ All local data cleared', 'success');
      setTimeout(() => {
        this.showJobList();
      }, 1000);
    }
  }

  async clearConfiguration() {
    if (confirm('Are you sure you want to clear your Airtable configuration? You will need to reconnect.')) {
      await chrome.storage.sync.clear();
      this.config = null;
      this.showStatus('✅ Configuration cleared', 'success');
      setTimeout(() => {
        this.loadJobAndShowForm();
      }, 1000);
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

  async deleteJob(jobId) {
    if(!confirm('Delete this job?')) return;
    if(this.config?.storageType==='local') {
       const result = await chrome.storage.local.get(['savedJobs']);
       const jobs = (result.savedJobs || []).filter(j => j.id !== jobId);
       await chrome.storage.local.set({ savedJobs: jobs });
       this.showStatus('Deleted!', 'success');
       this.showJobList();
    }
  }

  async updateJobStatus(jobId, status) {
    const result = await chrome.storage.local.get(['savedJobs']);
    const jobs = result.savedJobs || [];
    const job = jobs.find(j => j.id === jobId);
    if (job) {
      job.fields['Status'] = status;
      await chrome.storage.local.set({ savedJobs: jobs });
    }
    // update UI badge quickly
    this.showJobList();
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
  
  .job-form, .setup-screen, .job-list-screen, .settings-screen {
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
  
  /* Job List Styles */
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
  
  .actions .primary-btn {
    flex: 1;
    margin-bottom: 0;
  }
  
  .actions .secondary-btn {
    flex: 0 0 auto;
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
    transition: box-shadow 0.2s;
  }
  
  .job-item:hover {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
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
  
  .job-status {
    font-size: 10px;
    padding: 2px 6px;
    border-radius: 3px;
    font-weight: 500;
    flex-shrink: 0;
  }
  
  .status-to-apply {
    background: #bee3f8;
    color: #2a69ac;
  }
  
  .status-applied {
    background: #c6f6d5;
    color: #25855a;
  }
  
  .status-interview {
    background: #fef5e7;
    color: #c05621;
  }
  
  .status-rejected {
    background: #fed7d7;
    color: #c53030;
  }
  
  .job-company {
    color: #4a5568;
    font-size: 13px;
    margin-bottom: 4px;
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
  
  .job-link:hover {
    text-decoration: underline;
  }
  
  .empty-state {
    text-align: center;
    padding: 40px 20px;
    color: #718096;
  }
  
  .empty-state p {
    margin: 8px 0;
    font-size: 14px;
  }
  
  /* Settings Styles */
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
  
  .settings-actions button {
    margin-bottom: 8px;
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
  
  .danger-btn:hover {
    background: #c53030;
  }
  
  /* Setup Options Styles */
  .setup-options {
    margin: 20px 0;
  }
  
  .help-text {
    font-size: 12px;
    color: #718096;
    margin: 4px 0 15px 0;
  }
  
  .divider {
    text-align: center;
    color: #a0aec0;
    margin: 15px 0;
    font-size: 12px;
  }
  
  /* Storage Options Styles */
  .storage-options {
    display: flex;
    flex-direction: column;
    gap: 15px;
    margin: 20px 0;
  }
  
  .storage-option {
    border: 2px solid #e2e8f0;
    border-radius: 12px;
    padding: 16px;
    cursor: pointer;
    transition: all 0.2s;
    background: white;
  }
  
  .storage-option:hover {
    border-color: #3182ce;
    box-shadow: 0 4px 12px rgba(49, 130, 206, 0.1);
  }
  
  .storage-option .option-icon {
    font-size: 24px;
    margin-bottom: 8px;
  }
  
  .storage-option h4 {
    margin: 0 0 8px 0;
    color: #2d3748;
    font-size: 16px;
  }
  
  .storage-option p {
    margin: 0 0 12px 0;
    color: #4a5568;
    font-size: 14px;
  }
  
  .storage-option ul {
    margin: 0 0 16px 0;
    padding-left: 16px;
    font-size: 13px;
  }
  
  .storage-option li {
    margin: 4px 0;
    color: #4a5568;
  }
  
  .storage-option button {
    width: 100%;
    margin: 0;
  }
  
  /* Storage Info in Header */
  .storage-info {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
  }
  
  .storage-type {
    font-size: 10px;
    color: #718096;
    background: #edf2f7;
    padding: 2px 6px;
    border-radius: 3px;
    margin-top: 2px;
  }
  
  /* Troubleshooting Styles */
  .troubleshooting {
    margin: 15px 0;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
  }
  
  .troubleshooting summary {
    padding: 10px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
    color: #4a5568;
    background: #f7fafc;
    border-radius: 6px;
  }
  
  .troubleshooting summary:hover {
    background: #edf2f7;
  }
  
  .troubleshoot-content {
    padding: 10px;
    font-size: 12px;
  }
  
  .troubleshoot-content ul {
    margin: 8px 0;
    padding-left: 16px;
  }
  
  .troubleshoot-content li {
    margin: 4px 0;
    color: #4a5568;
  }
  
  .troubleshoot-content strong {
    color: #2d3748;
  }
  
  .status-counters {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top:4px;
  }
  .chip {
    font-size:10px;
    padding:2px 6px;
    border-radius:3px;
    font-weight:500;
    color:white;
  }
  .chip-to-apply{background:#3182ce;}
  .chip-applied{background:#38a169;}
  .chip-interview{background:#d69e2e;}
  .chip-rejected{background:#e53e3e;}
  .chip-offer{background:#805ad5;}
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











