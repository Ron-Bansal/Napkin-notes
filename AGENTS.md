# Napkin Notes — developer & agent guide

A Chrome/Chromium **side‑panel notes** extension (Manifest V3). Open a panel from
any tab (toolbar icon or `Alt+X`) and capture rich‑text notes without leaving the
page. This file is the pick‑up‑later context: architecture, workflow, data model,
gotchas, and enhancement ideas.

## Product principle (read before adding features)

The wedge is **speed and simplicity** — the fastest distance between a thought and
it being saved, without leaving what you're doing. Guard that. It is *not* a
"second brain." Resist folders/tags/search/unlimited notes and anything that slows
capture. Additive polish and light structure (lists, links, a few notes) — yes.
Notion‑creep — no.

---

## Repo layout

```
manifest.json        MV3 manifest (name, permissions, side_panel, commands, WAR)
background.js        Service worker — open routing + Arc overlay (NOT bundled)
sidepanel.html       Panel markup; loads the built sidepanel.js (classic script)
sidepanel.js         BUILT bundle (esbuild output — do not edit by hand)
styles.css           All styles (design tokens + components)
analytics.js         Google Analytics (guarded); imported by background + main
popup.html           Unused action popup (no default_popup set); kept minimal
privacy-policy.html  Privacy policy (required by the store because of analytics)
assets/              Icons + a couple of SVGs (menu icon, etc.)
src/                 Source for the bundle:
  main.js            App controller (settings, notes, save, migration, review)
  editor.js          TipTap editor + extensions + bubble menu + paste handling
  migration.js       Legacy‑HTML → TipTap migration + backup helpers
  analytics.js       Copy of analytics.js so the bundle can import it
build.mjs            esbuild build (src/main.js → sidepanel.js, IIFE, minified)
package.json         scripts: `build`, `watch`
```

`background.js` is a raw ES‑module service worker (imports `./analytics.js`
directly). Only the **side panel** is bundled.

---

## Build & dev workflow

```bash
npm install
npm run build        # src/ -> sidepanel.js (commit the built bundle)
npm run watch        # rebuild on change during dev
```

Load unpacked: `chrome://extensions` (or `arc://extensions`) → Developer mode →
Load unpacked → select the repo folder. After a rebuild, hit the extension's
reload icon.

- The built `sidepanel.js` **is committed** so the extension loads without a build
  step. Always `npm run build` before committing changes to `src/`.
- MV3 CSP forbids remote code and `eval` — TipTap is **bundled locally**. Never
  add a CDN `<script>`. Verify a build has no `eval(`/`new Function(` before ship.
- `node_modules/` is gitignored.

---

## Architecture

### Open routing (`background.js`)
Feature‑detects how to show the panel:
1. **Native** `chrome.sidePanel` (Chrome/Edge/Brave) — unchanged path.
2. **Injected overlay** for Arc etc. Arc *exposes* `chrome.sidePanel` but it's a
   no‑op, so we can't detect by API presence — we detect **Arc via its
   `--arc-palette-*` CSS variables** (probed with `chrome.scripting`) and **cache**
   the decision (`napkinUsesFallback`). The overlay is an `<iframe src=sidepanel.html>`
   in a shadow DOM, drag‑resizable (remembered width), with a theme‑matched close
   tab. Uses `activeTab` + `scripting` (granted on click/shortcut, **no host
   permissions** → existing users aren't re‑prompted).
3. **Popup window** fallback on pages where content scripts can't run (`chrome://`,
   Web Store, PDF viewer).

The close‑tab colours are resolved in the SW (reliable `chrome.storage`) from the
saved `theme` and passed to the injected function.

### Editor (`src/editor.js`)
One TipTap `Editor`, `setContent()` on note switch. Extensions:
- StarterKit (bold/italic/strike/lists/hr/history…) with `heading/underline/link`
  disabled and re‑added explicitly.
- **Custom heading** = the section header. Input rule `^(#{1,3}|!!!)\s$` → `<h3>`.
- Underline, Link (openOnClick, autolink, linkOnPaste, safe rel/target), Image
  (`allowBase64`), TaskList/TaskItem (checkboxes; `[ ] ` input rule + `Mod-Shift-9`),
  CharacterCount (word count), Placeholder, BubbleMenu.
- **Bubble menu** is built in JS (monochrome SVG icons), mounted by tippy — do
  **not** append it to the DOM yourself (tippy owns mounting), and it lives on
  `<body>` so it's never clipped. `syncBubbleActive` toggles `.is-active`.
- **Paste**: images → inline base64; else, if "paste as plain text" is on, strip to
  text with hard breaks.

### App controller (`src/main.js`)
Settings (theme/font/size/spellcheck/plain‑paste/word‑count), the **three‑note
model**, save, migration, and the review prompt. Notable:
- **Save is debounced (~400 ms)** and checks `chrome.runtime.lastError`; on failure
  it shows a subtle red **"Couldn't save"** dot where "Saving…" lives. Switching a
  note flushes/persists immediately so text is never lost mid‑debounce.
