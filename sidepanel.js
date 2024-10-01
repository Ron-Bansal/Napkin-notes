import { sendAnalyticsEvent } from "./analytics.js";

let isBackgroundActive = false;
let sessionStartTime;

function checkBackgroundStatus() {
  chrome.runtime.sendMessage({ type: "KEEP_ALIVE" }, (response) => {
    if (chrome.runtime.lastError) {
      console.log("Background script is not active. Retrying...");
      setTimeout(checkBackgroundStatus, 1000); // Retry after 1 second
    } else {
      console.log("Background script is active");
      isBackgroundActive = true;
    }
  });
}

// Start checking background status
checkBackgroundStatus();

document.addEventListener("DOMContentLoaded", () => {
  const editor = document.getElementById("editor");
  const helpButton = document.getElementById("help-button");
  const modal = document.getElementById("modal");
  const closeButton = document.querySelector(".close-button");
  const systemRadio = document.getElementById("system");
  const lightRadio = document.getElementById("light");
  const darkRadio = document.getElementById("dark");
  const fontSizeSlider = document.getElementById("font-size-slider");
  const fontSizeValue = document.getElementById("font-size-value");
  const lineHeightSlider = document.getElementById("line-height-slider");
  const lineHeightValue = document.getElementById("line-height-value");
  const spellCheckCheckbox = document.getElementById("spell-check");
  const footerToggleCheckbox = document.getElementById("footer-toggle");
  const footerElement = document.getElementById("app-footer");
  const analyticsOptIn = document.getElementById("analytics-opt-in");

  // Check if migration is needed and perform if necessary
  chrome.storage.local.get("migrationComplete", (result) => {
    if (!result.migrationComplete) {
      migrateToLocalStorage().then(loadContentAndPreferences);
    } else {
      loadContentAndPreferences();
    }
  });

  // Load saved content and preferences
  const loadContentAndPreferences = () => {
    chrome.storage.local.get(
      ["content", "theme", "fontSize", "spellCheck", "lineHeight"],
      (result) => {
        if (result.content) {
          editor.innerHTML = result.content;
        }
        if (result.theme) {
          document.body.classList.remove("dark-mode", "light-mode");
          if (result.theme === "dark") {
            document.body.classList.add("dark-mode");
            darkRadio.checked = true;
          } else if (result.theme === "light") {
            document.body.classList.add("light-mode");
            lightRadio.checked = true;
          } else {
            systemRadio.checked = true;
          }
        }
        if (result.fontSize) {
          editor.style.fontSize = `${result.fontSize}px`;
          fontSizeSlider.value = result.fontSize;
          fontSizeValue.textContent = `${result.fontSize}px`;
        }
        if (result.lineHeight) {
          editor.style.lineHeight = `${result.lineHeight}px`;
          lineHeightSlider.value = result.lineHeight;
          lineHeightValue.textContent = `${result.lineHeight}px`;
        }
        if (result.spellCheck !== undefined) {
          spellCheckCheckbox.checked = result.spellCheck;
          editor.setAttribute("spellcheck", result.spellCheck);
        } else {
          editor.setAttribute("spellcheck", true);
        }
      }
    );
  };

  // Track session start time (track session duration in the future)
  sessionStartTime = Date.now();
  sendAnalyticsEvent("session_started", {
    timestamp: new Date().toISOString(),
  });

  // Track how the side panel was opened:
  chrome.storage.local.get(["lastOpenMethod"], (result) => {
    if (result.lastOpenMethod) {
      sendAnalyticsEvent("panel_opened", {
        method: result.lastOpenMethod,
      });
      chrome.storage.local.remove("lastOpenMethod");
    }
  });

  // Save content function
  const saveContent = async () => {
    const content = editor.innerHTML;
    chrome.storage.local.set({ content }, async () => {
      console.log("Content saved");

      // Track content length or number of notes (if you have separate note structure)
      const contentLength = content.length;
      await sendAnalyticsEvent("content_saved", {
        content_length: contentLength,
      });
    });
  };

  const formatContent = () => {
    const content = editor.innerHTML;
    // Replace "--- " with a horizontal rule
    let updatedContent = content.replace(/---/g, "<hr>");
    // Replace "!!!" with a mark tag and add a line break after it
    updatedContent = updatedContent.replace(
      /!!!(.*?)!!!/g,
      "<mark>$1</mark><br>"
    );
    if (updatedContent !== content) {
      editor.innerHTML = updatedContent;
      // Move the caret to the end of the editor content
      const range = document.createRange();
      const sel = window.getSelection();
      range.selectNodeContents(editor);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    saveContent();
  };

  // Handle backspace for empty mark tags
  editor.addEventListener("keydown", (event) => {
    if (event.key === "Backspace") {
      const selection = window.getSelection();
      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const startContainer = range.startContainer;

        // Check if we're inside a mark tag
        let markElement =
          startContainer.nodeType === Node.TEXT_NODE
            ? startContainer.parentNode
            : startContainer;

        if (markElement.tagName === "MARK") {
          // Check if the mark tag is empty or contains only whitespace
          if (markElement.textContent.trim() === "") {
            event.preventDefault();

            // Remove the mark tag and its following <br> if it exists
            if (
              markElement.nextSibling &&
              markElement.nextSibling.nodeName === "BR"
            ) {
              markElement.parentNode.removeChild(markElement.nextSibling);
            }
            const textNode = document.createTextNode("\u200B"); // Zero-width space
            markElement.parentNode.replaceChild(textNode, markElement);

            // Set the cursor position
            range.setStart(textNode, 0);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);

            saveContent();
          }
        }
      }
    }
  });

  // Handle Enter key within mark tags
  editor.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      const selection = window.getSelection();
      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const startContainer = range.startContainer;

        // Check if we're inside a mark tag
        let markElement =
          startContainer.nodeType === Node.TEXT_NODE
            ? startContainer.parentNode
            : startContainer;

        if (markElement.tagName === "MARK") {
          event.preventDefault();

          // Split the mark tag content
          const beforeText = markElement.textContent.slice(
            0,
            range.startOffset
          );
          const afterText = markElement.textContent.slice(range.startOffset);

          // Create new elements
          const newMark = document.createElement("mark");
          newMark.textContent = beforeText;
          const br = document.createElement("br");
          const textNode = document.createTextNode(afterText);

          // Replace the old mark tag with new elements
          markElement.parentNode.insertBefore(newMark, markElement);
          markElement.parentNode.insertBefore(br, markElement);
          markElement.parentNode.insertBefore(textNode, markElement);
          markElement.parentNode.removeChild(markElement);

          // Set the cursor position after the new line
          range.setStart(textNode, 0);
          range.collapse(true);
          selection.removeAllRanges();
          selection.addRange(range);

          saveContent();
        }
      }
    }
  });

  const applyStrikethrough = () => {
    document.execCommand("strikeThrough");
    saveContent();
  };

  // Detect keyboard shortcut for strikethrough
  editor.addEventListener("keydown", (event) => {
    if (event.altKey && event.shiftKey && event.key === "S") {
      console.log("smash");
      event.preventDefault();
      applyStrikethrough();
    }
  });

  // Detect input and format content
  editor.addEventListener("input", formatContent);

  // Show the modal
  helpButton.addEventListener("click", () => {
    modal.style.display = "block";
  });

  // Hide the modal
  closeButton.addEventListener("click", () => {
    modal.style.display = "none";
  });

  // Hide the modal when clicking outside of it
  window.addEventListener("click", (event) => {
    if (event.target === modal) {
      modal.style.display = "none";
    }
  });

  // Apply theme
  const applyTheme = (theme) => {
    document.body.classList.remove("dark-mode", "light-mode");
    if (theme === "dark") {
      document.body.classList.add("dark-mode");
    } else if (theme === "light") {
      document.body.classList.add("light-mode");
    }
  };

  // Update theme storage
  document.querySelectorAll('input[name="theme"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      const selectedTheme = document.querySelector(
        'input[name="theme"]:checked'
      ).value;
      applyTheme(selectedTheme);
      chrome.storage.local.set({ theme: selectedTheme });
    });
  });

  // Update font size storage
  fontSizeSlider.addEventListener("input", () => {
    const fontSize = fontSizeSlider.value;
    editor.style.fontSize = `${fontSize}px`;
    fontSizeValue.textContent = `${fontSize}px`;
    chrome.storage.local.set({ fontSize: fontSize }, () => {
      console.log("Font size saved:", fontSize);
    });
  });

  // Update line height storage
  lineHeightSlider.addEventListener("input", () => {
    const lineHeight = lineHeightSlider.value;
    editor.style.lineHeight = `${lineHeight}px`;
    lineHeightValue.textContent = `${lineHeight}px`;
    chrome.storage.local.set({ lineHeight: lineHeight }, () => {
      console.log("Line height saved:", lineHeight);
    });
  });

  // Load saved spell check preference
  chrome.storage.local.get(["spellCheck"], (result) => {
    if (result.spellCheck !== undefined) {
      spellCheckCheckbox.checked = result.spellCheck;
      editor.setAttribute("spellcheck", result.spellCheck);
    } else {
      editor.setAttribute("spellcheck", true);
    }
  });

  // Save spell check preference
  spellCheckCheckbox.addEventListener("change", () => {
    const spellCheckEnabled = spellCheckCheckbox.checked;
    editor.setAttribute("spellcheck", spellCheckEnabled);
    chrome.storage.local.set({ spellCheck: spellCheckEnabled });
  });

  // Load saved footer visibility preference and adjust the UI accordingly
  chrome.storage.local.get(["footerVisible"], (result) => {
    const footerVisible = result.footerVisible !== undefined ? result.footerVisible : true;
    footerToggleCheckbox.checked = !footerVisible;
    footerElement.style.display = footerVisible ? "flex" : "none";
  });

  // Save footer visibility preference when the checkbox is toggled
  footerToggleCheckbox.addEventListener("change", () => {
    const footerVisible = !footerToggleCheckbox.checked;
    footerElement.style.display = footerVisible ? "flex" : "none";
    chrome.storage.local.set({ footerVisible: footerVisible });
  });

  // Track page view
  sendAnalyticsEvent("page_view", {
    page_title: document.title,
    page_location: document.location.href,
  });

  // Track when the help button is clicked
  helpButton.addEventListener("click", () => {
    sendAnalyticsEvent("help_opened");
  });

  // Track when notes are edited
  // editor.addEventListener("input", () => {
  //   sendAnalyticsEvent("note_edited");
  // });

  // Track settings changes
  fontSizeSlider.addEventListener("change", () => {
    sendAnalyticsEvent("setting_changed", {
      setting: "fontSize",
      value: `font size: ${fontSizeSlider.value}`,
    });
  });

  lineHeightSlider.addEventListener("change", () => {
    sendAnalyticsEvent("setting_changed", {
      setting: "lineHeight",
      value: `line height: ${lineHeightSlider.value}`,
    });
  });

  spellCheckCheckbox.addEventListener("change", () => {
    sendAnalyticsEvent("setting_changed", {
      setting: "spellCheck",
      value: `spell check: ${spellCheckCheckbox.value}`,
    });
  });

  document.querySelectorAll('input[name="theme"]').forEach((radio) => {
    radio.addEventListener("change", async () => {
      const selectedTheme = document.querySelector(
        'input[name="theme"]:checked'
      ).value;
      console.log(`Theme changed to: ${selectedTheme}`);

      // Track theme change event
      await sendAnalyticsEvent("theme_changed", { theme: selectedTheme });
    });
  });
});

