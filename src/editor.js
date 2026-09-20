// TipTap editor setup for Napkin Notes.
import { Editor, wrappingInputRule, textblockTypeInputRule } from "@tiptap/core";
import { Fragment, Slice } from "@tiptap/pm/model";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import CharacterCount from "@tiptap/extension-character-count";
import Placeholder from "@tiptap/extension-placeholder";
import Heading from "@tiptap/extension-heading";

// Section header: the legacy "!!!" gesture becomes a real h3 (the migration
// rewrites old <mark> blocks to <h3>, so both old and new render identically).
const SectionHeading = Heading.extend({
  addInputRules() {
    return [
      textblockTypeInputRule({
        find: /^!!!\s$/,
        type: this.type,
        getAttributes: { level: 3 },
      }),
    ];
  },
}).configure({ levels: [3] });

// Checkboxes via "[] " / "[ ] " / "[x] " at the start of a line, plus a shortcut.
const CheckList = TaskList.extend({
  addInputRules() {
    return [wrappingInputRule({ find: /^\s*\[( |x|X)?\]\s$/, type: this.type })];
  },
  addKeyboardShortcuts() {
    return {
      "Mod-Shift-9": () => this.editor.commands.toggleTaskList(),
    };
  },
});

export function createEditor({
  element,
  content,
  spellcheck,
  isPlainPaste,
  onUpdate,
}) {
  return new Editor({
    element,
    content: content || "",
    autofocus: false,
    editorProps: {
      attributes: {
        spellcheck: spellcheck ? "true" : "false",
        class: "np-prose",
      },
      // "Paste as plain text" — strip formatting, preserving line breaks.
      handlePaste: (view, event) => {
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
        const slice = new Slice(Fragment.fromArray(nodes), 0, 0);
        view.dispatch(tr.replaceSelection(slice).scrollIntoView());
        return true;
      },
    },
    extensions: [
      StarterKit.configure({
        heading: false, // replaced by SectionHeading (h3 only)
        underline: false, // added explicitly below
        link: false, // added explicitly below
      }),
      SectionHeading,
      Underline,
      Link.configure({
        openOnClick: true,
        autolink: true,
        linkOnPaste: true,
        HTMLAttributes: {
          rel: "noopener noreferrer nofollow",
          target: "_blank",
        },
      }),
      CheckList,
      TaskItem.configure({ nested: true }),
      CharacterCount,
      Placeholder.configure({ placeholder: "Start typing…" }),
    ],
    onUpdate,
  });
}

// Prompt-based link insertion for Cmd/Ctrl+K.
export function promptForLink(editor) {
  if (!editor) return;
  const previous = editor.getAttributes("link").href || "";
  const url = window.prompt("Link URL", previous);
  if (url === null) return; // cancelled
  if (url === "") {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    return;
  }
  const href = /^(https?:|mailto:)/i.test(url) ? url : "https://" + url;
  editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
}
