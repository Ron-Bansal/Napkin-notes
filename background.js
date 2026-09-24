// background.js
import { sendAnalyticsEvent } from "./analytics.js";

const LOG = "[Napkin]";

// ---------------------------------------------------------------------------
// Open routing
//
// Chrome / Edge / Brave / Opera render the native `chrome.sidePanel` UI, so we
// keep the exact original behaviour there. Arc is also Chromium and *exposes*
// `chrome.sidePanel`, but has no side-panel UI — calling open() there silently
// does nothing. So we can't feature-detect by API presence; we detect the
// browser itself (Arc injects `--arc-palette-*` CSS variables into every page),
// cache the result, and route those browsers to an injected iframe overlay,
// falling back to a detached popup window on pages where scripts can't run
// (chrome:// pages, the Web Store, the PDF viewer, etc.).
//
// All fallbacks reuse the same `sidepanel.html`, so notes and preferences read
// from and write to the same `chrome.storage.local` — no data path changes.
// ---------------------------------------------------------------------------

const CACHE_KEY = "napkinUsesFallback"; // true = overlay/window, false = native

const hasNativeSidePanelApi = () =>
  typeof chrome !== "undefined" &&
  chrome.sidePanel &&
  typeof chrome.sidePanel.open === "function";

// In-memory cache of settings so routeOpen can decide synchronously (required
// because chrome.sidePanel.open() must be called within the user gesture).
let memOpenMode = "auto";
let memUsesFallback = undefined; // true/false/undefined

// Hydrate on service worker start.
chrome.storage.local.get([CACHE_KEY, "napkinOpenMode"], (res) => {
  if (res.napkinOpenMode) memOpenMode = res.napkinOpenMode;
  if (typeof res[CACHE_KEY] === "boolean") memUsesFallback = res[CACHE_KEY];
  console.log(LOG, "settings hydrated", { memOpenMode, memUsesFallback });
});

// Keep in sync when settings change from the panel.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.napkinOpenMode) memOpenMode = changes.napkinOpenMode.newValue || "auto";
  if (changes[CACHE_KEY]) memUsesFallback = changes[CACHE_KEY].newValue;
});

// Entry point for both the icon click and the keyboard command.
// MUST stay synchronous through the openNative path so Chrome sees the user gesture.
function routeOpen(tab) {
  const tabId = tab && tab.id;
  console.log(LOG, "routeOpen", { tabId, hasNativeApi: hasNativeSidePanelApi(), memOpenMode, memUsesFallback });

  // Explicit modes bypass all detection.
  if (memOpenMode === "overlay") return openOverlay(tab);
  if (memOpenMode === "window") {
    chrome.tabs.create({ url: chrome.runtime.getURL("sidepanel.html") });
    return;
  }

  // --- Auto mode: native when available, overlay on Arc, window as last resort.

  // 1) Use the in-memory cached decision (no async, preserves user gesture).
  if (memUsesFallback === true) {
    console.log(LOG, "cached -> fallback");
    return openOverlay(tab);
  }
  if (memUsesFallback === false && hasNativeSidePanelApi() && tabId != null) {
    console.log(LOG, "cached -> native");
    return openNative(tab);
  }

  // 2) No cached decision yet. Open overlay first (works everywhere including
  //    Arc where native silently fails), then probe Arc in background. If the
  //    probe can't run (restricted page), assume not-Arc so next click uses native.
  openOverlay(tab);
  if (hasNativeSidePanelApi() && tabId != null) {
    detectArc(tabId).then((isArc) => {
      console.log(LOG, "detectArc ->", isArc);
      const val = isArc === true;
      memUsesFallback = val;
      try { chrome.storage.local.set({ [CACHE_KEY]: val }); } catch (e) {}
    });
  }
  return;
}

// Runs in the page. Arc exposes `--arc-palette-*` custom properties on the root
// element; regular Chromium does not. Returns true/false, or null if it can't run.
function detectArcBrowser() {
  try {
    const root = document.documentElement;
    const styles = getComputedStyle(root);
    const probes = [
      "--arc-palette-title",
      "--arc-palette-background",
      "--arc-palette-foreground",
      "--arc-background-simple-color",
    ];
    return probes.some((name) => {
      const v = styles.getPropertyValue(name);
      return v && v.trim().length > 0;
    });
  } catch (e) {
    return false;
  }
}

