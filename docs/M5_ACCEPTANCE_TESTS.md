# M5 Acceptance Checklist

## Advanced table
1. Open Templates.
2. Select any page.
3. Click "Add advanced custom table".
4. Test Add Row, Remove Row, Add Column and Remove Column.
5. Edit cell text and alignment.
6. Change column widths and row heights.
7. Change border width and cell padding.
8. Save the template and refresh.

## Merge / Split
1. Select a rectangular group of cells using the Select buttons.
2. Click Merge.
3. Confirm the cells merge in the builder preview.
4. Select the merged cell.
5. Click Split.
6. Confirm it returns to normal cells.

## Automatic continuation
1. Add enough rows to exceed Rows per page.
2. Keep Auto paginate enabled.
3. Keep Repeat header enabled.
4. Confirm the preview shows continuation sections.
5. Change Rows per page and confirm pagination changes.

## Flow rules
For blocks test:
- Page break before
- Keep together
- Allow split across pages

Save and refresh. Confirm the settings remain.

## Important architecture note
M5 stores page-flow rules now.
Advanced custom-table pagination preview is active.
The final print/PDF renderer in the export milestone will use these saved flow rules for physical output.

## Next milestone
M6:
- Quotation to document instance
- Choose a saved template
- Document-specific page/content overrides
- Preserve master template
- Saved document versions
- Duplicate and revision integration
