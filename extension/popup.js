// Popup script for CodeRabbit PR Analyzer

import {
  extractTitles,
  calculateSimilarity,
  groupSimilarTitles,
  initializePriorityFilter,
  applyPriorityFilter,
  displayDistribution,
  displayTitles,
  escapeHtml
} from './filter-utils.js';

let currentData = null;
let progressCheckInterval = null;
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
    // Update the GitHub search link after loading saved values
    updateGitHubSearchLink();
  });

  // Check for existing analysis on load
  checkExistingAnalysis();

  // Set up event listeners
  document.getElementById('analyzeBtn').addEventListener('click', handleAnalyze);
  document.getElementById('exportBtn').addEventListener('click', handleExport);
  document.getElementById('newAnalysisBtn').addEventListener('click', handleNewAnalysis);

  // Set up GitHub search link updater
  const orgInput = document.getElementById('organization');
  const repoInput = document.getElementById('repository');
  orgInput.addEventListener('input', updateGitHubSearchLink);
  repoInput.addEventListener('input', updateGitHubSearchLink);
  startDateInput.addEventListener('change', updateGitHubSearchLink);
  endDateInput.addEventListener('change', updateGitHubSearchLink);

  // Initialize the GitHub search link
  updateGitHubSearchLink();
});

// Update the GitHub search link based on input values
function updateGitHubSearchLink() {
  const organization = document.getElementById('organization').value.trim();
  const repository = document.getElementById('repository').value.trim();
  const startDate = document.getElementById('startDate').value;
  const endDate = document.getElementById('endDate').value;
  const linkElement = document.getElementById('githubSearchLink');

  // Check if all required fields are filled
  if (organization && repository && startDate && endDate) {
    // Build the GitHub search URL to match the extension's search criteria
    // Format: https://github.com/search?q=repo:org/repo+is:pr+is:closed+created:YYYY-MM-DD..YYYY-MM-DD&type=pullrequests
    // Note: GitHub search will show ALL closed PRs, but the extension only analyzes those with CodeRabbit comments
    const searchQuery = `repo:${organization}/${repository} is:pr is:closed created:${startDate}..${endDate}`;
    const encodedQuery = encodeURIComponent(searchQuery);
    const githubUrl = `https://github.com/search?q=${encodedQuery}&type=pullrequests`;

    linkElement.href = githubUrl;
    linkElement.style.pointerEvents = 'auto';
    linkElement.style.opacity = '1';
  } else {
    // Disable the link if fields are missing
    linkElement.href = '#';
    linkElement.style.pointerEvents = 'none';
    linkElement.style.opacity = '0.5';
  }
}

// Check if there's an analysis in progress or completed
function checkExistingAnalysis() {
  chrome.runtime.sendMessage({ action: 'getAnalysisStatus' }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('Error checking analysis status:', chrome.runtime.lastError);
      return;
    }

    if (!response) {
      console.warn('No response from background worker');
      return;
    }

    if (response.status === 'running') {
      setLoading(true);
      showProgress('⏳ Analysis in progress...');
      startProgressPolling();
    } else if (response.status === 'completed' && response.results) {
      currentData = response.results;
      displayResults(response.results);
    } else if (response.status === 'error') {
      chrome.storage.local.get(['analysisError'], (result) => {
        if (result.analysisError) {
          showError(result.analysisError);
        }
      });
    }
  });
}

// Poll for progress updates
function startProgressPolling() {
  if (progressCheckInterval) {
    clearInterval(progressCheckInterval);
  }

  progressCheckInterval = setInterval(() => {
    chrome.storage.local.get(['analysisStatus', 'analysisProgress', 'analysisResults', 'analysisError'], (result) => {
      if (result.analysisProgress) {
        showProgress(result.analysisProgress);
      }

      if (result.analysisStatus === 'completed' && result.analysisResults) {
        clearInterval(progressCheckInterval);
        progressCheckInterval = null;
        setLoading(false);
        hideProgress();
        currentData = result.analysisResults;
        displayResults(result.analysisResults);
      } else if (result.analysisStatus === 'error') {
        clearInterval(progressCheckInterval);
        progressCheckInterval = null;
        setLoading(false);
        hideProgress();
        showError(result.analysisError || 'Analysis failed');
      }
    });
  }, 500); // Check every 500ms
}

