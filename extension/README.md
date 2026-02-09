# CodeRabbit PR Analyzer - Browser Extension

A Chrome/Edge browser extension that analyzes CodeRabbit AI comments across your GitHub organization's pull requests.

## Features

- 🔍 **PR Analysis**: Fetches and analyzes all PRs from a GitHub repository
- 📊 **Comment Distribution**: Shows distribution of comments by severity and priority
- 📝 **Title Tracking**: Lists all unique comment titles with occurrence counts
- 🔐 **Session-Based**: Uses your existing GitHub browser session (no token needed)
- 💾 **Export Data**: Download analysis results as JSON

## Installation

### Chrome/Edge

1. Open Chrome/Edge and navigate to `chrome://extensions/` (or `edge://extensions/`)

2. Enable **Developer mode** (toggle in top-right corner)

3. Click **Load unpacked**

4. Select the `extension` folder from this project

5. The extension icon should appear in your browser toolbar

## Usage

1. **Log in to GitHub**: Make sure you're logged in to GitHub in your browser

2. **Click the extension icon** in your browser toolbar

3. **Enter details**:
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
1. Uses your browser's GitHub session cookies for authentication
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
- `cookies`: To use your GitHub session for API authentication
- `storage`: To save your organization/repository preferences
- `https://github.com/*`: To access GitHub
- `https://api.github.com/*`: To call the GitHub API

## Privacy

- All data processing happens locally in your browser
- No data is sent to external servers
- The extension only accesses GitHub using your existing session
- GitHub API rate limits apply (5,000 requests/hour for authenticated users)

## Troubleshooting

### "Not authenticated with GitHub"
- Make sure you're logged in to GitHub in the same browser
- Try refreshing github.com and then running the analysis again

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
extension/
├── manifest.json       # Extension configuration
├── popup.html         # Main UI
├── popup.css          # Styling
├── popup.js           # UI logic and event handling
├── github-api.js      # GitHub API wrapper
├── background.js      # Service worker
└── icons/            # Extension icons (add your own)
```

### Testing Changes
1. Make your code changes
2. Go to `chrome://extensions/`
3. Click the refresh icon on the extension card
4. Test the changes

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
