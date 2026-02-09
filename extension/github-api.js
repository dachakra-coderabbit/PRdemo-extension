// GitHub API module for fetching CodeRabbit PR data using GitHub token
const CODERABBIT_USERNAME = 'coderabbitai[bot]';

class GitHubAPI {
  constructor(owner, repo, startDate, endDate, token) {
    this.owner = owner;
    this.repo = repo;
    this.startDate = startDate;
    this.endDate = endDate;
    this.token = token;
    this.rateLimitRemaining = null;
  }

  async fetchWithRetry(url, retries = 3) {
    for (let i = 0; i < retries; i++) {
      try {
        const headers = {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'CodeRabbit-Analyzer-Extension'
        };

        // Add authorization if token is provided
        if (this.token) {
          headers['Authorization'] = `token ${this.token}`;
        }

        const response = await fetch(url, { headers });

        // Update rate limit info
        const rateLimitRemaining = response.headers.get('x-ratelimit-remaining');
        const rateLimitReset = response.headers.get('x-ratelimit-reset');
        this.rateLimitRemaining = rateLimitRemaining;

        if (response.status === 403) {
          // Check if it's a rate limit error
          if (rateLimitRemaining === '0' && rateLimitReset) {
            const resetTime = parseInt(rateLimitReset) * 1000;
            const resetDate = new Date(resetTime);
            const minutesUntilReset = Math.ceil((resetTime - Date.now()) / 1000 / 60);

            throw new Error(
              `GitHub API rate limit exceeded. ` +
              `Limit resets in ${minutesUntilReset} minutes (at ${resetDate.toLocaleTimeString()}). ` +
              `Try again later or reduce your date range.`
            );
          }
          throw new Error('GitHub API access forbidden. You may need to log in to GitHub.');
        }

        if (response.status === 401) {
          throw new Error('Not authenticated with GitHub. Please log in to GitHub first.');
        }

        if (response.status === 404) {
          throw new Error(
            `Repository not found: ${this.owner}/${this.repo}. ` +
            `Please check that the organization and repository names are correct, ` +
            `and that the repository exists and is accessible.`
          );
        }

        if (!response.ok) {
          throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
        }

        return await response.json();
      } catch (error) {
        if (i === retries - 1) throw error;
        console.log(`Request failed, retrying (${i + 1}/${retries})...`);
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
      }
    }
  }

