# Quotation Edit + Preview Flow

Required behavior:

1. Open Quotations.
2. Click any quotation row.
3. Right detail panel shows:
   - Edit
   - Preview
4. Edit opens the existing quotation edit mode.
5. Edit mode includes:
   - Header & Footer
   - Print preview
   - Cancel
   - Save quotation
6. Preview opens a printable quotation preview in a new tab.
7. Print preview includes saved quotation header/footer settings.
8. Header/footer editor supports:
   - None
   - Text
   - Image
   - alignment
   - height
   - different first page
   - quotation metadata toggle
   - page number toggle
9. Long quotation item lists continue onto more than one A4 preview page.
10. Left sidebar / Dashboard / AppShell must remain unchanged.

Protected files:
- src/app/globals.css
- src/components/app-shell.tsx
- src/components/workspace/dashboard-overview.tsx