async function detectArc(tabId) {
  if (!chrome.scripting || tabId == null) return null;
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: detectArcBrowser,
    });
    if (results && results[0] && typeof results[0].result === "boolean") {
      return results[0].result;
    }
    return null;
  } catch (e) {
    // Restricted page (chrome://, Web Store, PDF viewer, etc.)
    console.log(LOG, "detectArc could not run:", e && e.message);
    return null;
  }
}

async function openNative(tab) {
  const tabId = tab && tab.id;
  try {
    await chrome.sidePanel.open({ tabId });
    console.log(LOG, "native side panel opened");
  } catch (e) {
    console.error(LOG, "native open failed:", e);
    openOverlay(tab);
  }
}

async function openOverlay(tab) {
  const tabId = tab && tab.id;
  const url = chrome.runtime.getURL("sidepanel.html");

  let width = 384;
  let theme = "system";
  try {
    const stored = await chrome.storage.local.get(["napkinOverlayWidth", "theme"]);
    if (typeof stored.napkinOverlayWidth === "number") {
      width = stored.napkinOverlayWidth;
    }
    if (stored.theme) theme = stored.theme;
  } catch (e) {}

  if (chrome.scripting && tabId != null) {
    chrome.scripting.executeScript(
      {
        target: { tabId },
        func: toggleNapkinOverlay,
        args: [url, width, theme],
      },
      () => {
        if (chrome.runtime.lastError) {
          console.log(
            LOG,
            "overlay inject blocked, using window:",
            chrome.runtime.lastError.message
          );
          openPopupWindow(url);
        } else {
          console.log(LOG, "overlay toggled");
        }
      }
    );
  } else {
    openPopupWindow(url);
  }
}

// Reuse a single popup window rather than spawning a new one each time.
let overlayWindowId = null;

function openPopupWindow(url) {
  if (overlayWindowId != null) {
    chrome.windows.update(overlayWindowId, { focused: true }, () => {
      if (chrome.runtime.lastError) {
        overlayWindowId = null;
        createPopupWindow(url);
      }
    });
    return;
  }
  createPopupWindow(url);
}

function createPopupWindow(url) {
  chrome.windows.create(
    { url, type: "popup", width: 400, height: 640 },
    (win) => {
      if (chrome.runtime.lastError || !win) {
        console.error(LOG, chrome.runtime.lastError);
        return;
      }
      overlayWindowId = win.id;
    }
  );
}

chrome.windows.onRemoved.addListener((windowId) => {
  if (windowId === overlayWindowId) {
    overlayWindowId = null;
  }
});

