# TrackTern Extension

A Chrome extension that automatically extracts job information from job posting websites and saves it to your preferred storage method.

## 🚀 Features

- **Smart Job Extraction**: Automatically detects job titles, companies, and descriptions from job sites
- **Multiple Storage Options**: Choose between Local Storage (simple) or Airtable (advanced)
- **Beautiful Dashboard**: View all your saved jobs in a clean, organized interface
- **Export Functionality**: Download your job data as CSV
- **Works Everywhere**: LinkedIn, Indeed, and other major job sites

---

## 📦 Quick Setup

### Option 1: Local Storage (Recommended for Most Users)
✅ **Zero setup required** - works immediately  
✅ **No external accounts needed**  
✅ **Export to CSV anytime**  
⚠️ **Data stays on this device only**

1. Install the extension
2. Click "💾 Local Storage" when prompted
3. Start saving jobs immediately!

### Option 2: Airtable Sync (Advanced Users)
✅ **Access from anywhere**  
✅ **Advanced filtering & views**  
✅ **Team collaboration**  
⚠️ **Requires Airtable account setup**

1. Install the extension
2. Click "☁️ Airtable Sync" when prompted
3. Follow the guided setup process

---

## 🔧 Installation

1. **Download the extension**
   ```bash
   git clone https://github.com/Rezwan3App/tracktern-extension
   ```

2. **Load in Chrome**
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (top right)
   - Click "Load unpacked"
   - Select the extension folder

3. **Start Using**
   - Navigate to any job posting
   - Click the extension icon
   - Choose your storage method
   - Save jobs with one click!

---

## 💾 Storage Options Comparison

| Feature | Local Storage | Airtable |
|---------|---------------|-----------|
| **Setup Time** | 0 seconds | ~2 minutes |
| **Account Required** | ❌ None | ✅ Airtable account |
| **Works Offline** | ✅ Yes | ❌ No |
| **Cross-Device Sync** | ❌ No | ✅ Yes |
| **Export Data** | ✅ CSV | ✅ CSV + Database |
| **Advanced Filtering** | ❌ Basic | ✅ Full database |
| **Team Sharing** | ❌ No | ✅ Yes |
| **Data Backup** | ⚠️ Manual | ✅ Automatic |

---

## 🎯 How It Works

### 1. **Smart Detection**
The extension automatically detects:
- Job titles from page headings
- Company names from various page elements  
- Job descriptions from "About" sections and content blocks
- Filters out metadata like posting dates and applicant counts

### 2. **Flexible Storage**
Choose your preferred method:
- **Local Storage**: Instant setup, browser-based storage
- **Airtable**: Cloud sync with advanced database features

### 3. **Beautiful Interface**
- Clean job cards with status indicators
- Quick actions (add job, export, settings)
- Search and filter capabilities
- One-click job saving

---

## 🌐 Supported Job Sites

- **LinkedIn** (optimized selectors)
- **Indeed** 
- **Glassdoor**
- **AngelList** 
- **Monster**
- **ZipRecruiter**
- And many more! (Generic job site detection)

---

## ⚙️ Configuration

### Local Storage
- No configuration needed
- Data stored in browser's local storage
- Switch to Airtable anytime from Settings

### Airtable Setup
1. **Create Base**: Use our guided setup or existing base
2. **Generate Token**: Personal Access Token with required permissions
3. **Connect**: Paste token and start syncing

**Required Airtable Permissions:**
- `data.records:read`
- `data.records:write`  
- `schema.bases:read`

---

## 📊 Job Data Structure

Each saved job includes:
- **Job Title**: Position name
- **Company**: Company name
- **Description**: Full job description (cleaned of metadata)
- **URL**: Original job posting link
- **Status**: Application status (To Apply, Applied, Interview, Rejected)
- **Date Added**: When job was saved

---

## 🔄 Migration & Export

### Export Your Data
- **Local Storage**: Click "📊 Export CSV" in job list
- **Airtable**: Export via Airtable interface or extension CSV

### Switch Storage Methods
- Go to Settings → Switch storage type
- Data migration assistance available
- No data loss during switching

---

## 🛠️ Development

### Project Structure
```
tracktern-extension/
├── manifest.json          # Extension configuration
├── popup.html             # Extension popup interface  
├── popup.js               # Main application logic
├── content.js             # Content script for job extraction
├── AIRTABLE_SETUP.md      # Detailed Airtable setup guide
└── README.md              # This file
```

### Key Features
- **Multi-storage architecture**: Supports both local and cloud storage
- **Smart job extraction**: Advanced selectors and fallback methods
- **Error handling**: Comprehensive error management and user feedback
- **Responsive UI**: Clean, modern interface optimized for extension popup

### Contributing
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

---

## 🆘 Troubleshooting

### Common Issues

**"No job data detected"**
- Try the "↻ Re-scan page" button
- Some job sites may need manual entry
- Check browser console (F12) for detailed logs

**Local storage not working**
- Check if browser storage is enabled
- Clear extension data and restart
- Ensure sufficient storage space

**Airtable connection issues**
- Verify Personal Access Token format (starts with "pat")
- Check all required permissions are enabled
- Ensure base access is granted to token

### Getting Help
- Check `AIRTABLE_SETUP.md` for detailed setup instructions
- Use browser console (F12) for debugging information
- Open GitHub issue for bug reports

---

## 📈 Roadmap

- [ ] **Browser sync**: Sync local storage across Chrome instances
- [ ] **Job search integration**: Search jobs directly in extension
- [ ] **Application tracking**: Enhanced status workflow
- [ ] **Notifications**: Reminders for follow-ups
- [ ] **Analytics**: Job search insights and statistics
- [ ] **Templates**: Cover letter and resume templates

---

## 📄 License

MIT License - see LICENSE file for details.

---

## 🙏 Acknowledgments

Built with ❤️ for job seekers everywhere. 

**Made simple, kept powerful.** 🚀