function showError(message) {
  const errorDiv = document.getElementById('errorMessage');
  errorDiv.textContent = message;
  errorDiv.style.display = 'block';

  setTimeout(() => {
    errorDiv.style.display = 'none';
  }, 5000);
}

function showProgress(message, progressData = null) {
  const progressDiv = document.getElementById('progressMessage');
  const progressText = progressDiv.querySelector('.progress-text');
  const progressBarFill = document.getElementById('progressBarFill');
  const progressPercentage = document.getElementById('progressPercentage');

  progressText.textContent = message;
  progressDiv.style.display = 'block';

  // Update progress bar if progress data is provided
  if (progressData && progressData.current !== undefined && progressData.total !== undefined) {
    const percentage = progressData.total > 0
      ? Math.round((progressData.current / progressData.total) * 100)
      : 0;

    progressBarFill.style.width = `${percentage}%`;
    progressPercentage.textContent = `${percentage}%`;
  } else {
    // Reset progress bar if no data
    progressBarFill.style.width = '0%';
    progressPercentage.textContent = '0%';
  }
}

function hideProgress() {
  const progressDiv = document.getElementById('progressMessage');
  const progressBarFill = document.getElementById('progressBarFill');
  const progressPercentage = document.getElementById('progressPercentage');

  progressDiv.style.display = 'none';
  progressBarFill.style.width = '0%';
  progressPercentage.textContent = '0%';
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
  const startDate = document.getElementById('startDate').value;
  const endDate = document.getElementById('endDate').value;

  // Validation
  if (!organization || !repository) {
    showError('Please enter both organization and repository name');
    return;
  }

  const startDateObj = new Date(startDate);
  const endDateObj = new Date(endDate);

  if (isNaN(startDateObj.getTime()) || isNaN(endDateObj.getTime())) {
    showError('Please select valid start and end dates');
    return;
  }

  if (startDateObj > endDateObj) {
    showError('Start date must be before end date');
    return;
  }

  // Validate that date range doesn't exceed 90 days
  const daysDiff = Math.ceil((endDateObj - startDateObj) / (1000 * 60 * 60 * 24));
  if (daysDiff > 90) {
    showError('Date range cannot exceed 90 days. Please select a shorter time period.');
    return;
  }

  // Validate end date is not in the future
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Reset to start of day for fair comparison
  if (endDateObj > today) {
    showError('End date cannot be in the future');
    return;
  }

  // Save values to storage
  chrome.storage.local.set({ organization, repository });

  // Hide previous results and errors
  document.getElementById('results').style.display = 'none';
  document.getElementById('errorMessage').style.display = 'none';

  setLoading(true);
  showProgress('⏳ Starting analysis in background...');

  // Send analysis request to background worker
  chrome.runtime.sendMessage({
    action: 'startAnalysis',
    params: {
      organization,
      repository,
      startDate,
      endDate
    }
  }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('Error starting analysis:', chrome.runtime.lastError);
      setLoading(false);
      hideProgress();
      showError('Failed to start analysis. Please try reloading the extension.');
      return;
    }

    if (!response) {
      console.warn('No response from background worker');
      setLoading(false);
      hideProgress();
      showError('Background worker not responding. Please reload the extension.');
      return;
    }

    if (response.started) {
      showProgress('⏳ Analysis running in background. You can close this popup and come back later!');
      startProgressPolling();
    }
  });
}

function displayResults(data) {
  // Store data for filtering
  currentData = data;
  selectedPriorities = new Set(['all']);

  // Show results section
  document.getElementById('results').style.display = 'block';

  // Display summary stats
  document.getElementById('totalPRs').textContent = data.summary.totalPRs;
  document.getElementById('totalPRsReviewed').textContent = data.summary.totalPRsWithActionableIssues;
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

  // Initialize priority filter with callback
  initializePriorityFilter(data, selectedPriorities, () => {
    applyPriorityFilter(currentData, selectedPriorities, displayTitles);
  });

  // Display titles with selectedPriorities
  displayTitles('commentTitles', titles, selectedPriorities);

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

  // Clear stored analysis
  chrome.runtime.sendMessage({ action: 'clearAnalysis' }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('Error clearing analysis:', chrome.runtime.lastError);
    }
    // Scroll to top to show input form
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}
