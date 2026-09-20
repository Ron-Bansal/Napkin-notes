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
  const textSizeRadios = document.querySelectorAll('input[name="text-size"]');
  const editorFontRadios = document.querySelectorAll('input[name="editor-font"]');
  const spellCheckCheckbox = document.getElementById("spell-check");
  const plainPasteCheckbox = document.getElementById("plain-paste");
  const wordCountCheckbox = document.getElementById("word-count-toggle");
  const wordCountEl = document.getElementById("word-count");

  // Text size presets — line height is derived from the chosen size so the
  // two never drift out of proportion (replaces the old font/line sliders).
  const TEXT_SIZES = {
    small: { font: 13, line: 1.5 },
    medium: { font: 15, line: 1.6 },
    large: { font: 17, line: 1.7 },
  };

  const applyTextSize = (size) => {
    const cfg = TEXT_SIZES[size] || TEXT_SIZES.medium;
    editor.style.fontSize = `${cfg.font}px`;
    editor.style.lineHeight = `${cfg.line}`;
    textSizeRadios.forEach((radio) => {
      radio.checked = radio.value === size;
    });
  };

  // Prefer the new textSize preference; otherwise migrate the old numeric
  // fontSize into the nearest bucket so existing users keep their setting.
  const resolveTextSize = (result) => {
    if (result.textSize && TEXT_SIZES[result.textSize]) return result.textSize;
    if (result.fontSize) {
      const n = parseInt(result.fontSize, 10);
      if (n <= 13) return "small";
      if (n >= 17) return "large";
      return "medium";
    }
    return "medium";
  };

  // Editor font presets (system stacks — no extra fonts to load).
  const EDITOR_FONTS = {
    sans: '"Inter", "Segoe UI", system-ui, -apple-system, sans-serif',
    serif: '"Iowan Old Style", Palatino, Georgia, "Times New Roman", serif',
    mono: 'ui-monospace, "SF Mono", "SFMono-Regular", Menlo, Consolas, monospace',
  };

  const applyEditorFont = (font) => {
    const stack = EDITOR_FONTS[font] || EDITOR_FONTS.sans;
    editor.style.fontFamily = stack;
    editorFontRadios.forEach((radio) => {
      radio.checked = radio.value === font;
    });
  };

  // Whether pasted content is stripped to plain text (set from storage below).
  let plainPasteEnabled = false;
  let wordCountEnabled = false;

  const updateWordCount = () => {
    if (!wordCountEl) return;
    if (!wordCountEnabled) {
      wordCountEl.textContent = "";
      return;
    }
    const text = editor.textContent.trim();
    const words = text ? text.split(/\s+/).length : 0;
    wordCountEl.textContent = `${words} ${words === 1 ? "word" : "words"}`;
  };

  // Check if migration is needed and perform if necessary
  chrome.storage.local.get("migrationComplete", (result) => {
    if (!result.migrationComplete) {
      migrateToLocalStorage().then(loadContentAndPreferences);
    } else {
      loadContentAndPreferences();
    }
  });

  // Function to migrate data from chrome.storage.sync to chrome.storage.local
  const migrateToLocalStorage = async () => {
    return new Promise((resolve, reject) => {
      // Fetch all data from chrome.storage.sync
      chrome.storage.sync.get(null, (syncData) => {
        if (chrome.runtime.lastError) {
          console.error(
            "Error reading from chrome.storage.sync:",
            chrome.runtime.lastError
          );
          reject(chrome.runtime.lastError);
          return;
        }

        // Write the fetched data to chrome.storage.local
        chrome.storage.local.set(syncData, () => {
          if (chrome.runtime.lastError) {
            console.error(
              "Error writing to chrome.storage.local:",
              chrome.runtime.lastError
            );
            reject(chrome.runtime.lastError);
            return;
          }

          // Set a migration flag in local storage
          chrome.storage.local.set({ migrationComplete: true }, () => {
            if (chrome.runtime.lastError) {
              console.error(
                "Error setting migration flag:",
                chrome.runtime.lastError
              );
              reject(chrome.runtime.lastError);
              return;
            }

            console.log(
              "Migration from chrome.storage.sync to chrome.storage.local completed successfully."
            );
            resolve();
          });
        });
      });
    });
  };

  // Load saved content and preferences
  const loadContentAndPreferences = () => {
    chrome.storage.local.get(
      [
        "content",
        "theme",
        "fontSize",
        "spellCheck",
        "lineHeight",
        "textSize",
        "editorFont",
        "plainPaste",
        "wordCount",
      ],
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
          } else if (systemRadio) {
            systemRadio.checked = true;
          }
        }
        applyTextSize(resolveTextSize(result));
        applyEditorFont(result.editorFont || "sans");
        if (result.spellCheck !== undefined) {
          spellCheckCheckbox.checked = result.spellCheck;
          editor.setAttribute("spellcheck", result.spellCheck);
        } else {
          editor.setAttribute("spellcheck", true);
        }
        // Plain-text paste is the default; users can opt out.
        plainPasteEnabled = result.plainPaste !== false;
        if (plainPasteCheckbox) plainPasteCheckbox.checked = plainPasteEnabled;
        wordCountEnabled = result.wordCount === true;
        if (wordCountCheckbox) wordCountCheckbox.checked = wordCountEnabled;
        updateWordCount();
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

  // Update text size storage
  textSizeRadios.forEach((radio) => {
    radio.addEventListener("change", () => {
      const size = document.querySelector(
        'input[name="text-size"]:checked'
      ).value;
      applyTextSize(size);
      chrome.storage.local.set({ textSize: size }, () => {
        console.log("Text size saved:", size);
      });
      sendAnalyticsEvent("setting_changed", {
        setting: "textSize",
        value: `text size: ${size}`,
      });
    });
  });

  // Update editor font storage
  editorFontRadios.forEach((radio) => {
    radio.addEventListener("change", () => {
      const font = document.querySelector(
        'input[name="editor-font"]:checked'
      ).value;
      applyEditorFont(font);
      chrome.storage.local.set({ editorFont: font });
      sendAnalyticsEvent("setting_changed", {
        setting: "editorFont",
        value: `editor font: ${font}`,
      });
    });
  });

  // Paste as plain text
  if (plainPasteCheckbox) {
    plainPasteCheckbox.addEventListener("change", () => {
      plainPasteEnabled = plainPasteCheckbox.checked;
      chrome.storage.local.set({ plainPaste: plainPasteEnabled });
    });
  }

  editor.addEventListener("paste", (event) => {
    if (!plainPasteEnabled) return;
    event.preventDefault();
    const text = (event.clipboardData || window.clipboardData).getData(
      "text/plain"
    );
    document.execCommand("insertText", false, text);
  });

  // Word count
  if (wordCountCheckbox) {
    wordCountCheckbox.addEventListener("change", () => {
      wordCountEnabled = wordCountCheckbox.checked;
      chrome.storage.local.set({ wordCount: wordCountEnabled });
      updateWordCount();
    });
  }

  editor.addEventListener("input", updateWordCount);

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
  const category = link.getAttribute("data-ga-category");
  const action = link.getAttribute("data-ga-action");
  const label = link.getAttribute("data-ga-label");

  sendAnalyticsEvent("link_click", {
    event_category: category,
    event_action: action,
    event_label: label,
  });
}

document.querySelectorAll(".ga-track-link").forEach((link) => {
  link.addEventListener("click", handleLinkClick);
});

// window.addEventListener("beforeunload", () => {
//   const sessionDuration = (Date.now() - sessionStartTime) / 1000; // in seconds
//   console.log("DURATION:", sessionDuration)
//   sendAnalyticsEvent("session_ended", {
//     duration: sessionDuration,
//   });
// });
