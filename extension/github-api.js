// GitHub API module for fetching CodeRabbit PR data using GitHub token
const CODERABBIT_USERNAME = 'coderabbitai[bot]';
// Token is loaded from config.js (not committed to git)
const GITHUB_TOKEN = window.CONFIG?.GITHUB_TOKEN || '';

class GitHubAPI {
  constructor(owner, repo, startDate, endDate, token = GITHUB_TOKEN) {
    this.owner = owner;
    this.repo = repo;
    this.startDate = startDate;
    this.endDate = endDate;
    this.token = token || GITHUB_TOKEN;
    this.rateLimitRemaining = null;

    // Log token status for debugging (never log the actual token!)
    if (this.token) {
      console.log('✅ GitHub API initialized (token provided) - 5,000 requests/hour available');
    } else {
      console.warn('⚠️ WARNING: No GitHub token found! Using unauthenticated requests (60/hour limit). Add token to config.js for 5,000/hour limit.');
    }
  }

  async fetchWithRetry(url, retries = 3) {
    for (let i = 0; i < retries; i++) {
      try {
        const headers = {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'CodeRabbit-Analyzer-Extension'
        };

        // Add authorization if token is provided
        const isAuthenticated = !!this.token;
        if (this.token) {
          headers['Authorization'] = `token ${this.token}`;
        }

        const response = await fetch(url, { headers });

        // Update rate limit info
        const rateLimitRemaining = response.headers.get('x-ratelimit-remaining');
        const rateLimitLimit = response.headers.get('x-ratelimit-limit');
        const rateLimitReset = response.headers.get('x-ratelimit-reset');
        this.rateLimitRemaining = rateLimitRemaining;

        // Log rate limit info on first request
        if (i === 0) {
          console.log(`GitHub API Rate Limit: ${rateLimitRemaining}/${rateLimitLimit} remaining (${isAuthenticated ? 'Authenticated' : 'Unauthenticated'})`);
        }

        if (response.status === 403) {
          // Check if it's a rate limit error
          if (rateLimitRemaining === '0' && rateLimitReset) {
            const resetTime = parseInt(rateLimitReset) * 1000;
            const resetDate = new Date(resetTime);
            const minutesUntilReset = Math.ceil((resetTime - Date.now()) / 1000 / 60);

            const authStatus = isAuthenticated ? 'Authenticated' : 'Unauthenticated';
            const expectedLimit = isAuthenticated ? '5,000' : '60';

            throw new Error(
              `GitHub API rate limit exceeded (${authStatus}, limit: ${expectedLimit}/hour). ` +
              `Limit resets in ${minutesUntilReset} minutes (at ${resetDate.toLocaleTimeString()}). ` +
              `${!isAuthenticated ? 'NOTICE: Token not found! Check config.js. ' : ''}` +
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
    const per_page = 100;

    while (hasMore) {
      const url = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}per_page=${per_page}&page=${page}`;
      const data = await this.fetchWithRetry(url);

      // Handle both direct array responses and Search API responses (with 'items' array)
      let items;
      let maxPages = null;

      if (Array.isArray(data)) {
        // Direct array response (regular API)
        items = data;
      } else if (data && Array.isArray(data.items)) {
        // Search API response (has 1,000 result cap)
        items = data.items;

        // GitHub Search API caps results at 1,000 (10 pages of 100)
        if (data.total_count !== undefined) {
          maxPages = Math.ceil(Math.min(data.total_count, 1000) / per_page);
        }
      } else {
        items = [];
      }

      if (items.length > 0) {
        results = results.concat(items);
        page++;

        // Determine if there are more pages
        if (maxPages !== null) {
          // Search API: respect the 1,000 result cap
          hasMore = page <= maxPages;
        } else {
          // Regular API: check if we got a full page
          hasMore = items.length === per_page;
        }

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
      timestamp: '',
      accepted: false,
      acceptanceMethod: null
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

  async fetchGraphQLThreads(prNumber) {
    try {
      const query = `
        query($owner: String!, $repo: String!, $prNumber: Int!) {
          repository(owner: $owner, name: $repo) {
            pullRequest(number: $prNumber) {
              reviewThreads(first: 100) {
                nodes {
                  id
                  isResolved
                  comments(first: 100) {
                    nodes {
                      id
                      databaseId
                      url
                      author {
                        login
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `;

      const variables = {
        owner: this.owner,
        repo: this.repo,
        prNumber: prNumber
      };

      const response = await fetch('https://api.github.com/graphql', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GITHUB_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query, variables })
      });

      if (!response.ok) {
        console.error(`GraphQL request failed for PR #${prNumber}:`, response.status);
        return [];
      }

      const data = await response.json();

      if (data.errors) {
        console.error(`GraphQL errors for PR #${prNumber}:`, data.errors);
        return [];
      }

      const threads = data.data?.repository?.pullRequest?.reviewThreads?.nodes || [];
      return threads;
    } catch (error) {
      console.error(`Error fetching GraphQL threads for PR #${prNumber}:`, error);
      return [];
    }
  }

  async analyzePRs(progressCallback) {
    try {
      // Use Search API to fetch closed PRs (both merged and closed-without-merging) in date range
      progressCallback({ status: 'Fetching closed PRs from GitHub...' });

      // Format dates for GitHub search query (YYYY-MM-DD)
      const startDateStr = this.startDate.toISOString().split('T')[0];
      const endDateStr = this.endDate.toISOString().split('T')[0];

      // GitHub Search API: type:pr is:closed repo:owner/repo created:start..end
      // is:closed includes both merged PRs and closed-without-merging PRs
      const searchQuery = `type:pr is:closed repo:${this.owner}/${this.repo} created:${startDateStr}..${endDateStr}`;
      const searchUrl = `https://api.github.com/search/issues?q=${encodeURIComponent(searchQuery)}&sort=created&order=desc&per_page=100`;

      const searchResults = await this.fetchAllPages(searchUrl);

      // Search API returns items in 'items' array, convert to PR format
      const allPRs = searchResults.map(item => ({
        number: item.number,
        title: item.title,
        state: item.state,
        created_at: item.created_at,
        merged_at: item.closed_at, // Use closed_at for all closed PRs
        html_url: item.html_url,
        user: item.user
      }));

      // All PRs from search are already closed (merged or not) and in date range
      const filteredPRs = allPRs;

      progressCallback({
        status: `Found ${filteredPRs.length} closed PRs. Analyzing comments...`,
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
              // Fetch both REST comments and GraphQL threads in parallel
              const [comments, threads] = await Promise.all([
                this.fetchPRComments(pr.number),
                this.fetchGraphQLThreads(pr.number)
              ]);

              if (comments.length === 0) return null;

              const actionableIssues = [];

              for (const comment of comments) {
                const issue = this.parseActionableIssue(comment.body);
                if (issue) {
                  issue.url = comment.html_url;
                  issue.timestamp = comment.created_at;

                  // Try to find matching thread for this comment to check if resolved
                  const matchingThread = threads.find(thread =>
                    thread.comments.nodes.some(threadComment =>
                      threadComment.url === comment.html_url ||
                      threadComment.databaseId === comment.id
                    )
                  );

                  if (matchingThread && matchingThread.isResolved) {
                    issue.accepted = true;
                    issue.acceptanceMethod = 'graphql';
                  }

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
          totalPRs: filteredPRs.length,
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
