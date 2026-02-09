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
 */
export function displayTitles(elementId, groups, selectedPriorities) {
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
