// Listener for keyboard command
chrome.commands.onCommand.addListener((command) => {
  if (command === "open-side-panel") {
    // openSidePanel();
    chrome.storage.local.set({ lastOpenMethod: "keyboard_shortcut" });
    openSidePanel();
  }
});

// Listener for icon click
chrome.action.onClicked.addListener(() => {
  // chrome.storage.local.set({ lastOpenMethod: "icon_click" }
  chrome.storage.local.set({ lastOpenMethod: "icon_click" });
  openSidePanel();
});

// Function to open the side panel
function openSidePanel() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length > 0) {
      const currentTab = tabs[0];
      chrome.sidePanel.open(
        {
          tabId: currentTab.id,
        },
        () => {
          if (chrome.runtime.lastError) {
            console.error(chrome.runtime.lastError);
          } else {
            console.log("Side panel opened.");
            // chrome.runtime.sendMessage({ type: "PANEL_OPENED", method: method });
          }
        }
      );
    } else {
      console.error("No active tab found.");
    }
  });
}

// Function to open the side panel (storing method in storage)
// function openSidePanel(method) {
//   chrome.storage.local.set({ lastOpenMethod: method }, () => {
//     chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
//       if (tabs.length > 0) {
//         const currentTab = tabs[0];
//         chrome.sidePanel.open(
//           {
//             tabId: currentTab.id,
//           },
//           () => {
//             if (chrome.runtime.lastError) {
//               console.error(chrome.runtime.lastError);
//             } else {
//               console.log("Side panel opened.");
//             }
//           }
//         );
//       } else {
//         console.error("No active tab found.");
//       }
//     });
//   });
// }


// background.js
import { sendAnalyticsEvent } from "./analytics.js";

chrome.runtime.onInstalled.addListener(() => {
  console.log("Extension installed");
  sendAnalyticsEvent("extension_installed");
});

// Example of tracking an error
addEventListener("unhandledrejection", async (event) => {
  sendAnalyticsEvent("extension_error", {
    message: event.reason.message,
    stack: event.reason.stack,
  });
});

// Keep the service worker alive
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "KEEP_ALIVE") {
    sendResponse({ status: "alive" });
  }
  return true; // Indicates that the response is sent asynchronously
});

// Track how the side panel was opened
// chrome.action.onClicked.addListener(() => {
//   openSidePanel("icon_click");
// });

// chrome.commands.onCommand.addListener((command) => {
//   if (command === "open-side-panel") {
//     openSidePanel("keyboard_shortcut");
//   }
// });

// function openSidePanel(method) {
//   chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
//     if (tabs.length > 0) {
//       chrome.sidePanel.open({ tabId: tabs[0].id });
//       chrome.runtime.sendMessage({ type: "PANEL_OPENED", method: method });
//     }
//   });
// }
