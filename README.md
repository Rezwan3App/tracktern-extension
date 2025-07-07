# Tracktern Job Saver - Chrome Extension with Airtable Integration

A Chrome extension that automatically extracts job listing information from websites and saves it directly to Airtable.

## Features

- **Auto-extraction**: Automatically scrapes job title, company, description, and URL from job listing pages
- **Multiple site support**: Works with LinkedIn, Indeed, Workable.com, and many other job sites
- **Airtable integration**: Saves data directly to your Airtable base using Personal Access Tokens
- **Smart selectors**: Uses multiple fallback CSS selectors for reliable data extraction
- **Secure storage**: Configuration stored securely in Chrome's sync storage

## Setup Instructions

### 1. Create Airtable Base

1. Go to [Airtable](https://airtable.com) and create a new base
2. Create a table with these columns (exact names matter):
   - `Job Title` (Single line text)
   - `Company` (Single line text) 
   - `Description` (Long text)
   - `URL` (URL)
   - `Date Added` (Date)

### 2. Get Airtable Credentials

#### Personal Access Token (PAT):
1. Visit [https://airtable.com/create/tokens](https://airtable.com/create/tokens)
2. Click "Create new token"
3. Give it a name like "Job Saver Extension"
4. Set scopes:
   - `data.records:read`
   - `data.records:write`
   - `schema.bases:read`
5. Select your specific base under "Access"
6. Click "Create token" and copy it

#### Base ID:
1. Go to [https://airtable.com/api](https://airtable.com/api)
2. Select your base
3. Copy the Base ID (starts with `app...`)

### 3. Install Extension

1. Clone this repository or download the files
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" (top right)
4. Click "Load unpacked" and select the extension folder

### 4. Configure Extension

1. Click the extension icon in your browser
2. Click "⚙️ Settings" button
3. Fill in:
   - **Personal Access Token**: Your PAT from step 2
   - **Base ID**: Your base ID (e.g., `appXXXXXXXXXX`)
   - **Table Name**: Name of your table (e.g., `Jobs`)
4. Click "Save Configuration"

## Usage

1. **Visit any job listing page** (LinkedIn, Indeed, company careers pages, etc.)
2. **Click the extension icon** - it will auto-populate with scraped data
3. **Review and edit** the extracted information if needed
4. **Click "Save to Airtable"** to store the job

## Supported Job Sites

The extension works on most job listing websites including:
- LinkedIn Jobs
- Indeed
- Company career pages
- Workable.com hosted jobs
- AngelList/Wellfound
- RemoteOK
- And many others!

## Troubleshooting

### Configuration Issues
- **"Configuration test failed"**: Check your PAT has correct permissions and base ID is valid
- **"Base ID should start with app"**: Ensure you copied the full Base ID from Airtable API docs

### Saving Issues  
- **"Error saving job"**: Verify your table has the exact column names listed above
- **Missing data**: Some sites may require manual editing of scraped content

### Permission Issues
- **"Invalid permissions"**: Your PAT needs `data.records:write` scope
- **"Table not found"**: Check table name matches exactly (case-sensitive)

## Field Mapping

The extension maps scraped data to these Airtable fields:

| Extension Field | Airtable Field | Type |
|----------------|----------------|------|
| Job Title | `Job Title` | Single line text |
| Company | `Company` | Single line text |
| Description | `Description` | Long text |
| URL | `URL` | URL |
| Current Date | `Date Added` | Date |

## Security

- Personal Access Tokens are stored securely in Chrome's sync storage
- Tokens are encrypted and synced across your Chrome instances
- No data is sent to third parties except Airtable

## API Rate Limits

- Airtable allows 5 requests per second per base
- Extension includes error handling for rate limits
- For heavy usage, consider upgrading your Airtable plan

## Development

### File Structure
```
├── manifest.json       # Extension configuration
├── popup.html         # Extension popup UI  
├── popup.js          # Main extension logic & Airtable API
├── content.js        # Alternative content scraping
└── README.md         # This file
```

### Key Components
- **AirtableJobSaver class**: Handles all API interactions and UI management
- **Configuration management**: Secure storage and validation of credentials
- **Smart scraping**: Multiple selector strategies for different job sites
- **Error handling**: Comprehensive error messages and status updates

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly on various job sites
5. Submit a pull request

## License

MIT License - feel free to use and modify for your needs.

## Support

If you encounter issues:
1. Check the troubleshooting section above
2. Verify your Airtable setup matches the requirements
3. Test the configuration in the extension settings
4. Check browser console for detailed error messages