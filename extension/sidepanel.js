// Side panel script for CodeRabbit PR Analyzer

let currentData = null;
let selectedPriorities = new Set(['all']);

// Initialize date inputs with default values
document.addEventListener('DOMContentLoaded', () => {
  const today = new Date();
  const ninetyDaysAgo = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000);

  // Format dates for input[type="date"] (YYYY-MM-DD)
  const todayStr = today.toISOString().split('T')[0];
  const ninetyDaysAgoStr = ninetyDaysAgo.toISOString().split('T')[0];

  const startDateInput = document.getElementById('startDate');
  const endDateInput = document.getElementById('endDate');

  // Set default values
  startDateInput.value = ninetyDaysAgoStr;
  endDateInput.value = todayStr;

  // Set initial min/max constraints
  startDateInput.setAttribute('max', todayStr);
  endDateInput.setAttribute('max', todayStr);

  // Update constraints dynamically to enforce 90-day range
  function updateDateConstraints() {
    const startVal = startDateInput.value;
    const endVal = endDateInput.value;

    if (startVal) {
      // End date must be at most 90 days after start date
      const startDate = new Date(startVal);
      const maxEndDate = new Date(startDate.getTime() + 90 * 24 * 60 * 60 * 1000);
      const maxEndDateStr = maxEndDate > today ? todayStr : maxEndDate.toISOString().split('T')[0];

      endDateInput.setAttribute('min', startVal);
      endDateInput.setAttribute('max', maxEndDateStr);
    }

    if (endVal) {
      // Start date must be at least 90 days before end date
      const endDate = new Date(endVal);
      const minStartDate = new Date(endDate.getTime() - 90 * 24 * 60 * 60 * 1000);
      const minStartDateStr = minStartDate.toISOString().split('T')[0];

      startDateInput.setAttribute('min', minStartDateStr);
      startDateInput.setAttribute('max', endVal);
    }
  }

  // Initialize constraints
  updateDateConstraints();

  // Update constraints when dates change
  startDateInput.addEventListener('change', updateDateConstraints);
  endDateInput.addEventListener('change', updateDateConstraints);

  // Load saved values from storage
  chrome.storage.local.get(['organization', 'repository'], (result) => {
    if (result.organization) {
      document.getElementById('organization').value = result.organization;
    }
    if (result.repository) {
      document.getElementById('repository').value = result.repository;
    }
  });

  // Set up event listeners
  document.getElementById('analyzeBtn').addEventListener('click', handleAnalyze);
  document.getElementById('exportBtn').addEventListener('click', handleExport);
  document.getElementById('newAnalysisBtn').addEventListener('click', handleNewAnalysis);
});

function showError(message) {
  const errorDiv = document.getElementById('errorMessage');
  errorDiv.textContent = message;
  errorDiv.style.display = 'block';

  setTimeout(() => {
    errorDiv.style.display = 'none';
  }, 5000);
}

function showProgress(message) {
  const progressDiv = document.getElementById('progressMessage');
  const progressText = progressDiv.querySelector('.progress-text');
  progressText.textContent = message;
  progressDiv.style.display = 'block';
}

function hideProgress() {
  document.getElementById('progressMessage').style.display = 'none';
}

function setLoading(isLoading) {
  const btn = document.getElementById('analyzeBtn');
  const btnText = btn.querySelector('.btn-text');
  const btnLoader = btn.querySelector('.btn-loader');

  btn.disabled = isLoading;
  btnText.style.display = isLoading ? 'none' : 'inline';
  btnLoader.style.display = isLoading ? 'inline' : 'none';
}