// ---------------------------------------------------------------------------
// Injected overlay
//
// Serialized and executed in the page (isolated world). No access to module
// scope — everything comes through `iframeUrl`. Re-running toggles it.
// ---------------------------------------------------------------------------
function toggleNapkinOverlay(iframeUrl, initialWidth, themePref) {
  const ROOT_ID = "napkin-notes-overlay-root";
  const WIDTH_KEY = "napkinOverlayWidth";
  const MIN_W = 300;
  const MAX_W = 720;

  const reduceMotion = (() => {
    try {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (e) {
      return false;
    }
  })();
  const DUR = reduceMotion ? 0 : 280;

  const clampWidth = (w) =>
    Math.max(MIN_W, Math.min(MAX_W, Math.min(w, Math.floor(window.innerWidth * 0.9))));

  const applyImportant = (el, obj) => {
    for (const k in obj) el.style.setProperty(k, obj[k], "important");
  };

  function closeOverlay(node) {
    if (node.__closing) return;
    node.__closing = true;
    if (node.__cleanup) node.__cleanup();
    node.style.setProperty(
      "transition",
      "transform " + DUR + "ms cubic-bezier(0.4, 0, 0.2, 1)",
      "important"
    );
    node.style.setProperty("transform", "translateX(106%)", "important");
    if (DUR === 0) {
      node.remove();
      return;
    }
    let removed = false;
    const finish = () => {
      if (removed) return;
      removed = true;
      node.remove();
    };
    node.addEventListener("transitionend", finish, { once: true });
    setTimeout(finish, DUR + 120); // safety net if transitionend doesn't fire
  }

  // Toggle: if it's already open, animate it out.
  const existing = document.getElementById(ROOT_ID);
  if (existing) {
    closeOverlay(existing);
    return;
  }

  let width = clampWidth(typeof initialWidth === "number" ? initialWidth : 384);

  const root = document.createElement("div");
  root.id = ROOT_ID;
  applyImportant(root, {
    position: "fixed",
    top: "0",
    right: "0",
    height: "100vh",
    width: width + "px",
    "z-index": "2147483647",
    border: "0",
    margin: "0",
    padding: "0",
    "box-shadow": "-8px 0 30px rgba(0, 0, 0, 0.16)",
    transform: "translateX(106%)",
  });

  const shadow = root.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = [
    ":host, * { box-sizing: border-box; }",
    // Fallback tokens for first paint; overridden from the saved Napkin theme.
    ":host { --np-bg: #f5f6f7; --np-text: #2b2d33; --np-border: rgba(0,0,0,0.10); --np-hover: #eceef0; }",
    "@media (prefers-color-scheme: dark) { :host { --np-bg: #16171d; --np-text: #e9eaee; --np-border: rgba(255,255,255,0.12); --np-hover: #1e2027; } }",
    ".wrap { position: relative; width: 100%; height: 100%; background: transparent; }",
    ".frame { width: 100%; height: 100%; border: 0; background: var(--np-bg); display: block; }",
    ".handle { position: absolute; top: 0; left: 0; width: 10px; height: 100%; cursor: col-resize; display: flex; align-items: center; justify-content: center; touch-action: none; }",
    ".handle::before { content: ''; width: 3px; height: 44px; border-radius: 3px; background: rgba(120, 120, 120, 0.35); transition: background 0.18s ease, height 0.18s ease; }",
    ".handle:hover::before { background: rgba(120, 120, 120, 0.7); height: 68px; }",
    // A tab hanging from the top-left of the panel. Shadow uses a negative
    // spread so it stays on the left edge and never bleeds onto the panel.
    ".close { position: absolute; top: 0; left: -33px; width: 33px; height: 58px; display: flex; align-items: center; justify-content: center; padding: 0; cursor: pointer; border: 1px solid var(--np-border); border-top: 0; border-right: 0; border-radius: 0 0 0 14px; background: var(--np-bg); color: var(--np-text); box-shadow: -3px 0 10px -6px rgba(0, 0, 0, 0.30); opacity: 0; transform: translateX(10px); transition: opacity 0.25s ease, transform 0.28s cubic-bezier(0.16, 1, 0.3, 1), background 0.18s ease; }",
    ".close:hover { background: var(--np-hover); }",
    ".close:active { background: var(--np-hover); }",
    ".close.show { opacity: 1; transform: translateX(0); }",
    ".close svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; }",
    ".close::after { content: 'Close panel'; position: absolute; top: calc(100% + 6px); left: 50%; transform: translateX(-50%) translateY(2px); background: var(--np-text); color: var(--np-bg); font-family: -apple-system, system-ui, sans-serif; font-size: 11px; font-weight: 500; padding: 4px 8px; border-radius: 6px; white-space: nowrap; opacity: 0; visibility: hidden; transition: opacity 0.2s ease, transform 0.2s ease; pointer-events: none; z-index: 50; }",
    ".close:hover::after { opacity: 1; visibility: visible; transform: translateX(-50%) translateY(0); }",
    "@media (prefers-reduced-motion: reduce) { * { transition: none !important; } }",
  ].join("\n");

  const wrap = document.createElement("div");
  wrap.className = "wrap";

  const iframe = document.createElement("iframe");
  iframe.className = "frame";
  iframe.src = iframeUrl;
  iframe.setAttribute("title", "Napkin Notes");

  const handle = document.createElement("div");
  handle.className = "handle";
  handle.setAttribute("aria-label", "Resize Napkin Notes");

  const closeBtn = document.createElement("button");
  closeBtn.className = "close";
  closeBtn.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  closeBtn.setAttribute("aria-label", "Close Napkin Notes");
  closeBtn.addEventListener("click", () => closeOverlay(root));

  wrap.appendChild(iframe);
  wrap.appendChild(handle);
  wrap.appendChild(closeBtn);
  shadow.appendChild(style);
  shadow.appendChild(wrap);
  document.documentElement.appendChild(root);

  // Tint the panel + close tab to match the user's Napkin theme (same colour
  // as behind the editor), so the tab reads as part of the panel, not the page.
  // themePref comes from the service worker; "system" resolves via matchMedia.
  const prefersDark =
    themePref === "dark" ||
    ((!themePref || themePref === "system") &&
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  const c = prefersDark
    ? { bg: "#16171d", text: "#e9eaee", border: "rgba(255,255,255,0.12)", hover: "#1e2027" }
    : { bg: "#f5f6f7", text: "#2b2d33", border: "rgba(0,0,0,0.10)", hover: "#eceef0" };
  root.style.setProperty("--np-bg", c.bg);
  root.style.setProperty("--np-text", c.text);
  root.style.setProperty("--np-border", c.border);
  root.style.setProperty("--np-hover", c.hover);

  // Slide in on the next frame so the initial off-screen transform is painted.
  requestAnimationFrame(() => {
    root.style.setProperty(
      "transition",
      "transform " + DUR + "ms cubic-bezier(0.16, 1, 0.3, 1)",
      "important"
    );
    root.style.setProperty("transform", "translateX(0)", "important");
    closeBtn.classList.add("show");
  });

  // Drag-to-resize.
  let dragging = false;
  let startX = 0;
  let startW = 0;

  const onPointerMove = (e) => {
    if (!dragging) return;
    const delta = startX - e.clientX; // dragging left widens the panel
    width = clampWidth(startW + delta);
    root.style.setProperty("width", width + "px", "important");
  };

  const onPointerUp = () => {
    if (!dragging) return;
    dragging = false;
    iframe.style.pointerEvents = "";
    if (document.body) document.body.style.userSelect = "";
    try {
      chrome.storage.local.set({ [WIDTH_KEY]: width });
    } catch (e) {}
  };

  handle.addEventListener("pointerdown", (e) => {
    dragging = true;
    startX = e.clientX;
    startW = root.getBoundingClientRect().width;
    // Kill the transition and let the iframe ignore the mouse while dragging.
    root.style.setProperty("transition", "none", "important");
    iframe.style.pointerEvents = "none";
    if (document.body) document.body.style.userSelect = "none";
    e.preventDefault();
  });

  document.addEventListener("pointermove", onPointerMove, true);
  document.addEventListener("pointerup", onPointerUp, true);

  const keyHandler = (event) => {
    if (event.key === "Escape") closeOverlay(root);
  };
  document.addEventListener("keydown", keyHandler, true);

  // Everything to unhook when the panel closes.
  root.__cleanup = () => {
    document.removeEventListener("pointermove", onPointerMove, true);
    document.removeEventListener("pointerup", onPointerUp, true);
    document.removeEventListener("keydown", keyHandler, true);
  };
}

// ---------------------------------------------------------------------------
// Event wiring
// ---------------------------------------------------------------------------

// Keyboard command
chrome.commands.onCommand.addListener((command) => {
  console.log(LOG, "command:", command);
  if (
    command === "open-side-panel" ||
    command === "open-side-panel-secondary"
  ) {
    chrome.storage.local.set({ lastOpenMethod: "keyboard_shortcut" });
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0) {
        routeOpen(tabs[0]);
      } else {
        console.error(LOG, "No active tab found.");
      }
    });
  }
});

