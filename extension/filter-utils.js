// Shared utility functions for filtering and displaying PR analysis data

/**
 * Extracts and groups titles from PR data
 * @param {Object} data - The PR analysis data
 * @returns {Array} Array of grouped titles
 */
export function extractTitles(data) {
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
        priority: issue.priority,
        accepted: issue.accepted || false,
        acceptanceMethod: issue.acceptanceMethod || null
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

/**
 * Calculates similarity between two titles using Jaccard similarity
 * @param {string} title1 - First title
 * @param {string} title2 - Second title
 * @returns {number} Similarity score between 0 and 1
 */
export function calculateSimilarity(title1, title2) {
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

/**
 * Groups similar titles together based on similarity threshold
 * @param {Array} titles - Array of title objects
 * @returns {Array} Array of grouped titles
 */
export function groupSimilarTitles(titles) {
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

/**
 * Initializes combined priority and acceptance filter UI and event handlers
 * @param {Object} data - The PR analysis data
 * @param {Set} selectedPriorities - Set of currently selected priorities
 * @param {string} selectedAcceptanceStatus - Currently selected acceptance status
 * @param {Function} onPriorityChange - Callback when priority filter changes
 * @param {Function} onAcceptanceChange - Callback when acceptance filter changes
 */
export function initializePriorityFilter(data, selectedPriorities, selectedAcceptanceStatus, onPriorityChange, onAcceptanceChange) {
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

  // Save the "All" button and acceptance buttons before clearing
  const allButton = controlsContainer.querySelector('[data-priority="all"]');
  const acceptedButton = controlsContainer.querySelector('[data-acceptance="accepted"]');
  const notAcceptedButton = controlsContainer.querySelector('[data-acceptance="not-accepted"]');

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

  // Re-add acceptance buttons at the end
  if (acceptedButton) controlsContainer.appendChild(acceptedButton);
  if (notAcceptedButton) controlsContainer.appendChild(notAcceptedButton);

  // Add click handlers to priority filter buttons
  controlsContainer.querySelectorAll('[data-priority]').forEach(button => {
    button.addEventListener('click', () => {
      const priority = button.getAttribute('data-priority');

      if (priority === 'all') {
        // Select all, deselect all filters (priority and acceptance)
        selectedPriorities.clear();
        selectedPriorities.add('all');
        controlsContainer.querySelectorAll('[data-priority]').forEach(btn => {
          btn.classList.remove('active');
        });
        controlsContainer.querySelectorAll('[data-acceptance]').forEach(btn => {
          btn.classList.remove('active');
        });
        button.classList.add('active');

        // Reset acceptance filter to 'all'
        if (onAcceptanceChange) onAcceptanceChange('all');
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
          // Also reset acceptance filter
          controlsContainer.querySelectorAll('[data-acceptance]').forEach(btn => {
            btn.classList.remove('active');
          });
          if (onAcceptanceChange) onAcceptanceChange('all');
        } else {
          allButton.classList.remove('active');
        }

        // Update button state
        button.classList.toggle('active', selectedPriorities.has(priority));
      }

      // Call the filter change callback
      if (onPriorityChange) onPriorityChange();
    });
  });

  // Add click handlers to acceptance filter buttons
  controlsContainer.querySelectorAll('[data-acceptance]').forEach(button => {
    button.addEventListener('click', () => {
      const status = button.getAttribute('data-acceptance');
      const isCurrentlyActive = button.classList.contains('active');

      if (isCurrentlyActive) {
        // Clicking the same button again deselects it and shows all
        button.classList.remove('active');
        // Activate the "All" button
        if (allButton) {
          selectedPriorities.clear();
          selectedPriorities.add('all');
          controlsContainer.querySelectorAll('[data-priority]').forEach(btn => {
            btn.classList.remove('active');
          });
          allButton.classList.add('active');
        }
        // Reset to show all
        if (onAcceptanceChange) onAcceptanceChange('all');
        if (onPriorityChange) onPriorityChange();
      } else {
        // Update active state - only one acceptance filter can be active
        controlsContainer.querySelectorAll('[data-acceptance]').forEach(btn => {
          btn.classList.remove('active');
        });
        button.classList.add('active');

        // Call the acceptance change callback
        if (onAcceptanceChange) onAcceptanceChange(status);
      }
    });
  });
}

/**
 * Displays distribution data in a grid
 * @param {string} elementId - ID of the container element
 * @param {Array} distribution - Distribution data array
 */
export function displayDistribution(elementId, distribution) {
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

/**
 * Displays grouped titles with expand/collapse functionality
 * @param {string} elementId - ID of the container element
 * @param {Array} groups - Array of title groups
 * @param {Set} selectedPriorities - Set of selected priorities (for empty state message)
 * @param {string} selectedAcceptanceStatus - Currently selected acceptance status (for empty state message)
 */
export function displayTitles(elementId, groups, selectedPriorities, selectedAcceptanceStatus = 'all') {
  const container = document.getElementById(elementId);
  container.innerHTML = '';

  if (groups.length === 0) {
    const message = selectedPriorities.has('all') && selectedAcceptanceStatus === 'all'
      ? 'No titles found'
      : 'No titles match the selected filters';
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

          const link = document.createElement('a');
          link.href = occurrence.url;
          link.target = '_blank';
          link.className = 'comment-link';
          link.title = 'View comment on GitHub';

          let linkText = `🔗 PR #${occurrence.prNumber}`;
          if (occurrence.accepted) {
            linkText += ' ✅';
            if (occurrence.acceptanceMethod === 'body-parsing') {
              linkText += ' (auto detect)';
            }
          }
          link.textContent = linkText;

          linkDiv.appendChild(link);
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

        const link = document.createElement('a');
        link.href = occurrence.url;
        link.target = '_blank';
        link.className = 'comment-link';
        link.title = 'View comment on GitHub';

        let linkText = `🔗 PR #${occurrence.prNumber}`;
        if (occurrence.accepted) {
          linkText += ' ✅';
          if (occurrence.acceptanceMethod === 'body-parsing') {
            linkText += ' (auto detect)';
          }
        }
        link.textContent = linkText;

        linkDiv.appendChild(link);
        occurrencesContainer.appendChild(linkDiv);
      });

      groupDiv.appendChild(occurrencesContainer);
    }

    container.appendChild(groupDiv);
  });
}

