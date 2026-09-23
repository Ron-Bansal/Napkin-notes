import { sendAnalyticsEvent } from "./analytics.js";
import { createEditor, promptForLink } from "./editor.js";
import { migrateLegacyHTML, backupNotesOnce } from "./migration.js";

let sessionStartTime;

function checkBackgroundStatus() {
  try {
    chrome.runtime.sendMessage({ type: "KEEP_ALIVE" }, () => {
      if (chrome.runtime.lastError) {
        setTimeout(checkBackgroundStatus, 1000);
      }
    });
  } catch (e) {}
}
checkBackgroundStatus();

document.addEventListener("DOMContentLoaded", () => {
  const editorEl = document.getElementById("editor");
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
  const saveStatusEl = document.getElementById("save-status");

  let tipEditor = null;
  let currentSpellcheck = true;
  let plainPasteEnabled = true;
  let wordCountEnabled = false;
  let saveDebounceTimer = null;

  // ---- Appearance --------------------------------------------------------
  const TEXT_SIZES = {
    small: { font: 13, line: 1.5 },
    medium: { font: 15, line: 1.6 },
    large: { font: 17, line: 1.7 },
  };
  const applyTextSize = (size) => {
    const cfg = TEXT_SIZES[size] || TEXT_SIZES.medium;
    editorEl.style.fontSize = `${cfg.font}px`;
    editorEl.style.lineHeight = `${cfg.line}`;
    textSizeRadios.forEach((r) => (r.checked = r.value === size));
  };
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
  const EDITOR_FONTS = {
    sans: '"Inter", "Segoe UI", system-ui, -apple-system, sans-serif',
    serif: '"Iowan Old Style", Palatino, Georgia, "Times New Roman", serif',
    mono: 'ui-monospace, "SF Mono", "SFMono-Regular", Menlo, Consolas, monospace',
  };
  const applyEditorFont = (font) => {
    editorEl.style.fontFamily = EDITOR_FONTS[font] || EDITOR_FONTS.sans;
    editorFontRadios.forEach((r) => (r.checked = r.value === font));
  };

  const setSpellcheck = (on) => {
    currentSpellcheck = !!on;
    if (tipEditor && tipEditor.view) {
      tipEditor.view.dom.setAttribute("spellcheck", on ? "true" : "false");
    }
  };

  const updateWordCount = () => {
    if (!wordCountEl) return;
    if (!wordCountEnabled || !tipEditor) {
      wordCountEl.textContent = "";
      return;
    }
    const words = tipEditor.storage.characterCount.words();
    wordCountEl.textContent = `${words.toLocaleString()} ${
      words === 1 ? "word" : "words"
    }`;
  };

  // ---- Save indicator (Saving… / Saved / Couldn't save) ------------------
  const setSaveStatus = (state) => {
    if (!saveStatusEl) return;
    saveStatusEl.classList.add("visible");
    saveStatusEl.classList.remove("saving", "saved", "error");
    if (state === "saving") {
      saveStatusEl.classList.add("saving");
      saveStatusEl.textContent = "Saving…";
    } else if (state === "error") {
      saveStatusEl.classList.add("error");
      saveStatusEl.textContent = "Couldn't save";
    } else {
      saveStatusEl.classList.add("saved");
      saveStatusEl.textContent = "Saved";
    }
  };

  // ---- Notes (three fixed slots) -----------------------------------------
  const NOTE_COUNT = 3;
  const NAME_MAX = 16;
  const RICH_FLAG = "richMigrated";
  let notes = [
    { content: "", name: "" },
    { content: "", name: "" },
    { content: "", name: "" },
  ];
  let activeNote = 0;
  let renaming = false;

  const tabEls = Array.from(document.querySelectorAll(".note-tab"));
  const prevNoteBtn = document.getElementById("note-prev");
  const nextNoteBtn = document.getElementById("note-next");

  const persistNotes = () => {
    try {
      chrome.storage.local.set({ notes }, () => {
        if (chrome.runtime.lastError) setSaveStatus("error");
      });
    } catch (e) {
      setSaveStatus("error");
    }
  };
  const persistActiveNote = () => {
    try {
      chrome.storage.local.set({ activeNote });
    } catch (e) {}
  };

  const normalizeNotes = (raw, legacyContent) => {
    const out = [];
    for (let i = 0; i < NOTE_COUNT; i++) {
      const n = Array.isArray(raw) ? raw[i] : null;
      out.push({
        content:
          n && typeof n.content === "string"
            ? n.content
            : i === 0 && typeof legacyContent === "string"
            ? legacyContent
            : "",
        name: n && typeof n.name === "string" ? n.name.slice(0, NAME_MAX) : "",
      });
    }
    return out;
  };

  const renderTabs = () => {
    tabEls.forEach((tab, i) => {
      const numEl = tab.querySelector(".note-tab-num");
      const nameEl = tab.querySelector(".note-tab-name");
      const name = (notes[i] && notes[i].name) || "";
      if (numEl) numEl.textContent = String(i + 1);
      if (nameEl && !tab.classList.contains("renaming")) {
        nameEl.textContent = name;
      }
      tab.classList.toggle("active", i === activeNote);
      const label = name || `Note ${i + 1}`;
      tab.setAttribute("data-tooltip", `${label} · Alt+${i + 1}`);
      tab.setAttribute("aria-label", label);
      tab.setAttribute("aria-selected", i === activeNote ? "true" : "false");
    });
  };

  const playEnterAnim = () => {
    editorEl.classList.remove("note-enter");
    void editorEl.offsetWidth;
    editorEl.classList.add("note-enter");
  };

  const renderActiveNote = () => {
    if (tipEditor) {
      tipEditor.commands.setContent(
        (notes[activeNote] && notes[activeNote].content) || "",
        false
      );
    }
    playEnterAnim();
    renderTabs();
    updateWordCount();
  };

  const switchNote = (index) => {
    index = ((index % NOTE_COUNT) + NOTE_COUNT) % NOTE_COUNT;
    if (index === activeNote) {
      if (tipEditor) tipEditor.commands.focus();
      return;
    }
    // Flush any pending debounced save into the outgoing note before switching.
    clearTimeout(saveDebounceTimer);
    if (notes[activeNote] && tipEditor) {
      notes[activeNote].content = tipEditor.getHTML();
    }
    persistNotes();
    activeNote = index;
    persistActiveNote();
    renderActiveNote();
    if (tipEditor) tipEditor.commands.focus();
    sendAnalyticsEvent("note_switched", { note: activeNote + 1 });
  };
  const cycleNote = (delta) => switchNote(activeNote + delta);

  const beginRename = (index) => {
    if (renaming) return;
    renaming = true;
    const tab = tabEls[index];
    const nameEl = tab.querySelector(".note-tab-name");
    const input = document.createElement("input");
    input.type = "text";
    input.className = "note-rename-input";
    input.maxLength = NAME_MAX;
    input.value = notes[index].name || "";
    input.placeholder = `Note ${index + 1}`;
    tab.classList.add("renaming");
    if (nameEl) nameEl.style.display = "none";
    tab.appendChild(input);
    input.focus();
    input.select();

    let done = false;
    const finish = (save) => {
      if (done) return;
      done = true;
      renaming = false;
      if (save) {
        notes[index].name = input.value.trim().slice(0, NAME_MAX);
        persistNotes();
      }
      input.remove();
      tab.classList.remove("renaming");
      if (nameEl) nameEl.style.display = "";
      renderTabs();
    };
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") {
        e.preventDefault();
        finish(true);
      } else if (e.key === "Escape") {
        e.preventDefault();
        finish(false);
      }
    });
    input.addEventListener("blur", () => finish(true));
  };

  tabEls.forEach((tab, i) => {
    tab.addEventListener("click", () => switchNote(i));
    tab.addEventListener("dblclick", (e) => {
      e.preventDefault();
      beginRename(i);
    });
  });
  if (prevNoteBtn) prevNoteBtn.addEventListener("click", () => cycleNote(-1));
  if (nextNoteBtn) nextNoteBtn.addEventListener("click", () => cycleNote(1));

  // Global keyboard: note switching + a couple of editor shortcuts.
  document.addEventListener("keydown", (e) => {
    if (renaming) return;
    // Note switching (match e.code so macOS Option+digit works).
    if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      switch (e.code) {
        case "Digit1":
          switchNote(0);
          e.preventDefault();
          return;
        case "Digit2":
          switchNote(1);
          e.preventDefault();
          return;
        case "Digit3":
          switchNote(2);
          e.preventDefault();
          return;
        case "ArrowLeft":
          cycleNote(-1);
          e.preventDefault();
          return;
        case "ArrowRight":
          cycleNote(1);
          e.preventDefault();
          return;
      }
    }
    // Strikethrough (preserve the legacy Alt+Shift+S gesture).
    if (e.altKey && e.shiftKey && !e.metaKey && !e.ctrlKey && e.code === "KeyS") {
      e.preventDefault();
      if (tipEditor) tipEditor.chain().focus().toggleStrike().run();
      return;
    }
    // Link (Cmd/Ctrl+K).
    if ((e.metaKey || e.ctrlKey) && !e.altKey && e.code === "KeyK") {
      e.preventDefault();
      promptForLink(tipEditor);
    }
  });

  // ---- Save (debounced; writes are checked for failure) -------------------
  const flushSave = () => {
    if (!tipEditor) return;
    const content = tipEditor.getHTML();
    if (notes[activeNote]) notes[activeNote].content = content;
    try {
      chrome.storage.local.set({ notes }, () => {
        if (chrome.runtime.lastError) {
          setSaveStatus("error");
        } else {
          setSaveStatus("saved");
          sendAnalyticsEvent("content_saved", {
            content_length: content.length,
          });
        }
      });
    } catch (e) {
      setSaveStatus("error");
    }
  };

  const saveActiveNote = () => {
    if (!tipEditor) return;
    // Keep the in-memory note current immediately so a switch never loses text;
    // the storage write itself is debounced to avoid churn on every keystroke.
    if (notes[activeNote]) notes[activeNote].content = tipEditor.getHTML();
    setSaveStatus("saving");
    clearTimeout(saveDebounceTimer);
    saveDebounceTimer = setTimeout(flushSave, 400);
  };

  // ---- Editor bootstrap ---------------------------------------------------
  const initEditor = () => {
    tipEditor = createEditor({
      element: editorEl,
      content: (notes[activeNote] && notes[activeNote].content) || "",
      spellcheck: currentSpellcheck,
      isPlainPaste: () => plainPasteEnabled,
      onUpdate: () => {
        saveActiveNote();
        updateWordCount();
      },
    });
    setSpellcheck(currentSpellcheck);
    if (typeof window !== "undefined" && window.__NAPKIN_TEST__) {
      window.__napkinEditor = tipEditor;
    }
    renderTabs();
    updateWordCount();
    playEnterAnim();
  };

  // ---- Upgrade notice + restore ------------------------------------------
  const htmlToText = (html) => {
    const d = document.createElement("div");
    d.innerHTML = html || "";
    return d.innerText || d.textContent || "";
  };
  const downloadNotesCopy = () => {
    const parts = notes.map(
      (n, i) => `# ${n.name || "Note " + (i + 1)}\n\n${htmlToText(n.content)}`
    );
    const blob = new Blob([parts.join("\n\n———\n\n")], {
      type: "text/plain",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "napkin-notes-backup.txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  const showUpgradeNotice = () => {
    const el = document.getElementById("upgrade-notice");
    if (el) el.classList.add("show");
  };
  const hideUpgradeNotice = () => {
    const el = document.getElementById("upgrade-notice");
    if (el) el.classList.remove("show");
  };
  const upgradeDismiss = document.getElementById("upgrade-dismiss");
  const upgradeDownload = document.getElementById("upgrade-download");
  if (upgradeDismiss)
    upgradeDismiss.addEventListener("click", hideUpgradeNotice);
  if (upgradeDownload)
    upgradeDownload.addEventListener("click", downloadNotesCopy);

  const restoreRow = document.getElementById("restore-row");
  const restoreBtn = document.getElementById("restore-notes");
  const revealRestoreIfBackup = () => {
    try {
      chrome.storage.local.get(["notesBackupV3"], (res) => {
        if (res && res.notesBackupV3 && restoreRow) {
          restoreRow.style.display = "";
        }
      });
    } catch (e) {}
  };
  if (restoreBtn) {
    restoreBtn.addEventListener("click", () => {
      chrome.storage.local.get(["notesBackupV3"], (res) => {
        const b = res && res.notesBackupV3;
        if (!b || !Array.isArray(b.notes)) {
          window.alert("No backup was found.");
          return;
        }
        if (
          !window.confirm(
            "Restore your notes from before the editor upgrade? This replaces the current note contents."
          )
        )
          return;
        notes = notes.map((n, i) => ({
          content: migrateLegacyHTML((b.notes[i] && b.notes[i].content) || ""),
          name: (b.notes[i] && b.notes[i].name) || n.name,
        }));
        persistNotes();
        renderActiveNote();
        sendAnalyticsEvent("notes_restored");
      });
    });
  }

  // ---- Review prompt (two-step fork; earned trigger; capped at 3 asks) -----
  const REVIEW = {
    reviewsUrl:
      "https://chromewebstore.google.com/detail/napkin-notes-%E2%80%A2-side-panel/dlhljjkacijknfelknklfcohibfdciki/reviews",
    feedbackUrl: "mailto:raunaqbansal11@gmail.com",
    firstAskSessions: 6,
    cooldownMs: 45 * 24 * 60 * 60 * 1000,
    maxAsks: 3,
  };
  const reviewEl = document.getElementById("review-prompt");
  const reviewTextEl = document.getElementById("review-text");
  const reviewActionsEl = document.getElementById("review-actions");
  const reviewCloseEl = document.getElementById("review-close");

  const hideReview = () => {
    if (reviewEl) reviewEl.classList.remove("show");
  };
  const setReviewDone = () => {
    try {
      chrome.storage.local.set({ reviewState: "done" });
    } catch (e) {}
  };
  const reviewButton = (label, primary, onClick) => {
    const b = document.createElement("button");
    b.className = "review-btn" + (primary ? " primary" : "");
    b.textContent = label;
    b.addEventListener("click", onClick);
    return b;
  };
  const renderReviewStep = (text, buttons) => {
    if (!reviewTextEl || !reviewActionsEl) return;
    reviewTextEl.textContent = text;
    reviewActionsEl.innerHTML = "";
    buttons.forEach((b) => reviewActionsEl.appendChild(b));
  };
  const showReviewStep1 = () => {
    renderReviewStep("Enjoying Napkin?", [
      reviewButton("Not really", false, () => {
        sendAnalyticsEvent("review_prompt", { step: "negative" });
        renderReviewStep("Sorry to hear that — what could be better?", [
          reviewButton("Give feedback", true, () => {
            window.open(REVIEW.feedbackUrl, "_blank");
            setReviewDone();
            hideReview();
          }),
        ]);
      }),
      reviewButton("Yes!", true, () => {
        sendAnalyticsEvent("review_prompt", { step: "positive" });
        renderReviewStep(
          "Great to hear! A quick rating on the store helps others find it.",
          [
            reviewButton("Maybe later", false, hideReview),
            reviewButton("Rate Napkin", true, () => {
              window.open(REVIEW.reviewsUrl, "_blank");
              setReviewDone();
              hideReview();
            }),
          ]
        );
      }),
    ]);
    if (reviewEl) reviewEl.classList.add("show");
  };
  if (reviewCloseEl) reviewCloseEl.addEventListener("click", hideReview);

  const maybeShowReview = (store, sessionCount) => {
    if (!reviewEl) return;
    if ((store.reviewState || "none") === "done") return;
    if ((store.reviewAsks || 0) >= REVIEW.maxAsks) return;
    if (sessionCount < REVIEW.firstAskSessions) return;
    const last = store.reviewLastAskedAt || 0;
    if (last && Date.now() - last < REVIEW.cooldownMs) return;
    // Never stack on the upgrade notice.
    const up = document.getElementById("upgrade-notice");
    if (up && up.classList.contains("show")) return;
    // Only ask users who've gotten value — a real note exists.
    const hasValue = notes.some(
      (n) => (n.content || "").replace(/<[^>]+>/g, "").trim().length > 40
    );
    if (!hasValue) return;
    // Record the ask now; surface after a short beat so it doesn't slam in.
    try {
      chrome.storage.local.set({
        reviewAsks: (store.reviewAsks || 0) + 1,
        reviewLastAskedAt: Date.now(),
        reviewState: "later",
      });
    } catch (e) {}
    sendAnalyticsEvent("review_prompt", { step: "shown" });
    setTimeout(showReviewStep1, 1200);
  };

  // ---- Storage migration (sync -> local) then load -----------------------
  chrome.storage.local.get("migrationComplete", (result) => {
    if (!result.migrationComplete) {
      migrateSyncToLocal().then(loadContentAndPreferences, loadContentAndPreferences);
    } else {
      loadContentAndPreferences();
    }
  });

  const migrateSyncToLocal = () =>
    new Promise((resolve, reject) => {
      try {
        chrome.storage.sync.get(null, (syncData) => {
          if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
          chrome.storage.local.set(syncData, () => {
            if (chrome.runtime.lastError)
              return reject(chrome.runtime.lastError);
            chrome.storage.local.set({ migrationComplete: true }, () => resolve());
          });
        });
      } catch (e) {
        reject(e);
      }
    });

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
        "notes",
        "activeNote",
        RICH_FLAG,
        "sessionCount",
        "reviewState",
        "reviewAsks",
        "reviewLastAskedAt",
      ],
      (result) => {
        const migratingNotes = !Array.isArray(result.notes);
        notes = normalizeNotes(result.notes, result.content);
        activeNote = Number.isInteger(result.activeNote)
          ? Math.min(Math.max(result.activeNote, 0), NOTE_COUNT - 1)
          : 0;
        if (migratingNotes) {
          persistNotes();
          persistActiveNote();
        }

        // Theme
        if (result.theme) {
          document.body.classList.remove("dark-mode", "light-mode");
          if (result.theme === "dark") {
            document.body.classList.add("dark-mode");
            if (darkRadio) darkRadio.checked = true;
          } else if (result.theme === "light") {
            document.body.classList.add("light-mode");
            if (lightRadio) lightRadio.checked = true;
          } else if (systemRadio) {
            systemRadio.checked = true;
          }
        }

        applyTextSize(resolveTextSize(result));
        applyEditorFont(result.editorFont || "sans");

        currentSpellcheck =
          result.spellCheck !== undefined ? result.spellCheck : true;
        if (spellCheckCheckbox) spellCheckCheckbox.checked = currentSpellcheck;

        plainPasteEnabled = result.plainPaste !== false;
        if (plainPasteCheckbox) plainPasteCheckbox.checked = plainPasteEnabled;

        wordCountEnabled = result.wordCount === true;
        if (wordCountCheckbox) wordCountCheckbox.checked = wordCountEnabled;

        const finishLoad = () => {
          initEditor();
          revealRestoreIfBackup();
          // Count this session and maybe surface the review prompt.
          const sessionCount = (result.sessionCount || 0) + 1;
          try {
            chrome.storage.local.set({ sessionCount });
          } catch (e) {}
          maybeShowReview(result, sessionCount);
        };

        // Rich-text (TipTap) migration — runs once, and only AFTER a backup of
        // the originals is safely written. If the backup can't be written, we
        // do not migrate over the originals (and surface a save error).
        if (result[RICH_FLAG]) {
          finishLoad();
          return;
        }
        const hadContent = notes.some((n) => n.content && n.content.trim());
        if (!hadContent) {
          try {
            chrome.storage.local.set({ [RICH_FLAG]: true });
          } catch (e) {}
          finishLoad();
          return;
        }
        backupNotesOnce(chrome.storage.local, notes, (ok) => {
          if (ok) {
            notes = notes.map((n) => ({
              content: migrateLegacyHTML(n.content),
              name: n.name,
            }));
            persistNotes();
            try {
              chrome.storage.local.set({ [RICH_FLAG]: true });
            } catch (e) {}
            showUpgradeNotice();
          } else {
            // Couldn't back up — keep originals untouched; retry on next load.
            setSaveStatus("error");
          }
          finishLoad();
        });
      }
    );
  };

  // ---- Session analytics --------------------------------------------------
  sessionStartTime = Date.now();
  sendAnalyticsEvent("session_started", {
    timestamp: new Date().toISOString(),
  });
  chrome.storage.local.get(["lastOpenMethod"], (result) => {
    if (result.lastOpenMethod) {
      sendAnalyticsEvent("panel_opened", { method: result.lastOpenMethod });
      chrome.storage.local.remove("lastOpenMethod");
    }
  });

  // ---- Settings modal -----------------------------------------------------
  if (helpButton)
    helpButton.addEventListener("click", () => {
      modal.style.display = "block";
      sendAnalyticsEvent("help_opened");
    });
  if (closeButton)
    closeButton.addEventListener("click", () => {
      modal.style.display = "none";
    });
  window.addEventListener("click", (event) => {
    if (event.target === modal) modal.style.display = "none";
  });

  const applyTheme = (theme) => {
    document.body.classList.remove("dark-mode", "light-mode");
    if (theme === "dark") document.body.classList.add("dark-mode");
    else if (theme === "light") document.body.classList.add("light-mode");
  };
  document.querySelectorAll('input[name="theme"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      const selected = document.querySelector(
        'input[name="theme"]:checked'
      ).value;
      applyTheme(selected);
      try {
        chrome.storage.local.set({ theme: selected });
      } catch (e) {}
      sendAnalyticsEvent("theme_changed", { theme: selected });
    });
  });

  textSizeRadios.forEach((radio) => {
    radio.addEventListener("change", () => {
      const size = document.querySelector(
        'input[name="text-size"]:checked'
      ).value;
      applyTextSize(size);
      try {
        chrome.storage.local.set({ textSize: size });
      } catch (e) {}
      sendAnalyticsEvent("setting_changed", {
        setting: "textSize",
        value: `text size: ${size}`,
      });
    });
  });

  editorFontRadios.forEach((radio) => {
    radio.addEventListener("change", () => {
      const font = document.querySelector(
        'input[name="editor-font"]:checked'
      ).value;
      applyEditorFont(font);
      try {
        chrome.storage.local.set({ editorFont: font });
      } catch (e) {}
      sendAnalyticsEvent("setting_changed", {
        setting: "editorFont",
        value: `editor font: ${font}`,
      });
    });
  });

  if (spellCheckCheckbox)
    spellCheckCheckbox.addEventListener("change", () => {
      setSpellcheck(spellCheckCheckbox.checked);
      try {
        chrome.storage.local.set({ spellCheck: spellCheckCheckbox.checked });
      } catch (e) {}
      sendAnalyticsEvent("setting_changed", {
        setting: "spellCheck",
        value: `spell check: ${spellCheckCheckbox.checked}`,
      });
    });

  if (plainPasteCheckbox)
    plainPasteCheckbox.addEventListener("change", () => {
      plainPasteEnabled = plainPasteCheckbox.checked;
      try {
        chrome.storage.local.set({ plainPaste: plainPasteEnabled });
      } catch (e) {}
    });

  if (wordCountCheckbox)
    wordCountCheckbox.addEventListener("change", () => {
      wordCountEnabled = wordCountCheckbox.checked;
      try {
        chrome.storage.local.set({ wordCount: wordCountEnabled });
      } catch (e) {}
      updateWordCount();
    });

  sendAnalyticsEvent("page_view", {
    page_title: document.title,
    page_location: document.location.href,
  });

  // Track outbound link clicks in the settings sheet.
  document.querySelectorAll(".ga-track-link").forEach((link) => {
    link.addEventListener("click", (event) => {
      const el = event.currentTarget;
      sendAnalyticsEvent("link_click", {
        event_category: el.getAttribute("data-ga-category"),
        event_action: el.getAttribute("data-ga-action"),
        event_label: el.getAttribute("data-ga-label"),
      });
    });
  });
});

window.addEventListener("error", (event) => {
  sendAnalyticsEvent("error_occurred", {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
  });
});
