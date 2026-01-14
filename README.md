# TrackFlow Extension

A Chrome extension that extracts job information from job posting websites and saves it locally in your browser.

## Features
- Smart job extraction (title, company, description, URL)
- Local-only storage (no external services)
- Job list dashboard with status tracking
- CSV export
- Works on most job sites

## Quick Setup
1. Install the extension
2. Open any job posting
3. Click the extension icon and save the job

## Installation
1. Clone the repo:
   ```bash
   git clone https://github.com/Rezwan3App/tracktern-extension
   ```
2. Load in Chrome:
   - Open `chrome://extensions/`
   - Enable Developer Mode
   - Click "Load unpacked" and select this folder

## How It Works
1. Scrapes job details from the active tab
2. Saves jobs to `chrome.storage.local`
3. Shows a list of saved jobs with status updates

## Project Structure
```
tracktern-extension/
├── manifest.json          # Extension configuration
├── popup.html             # Extension popup UI
├── popup.js               # Popup logic and job storage
├── icons/                 # Extension icons
└── README.md              # This file
```

## Notes
- Data lives only in your browser unless you export CSV.

## License
MIT License