async function handleAnalyze() {
  const organization = document.getElementById('organization').value.trim();
  const repository = document.getElementById('repository').value.trim();
  const startDate = new Date(document.getElementById('startDate').value);
  const endDate = new Date(document.getElementById('endDate').value);

  // Validation
  if (!organization || !repository) {
    showError('Please enter both organization and repository name');
    return;
  }

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    showError('Please select valid start and end dates');
    return;
  }

  if (startDate > endDate) {
    showError('Start date must be before end date');
    return;
  }

  // Validate that date range doesn't exceed 90 days
  const daysDiff = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
  if (daysDiff > 90) {
    showError('Date range cannot exceed 90 days. Please select a shorter time period.');
    return;
  }

  // Validate end date is not in the future
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Reset to start of day for fair comparison
  if (endDate > today) {
    showError('End date cannot be in the future');
    return;
  }

  // Save values to storage
  chrome.storage.local.set({ organization, repository });

  // Hide previous results and errors
  document.getElementById('results').style.display = 'none';
  document.getElementById('errorMessage').style.display = 'none';

  setLoading(true);
  showProgress('⏳ Starting analysis...');

  try {
    // Run analysis directly in the side panel with hardcoded token
    const api = new GitHubAPI(organization, repository, startDate, endDate);

    const data = await api.analyzePRs((progress) => {
      console.log('Progress:', progress);
      if (progress.status) {
        showProgress(`⏳ ${progress.status}`);
      }
    });

    currentData = data;
    hideProgress();
    displayResults(data);
  } catch (error) {
    console.error('Error analyzing PRs:', error);
    hideProgress();
    showError(error.message || 'Failed to analyze PRs. Please check your inputs and try again.');
  } finally {
    setLoading(false);
  }
}

function displayResults(data) {
  // Store data for filtering
  currentData = data;
  selectedPriorities = new Set(['all']);

  // Show results section
  document.getElementById('results').style.display = 'block';

  // Display summary stats
  document.getElementById('totalPRs').textContent = data.summary.totalPRsWithActionableIssues;
  document.getElementById('totalComments').textContent = data.summary.totalActionableIssues;
  document.getElementById('avgComments').textContent = data.summary.avgIssuesPerPR;

  // Calculate distributions
  const severityDist = calculateDistribution(data, 'severity');
  const priorityDist = calculateDistribution(data, 'priority');
  const titles = extractTitles(data);

  // Display severity distribution
  displayDistribution('severityDistribution', severityDist);

  // Display priority distribution
  displayDistribution('priorityDistribution', priorityDist);

  // Initialize priority filter
  initializePriorityFilter(data);

  // Display titles
  displayTitles('commentTitles', titles);

  // Scroll to results
  document.getElementById('results').scrollIntoView({ behavior: 'smooth' });
}

function calculateDistribution(data, field) {
  const distribution = {};
  let total = 0;

  data.pullRequests.forEach(pr => {
    pr.actionableIssues.forEach(issue => {
      const value = issue[field];
      if (value) {
        distribution[value] = (distribution[value] || 0) + 1;
        total++;
      }
    });
  });

  // Convert to array with percentages
  return Object.entries(distribution)
    .map(([key, count]) => ({
      label: key,
      count,
      percentage: total > 0 ? ((count / total) * 100).toFixed(1) : 0
    }))
    .sort((a, b) => b.count - a.count);
}

function extractTitles(data) {
  const titleGroups = {};

  data.pullRequests.forEach(pr => {
    pr.actionableIssues.forEach(issue => {
      const title = issue.title || '(No title)';
      if (!titleGroups[title]) {
        titleGroups[title] = [];
      }
      titleGroups[title].push({
        url: issue.url,
        prNumber: pr.number,
        prTitle: pr.title,
        priority: issue.priority
      });
    });
  });

  // Convert to array and sort by count
  const titles = Object.entries(titleGroups)
    .map(([title, occurrences]) => ({
      title,
      count: occurrences.length,
      occurrences
    }))
    .sort((a, b) => b.count - a.count);

  // Group similar titles
  return groupSimilarTitles(titles);
}

function calculateSimilarity(title1, title2) {
  // Normalize titles for comparison
  const normalize = (str) => str.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const words1 = new Set(normalize(title1).split(' '));
  const words2 = new Set(normalize(title2).split(' '));

  // Calculate Jaccard similarity (intersection / union)
  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
}

function groupSimilarTitles(titles) {
  const groups = [];
  const used = new Set();
  const SIMILARITY_THRESHOLD = 0.6; // 60% similarity

  titles.forEach((title, i) => {
    if (used.has(i)) return;

    const group = {
      mainTitle: title.title,
      totalCount: title.count,
      items: [title],
      allOccurrences: [...title.occurrences]
    };

    // Find similar titles
    for (let j = i + 1; j < titles.length; j++) {
      if (used.has(j)) continue;

      const similarity = calculateSimilarity(title.title, titles[j].title);
      if (similarity >= SIMILARITY_THRESHOLD) {
        group.items.push(titles[j]);
        group.totalCount += titles[j].count;
        group.allOccurrences.push(...titles[j].occurrences);
        used.add(j);
      }
    }

    used.add(i);
    groups.push(group);
  });

  // Sort groups by total count
  return groups.sort((a, b) => b.totalCount - a.totalCount);
}