  async fetchAllPages(baseUrl, progressCallback) {
    let results = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const url = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}per_page=100&page=${page}`;
      const data = await this.fetchWithRetry(url);

      if (Array.isArray(data) && data.length > 0) {
        results = results.concat(data);
        page++;
        hasMore = data.length === 100;

        if (progressCallback) {
          progressCallback({ page, total: results.length });
        }
      } else {
        hasMore = false;
      }
    }

    return results;
  }

  parseActionableIssue(body) {
    if (!body) return null;

    // Extract severity and priority from markers
    // Patterns like: "_⚠️ Potential issue_ | _🟠 Major_"
    const severityMatch = body.match(/_(⚠️|🧹|💡|🔍)\s*([^_]+)_\s*\|\s*_([🔵🟠🟡🔴🟣])\s*([^_]+)_/);

    if (!severityMatch) {
      return null;
    }

    const severity = severityMatch[2].trim();
    const priority = severityMatch[4].trim();

    let title = '';
    let description = '';

    // Try multiple patterns for extracting title and description

    // Pattern 1: Title after </details> with bold formatting
    const issueMatch = body.match(/<\/details>\s*\n\s*\*\*([^*]+)\*\*/);
    if (issueMatch) {
      title = issueMatch[1].trim();
      const afterTitle = body.substring(body.indexOf(issueMatch[0]) + issueMatch[0].length);
      const descMatch = afterTitle.match(/^([\s\S]*?)(?:<details>|<!--)/);
      if (descMatch) {
        description = descMatch[1].trim().replace(/\n{3,}/g, '\n\n');
      }
    } else {
      // Pattern 2: Look for any bold text after the severity line
      const afterSeverity = body.substring(body.indexOf(severityMatch[0]) + severityMatch[0].length);
      const boldMatch = afterSeverity.match(/\*\*([^*]+)\*\*/);
      if (boldMatch) {
        title = boldMatch[1].trim();
      }

      // Pattern 3: Extract text after severity marker until end or next section
      const textMatch = afterSeverity.match(/^\s*\n\s*([^\n<]+)/);
      if (!title && textMatch) {
        title = textMatch[1].trim();
      }

      // Get description (text after title or after severity)
      const descStart = title ? afterSeverity.indexOf(title) + title.length : 0;
      const descText = afterSeverity.substring(descStart);
      const descMatch = descText.match(/^\s*\n\s*([^\n<`]+)/);
      if (descMatch) {
        description = descMatch[1].trim();
      }
    }

    // If still no title, use first 100 chars of body as title
    if (!title) {
      const cleanBody = body.replace(/<[^>]+>/g, '').replace(/[_*`]/g, '').trim();
      const lines = cleanBody.split('\n').filter(line => line.trim());
      if (lines.length > 0) {
        title = lines[0].substring(0, 100) + (lines[0].length > 100 ? '...' : '');
      }
    }

    return {
      severity,
      priority,
      title,
      description,
      url: '',
      timestamp: ''
    };
  }

  async fetchPRComments(prNumber) {
    try {
      // Fetch all comment types in parallel for better performance
      const [reviews, reviewComments, issueComments] = await Promise.all([
        this.fetchAllPages(
          `https://api.github.com/repos/${this.owner}/${this.repo}/pulls/${prNumber}/reviews`
        ),
        this.fetchAllPages(
          `https://api.github.com/repos/${this.owner}/${this.repo}/pulls/${prNumber}/comments`
        ),
        this.fetchAllPages(
          `https://api.github.com/repos/${this.owner}/${this.repo}/issues/${prNumber}/comments`
        )
      ]);

      // Filter for CodeRabbit comments and combine
      const comments = [
        ...reviews.filter(r => r.user.login === CODERABBIT_USERNAME && r.body),
        ...reviewComments.filter(c => c.user.login === CODERABBIT_USERNAME),
        ...issueComments.filter(c => c.user.login === CODERABBIT_USERNAME)
      ];

      return comments;
    } catch (error) {
      console.error(`Error fetching comments for PR #${prNumber}:`, error);
      return [];
    }
  }

  async analyzePRs(progressCallback) {
    try {
      // Fetch all PRs (state=closed to get merged PRs)
      progressCallback({ status: 'Fetching merged PRs from GitHub...' });
      const prsUrl = `https://api.github.com/repos/${this.owner}/${this.repo}/pulls?state=closed&sort=created&direction=desc`;
      const allPRs = await this.fetchAllPages(prsUrl);

      // Filter PRs by date range and merged status
      const filteredPRs = allPRs.filter(pr => {
        // Only include merged PRs
        if (!pr.merged_at) return false;

        // Check if PR was created in the date range
        const createdAt = new Date(pr.created_at);
        return createdAt >= this.startDate && createdAt <= this.endDate;
      });

      progressCallback({
        status: `Found ${filteredPRs.length} merged PRs. Analyzing comments...`,
        total: filteredPRs.length
      });

      const prsWithIssues = [];
      let totalActionableIssues = 0;
      let processedCount = 0;

      // Process PRs in parallel batches for better performance
      const BATCH_SIZE = 20; // Process 20 PRs at a time (optimized for token auth)

      for (let i = 0; i < filteredPRs.length; i += BATCH_SIZE) {
        const batch = filteredPRs.slice(i, i + BATCH_SIZE);

        // Show rate limit info in progress
        const rateLimitInfo = this.rateLimitRemaining
          ? ` (Rate limit: ${this.rateLimitRemaining} remaining)`
          : '';

        progressCallback({
          status: `Analyzing PRs ${i + 1}-${Math.min(i + BATCH_SIZE, filteredPRs.length)} of ${filteredPRs.length}...${rateLimitInfo}`,
          current: i + batch.length,
          total: filteredPRs.length
        });

        // Process batch in parallel
        const batchResults = await Promise.all(
          batch.map(async (pr) => {
            try {
              const comments = await this.fetchPRComments(pr.number);

              if (comments.length === 0) return null;

              const actionableIssues = [];

              for (const comment of comments) {
                const issue = this.parseActionableIssue(comment.body);
                if (issue) {
                  issue.url = comment.html_url;
                  issue.timestamp = comment.created_at;
                  actionableIssues.push(issue);
                }
              }

              if (actionableIssues.length > 0) {
                return {
                  number: pr.number,
                  title: pr.title,
                  url: pr.html_url,
                  state: pr.state,
                  author: pr.user.login,
                  createdAt: pr.created_at,
                  actionableIssues
                };
              }

              return null;
            } catch (error) {
              console.error(`Error processing PR #${pr.number}:`, error);
              return null;
            }
          })
        );

        // Collect results
        batchResults.forEach(result => {
          if (result) {
            prsWithIssues.push(result);
            totalActionableIssues += result.actionableIssues.length;
          }
        });

        processedCount += batch.length;

        // Minimal delay between batches (token auth = 5000/hour = plenty of headroom)
        if (i + BATCH_SIZE < filteredPRs.length) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }

      progressCallback({ status: 'Processing results...' });

      return {
        repository: `${this.owner}/${this.repo}`,
        dateRange: {
          start: this.startDate.toISOString().split('T')[0],
          end: this.endDate.toISOString().split('T')[0]
        },
        summary: {
          totalPRsWithActionableIssues: prsWithIssues.length,
          totalActionableIssues: totalActionableIssues,
          avgIssuesPerPR: prsWithIssues.length > 0
            ? (totalActionableIssues / prsWithIssues.length).toFixed(1)
            : '0'
        },
        pullRequests: prsWithIssues
      };
    } catch (error) {
      throw error;
    }
  }
}

// Export for use in popup.js and background service worker
if (typeof window !== 'undefined') {
  window.GitHubAPI = GitHubAPI;
}

// Also export globally for service worker context
if (typeof self !== 'undefined') {
  self.GitHubAPI = GitHubAPI;
}
