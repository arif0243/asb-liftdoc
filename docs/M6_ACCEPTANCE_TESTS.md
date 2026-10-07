# M6 Acceptance Checklist

## Create from quotation
1. Open Quotations.
2. Select a quotation revision.
3. Click Create document.
4. Choose a saved template.
5. Create the document.

Expected:
- New document number such as DOC-2026-0001.
- Version starts at V0.
- The exact quotation revision is linked.
- Client and project come from that quotation.
- Template pages are copied into the document.

## Master template protection
1. Open a document.
2. Click Edit this document.
3. Change:
   - document title
   - page name
   - header/footer text
   - heading/text/dynamic-field content
4. Save.
5. Open Templates.

Expected:
The master template has NOT changed.

## Saved document persistence
1. Refresh the browser.
2. Reopen the document.
3. Confirm the overrides remain.

## Duplicate document
1. Select a document.
2. Click Duplicate.

Expected:
- A new DOC number is created.
- Version is V0.
- Existing pages and overrides are copied.
- Original document remains unchanged.

## New saved version
1. Select a document.
2. Click New version.

Expected:
- Document number stays the same.
- Version increases from V0 to V1.
- The previous version remains available.
- New version starts as Draft.

Create another version and confirm V2.

## Quotation revision integration
Create a document from a quotation Rev 0.
Then create or select Rev 1 and create another document.

Expected:
Each document preserves the exact quotation revision it was created from.

## Preview
Confirm the Documents page preview resolves:
- client fields
- project fields
- quotation fields
- quotation item table
- totals
- advanced custom tables

## Global search
Use Ctrl+K or Global Search and search by:
- Document number
- Document title
- Quotation number
- Client name
- Text inside the saved document snapshot

Confirm Documents filter works.

## Status
Change a document between:
- Draft
- Final
- Archived

Save and refresh.

## Data safety
Document instances are stored locally in:
data/documents.json

The file is excluded from Git.

## Next milestone
M7 will add export/output:
- Print-ready rendering
- PDF export
- Page image export
- Word export foundation
- Excel export for commercial tables
- File naming and download workflow