// Track formatting usage
editor.addEventListener("input", () => {
  const content = editor.innerHTML;
  sendAnalyticsEvent("formatting_used", {
    bold_count: (content.match(/<b>|<strong>/g) || []).length,
    italic_count: (content.match(/<i>|<em>/g) || []).length,
    underline_count: (content.match(/<u>/g) || []).length,
    strikethrough_count: (content.match(/<strike>|<s>/g) || []).length,
    section_dividers: (content.match(/<hr>/g) || []).length,
    section_titles: (content.match(/<mark>/g) || []).length,
  });
});

// Track errors
window.addEventListener("error", (event) => {
  sendAnalyticsEvent("error_occurred", {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
  });
});

// Track link clicks
function handleLinkClick(event) {
  const link = event.currentTarget;
  const category = link.getAttribute('data-ga-category');
  const action = link.getAttribute('data-ga-action');
  const label = link.getAttribute('data-ga-label');

  sendAnalyticsEvent('link_click', {
    event_category: category,
    event_action: action,
    event_label: label
  });
}

document.querySelectorAll('.ga-track-link').forEach(link => {
  link.addEventListener('click', handleLinkClick);
});

// window.addEventListener("beforeunload", () => {
//   const sessionDuration = (Date.now() - sessionStartTime) / 1000; // in seconds
//   console.log("DURATION:", sessionDuration)
//   sendAnalyticsEvent("session_ended", {
//     duration: sessionDuration,
//   });
// });
