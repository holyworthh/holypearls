# HolyPearls — TECH 04: Files & Artwork

**Version:** 2.0 (27 September 2026). Replaces TECH 04 v1. **Built in:** T01-04 and T01-05 (shared file service), then used by every feature.

## 1\. What this covers

Customer artwork, logos and brand assets, proof files, CSV imports, problem-report photos, product media uploaded by staff, and exports.

## 2\. Storage

Private S3-compatible storage: Cloudflare R2 in production, MinIO locally. Nothing is public. Public product images are served through the web app's image optimizer from a separate public-media bucket that only staff can write to.

Folder prefixes (internal only, never used as permission): `uploads/pending/`, `files/source/`, `files/preview/`, `proofs/`, `brand-assets/`, `imports/`, `exports/`.

## 3\. Upload steps

1. The browser asks for an upload: purpose, file name, size and type.  
2. The API checks the person may attach a file to that record and that the size and type are allowed for the purpose.  
3. The API creates a `files` row (PENDING\_UPLOAD) and returns an upload URL valid for 15 minutes, for one object only.  
4. The browser uploads directly to R2, showing progress.  
5. The browser tells the API the upload finished.  
6. The API confirms the object exists and its real size, and sets PROCESSING.  
7. The worker (`file.inspect`) reads the first bytes to detect the real type. If it's not allowed or doesn't match, REJECTED. Otherwise `file.preview` runs.  
8. The file becomes READY, NEEDS\_REVIEW (for example low resolution for the intended print size) or REJECTED, with a reason the customer can understand.

Never trust the type or size the browser claims.

## 4\. Allowed types and limits (starting values, configurable per purpose)

| Purpose | Types | Max size |
| :---- | :---- | :---- |
| Artwork and logos | JPEG, PNG, PDF | 50 MB |
| Project and quote attachments | JPEG, PNG, PDF | 25 MB |
| Proof files (staff) | JPEG, PNG, PDF | 100 MB |
| Problem-report photos | JPEG, PNG | 15 MB |
| CSV imports | CSV | 5 MB, 5,000 rows |
| Product media (staff) | JPEG, PNG, WebP | 20 MB |

AI, EPS, SVG, PSD and other design files are not accepted by the website at launch. Customers use "design help" or support; staff handle those files outside the app and upload a PDF or image. SVG is excluded because it can contain scripts.

## 5\. Previews

- Images: resized preview (2,000 px long edge) and thumbnail (400 px), stripped of metadata.  
- PDFs: first page (and each page for proofs, up to 20\) rendered to PNG in the worker, with a 60-second limit per file and a 1 GB memory cap. The PDF renderer runs with no network access. A PDF that fails to render becomes NEEDS\_REVIEW, not an error.  
- Browsers only ever display previews. Original ("source") files stay private and are only downloaded by staff or the owner.

## 6\. Downloads

The API checks access to the `files` row, then returns a download URL valid for 5 minutes. Download URLs are never stored in the database, emails or logs.

## 7\. Ownership

Every file has a purpose and belongs to one record (configuration, project, quote change request, proof version, brand asset version, import batch, problem report, product). Access follows that record's permissions. Knowing a file ID or storage key never grants access.

## 8\. Checks after upload

Before READY: the object exists, the real size is within the limit, the real type is allowed, and a preview could be made. Malware scanning is **not** used at launch, because only images and PDFs are accepted, previews are rendered in an isolated worker, and originals are never opened in the browser. Revisit if new file types are allowed (see risk R-004).

## 9\. Brand asset versions

A Brand Asset is the logo or artwork as a concept. Each Brand Asset Version points to exactly one file. Replacing creates V(n+1) and keeps every earlier version. A new version doesn't change templates or past orders that point to an older version (PRD 05 B2B-FR-024).

## 10\. Proof files

A proof has permanent proof versions. Each version points to exact files plus the saved production details shown to the customer. Revisions create a new version. Comments and decisions stay on the version they were made on. The viewer loads the preview first and higher resolution only when the customer zooms in.

## 11\. Proof pins

Pins are stored as positions relative to the image (0–1 horizontally and vertically) plus text, so they stay in place at any screen size. They never modify the artwork. Every pin is also listed as numbered text.

## 12\. CSV imports

Belong to a group collection. Steps: upload → read into an import batch → match columns → check each row → show row-by-row problems → resolve problems and duplicates → import valid rows according to the organizer's setting. Never silently drop a row. Each imported record remembers its batch and row number. CSV contents are never written to logs.

## 13\. Keeping and deleting files

Files used by proofs, accepted orders or asset versions are kept for 7 years (or as the business and legal review decides; see TECH 06 section 12). Uploads never attached to anything are deleted after 7 days. Exports are deleted after 24 hours.

## 14\. Done when

Every upload, view and review screen uses these steps, and no private production file ever has a permanent public URL.