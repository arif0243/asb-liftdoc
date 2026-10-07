export type QuotationStatus = "draft" | "sent" | "approved" | "rejected";

export type QuotationItem = {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  rate: number;
  total: number;
};

export type Quotation = {
  id: string;
  quotationNo: string;
  revisionNo: number;
  rootQuotationId: string;
  parentQuotationId: string | null;
  duplicatedFromId: string | null;

  clientId: string;
  projectId: string | null;

  title: string;
  subject: string;
  quotationDate: string;
  validityDays: number;
  currency: "BDT";
  status: QuotationStatus;

  items: QuotationItem[];
  subtotal: number;
  discount: number;
  vatPercent: number;
  vatAmount: number;
  taxPercent: number;
  taxAmount: number;
  otherCharge: number;
  grandTotal: number;

  notes: string;

  createdAt: string;
  updatedAt: string;
};

export type QuotationStoreData = {
  quotations: Quotation[];
};
