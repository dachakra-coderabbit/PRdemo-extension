# CodeRabbit PR Analyzer - Browser Extension

A Chrome/Edge browser extension that analyzes CodeRabbit AI comments across your GitHub organization's pull requests.

## Features

- 🔍 **PR Analysis**: Fetches and analyzes all PRs from a GitHub repository
- 📊 **Comment Distribution**: Shows distribution of comments by severity and priority
- 📝 **Title Tracking**: Lists all unique comment titles with occurrence counts
- 🔐 **Token-Based Auth**: Uses a hardcoded GitHub token for authentication
- 💾 **Export Data**: Download analysis results as JSON

## Installation

### Chrome/Edge

1. **Set up GitHub token**:
   - Copy `.env.example` to `.env` in the project root
   - Generate a GitHub token at https://github.com/settings/tokens/new
     - For classic token: Check the `repo` scope
     - For fine-grained token: Set "Pull requests" to Read-only
   - Replace `ghp_YOUR_TOKEN_HERE` in `.env` with your actual token
   - Run `node build-config.js` to generate `config.js` from `.env`

2. Open Chrome/Edge and navigate to `chrome://extensions/` (or `edge://extensions/`)

3. Enable **Developer mode** (toggle in top-right corner)

4. Click **Load unpacked**

5. Select the `extension` folder from this project

6. The extension icon should appear in your browser toolbar

## Usage

1. **Click the extension icon** in your browser toolbar

2. **Enter details**:
   - Organization/Owner (e.g., `facebook`)
   - Repository Name (e.g., `react`)
   - Date Range (defaults to last 90 days)

4. **Click "Analyze PRs"** and wait for the results

5. **View Results**:
   - Total PRs reviewed by CodeRabbit
   - Comment distribution by severity (Potential issue, Nitpick, etc.)
   - Comment distribution by priority (Critical, Major, Minor, Trivial)
   - List of all comment titles with occurrence counts

6. **Export Data**: Click "Export Data as JSON" to download the full analysis

## How It Works

The extension:
1. Uses a hardcoded GitHub token for authentication
2. Calls the GitHub API to fetch all PRs in the specified date range
3. For each PR, fetches all comments from the `coderabbitai[bot]` user
4. Parses CodeRabbit's comment format to extract severity, priority, and titles
5. Aggregates and displays the statistics

## Data Structure

The extension parses CodeRabbit comments that follow this format:
```
_⚠️ Potential issue_ | _🟠 Major_
**Comment Title Here**
Description text...
```

### Severity Types
- ⚠️ Potential issue
- 🧹 Nitpick
- 💡 Suggestion
- 🔍 Review

### Priority Levels
- 🔴 Critical
- 🟠 Major
- 🟡 Minor
- 🔵 Trivial

## Permissions

The extension requires these permissions:
- `storage`: To save your organization/repository preferences
- `https://github.com/*`: To access GitHub
- `https://api.github.com/*`: To call the GitHub API

## Privacy

- All data processing happens locally in your browser
- No data is sent to external servers
- The extension uses a configured GitHub token for API access
- GitHub API rate limits apply (5,000 requests/hour for authenticated tokens)

## Troubleshooting

### "Not authenticated with GitHub"
- Make sure you've created `.env` from `.env.example` with a valid token
- Run `node build-config.js` to generate `config.js`
- Verify your GitHub token is valid: `curl -H "Authorization: token YOUR_TOKEN" https://api.github.com/user`
- Reload the extension in Chrome after regenerating `config.js`

### "Rate limit exceeded"
- GitHub limits API requests to 5,000 per hour
- Wait for the rate limit to reset (shown in error message)
- Consider narrowing your date range to reduce API calls

### No results found
- Verify the organization and repository names are correct
- Check that the repository has PRs in the selected date range
- Ensure CodeRabbit has commented on the PRs

## Development

### Project Structure
```
project-root/
├── .env               # GitHub token (DO NOT COMMIT)
├── .env.example       # Template for .env
├── build-config.js    # Build script to generate config.js from .env
├── .gitignore         # Git ignore rules
└── extension/
    ├── manifest.json       # Extension configuration
    ├── config.js          # Auto-generated from .env (DO NOT COMMIT)
    ├── sidepanel.html     # Side panel UI
    ├── popup.html         # Popup UI
    ├── popup.css          # Styling
    ├── sidepanel.js       # Side panel logic
    ├── popup.js           # Popup logic
    ├── github-api.js      # GitHub API wrapper
    └── background.js      # Service worker
```

**Important**:
- Never commit `.env` or `config.js` - they contain your GitHub token!
- Run `node build-config.js` after updating `.env` to regenerate `config.js`

### Testing Changes
1. Make your code changes
2. If you updated `.env`, run `node build-config.js` to regenerate `config.js`
3. Go to `chrome://extensions/`
4. Click the refresh icon on the extension card
5. Test the changes

## Future Enhancements

Potential features to add:
- [ ] Progress bar during analysis
- [ ] Filter by PR author
- [ ] Trend analysis over time
- [ ] Compare multiple repositories
- [ ] Custom date ranges (last week, last month, etc.)
- [ ] Dark mode support
- [ ] Export to CSV
- [ ] GitHub Enterprise support

## Credits

Based on the `fetch-repo-prs-github.ts` script from the coderabbit-comments project.

## License

MIT
