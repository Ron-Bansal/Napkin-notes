// Listener for keyboard command
chrome.commands.onCommand.addListener((command) => {
  if (command === "open-side-panel") {
    openSidePanel();
  }
});

// Listener for icon click
chrome.action.onClicked.addListener(() => {
  openSidePanel();
});

// Function to open the side panel
function openSidePanel() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length > 0) {
      const currentTab = tabs[0];
      chrome.sidePanel.open({
        tabId: currentTab.id
      }, () => {
        if (chrome.runtime.lastError) {
          console.error(chrome.runtime.lastError);
        } else {
          console.log('Side panel opened.');
        }
      });
    } else {
      console.error('No active tab found.');
    }
  });
}