function initializePriorityFilter(data) {
  // Extract unique priorities and their counts
  const priorityCounts = {};
  let totalTitles = 0;

  data.pullRequests.forEach(pr => {
    pr.actionableIssues.forEach(issue => {
      const priority = issue.priority || 'Unknown';
      priorityCounts[priority] = (priorityCounts[priority] || 0) + 1;
      totalTitles++;
    });
  });

  // Show the filter section
  const filterSection = document.getElementById('priorityFilterSection');
  filterSection.style.display = 'block';

  // Update "All" button count
  document.getElementById('priorityCountAll').textContent = totalTitles;

  // Get the controls container
  const controlsContainer = document.getElementById('priorityFilterControls');

  // Clear any existing dynamic buttons (keep the "All" button)
  const allButton = controlsContainer.querySelector('[data-priority="all"]');
  controlsContainer.innerHTML = '';
  controlsContainer.appendChild(allButton);

  // Create buttons for each priority
  Object.entries(priorityCounts)
    .sort((a, b) => b[1] - a[1]) // Sort by count descending
    .forEach(([priority, count]) => {
      const button = document.createElement('button');
      button.className = 'priority-filter-btn';
      button.setAttribute('data-priority', priority);
      button.innerHTML = `${priority} (<span class="priority-count">${count}</span>)`;
      controlsContainer.appendChild(button);
    });

  // Add click handlers to all filter buttons
  controlsContainer.querySelectorAll('.priority-filter-btn').forEach(button => {
    button.addEventListener('click', () => {
      const priority = button.getAttribute('data-priority');

      if (priority === 'all') {
        // Select all, deselect others
        selectedPriorities.clear();
        selectedPriorities.add('all');
        controlsContainer.querySelectorAll('.priority-filter-btn').forEach(btn => {
          btn.classList.remove('active');
        });
        button.classList.add('active');
      } else {
        // Toggle specific priority
        if (selectedPriorities.has('all')) {
          selectedPriorities.clear();
        }

        if (selectedPriorities.has(priority)) {
          selectedPriorities.delete(priority);
        } else {
          selectedPriorities.add(priority);
        }

        // If no priorities selected, select all
        if (selectedPriorities.size === 0) {
          selectedPriorities.add('all');
          allButton.classList.add('active');
        } else {
          allButton.classList.remove('active');
        }

        // Update button state
        button.classList.toggle('active', selectedPriorities.has(priority));
      }

      // Apply the filter
      applyPriorityFilter();
    });
  });
}

function applyPriorityFilter() {
  if (!currentData) return;

  // Extract and group titles
  const titles = extractTitles(currentData);

  // Filter by priority if not showing all
  let filteredTitles = titles;
  if (!selectedPriorities.has('all')) {
    filteredTitles = titles.filter(group => {
      // Check if any occurrence in the group matches selected priorities
      return group.allOccurrences.some(occurrence =>
        selectedPriorities.has(occurrence.priority)
      );
    });
  }

  // Display filtered titles
  displayTitles('commentTitles', filteredTitles);
}

function displayDistribution(elementId, distribution) {
  const container = document.getElementById(elementId);
  container.innerHTML = '';

  if (distribution.length === 0) {
    container.innerHTML = '<div class="empty-state">No data available</div>';
    return;
  }

  distribution.forEach(item => {
    const div = document.createElement('div');
    div.className = 'distribution-item';
    div.innerHTML = `
      <div class="distribution-item-label">${item.label}</div>
      <div class="distribution-item-value">
        ${item.count}
        <span class="distribution-item-percent">(${item.percentage}%)</span>
      </div>
    `;
    container.appendChild(div);
  });
}

