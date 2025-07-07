# Airtable Setup Guide for Job Tracker Extension

## 🚀 Quick Setup (Recommended)

### Step 1: Create an Airtable Base
1. Go to [airtable.com](https://airtable.com) and sign up/log in
2. Click "Create a base" or go to [airtable.com/create/base](https://airtable.com/create/base)
3. Choose "Start from scratch" or use any template
4. Name your base something like "Job Tracker", "Job Applications", or "Career Dashboard"

### Step 2: Create Personal Access Token
1. Go to [airtable.com/create/tokens](https://airtable.com/create/tokens)
2. Click "Create new token"
3. Give it a name like "Job Tracker Extension"

**Required Scopes (check these boxes):**
- ✅ `data.records:read`
- ✅ `data.records:write` 
- ✅ `schema.bases:read`

**Base Access:**
- Select your Job Tracker base from the dropdown

4. Click "Create token" and copy the token (starts with "pat...")

### Step 3: Connect Extension
1. Open the Job Tracker extension
2. Click "✨ Auto-Setup" or "🔧 Manual Setup"
3. Paste your Personal Access Token
4. Click "Connect & Setup"

---

## 🔧 Manual Setup (Advanced)

If you prefer to set up your base structure manually:

### Base Structure
The extension works with any table structure, but for best results, create columns like:

| Column Name | Type | Description |
|-------------|------|-------------|
| Job Title | Single line text | The position title |
| Company | Single line text | Company name |
| Description | Long text | Job description |
| URL | URL | Link to job posting |
| Status | Single select | Application status |
| Date Added | Date | When job was saved |

### Status Options (Single Select)
- To Apply
- Applied  
- Interview
- Rejected
- Offer

---

## 🔍 Troubleshooting

### Common Errors

**❌ "Invalid token: 401"**
- Token is incorrect or expired
- Create a new Personal Access Token
- Make sure it starts with "pat"

**❌ "Token does not have required permissions: 403"**
- Missing required scopes
- Recreate token with all three scopes checked:
  - `data.records:read`
  - `data.records:write`
  - `schema.bases:read`

**❌ "No bases found"**
- Token doesn't have access to any bases
- When creating token, make sure to select your base in "Base Access"

**❌ "No tables found in base"**
- Your base is empty
- Create at least one table in your Airtable base

### Token Validation
✅ **Valid token format:** `patXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX`
❌ **Invalid:** Short tokens, tokens not starting with "pat"

### Debug Steps
1. Open browser console (F12)
2. Look for detailed error messages
3. Check that your token has base access
4. Verify your base has at least one table

---

## 🎯 How the Extension Works

1. **Base Detection:** Looks for bases with "job", "application", "tracker", or "career" in the name
2. **Table Selection:** Finds job-related tables or uses the first available table
3. **Auto-Mapping:** Works with any column structure, maps common field names
4. **Flexible Setup:** Adapts to your existing base structure

---

## 📝 Best Practices

### Base Organization
- Use descriptive base names (e.g., "Job Applications 2024")
- Create views for different application stages
- Add filters for companies or job types

### Field Setup
- Use Single Select for consistent status tracking
- Add formula fields for application age
- Include attachments for resumes/cover letters

### Privacy & Security
- Personal Access Tokens are stored locally in your browser
- Tokens only access the bases you specify
- Revoke tokens anytime at [airtable.com/account](https://airtable.com/account)

---

## 🆘 Still Need Help?

1. **Check Browser Console:** Press F12 and look for error details
2. **Verify Token:** Make sure it starts with "pat" and has all permissions
3. **Test Manually:** Try accessing your base directly in Airtable
4. **Recreate Token:** Delete old token and create a new one with proper permissions

The extension is designed to work with any Airtable setup - just make sure your token has the right permissions! 🚀