/**
 * Escapes HTML special characters to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} Escaped HTML text
 */
export function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Loads manual acceptance state from storage
 * @returns {Promise<Object>} Map of URL to acceptance state
 */
export async function loadManualAcceptanceState() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['manualAcceptanceState'], (result) => {
      resolve(result.manualAcceptanceState || {});
    });
  });
}

/**
 * Applies manual acceptance state to PR data
 * @param {Object} data - The PR analysis data
 */
export async function applyManualAcceptanceState(data) {
  const manualState = await loadManualAcceptanceState();

  data.pullRequests.forEach(pr => {
    pr.actionableIssues.forEach(issue => {
      if (manualState[issue.url] !== undefined) {
        issue.accepted = manualState[issue.url];
        issue.acceptanceMethod = 'manual';
      }
    });
  });
}

/**
 * Updates filter counts dynamically based on current filters
 * @param {Object} currentData - The PR analysis data
 * @param {Set} selectedPriorities - Currently selected priorities
 * @param {string} selectedAcceptanceStatus - Currently selected acceptance status
 */
export function updateFilterCounts(currentData, selectedPriorities, selectedAcceptanceStatus) {
  const titles = extractTitles(currentData);

  // Count for priority filter (based on acceptance filter)
  const priorityCounts = { all: 0 };
  const allPriorities = new Set();

  titles.forEach(group => {
    group.allOccurrences.forEach(occurrence => {
      allPriorities.add(occurrence.priority);

      // Apply acceptance filter
      let matchesAcceptance = true;
      if (selectedAcceptanceStatus === 'accepted') {
        matchesAcceptance = occurrence.accepted;
      } else if (selectedAcceptanceStatus === 'not-accepted') {
        matchesAcceptance = !occurrence.accepted;
      }

      if (matchesAcceptance) {
        priorityCounts.all++;
        priorityCounts[occurrence.priority] = (priorityCounts[occurrence.priority] || 0) + 1;
      }
    });
  });

  // Update priority count displays
  const allCountEl = document.getElementById('priorityCountAll');
  if (allCountEl) allCountEl.textContent = priorityCounts.all;

  allPriorities.forEach(priority => {
    const countEl = document.getElementById(`priorityCount${priority.replace(/\s+/g, '')}`);
    if (countEl) countEl.textContent = priorityCounts[priority] || 0;
  });

  // Count for acceptance filter (based on priority filter)
  const acceptanceCounts = { all: 0, accepted: 0, notAccepted: 0 };

  titles.forEach(group => {
    group.allOccurrences.forEach(occurrence => {
      // Apply priority filter
      const matchesPriority = selectedPriorities.has('all') || selectedPriorities.has(occurrence.priority);

      if (matchesPriority) {
        acceptanceCounts.all++;
        if (occurrence.accepted) {
          acceptanceCounts.accepted++;
        } else {
          acceptanceCounts.notAccepted++;
        }
      }
    });
  });

  // Update acceptance count displays
  const acceptanceAllEl = document.getElementById('acceptanceCountAll');
  const acceptanceAcceptedEl = document.getElementById('acceptanceCountAccepted');
  const acceptanceNotAcceptedEl = document.getElementById('acceptanceCountNotAccepted');

  if (acceptanceAllEl) acceptanceAllEl.textContent = acceptanceCounts.all;
  if (acceptanceAcceptedEl) acceptanceAcceptedEl.textContent = acceptanceCounts.accepted;
  if (acceptanceNotAcceptedEl) acceptanceNotAcceptedEl.textContent = acceptanceCounts.notAccepted;
}

/**
 * Applies combined priority and acceptance filters
 * @param {Object} currentData - The PR analysis data
 * @param {Set} selectedPriorities - Currently selected priorities
 * @param {string} selectedAcceptanceStatus - Currently selected acceptance status
 * @param {Function} displayCallback - Callback to display filtered results
 */
export function applyCombinedFilters(currentData, selectedPriorities, selectedAcceptanceStatus, displayCallback) {
  // Update counts first
  updateFilterCounts(currentData, selectedPriorities, selectedAcceptanceStatus);

  const titles = extractTitles(currentData);

  // Filter titles based on both priority AND acceptance
  const filteredTitles = titles.map(group => {
    const filteredOccurrences = group.allOccurrences.filter(occurrence => {
      // Check priority filter
      const matchesPriority = selectedPriorities.has('all') || selectedPriorities.has(occurrence.priority);

      // Check acceptance filter
      let matchesAcceptance = true;
      if (selectedAcceptanceStatus === 'accepted') {
        matchesAcceptance = occurrence.accepted;
      } else if (selectedAcceptanceStatus === 'not-accepted') {
        matchesAcceptance = !occurrence.accepted;
      }

      // Must match BOTH filters (AND logic)
      return matchesPriority && matchesAcceptance;
    });

    if (filteredOccurrences.length === 0) return null;

    return {
      ...group,
      allOccurrences: filteredOccurrences,
      totalCount: filteredOccurrences.length
    };
  }).filter(group => group !== null);

  // Call display callback
  if (displayCallback) {
    displayCallback('commentTitles', filteredTitles, selectedPriorities, selectedAcceptanceStatus);
  }
}