function displayTitles(elementId, groups) {
  const container = document.getElementById(elementId);
  container.innerHTML = '';

  if (groups.length === 0) {
    const message = selectedPriorities.has('all')
      ? 'No titles found'
      : 'No titles match the selected priority filters';
    container.innerHTML = `<div class="empty-state">${message}</div>`;
    return;
  }

  groups.forEach((group, index) => {
    const groupDiv = document.createElement('div');
    groupDiv.className = 'title-group';

    // Group header
    const header = document.createElement('div');
    header.className = 'title-group-header';

    const isGrouped = group.items.length > 1;
    const expandIcon = isGrouped ? '<span class="expand-icon">▶</span>' : '';

    header.innerHTML = `
      ${expandIcon}
      <span class="title-item-count">${group.totalCount}</span>
      <span class="title-item-text">${escapeHtml(group.mainTitle)}</span>
      ${isGrouped ? `<span class="group-count">(${group.items.length} similar)</span>` : ''}
    `;

    // If grouped, make header clickable for expand/collapse
    if (isGrouped) {
      const textSpan = header.querySelector('.title-item-text');
      const expandIconSpan = header.querySelector('.expand-icon');

      if (textSpan && expandIconSpan) {
        textSpan.style.cursor = 'pointer';
        expandIconSpan.style.cursor = 'pointer';
      }

      const itemsContainer = document.createElement('div');
      itemsContainer.className = 'title-group-items';
      itemsContainer.style.display = 'none';

      // Add all items in the group with their occurrences
      group.items.forEach(item => {
        const itemTitleDiv = document.createElement('div');
        itemTitleDiv.className = 'title-group-item-header';
        itemTitleDiv.innerHTML = `
          <span class="title-item-count">${item.count}</span>
          <span class="title-item-text">${escapeHtml(item.title)}</span>
        `;
        itemsContainer.appendChild(itemTitleDiv);

        // Add links to each occurrence
        item.occurrences.forEach(occurrence => {
          const linkDiv = document.createElement('div');
          linkDiv.className = 'title-occurrence';
          linkDiv.innerHTML = `
            <a href="${occurrence.url}" target="_blank" class="comment-link" title="View comment on GitHub">
              🔗 PR #${occurrence.prNumber}
            </a>
          `;
          itemsContainer.appendChild(linkDiv);
        });
      });

      // Toggle expand/collapse only when clicking text or icon
      const toggleExpand = () => {
        const isExpanded = itemsContainer.style.display === 'block';
        itemsContainer.style.display = isExpanded ? 'none' : 'block';
        const icon = header.querySelector('.expand-icon');
        if (icon) {
          icon.textContent = isExpanded ? '▶' : '▼';
        }
      };

      const textSpanEl = header.querySelector('.title-item-text');
      const expandIconEl = header.querySelector('.expand-icon');

      if (textSpanEl) textSpanEl.addEventListener('click', toggleExpand);
      if (expandIconEl) expandIconEl.addEventListener('click', toggleExpand);

      groupDiv.appendChild(header);
      groupDiv.appendChild(itemsContainer);
    } else {
      // Single item - show occurrences directly
      groupDiv.appendChild(header);

      const occurrencesContainer = document.createElement('div');
      occurrencesContainer.className = 'title-occurrences-list';

      group.allOccurrences.forEach(occurrence => {
        const linkDiv = document.createElement('div');
        linkDiv.className = 'title-occurrence';
        linkDiv.innerHTML = `
          <a href="${occurrence.url}" target="_blank" class="comment-link" title="View comment on GitHub">
            🔗 PR #${occurrence.prNumber}
          </a>
        `;
        occurrencesContainer.appendChild(linkDiv);
      });

      groupDiv.appendChild(occurrencesContainer);
    }

    container.appendChild(groupDiv);
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function handleExport() {
  if (!currentData) return;

  const dataStr = JSON.stringify(currentData, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const filename = `${currentData.repository.replace('/', '_')}_coderabbit_analysis_${Date.now()}.json`;

  chrome.downloads.download({
    url: url,
    filename: filename,
    saveAs: true
  });
}

function handleNewAnalysis() {
  // Clear current results
  currentData = null;
  document.getElementById('results').style.display = 'none';
  document.getElementById('errorMessage').style.display = 'none';
  hideProgress();

  // Scroll to top to show input form
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
