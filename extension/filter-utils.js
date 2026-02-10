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
 * Initializes priority filter UI and event handlers
 * @param {Object} data - The PR analysis data
 * @param {Set} selectedPriorities - Set of currently selected priorities
 * @param {Function} onFilterChange - Callback when filter changes
 */
export function initializePriorityFilter(data, selectedPriorities, onFilterChange) {
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

      // Call the filter change callback
      onFilterChange();
    });
  });
}

/**
 * Applies priority filter and displays filtered titles
 * @param {Object} currentData - The current PR data
 * @param {Set} selectedPriorities - Set of selected priorities
 * @param {Function} displayTitlesCallback - Function to display titles
 */
export function applyPriorityFilter(currentData, selectedPriorities, displayTitlesCallback) {
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
  displayTitlesCallback('commentTitles', filteredTitles, selectedPriorities);
}

/**
 * Initializes acceptance filter UI and event handlers
 * @param {Object} data - The PR analysis data
 * @param {string} currentStatus - Currently selected acceptance status ('all', 'accepted', or 'not-accepted')
 * @param {Function} onFilterChange - Callback when filter changes, receives new status as parameter
 */
export function initializeAcceptanceFilter(data, currentStatus, onFilterChange) {
  // Count accepted and not accepted issues
  let acceptedCount = 0;
  let notAcceptedCount = 0;

  data.pullRequests.forEach(pr => {
    pr.actionableIssues.forEach(issue => {
      if (issue.accepted) {
        acceptedCount++;
      } else {
        notAcceptedCount++;
      }
    });
  });

  const totalCount = acceptedCount + notAcceptedCount;

  // Show the filter section
  const filterSection = document.getElementById('acceptanceFilterSection');
  if (filterSection) {
    filterSection.style.display = 'block';

    // Update counts
    const allCountEl = document.getElementById('acceptanceCountAll');
    const acceptedCountEl = document.getElementById('acceptanceCountAccepted');
    const notAcceptedCountEl = document.getElementById('acceptanceCountNotAccepted');

    if (allCountEl) allCountEl.textContent = totalCount;
    if (acceptedCountEl) acceptedCountEl.textContent = acceptedCount;
    if (notAcceptedCountEl) notAcceptedCountEl.textContent = notAcceptedCount;

    // Add click handlers to filter buttons
    const controlsContainer = document.getElementById('acceptanceFilterControls');
    if (controlsContainer) {
      controlsContainer.querySelectorAll('.acceptance-filter-btn').forEach(button => {
        button.addEventListener('click', () => {
          const newStatus = button.getAttribute('data-acceptance');

          // Update button states
          controlsContainer.querySelectorAll('.acceptance-filter-btn').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-acceptance') === newStatus);
          });

          // Call the filter change callback with new status
          onFilterChange(newStatus);
        });
      });
    }
  }
}

/**
 * Updates filter counts based on current filter state
 * @param {Object} currentData - The current PR data
 * @param {Set} selectedPriorities - Set of selected priorities
 * @param {string} selectedAcceptanceStatus - Selected acceptance status
 */
