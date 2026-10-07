# M3 Acceptance Checklist

## Prerequisite
Create at least one active Client in M2.
A Project is optional.

## Create quotation
1. Open Quotations.
2. Click New quotation.
3. Select a Client.
4. Optionally select a Project.
5. Enter a quotation title.
6. Add at least 2 commercial items.
7. Set quantity and rate.
8. Optionally add discount, VAT, Tax or Other charge.
9. Confirm the live Grand Total changes correctly.
10. Save.

Expected:
- Automatic quotation number such as QT-2026-0001.
- Revision starts at Rev 0.
- Saved quotation remains after browser refresh.

## Edit
1. Select the quotation.
2. Click Edit.
3. Change one item rate or status.
4. Save.
5. Confirm totals/status update.

## Duplicate
1. Select a quotation.
2. Click Duplicate.
3. Confirm.
4. Verify:
   - A new quotation number is created.
   - Revision is Rev 0.
   - Client, project, items and terms/data are copied.
   - New copy status is Draft.
   - Original quotation remains unchanged.

## Revision
1. Select a quotation.
2. Click New revision.
3. Confirm.
4. Verify:
   - Quotation number stays the same.
   - Revision increases to Rev 1.
   - Previous revision still exists.
   - New revision status is Draft.

Create another revision and confirm Rev 2 is generated.

## Global search
Use Ctrl+K and search by:
- Quotation number
- Quotation title
- Client name
- Project name
- Commercial item description

Open Global Search and verify the Quotations filter.

## Dashboard
Confirm Quotation count is updated.

## Local persistence
Quotation data is stored in:
data/quotations.json

The file is excluded from Git.

## Next milestone
M4 will begin the Custom Document Builder:
- Page/section model
- A4/Legal/custom page settings foundation
- Different page layouts
- Header/footer model
- Reusable sections
- Quotation data mapped into document fields