// Toolbar icon click
chrome.action.onClicked.addListener((tab) => {
  console.log(LOG, "action click", tab && tab.id);
  chrome.storage.local.set({ lastOpenMethod: "icon_click" });
  if (tab && tab.id != null) {
    routeOpen(tab);
  } else {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0) routeOpen(tabs[0]);
    });
  }
});

// Eagerly probe for Arc on any available tab so the cache is warm before the
// user's first click. Runs on startup and on install/update.
function probeArcEagerly() {
  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    const tab = tabs && tabs[0];
    if (!tab || tab.id == null) return;
    const isArc = await detectArc(tab.id);
    console.log(LOG, "eager Arc probe ->", isArc);
    const val = isArc === true;
    memUsesFallback = val;
    try { chrome.storage.local.set({ [CACHE_KEY]: val }); } catch (e) {}
  });
}

// Probe on service worker start (covers restarts / reloads).
probeArcEagerly();

chrome.runtime.onInstalled.addListener((details) => {
  console.log(LOG, "Extension installed:", details.reason);
  // Re-probe Arc on install/update so the cache is fresh.
  chrome.storage.local.remove(CACHE_KEY);
  memUsesFallback = undefined;
  probeArcEagerly();

  // Right-click context menu on the extension icon.
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "napkin-open-tab",
      title: "Open in New Tab",
      contexts: ["action"],
    });
  });

  sendAnalyticsEvent("extension_installed");
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === "napkin-open-tab") {
    chrome.tabs.create({ url: chrome.runtime.getURL("sidepanel.html") });
  }
});

// Track unhandled errors
addEventListener("unhandledrejection", async (event) => {
  sendAnalyticsEvent("extension_error", {
    message: event.reason && event.reason.message,
    stack: event.reason && event.reason.stack,
  });
});

// Keep the service worker alive
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "KEEP_ALIVE") {
    sendResponse({ status: "alive" });
  }
  return true; // Response may be sent asynchronously
});

console.log(LOG, "service worker loaded");