export function updateFilterCounts(currentData, selectedPriorities, selectedAcceptanceStatus) {
  if (!currentData) return;

  // Count items for each priority (filtered by acceptance)
  const priorityCounts = {};
  let totalWithAcceptance = 0;

  currentData.pullRequests.forEach(pr => {
    pr.actionableIssues.forEach(issue => {
      // Check if this issue matches the acceptance filter
      let matchesAcceptance = true;
      if (selectedAcceptanceStatus === 'accepted') {
        matchesAcceptance = issue.accepted;
      } else if (selectedAcceptanceStatus === 'not-accepted') {
        matchesAcceptance = !issue.accepted;
      }

      if (matchesAcceptance) {
        const priority = issue.priority || 'Unknown';
        priorityCounts[priority] = (priorityCounts[priority] || 0) + 1;
        totalWithAcceptance++;
      }
    });
  });

  // Update priority filter counts
  const priorityAllCount = document.getElementById('priorityCountAll');
  if (priorityAllCount) {
    priorityAllCount.textContent = totalWithAcceptance;
  }

  Object.entries(priorityCounts).forEach(([priority, count]) => {
    const button = document.querySelector(`[data-priority="${priority}"] .priority-count`);
    if (button) {
      button.textContent = count;
    }
  });

  // Count items for acceptance status (filtered by priority)
  let acceptedCount = 0;
  let notAcceptedCount = 0;
  let totalWithPriority = 0;

  currentData.pullRequests.forEach(pr => {
    pr.actionableIssues.forEach(issue => {
      // Check if this issue matches the priority filter
      const matchesPriority = selectedPriorities.has('all') || selectedPriorities.has(issue.priority);

      if (matchesPriority) {
        totalWithPriority++;
        if (issue.accepted) {
          acceptedCount++;
        } else {
          notAcceptedCount++;
        }
      }
    });
  });

  // Update acceptance filter counts
  const acceptanceAllCount = document.getElementById('acceptanceCountAll');
  const acceptanceAcceptedCount = document.getElementById('acceptanceCountAccepted');
  const acceptanceNotAcceptedCount = document.getElementById('acceptanceCountNotAccepted');

  if (acceptanceAllCount) acceptanceAllCount.textContent = totalWithPriority;
  if (acceptanceAcceptedCount) acceptanceAcceptedCount.textContent = acceptedCount;
  if (acceptanceNotAcceptedCount) acceptanceNotAcceptedCount.textContent = notAcceptedCount;
}

/**
 * Applies both priority and acceptance filters and displays filtered titles
 * @param {Object} currentData - The current PR data
 * @param {Set} selectedPriorities - Set of selected priorities
 * @param {string} selectedAcceptanceStatus - Selected acceptance status ('all', 'accepted', or 'not-accepted')
 * @param {Function} displayTitlesCallback - Function to display titles
 */
export function applyCombinedFilters(currentData, selectedPriorities, selectedAcceptanceStatus, displayTitlesCallback) {
  if (!currentData) return;

  // Update filter counts based on current state
  updateFilterCounts(currentData, selectedPriorities, selectedAcceptanceStatus);

  // Extract and group titles
  const titles = extractTitles(currentData);

  // Apply both filters together with AND logic
  let filteredTitles = titles.map(group => {
    // Filter occurrences by both priority AND acceptance status
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

      // Both filters must match (AND logic)
      return matchesPriority && matchesAcceptance;
    });

    // Return new group object with filtered occurrences
    return {
      ...group,
      allOccurrences: filteredOccurrences,
      totalCount: filteredOccurrences.length
    };
  }).filter(group => group.allOccurrences.length > 0); // Remove groups with no matching occurrences

  // Display filtered titles
  displayTitlesCallback('commentTitles', filteredTitles, selectedPriorities, selectedAcceptanceStatus);
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
 * @param {string} selectedAcceptanceStatus - Selected acceptance status ('all', 'accepted', or 'not-accepted')
 * @param {Object} currentData - Current PR data (optional, for toggle functionality)
 * @param {Function} onAcceptanceToggle - Callback when acceptance is toggled (optional)
 */
