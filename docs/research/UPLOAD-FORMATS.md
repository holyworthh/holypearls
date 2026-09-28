# Artwork and proof file formats: feasibility study

Date: 2026-09-28. Asked by the owner: customers should be able to upload SVG and Adobe Illustrator (AI) files, proofing should work with them, and whatever is uploaded must be viewable on the proofing page. How feasible are PDFs, and what's best for customers?

## Short answer

| Format | Accept? | Preview on the proofing page | Print quality | Verdict |
| :---- | :---- | :---- | :---- | :---- |
| **PDF** | Yes | Every page, rendered to images (already built) | Best: vectors, embedded fonts, CMYK, bleed, several pages | **Recommended first choice** |
| **AI** (Illustrator) | Yes (built) | Yes, when saved "PDF compatible" (Illustrator's default). Older or non-compatible files: no preview; staff open them in Illustrator | Same as PDF | Recommended for designers |
| **SVG** | Yes (built) | Yes, drawn to an image on the server | Good for logos and flat artwork; no CMYK, no bleed, fonts may be substituted | Good for logos |
| **PNG / JPEG** | Yes | Yes | Only as good as the pixels; needs about 300 dpi at print size | Fine for photos, weak for logos |
| EPS | No | Needs Ghostscript (AGPL licence, known security history) | Good | Design help instead |
| PSD | No | No reliable open-source renderer for layered files | Good | Design help instead |

Upload hint shown to customers: **"PDF, AI, SVG, PNG or JPEG, up to 50 MB"**, with PDF recommended.

## How each format works

### PDF: feasible, already built

- PDF is the print industry's standard. It keeps vector shapes, embeds fonts, supports CMYK and spot colours, and can carry bleed and several pages (front and back of a business card, every page of a brochure).
- The worker already renders PDFs with MuPDF in an isolated child process (60 seconds, memory-limited). Proofs get up to 20 pages rendered; artwork gets the first page.
- The browser never opens the PDF itself. The proofing page shows the rendered images, so it works the same on every phone, and a hostile PDF can't run anything in the browser.
- Risk: very large or complex PDFs can hit the time or memory limit. The file then becomes NEEDS_REVIEW with a clear message instead of failing silently. On the free Render plan (512 MB) this happens sooner.

### Adobe Illustrator (AI): feasible for almost all modern files

- Since Illustrator 9 (2000), an .ai file is a PDF inside, as long as "Create PDF Compatible File" is ticked when saving. It is ticked by default.
- These files are recognised by their `%PDF` start and `.ai` name and previewed with the same PDF renderer.
- Files saved without PDF compatibility, or very old PostScript-based AI files, can't be drawn without Illustrator. They're still accepted and kept for staff, but become NEEDS_REVIEW with the message: *save it again with "Create PDF Compatible File" ticked, or export a PDF.*
- The preview shows the artboard as Illustrator would print it. Hidden layers and content outside the artboard aren't shown, which matches what gets printed.

### SVG: feasible, with care

- Browsers can show SVG directly, but an SVG can contain JavaScript and links to other files. Shown on our own domain, it could steal a signed-in person's session. So:
  - The original SVG is only ever offered as a **download** (`Content-Disposition: attachment`), never displayed.
  - The preview is drawn to a PNG/WebP image on the server by librsvg (inside sharp), from memory. Scripts never run, and linked files and URLs are never fetched (tested with a file containing both).
  - Drawn at 300 dpi so small logos stay sharp.
- Print caveats to explain to customers:
  - SVG has no CMYK or spot colours. Colours are converted at print time and may shift slightly.
  - Text that uses a font we don't have is drawn in a fallback font. Customers should convert text to outlines. The proofing step catches this: the customer approves exactly what we drew.
  - No bleed. Staff add it when preparing the proof.

### PNG and JPEG

- Already supported. The preview checks nothing about print resolution yet. A later improvement: warn when the image is below about 300 dpi at the chosen print size (needs the product size, so it belongs with the configurator, T03).

### Why not EPS and PSD

- EPS needs Ghostscript to draw. Ghostscript is AGPL-licensed and has had several serious security flaws with untrusted files. Not worth it for a format Illustrator and Photoshop can export to PDF.
- PSD has no dependable open-source renderer for layered files. Photoshop exports PDF, PNG and JPEG.
- Both remain possible through "design help", where staff take the file by email or in person.

## Proofing

- Staff upload proofs as PDF (preferred), AI, SVG, PNG or JPEG. The proofing page (a later ticket) will show rendered page images at up to 2000 px, with a thumbnail strip for multi-page proofs, and the customer approves what they see.
- Because every format becomes the same kind of image, the proofing page needs no format-specific code, and approval always refers to exactly what the customer saw (the rendered pages are kept with the proof version).

## Recommendation

1. Tell customers: **"Best: a print-ready PDF. We also take AI, SVG, PNG and JPEG."**
2. Keep EPS and PSD out; offer design help.
3. Later (T03, configurator): print-size resolution warning for PNG and JPEG, and a "convert text to outlines" tip for SVG.

## What changed in the code

- `apps/api/src/files/rules.ts`: artwork, project attachments and proofs accept PDF, AI, SVG, PNG and JPEG. The .ai and .svg names decide the claimed type, because browsers often send an empty type or `application/postscript` for them.
- `apps/api/src/files/preview.ts`: `previewSvg` draws SVG at 300 dpi on white, then makes the usual preview and thumbnail.
- `apps/api/src/files/processing.ts`: AI goes through the PDF renderer, and each format has its own NEEDS_REVIEW message.
- `FileUpload`: the file picker and hint list the new formats.
- Tests: SVG with a script and a `file://` link is previewed safely and downloads as an attachment; PDF-compatible AI previews; old PostScript AI goes to NEEDS_REVIEW with the save-again message; EPS is refused.
