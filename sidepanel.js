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
  // const clearNotesButton = document.getElementById("clear-notes-button");

  // Load saved content and preferences
  chrome.storage.sync.get(
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

  // Save content function
  const saveContent = () => {
    const content = editor.innerHTML;
    chrome.storage.sync.set({ content }, () => {
      console.log("Content saved");
    });
  };

  // Format content function to add horizontal rule
  // const formatContent = () => {
  //   const content = editor.innerHTML;
  //   // Replace "--- " with a horizontal rule
  //   const updatedContent = content.replace(/---/g, "<hr>");

  //   if (updatedContent !== content) {
  //     editor.innerHTML = updatedContent;
  //     // Move the caret to the end of the editor content
  //     const range = document.createRange();
  //     const sel = window.getSelection();
  //     range.setStart(editor.childNodes[editor.childNodes.length - 1], 1);
  //     range.collapse(true);
  //     sel.removeAllRanges();
  //     sel.addRange(range);
  //   }
  //   saveContent();
  // };
  const formatContent = () => {
    const content = editor.innerHTML;
  
    // Replace "---" with a horizontal rule
    let updatedContent = content.replace(/---/g, "<hr>");
  
    // Replace "///" with an open <mark> tag, allowing the user to type inside it
    updatedContent = updatedContent.replace(/\/\/\//g, "<mark></mark>&#8203;");
  
    if (updatedContent !== content) {
      editor.innerHTML = updatedContent;
  
      // Move the caret inside the newly inserted <mark> tag
      const range = document.createRange();
      const sel = window.getSelection();
  
      // Get the last <mark> tag inserted and place the caret inside it
      const markElement = editor.querySelector("mark");
      if (markElement) {
        range.setStart(markElement, 0); // Place caret inside <mark> at the start
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      }
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
    editor.style.fontSize = `${fontSize}px`;
    fontSizeValue.textContent = `${fontSize}px`;
    chrome.storage.sync.set({ fontSize: fontSize }, () => {
      console.log("Font size saved:", fontSize);
    });
  });

  // Adjust line height
  lineHeightSlider.addEventListener("input", () => {
    const lineHeight = lineHeightSlider.value;
    editor.style.lineHeight = `${lineHeight}px`;
    lineHeightValue.textContent = `${lineHeight}px`;
    chrome.storage.sync.set({ lineHeight: lineHeight }, () => {
      console.log("Line height saved:", lineHeight);
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
});