export function displayTitles(elementId, groups, selectedPriorities, selectedAcceptanceStatus = 'all', currentData = null, onAcceptanceToggle = null) {
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

        // Add links to each occurrence with acceptance toggle
        item.occurrences.forEach(occurrence => {
          const linkDiv = document.createElement('div');
          linkDiv.className = 'title-occurrence';

          const acceptedClass = occurrence.accepted ? 'accepted' : '';
          const acceptedIcon = occurrence.accepted ? '✓' : '○';
          const methodLabel = occurrence.accepted && occurrence.acceptanceMethod
            ? `(${occurrence.acceptanceMethod})`
            : '';

          linkDiv.innerHTML = `
            <button class="acceptance-toggle ${acceptedClass}" data-url="${occurrence.url}" title="Toggle acceptance">
              ${acceptedIcon}
            </button>
            <a href="${occurrence.url}" target="_blank" class="comment-link" title="View comment on GitHub">
              🔗 PR #${occurrence.prNumber}
            </a>
            ${methodLabel ? `<span class="acceptance-method">${methodLabel}</span>` : ''}
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

        const acceptedClass = occurrence.accepted ? 'accepted' : '';
        const acceptedIcon = occurrence.accepted ? '✓' : '○';
        const methodLabel = occurrence.accepted && occurrence.acceptanceMethod
          ? `(${occurrence.acceptanceMethod})`
          : '';

        linkDiv.innerHTML = `
          <button class="acceptance-toggle ${acceptedClass}" data-url="${occurrence.url}" title="Toggle acceptance">
            ${acceptedIcon}
          </button>
          <a href="${occurrence.url}" target="_blank" class="comment-link" title="View comment on GitHub">
            🔗 PR #${occurrence.prNumber}
          </a>
          ${methodLabel ? `<span class="acceptance-method">${methodLabel}</span>` : ''}
        `;
        occurrencesContainer.appendChild(linkDiv);
      });

      groupDiv.appendChild(occurrencesContainer);
    }

    container.appendChild(groupDiv);
  });

  // Initialize acceptance toggle buttons if currentData is provided
  if (currentData && onAcceptanceToggle) {
    const toggleButtons = container.querySelectorAll('.acceptance-toggle');
    toggleButtons.forEach(button => {
      button.addEventListener('click', async (e) => {
        e.preventDefault();
        const url = button.getAttribute('data-url');
        await toggleManualAcceptance(url, currentData, onAcceptanceToggle);
      });
    });
  }
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
 * @returns {Promise<Object>} Object mapping comment URLs to acceptance state
 */
export async function loadManualAcceptanceState() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['manualAcceptance'], (result) => {
      resolve(result.manualAcceptance || {});
    });
  });
}

/**
 * Saves manual acceptance state to storage
 * @param {Object} state - Object mapping comment URLs to acceptance state
 */
export async function saveManualAcceptanceState(state) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ manualAcceptance: state }, resolve);
  });
}

/**
 * Toggles manual acceptance for an issue
 * @param {string} url - Comment URL
 * @param {Object} currentData - Current PR data
 * @param {Function} onToggle - Callback when toggle completes
 */
export async function toggleManualAcceptance(url, currentData, onToggle) {
  const state = await loadManualAcceptanceState();

  // Toggle the state
  if (state[url]) {
    delete state[url];
  } else {
    state[url] = {
      accepted: true,
      acceptanceMethod: 'manual',
      timestamp: new Date().toISOString()
    };
  }

  await saveManualAcceptanceState(state);

  // Update the issue in currentData
  currentData.pullRequests.forEach(pr => {
    pr.actionableIssues.forEach(issue => {
      if (issue.url === url) {
        if (state[url]) {
          issue.accepted = true;
          issue.acceptanceMethod = 'manual';
        } else {
          // Revert to automated detection state or default
          issue.accepted = false;
          issue.acceptanceMethod = null;
        }
      }
    });
  });

  if (onToggle) {
    onToggle();
  }
}

/**
 * Applies manual acceptance state from storage to PR data
 * Manual state has highest priority and overrides automated detection
 * @param {Object} data - PR data to update
 */
export async function applyManualAcceptanceState(data) {
  // Safety check: ensure data and pullRequests exist
  if (!data || !data.pullRequests || !Array.isArray(data.pullRequests)) {
    console.warn('applyManualAcceptanceState: Invalid data structure', data);
    return;
  }

  const state = await loadManualAcceptanceState();

  data.pullRequests.forEach(pr => {
    if (pr.actionableIssues && Array.isArray(pr.actionableIssues)) {
      pr.actionableIssues.forEach(issue => {
        // Manual acceptance has highest priority
        if (state[issue.url]) {
          issue.accepted = state[issue.url].accepted;
          issue.acceptanceMethod = state[issue.url].acceptanceMethod;
        }
      });
    }
  });
}
