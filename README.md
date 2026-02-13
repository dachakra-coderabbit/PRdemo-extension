# CodeRabbit PR Hopper

A Chrome extension for analyzing CodeRabbit comments across your GitHub pull requests. Find patterns in code review feedback by grouping similar issues and filtering by priority or acceptance status.

## What You Need

**Chrome or any Chromium-based browser**
   Edge, Brave, and Arc work too.

**A GitHub organization or repository you want to analyze**
   For example: `facebook/react` or your company's org name.

## Loading the Extension

1. Open Chrome and go to `chrome://extensions/`
2. Look for the "Developer mode" toggle in the top-right corner and turn it on
3. Click the "Load unpacked" button that appears
4. Navigate to the `extension/` folder inside this project
5. Click "Select Folder"

![Screenshot](/extension/loading-extension.png)
You should see "CodeRabbit PR Hopper" appear in your extensions list. Pin it to your toolbar for easy access.


## Usage

Click the extension icon to open the side panel. You'll see a form asking for:

- **Organization/Owner**: `supabase` (if you want to analyze supabase/supabase)
- **Repository**: `supase` (leave empty to search across all repos in the org)
- **Date Range**: Last 90 days is the default

Click "Analyze PRs" and wait. It'll fetch closed & merged PRs, find CodeRabbit comments, and group similar feedback.

**Example:**
```
Organization: supabase
Repository: supabase
Start Date: 2024-11-01
End Date: 2025-02-01
```

This searches all closed & merged PRs in `supabase/supabase` from November through January.

### Results
**All Comment Titles** This section contains all the inline comments posted by CodeRabbit. The titles represent the actionable comment's title. We are using Jaccard similarity to group similar titles together to elminate noise.

### Filtering

Use the filter buttons to narrow down results:

- **Priority Filters:** High, Medium, Low
- **Acceptance Filters:** Accepted, Not Accepted

There's 2 types of Accepted Comments: 
1. ✅  -> The inline comment was resolved:
  a. When user add commit by clicking through CR's `Commitable Suggestion`
  b. When user manually resolves comment. (May lead to false positives)
  
2. `(auto detect)` -> This means CR automatically detected the commit that resolved the comment and added "✅ Addressed in commit" to the body.


## Technical Details 

### Token (Optional)

The extension uses a Personal Access Token (PAT) from a dedicated service account, ensuring secure and isolated access by default. There’s no need to provide your own token.

However, if you prefer to use your own PAT, follow the steps below:

```bash
cd extension
cp config.example.js config.js
```

Then open `config.js` and replace the placeholder with your GitHub token:

```javascript
window.CONFIG = {
  GITHUB_TOKEN: 'ghp_yourActualTokenHere'
};
Don't commit `config.js`. It's already in `.gitignore`.
```


### Endpoints: 
We're hitting GitHub with two different APIs because each does something the other can't.
#### GitHub REST API
**What it's for:** Finding PRs and reading comments
**Endpoint:** `https://api.github.com/search/issues`

The REST API lets us search for closed PRs in a date range and grab all the CodeRabbit comments. It's fast and straightforward for bulk operations.

[GitHub REST API Docs](https://docs.github.com/en/rest)

#### GitHub GraphQL API
**What it's for:** Checking if review threads are resolved
**Endpoint:** `https://api.github.com/graphql`

GraphQL gives us access to review thread metadata that isn't available in REST. Specifically, we need the `isResolved` field to know if someone marked a comment as resolved. We also check comment bodies for "✅ Addressed in commit" text

[GitHub GraphQL API Docs](https://docs.github.com/en/graphql)

### Rate Limits

GitHub's rate limits depend on authentication:

| Auth Status | Rate Limit | Resets |
|------------|------------|--------|
| **No Token** | 60 requests/hour | Every hour |
| **With Token** | 5,000 requests/hour | Every hour |

The extension will warn you if it detects no token. You'll hit the limit fast without one—analyzing even 10-20 PRs can burn through 60 requests.


### What Gets Grouped
The extension uses Jaccard similarity (60% threshold) to cluster similar comment titles. If CodeRabbit flags the same issue across multiple PRs, you'll see them grouped together with a count.
