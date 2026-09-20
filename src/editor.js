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

// Floating format toolbar (appended to <body> so it is never clipped).
function buildBubbleMenu(getEditor) {
  const el = document.createElement("div");
  el.className = "np-bubble";
  const btns = [
    ["bold", "<b>B</b>"],
    ["italic", "<i>i</i>"],
    ["underline", "<u>U</u>"],
    ["strike", "<s>S</s>"],
    ["|", ""],
    ["link", "🔗"],
    ["h3", "H"],
    ["bullet", "•"],
    ["check", "☑"],
  ];
  btns.forEach(([cmd, label]) => {
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
    b.innerHTML = label;
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

  document.body.appendChild(menuEl);
  return editor;
}
