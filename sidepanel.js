// document.addEventListener("DOMContentLoaded", () => {
//   const editor = document.getElementById("editor");
//   const helpButton = document.getElementById("help-button");
//   const modal = document.getElementById("modal");
//   const closeButton = document.querySelector(".close-button");
//   const systemRadio = document.getElementById("system");
//   const lightRadio = document.getElementById("light");
//   const darkRadio = document.getElementById("dark");

//   // Load saved content and preferences
//   chrome.storage.sync.get(["content", "theme"], (result) => {
//     if (result.content) {
//       editor.innerHTML = result.content;
//     }
//     if (result.theme) {
//       document.body.classList.remove("dark-mode", "light-mode");
//       if (result.theme === "dark") {
//         document.body.classList.add("dark-mode");
//         darkRadio.checked = true;
//       } else if (result.theme === "light") {
//         document.body.classList.add("light-mode");
//         lightRadio.checked = true;
//       } else {
//         systemRadio.checked = true;
//       }
//     }
//   });

//   // Save content function
//   const saveContent = () => {
//     const content = editor.innerHTML;
//     chrome.storage.sync.set({ content }, () => {
//       console.log("Content saved");
//     });
//   };

//   // Format content function to add horizontal rule
//   const formatContent = () => {
//     const content = editor.innerHTML;
//     // Replace "--- " with a horizontal rule
//     const updatedContent = content.replace(/---/g, "<hr>");
//     if (updatedContent !== content) {
//       editor.innerHTML = updatedContent;
//       // Move the caret to the end of the editor content
//       const range = document.createRange();
//       const sel = window.getSelection();
//       range.setStart(editor.childNodes[editor.childNodes.length - 1], 1);
//       range.collapse(true);
//       sel.removeAllRanges();
//       sel.addRange(range);
//     }
//     saveContent();
//   };

//   // Function to apply strikethrough to selected text
//   const applyStrikethrough = () => {
//     document.execCommand("strikeThrough");
//     saveContent();
//   };

//   // Detect keyboard shortcut for strikethrough
//   editor.addEventListener("keydown", (event) => {
//     if (event.altKey && event.shiftKey && event.key === "S") {
//       console.log("smash");
//       event.preventDefault();
//       applyStrikethrough();
//     }
//   });

//   // Detect input and format content
//   editor.addEventListener("input", formatContent);

//   // Show the modal
//   helpButton.addEventListener("click", () => {
//     modal.style.display = "block";
//   });

//   // Hide the modal
//   closeButton.addEventListener("click", () => {
//     modal.style.display = "none";
//   });

//   // Hide the modal when clicking outside of it
//   window.addEventListener("click", (event) => {
//     if (event.target === modal) {
//       modal.style.display = "none";
//     }
//   });

//   // Apply theme
//   const applyTheme = (theme) => {
//     document.body.classList.remove("dark-mode", "light-mode");
//     if (theme === "dark") {
//       document.body.classList.add("dark-mode");
//     } else if (theme === "light") {
//       document.body.classList.add("light-mode");
//     }
//   };

//   // Listen for changes to theme radio buttons
//   document.querySelectorAll('input[name="theme"]').forEach((radio) => {
//     radio.addEventListener("change", () => {
//       const selectedTheme = document.querySelector(
//         'input[name="theme"]:checked'
//       ).value;
//       applyTheme(selectedTheme);
//       chrome.storage.sync.set({ theme: selectedTheme });
//     });
//   });

//   // Set the initial theme based on system preference if "system" is selected
//   if (systemRadio.checked) {
//     const prefersDarkScheme = window.matchMedia(
//       "(prefers-color-scheme: dark)"
//     ).matches;
//     if (prefersDarkScheme) {
//       applyTheme("dark");
//     } else {
//       applyTheme("light");
//     }
//   }
// });

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
  const spellCheckCheckbox = document.getElementById("spell-check");
  // const clearNotesButton = document.getElementById("clear-notes-button");

  // Load saved content and preferences
  chrome.storage.sync.get(["content", "theme", "fontSize", "spellCheck"], (result) => {
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
      document.body.style.fontSize = `${result.fontSize}px`;
      fontSizeSlider.value = result.fontSize;
      fontSizeValue.textContent = `${result.fontSize}px`;
    }
    if (result.spellCheck !== undefined) {
      spellCheckCheckbox.checked = result.spellCheck;
      editor.setAttribute("spellcheck", result.spellCheck);
    } else {
      editor.setAttribute("spellcheck", true);
    }
  });

  // Save content function
  const saveContent = () => {
    const content = editor.innerHTML;
    chrome.storage.sync.set({ content }, () => {
      console.log("Content saved");
    });
  };

  // Format content function to add horizontal rule
  const formatContent = () => {
    const content = editor.innerHTML;
    // Replace "--- " with a horizontal rule
    const updatedContent = content.replace(/---/g, "<hr>");
    if (updatedContent !== content) {
      editor.innerHTML = updatedContent;
      // Move the caret to the end of the editor content
      const range = document.createRange();
      const sel = window.getSelection();
      range.setStart(editor.childNodes[editor.childNodes.length - 1], 1);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    saveContent();
  };

  // Function to apply strikethrough to selected text
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

  // Listen for changes to theme radio buttons
  document.querySelectorAll('input[name="theme"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      const selectedTheme = document.querySelector(
        'input[name="theme"]:checked'
      ).value;
      applyTheme(selectedTheme);
      chrome.storage.sync.set({ theme: selectedTheme });
    });
  });


  // Adjust font size
  fontSizeSlider.addEventListener("input", () => {
    const fontSize = fontSizeSlider.value;
    document.body.style.fontSize = `${fontSize}px`;
    fontSizeValue.textContent = `${fontSize}px`;
    chrome.storage.sync.set({ fontSize: fontSize }, () => {
      console.log("Font size saved:", fontSize);
    });
  });

  // Load saved spell check preference
  chrome.storage.sync.get(["spellCheck"], (result) => {
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
    chrome.storage.sync.set({ spellCheck: spellCheckEnabled });
  });

  // Clear all notes
  // clearNotesButton.addEventListener("click", () => {
  //   editor.innerHTML = "";
  //   chrome.storage.sync.set({ content: "" }, () => {
  //     console.log("All notes cleared");
  //   });
  // });
});
