// Side panel script for CodeRabbit PR Analyzer

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
        showProgress(`⏳ ${progress.status}`, progress);
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

  // Scroll to top to show input form
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
