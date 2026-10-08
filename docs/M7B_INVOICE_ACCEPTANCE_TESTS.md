# M7B Bills & Invoices Acceptance

1. Open `/invoices`.
2. Create a direct invoice.
3. Add several items and save.
4. Refresh and confirm persistence.
5. Create another invoice from a quotation revision.
6. Confirm quotation items and commercial values are copied.
7. Edit paid amount:
   - 0 = unpaid balance
   - partial amount = Partially Paid
   - full amount = Paid
8. Duplicate an invoice.
9. Confirm new invoice number, Draft status and paid amount reset to 0.
10. Confirm Dashboard / AppShell / Sidebar did not change.

Data file:
`data/invoices.json`

Next after confirmation:
M8 Production Readiness, backup/restore, regression, deployment and security checks.
