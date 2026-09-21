// Migration + backup helpers for the move to the rich (TipTap) editor.

// Rewrite legacy markup so TipTap parses it correctly. The only special case is
// the old <mark> section-header block, which becomes a real <h3>. Everything
// else (<b>/<i>/<u>/<s>/<hr>/<br>) is parsed by TipTap's default extensions.
export function migrateLegacyHTML(html) {
  if (typeof html !== "string" || !html) return "";
  let out = html;
  // <mark ...>text</mark>  ->  <h3>text</h3>
  out = out.replace(/<mark\b[^>]*>([\s\S]*?)<\/mark>/gi, "<h3>$1</h3>");
  return out;
}

// One-time backup of every note's pre-migration content. Calls done(true) once
// a backup is safely in place (either already present, or freshly written), and
// done(false) only if the write itself failed — so the caller can refuse to
// migrate over originals it couldn't back up.
export function backupNotesOnce(local, notes, done) {
  local.get(["notesBackupV3"], (res) => {
    if (res && res.notesBackupV3) {
      done(true); // a backup already exists — safe to proceed
      return;
    }
    const snapshot = {
      at: new Date().toISOString(),
      notes: (notes || []).map((n) => ({
        content: (n && n.content) || "",
        name: (n && n.name) || "",
      })),
    };
    local.set({ notesBackupV3: snapshot }, () => {
      const err =
        typeof chrome !== "undefined" &&
        chrome.runtime &&
        chrome.runtime.lastError;
      done(!err);
    });
  });
}
