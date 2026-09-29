"use client";

import { mergeAttributes, Node } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Heading2, Image as ImageIcon, Italic, Link2, List, ListOrdered, Quote, Rows3, SquareCheck } from "lucide-react";
import { type ReactNode, useState } from "react";
import { FileUpload } from "../../../../components/FileUpload";
import e from "./editor.module.css";

/**
 * A guide diagram placed in the text (comparison or decision aid). It saves
 * as <div data-block="…"></div>; its content is edited in the guide's parts.
 */
const Block = Node.create({
  name: "hpBlock",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return { name: { default: "comparison", parseHTML: (element) => element.getAttribute("data-block"), renderHTML: (attributes) => ({ "data-block": attributes.name }) } };
  },
  parseHTML() {
    return [{ tag: "div[data-block]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { class: e.blockChip })];
  },
});

function Tool({ label, active = false, disabled = false, onClick, children }: { label: string; active?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className={e.tool} aria-label={label} aria-pressed={active} disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={onClick} data-tooltip={label}>
      {children}
    </button>
  );
}

/**
 * The content editor's rich text (Pen 106 · RZTtl): bold, italic, heading,
 * lists, link, image and quote. Only these survive saving; the API cleans
 * everything else and says what it removed.
 */
export function RichTextEditor({
  value,
  onChange,
  blocks = false,
  labelledBy,
  onImageInserted,
}: {
  value: string;
  onChange: (html: string) => void;
  blocks?: boolean;
  labelledBy?: string;
  /** Images show once the page that uses them is saved, so the editor saves straight after. */
  onImageInserted?: () => void;
}) {
  const [linking, setLinking] = useState<string | null>(null);
  const [imaging, setImaging] = useState(false);
  const [alt, setAlt] = useState("");
  const [uploaded, setUploaded] = useState<string | null>(null);
  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] }, code: false, codeBlock: false, strike: false, underline: false, link: { openOnClick: false, autolink: true, protocols: ["mailto", "tel"] } }),
      Image.configure({ inline: false }),
      Block,
    ],
    content: value,
    editorProps: {
      attributes: {
        class: e.body ?? "",
        role: "textbox",
        "aria-multiline": "true",
        ...(labelledBy ? { "aria-labelledby": labelledBy } : { "aria-label": "Page text" }),
      },
    },
    onUpdate: ({ editor: current }) => onChange(current.isEmpty ? "" : current.getHTML()),
  });
  if (!editor) return <div className={e.rich} aria-busy="true" />;
  const state = {
    bold: editor.isActive("bold"),
    italic: editor.isActive("italic"),
    heading: editor.isActive("heading", { level: 2 }),
    bullet: editor.isActive("bulletList"),
    ordered: editor.isActive("orderedList"),
    link: editor.isActive("link"),
    quote: editor.isActive("blockquote"),
  };

  const applyLink = () => {
    const href = (linking ?? "").trim();
    if (!href) editor.chain().focus().extendMarkRange("link").unsetLink().run();
    else editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    setLinking(null);
  };

  return (
    <div className={e.rich}>
      <div className={e.toolbar} role="toolbar" aria-label="Text formatting">
        <Tool label="Bold" active={state.bold} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold size={18} aria-hidden="true" />
        </Tool>
        <Tool label="Italic" active={state.italic} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic size={18} aria-hidden="true" />
        </Tool>
        <Tool label="Section heading" active={state.heading} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
          <Heading2 size={18} aria-hidden="true" />
        </Tool>
        <Tool label="Bulleted list" active={state.bullet} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <List size={18} aria-hidden="true" />
        </Tool>
        <Tool label="Numbered list" active={state.ordered} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <ListOrdered size={18} aria-hidden="true" />
        </Tool>
        <Tool label="Link" active={state.link} onClick={() => setLinking(editor.getAttributes("link").href ?? "")}>
          <Link2 size={18} aria-hidden="true" />
        </Tool>
        <Tool label="Image" onClick={() => setImaging(true)}>
          <ImageIcon size={18} aria-hidden="true" />
        </Tool>
        <Tool label="Quote" active={state.quote} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
          <Quote size={18} aria-hidden="true" />
        </Tool>
        {blocks ? (
          <>
            <span className={e.toolSep} aria-hidden="true" />
            <Tool label="Place the comparison here" onClick={() => editor.chain().focus().insertContent({ type: "hpBlock", attrs: { name: "comparison" } }).run()}>
              <Rows3 size={18} aria-hidden="true" />
            </Tool>
            <Tool label="Place the decision aid here" onClick={() => editor.chain().focus().insertContent({ type: "hpBlock", attrs: { name: "decision" } }).run()}>
              <SquareCheck size={18} aria-hidden="true" />
            </Tool>
          </>
        ) : null}
      </div>
      {linking !== null ? (
        <div className={e.inlineForm}>
          <label className={e.inlineLabel} htmlFor="rich-link">
            Link address
          </label>
          <input
            id="rich-link"
            className={e.inlineInput}
            value={linking}
            placeholder="https://… or /products/polo-shirt"
            autoFocus
            onChange={(event) => setLinking(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                applyLink();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                setLinking(null);
              }
            }}
          />
          <button type="button" className={e.inlineButton} onClick={applyLink}>
            {linking.trim() ? "Apply" : "Remove link"}
          </button>
          <button type="button" className={e.inlineCancel} onClick={() => setLinking(null)}>
            Cancel
          </button>
        </div>
      ) : null}
      {imaging ? (
        <div className={e.inlineForm}>
          <div className={e.imageUpload}>
            <FileUpload purpose="CONTENT_MEDIA" accept="image/jpeg,image/png,image/webp" label="Image" hint="JPEG, PNG or WebP" onChange={(file) => setUploaded(file && file.status === "READY" ? file.id : null)} />
          </div>
          <label className={e.inlineLabel} htmlFor="rich-alt">
            Describe the image
          </label>
          <input id="rich-alt" className={e.inlineInput} value={alt} placeholder="e.g. Embroidered navy polo, left chest" onChange={(event) => setAlt(event.target.value)} />
          <button
            type="button"
            className={e.inlineButton}
            disabled={!uploaded || !alt.trim()}
            onClick={() => {
              editor.chain().focus().setImage({ src: `/api/v1/media/${uploaded}/preview`, alt: alt.trim() }).run();
              setImaging(false);
              setUploaded(null);
              setAlt("");
              onImageInserted?.();
            }}
          >
            Insert image
          </button>
          <button type="button" className={e.inlineCancel} onClick={() => setImaging(false)}>
            Cancel
          </button>
        </div>
      ) : null}
      <EditorContent editor={editor} />
    </div>
  );
}