- Keyboard: `Alt+1/2/3` jump, `Alt+←/→` cycle notes (matched on **`e.code`**, not
  `e.key`, because macOS `Option+1` yields `¡`), `Alt+Shift+S` strike, `Cmd/Ctrl+K`
  link. Double‑click a tab to rename (16‑char cap).

### Formatting vocabulary → CSS
`<h3>` = green section‑header block · `<strong>` = green · `<em>` = highlight ·
`<u>` = red · `<s>` = strike. Styled under `.np-prose …` in `styles.css`. Legacy
`b/i/u/mark` selectors are kept for safety.

---

## Data model (chrome.storage.local)

Notes are **local only** (no sync — see gotchas). Keys:

| Key | Meaning |
|---|---|
| `notes` | `[{content:HTML, name}, ×3]` — the three note slots |
| `activeNote` | index 0–2 |
| `content` | **legacy** single note; frozen at migration as a backup — do not delete |
| `richMigrated` | flag: TipTap migration done (once) |
| `notesBackupV3` | pre‑migration snapshot `{at, notes:[…]}` for Restore |
| `migrationComplete` | flag: old sync→local migration done |
| `theme` `textSize` `editorFont` `spellCheck` `plainPaste` `wordCount` | prefs |
| `sessionCount` | increments per panel open (review trigger) |
| `reviewState` `reviewAsks` `reviewLastAskedAt` | review‑prompt state |
| `napkinOverlayWidth` `napkinUsesFallback` | Arc overlay width + routing cache |
| `lastOpenMethod` | analytics: how the panel was opened |
| `clientId` (+ session) | GA identifiers |

### Migration (safe, one‑way, auto)
On first 3.0 load, if `richMigrated` is unset and any note has content:
**write `notesBackupV3` FIRST**, and only migrate if that write succeeded; then
rewrite each note's HTML (`<mark>`→`<h3>`; `b/i/u/s/hr/br` parse natively) and set
`richMigrated`. Show the one‑time upgrade notice. New users skip it. **Settings →
Restore original notes** recovers from `notesBackupV3`. Images (`<img src=data:…>`)
carry over via the Image extension.

### Review prompt (two‑step, capped)
Shows ~1.2 s after load only when: `sessionCount ≥ 6` **and** a note has >40 chars
**and** not `done` **and** `reviewAsks < 3` **and** ≥45‑day cooldown **and** the
upgrade notice isn't showing. Yes → store rating; Not really → feedback email.
Stops forever on rate/feedback or after 3 asks.

---

## Gotchas

- **Rebuild after editing `src/`** and commit the new `sidepanel.js`.
- **Store submission:** keep `manifest.json` clean — **no `update_url`** in the
  uploaded zip; version must increase. **Don't list browser names** in the
  description (flagged as keyword spam). Privacy policy URL is **required** (GA);
  host `privacy-policy.html` and declare it in the dashboard's Privacy tab.
- **Permissions rationale** (for dashboard): `storage`/`unlimitedStorage` = notes
  incl. images without a cap; `sidePanel` = the panel; `activeTab`+`scripting` =
  overlay panel on browsers without a native side panel.
- **No `chrome.storage.sync`** — it has an ~8 KB/item, ~100 KB total cap and fails
  silently on oversized writes (this caused past data loss). Local + `unlimitedStorage`
  is deliberate. Real cross‑device sync needs a backend, not `sync`.
- **Testing:** browser automation can't trigger ProseMirror input rules or grant
  real editor focus, so verify those by hand. A `window.__napkinEditor` hook exists
  only when `window.__NAPKIN_TEST__` is set (never in production). The `_test.html`
  harness pattern: stub `chrome` (async callbacks!) + `document.write` the panel body
  + load the built bundle.
- **Rollback ≠ restore.** Updates/downgrades never wipe `storage.local`, but each
  version only reads keys it knows (2.x reads `content`; 3.0 reads `notes`). Recovery
  path is the in‑app Restore, not a store rollback.

## Release checklist

1. Bump `manifest.json` version.
2. `npm run build`; sanity‑check the bundle (no `eval`).
3. Zip runtime files only:
   `zip -r napkin-notes-X.Y.Z.zip . -x 'node_modules/*' 'src/*' '.git/*' 'build.mjs' 'package*.json' '.gitignore' 'README.md' 'AGENTS.md' '*.zip'`
4. Dashboard: permission justifications, data disclosure (User activity via GA;
   notes stay local), privacy‑policy URL, refreshed screenshots. Consider a
   **partial rollout %** and/or **trusted testers** to verify live before 100%.

## Enhancement ideas (from prior product discussion)

- **Pro tier** (one‑time; client‑side, no server cost): more/unlimited notes,
  **local note history/restore**, personalization (accent colour/themes), export
  (Markdown/PDF). Payments need an external processor + license (ExtensionPay/Gumroad)
  — the store dropped built‑in payments. Never paywall the core wedge.
- **Image downscaling on paste** (canvas resize) to keep storage lean.
- **Cross‑device sync** — highest user want; needs a backend, Pro‑gated.
- **Onboarding**: seed a small example note (checklist/link) for new users.
- **Instrumentation**: track activation (wrote a note?), day‑2/7 retention, feature
  adoption — build against real usage.
```
