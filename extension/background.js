// Background service worker for CodeRabbit PR Analyzer extension

// Listen for extension installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('CodeRabbit PR Analyzer extension installed');
  } else if (details.reason === 'update') {
    console.log('CodeRabbit PR Analyzer extension updated');
  }
});

// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});
