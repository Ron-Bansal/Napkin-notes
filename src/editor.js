// TipTap editor setup for Napkin Notes.
import { Editor, wrappingInputRule, textblockTypeInputRule } from "@tiptap/core";
import { Fragment, Slice } from "@tiptap/pm/model";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import CharacterCount from "@tiptap/extension-character-count";
import Placeholder from "@tiptap/extension-placeholder";
import Heading from "@tiptap/extension-heading";
import BubbleMenu from "@tiptap/extension-bubble-menu";

// Section header (h3): standard "#"/"##"/"###" markdown, plus the legacy "!!!".
const SectionHeading = Heading.extend({
  addInputRules() {
    return [
      textblockTypeInputRule({
        find: /^(#{1,3}|!!!)\s$/,
        type: this.type,
        getAttributes: { level: 3 },
      }),
    ];
  },
}).configure({ levels: [3] });

// Checkboxes via "[] " / "[ ] " / "[x] ", plus a shortcut.
const CheckList = TaskList.extend({
  addInputRules() {
    return [wrappingInputRule({ find: /^\s*\[( |x|X)?\]\s$/, type: this.type })];
  },
  addKeyboardShortcuts() {
    return { "Mod-Shift-9": () => this.editor.commands.toggleTaskList() };
  },
});

export function promptForLink(editor) {
  if (!editor) return;
  const previous = editor.getAttributes("link").href || "";
  const url = window.prompt("Link URL", previous);
  if (url === null) return;
  if (url === "") {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    return;
  }
  const href = /^(https?:|mailto:)/i.test(url) ? url : "https://" + url;
  editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
}

// Clean monochrome line icons (Lucide-style), stroked with currentColor.
const svg = (inner) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
const ICONS = {
  bold: svg('<path d="M7 5h6a3.5 3.5 0 0 1 0 7H7z"/><path d="M7 12h7a3.5 3.5 0 0 1 0 7H7z"/>'),
  italic: svg('<line x1="19" y1="5" x2="11" y2="5"/><line x1="13" y1="19" x2="5" y2="19"/><line x1="15" y1="5" x2="9" y2="19"/>'),
  underline: svg('<path d="M7 5v6a5 5 0 0 0 10 0V5"/><line x1="5" y1="20" x2="19" y2="20"/>'),
  strike: svg('<line x1="4" y1="12" x2="20" y2="12"/><path d="M16 6.5A4 4 0 0 0 12 4c-2.5 0-4 1.4-4 3.2"/><path d="M8.5 17A4 4 0 0 0 12 19c2.5 0 4-1.4 4-3.2"/>'),
  link: svg('<path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1-1"/>'),
  h3: svg('<path d="M6 5v14"/><path d="M15 5v14"/><path d="M6 12h9"/>'),
  bullet: svg('<line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>'),
  check: svg('<line x1="10" y1="7" x2="20" y2="7"/><line x1="10" y1="17" x2="20" y2="17"/><path d="M3 7l1.6 1.6L7.5 5.5"/><path d="M3 17l1.6 1.6L7.5 15.5"/>'),
};

// Floating format toolbar (appended to <body> so it is never clipped).
function buildBubbleMenu(getEditor) {
  const el = document.createElement("div");
  el.className = "np-bubble";
  const items = [
    ["bold", "Bold"],
    ["italic", "Italic"],
    ["underline", "Underline"],
    ["strike", "Strikethrough"],
    ["|", ""],
    ["h3", "Header"],
    ["bullet", "Bullet list"],
    ["check", "Checklist"],
    ["link", "Link"],
  ];
  items.forEach(([cmd, label]) => {
    if (cmd === "|") {
      const sep = document.createElement("span");
      sep.className = "np-bubble-sep";
      el.appendChild(sep);
      return;
    }
    const b = document.createElement("button");
    b.type = "button";
    b.className = "np-bubble-btn";
    b.dataset.cmd = cmd;
    b.title = label;
    b.setAttribute("aria-label", label);
    b.innerHTML = ICONS[cmd] || "";
    b.addEventListener("mousedown", (e) => e.preventDefault()); // keep selection
    b.addEventListener("click", () => {
      const ed = getEditor();
      if (!ed) return;
      const c = ed.chain().focus();
      if (cmd === "bold") c.toggleBold().run();
      else if (cmd === "italic") c.toggleItalic().run();
      else if (cmd === "underline") c.toggleUnderline().run();
      else if (cmd === "strike") c.toggleStrike().run();
      else if (cmd === "link") promptForLink(ed);
      else if (cmd === "h3") c.toggleHeading({ level: 3 }).run();
      else if (cmd === "bullet") c.toggleBulletList().run();
      else if (cmd === "check") c.toggleTaskList().run();
    });
    el.appendChild(b);
  });
  return el;
}

// Reflect the current selection's active marks/nodes on the toolbar buttons.
function syncBubbleActive(menuEl, editor) {
  const isActive = (cmd) => {
    if (cmd === "h3") return editor.isActive("heading", { level: 3 });
    if (cmd === "bullet") return editor.isActive("bulletList");
    if (cmd === "check") return editor.isActive("taskList");
    return editor.isActive(cmd);
  };
  menuEl.querySelectorAll(".np-bubble-btn").forEach((b) => {
    b.classList.toggle("is-active", isActive(b.dataset.cmd));
  });
}

export function createEditor({
  element,
  content,
  spellcheck,
  isPlainPaste,
  onUpdate,
}) {
  let editor;
  const menuEl = buildBubbleMenu(() => editor);

  editor = new Editor({
    element,
    content: content || "",
    autofocus: false,
    editorProps: {
      attributes: {
        spellcheck: spellcheck ? "true" : "false",
        class: "np-prose",
      },
      handlePaste: (view, event) => {
        // Pasted images -> inline base64 (works in all modes).
        const files =
          event.clipboardData && event.clipboardData.files
            ? Array.from(event.clipboardData.files)
            : [];
        const images = files.filter((f) => f.type.startsWith("image/"));
        if (images.length) {
          event.preventDefault();
          images.forEach((file) => {
            const reader = new FileReader();
            reader.onload = () => {
              if (editor)
                editor.chain().focus().setImage({ src: reader.result }).run();
            };
            reader.readAsDataURL(file);
          });
          return true;
        }
        // Paste as plain text.
        if (!isPlainPaste || !isPlainPaste()) return false;
        const text =
          event.clipboardData && event.clipboardData.getData("text/plain");
        if (text == null) return false;
        event.preventDefault();
        const { schema, tr } = view.state;
        const nodes = [];
        text.split(/\r?\n/).forEach((line, i) => {
          if (i > 0) nodes.push(schema.nodes.hardBreak.create());
          if (line.length) nodes.push(schema.text(line));
        });
        view.dispatch(
          tr.replaceSelection(new Slice(Fragment.fromArray(nodes), 0, 0)).scrollIntoView()
        );
        return true;
      },
    },
    extensions: [
      StarterKit.configure({ heading: false, underline: false, link: false }),
      SectionHeading,
      Underline,
      Link.configure({
        openOnClick: true,
        autolink: true,
        linkOnPaste: true,
        HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
      }),
      Image.configure({ allowBase64: true, inline: false }),
      CheckList,
      TaskItem.configure({ nested: true }),
      CharacterCount,
      Placeholder.configure({ placeholder: "Start typing…" }),
      BubbleMenu.configure({
        element: menuEl,
        tippyOptions: { appendTo: () => document.body, maxWidth: "none" },
        shouldShow: ({ editor: ed, from, to }) =>
          from !== to && !ed.isActive("image"),
      }),
    ],
    onUpdate,
  });

  // Note: do NOT append menuEl to the DOM — the BubbleMenu/tippy instance owns
  // mounting and visibility. Appending it manually leaves a static copy behind.
  const sync = () => syncBubbleActive(menuEl, editor);
  editor.on("selectionUpdate", sync);
  editor.on("transaction", sync);
  return editor;
}
