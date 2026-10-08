export type InvoiceStatus =
  | "draft"
  | "sent"
  | "partially_paid"
  | "paid"
  | "overdue"
  | "cancelled";

export type InvoiceItem = {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  rate: number;
  total: number;
};

export type Invoice = {
  id: string;
  invoiceNo: string;
  clientId: string;
  projectId: string | null;
  sourceQuotationId: string | null;
  sourceQuotationNo: string | null;
  sourceQuotationRevisionNo: number | null;
  title: string;
  issueDate: string;
  dueDate: string;
  currency: string;
  status: InvoiceStatus;
  items: InvoiceItem[];
  subtotal: number;
  discount: number;
  vat: number;
  tax: number;
  other: number;
  grandTotal: number;
  paidAmount: number;
  balance: number;
  notes: string;
  duplicatedFromId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type InvoiceStoreData = {
  invoices: Invoice[];
};
