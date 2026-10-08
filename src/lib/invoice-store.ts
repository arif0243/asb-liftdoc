import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import type {
  Invoice,
  InvoiceItem,
  InvoiceStatus,
  InvoiceStoreData,
} from "@/types/invoice";
import { readQuotationStore } from "@/lib/quotation-store";
import { readWorkspace } from "@/lib/workspace-store";

const dataFile = path.join(process.cwd(), "data", "invoices.json");
let writeQueue = Promise.resolve();

async function ensureFile() {
  await fs.mkdir(path.dirname(dataFile), { recursive: true });
  try {
    await fs.access(dataFile);
  } catch {
    await fs.writeFile(
      dataFile,
      JSON.stringify({ invoices: [] }, null, 2),
      "utf8",
    );
  }
}

export async function readInvoiceStore(): Promise<InvoiceStoreData> {
  await ensureFile();

  try {
    const raw = await fs.readFile(dataFile, "utf8");
    const parsed = JSON.parse(raw) as Partial<InvoiceStoreData>;

    return {
      invoices: Array.isArray(parsed.invoices) ? parsed.invoices : [],
    };
  } catch {
    return { invoices: [] };
  }
}

async function writeStore(data: InvoiceStoreData) {
  writeQueue = writeQueue.then(async () => {
    const temporary = `${dataFile}.tmp`;
    await fs.writeFile(temporary, JSON.stringify(data, null, 2), "utf8");
    await fs.rename(temporary, dataFile);
  });

  await writeQueue;
}

function asText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeItems(value: unknown): InvoiceItem[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((record) => {
      const source = record as Partial<InvoiceItem>;
      const quantity = Math.max(0, asNumber(source.quantity));
      const rate = Math.max(0, asNumber(source.rate));

      return {
        id: asText(source.id) || randomUUID(),
        description: asText(source.description),
        quantity,
        unit: asText(source.unit) || "pcs",
        rate,
        total: quantity * rate,
      };
    })
    .filter((item) => item.description);
}

function totals(input: {
  items: InvoiceItem[];
  discount: number;
  vat: number;
  tax: number;
  other: number;
  paidAmount: number;
}) {
  const subtotal = input.items.reduce((sum, item) => sum + item.total, 0);
  const grandTotal = Math.max(
    0,
    subtotal - input.discount + input.vat + input.tax + input.other,
  );
  const paidAmount = Math.max(0, input.paidAmount);

  return {
    subtotal,
    grandTotal,
    paidAmount,
    balance: Math.max(0, grandTotal - paidAmount),
  };
}

function statusFor(
  requested: InvoiceStatus,
  grandTotal: number,
  paidAmount: number,
): InvoiceStatus {
  if (requested === "cancelled") return "cancelled";
  if (grandTotal > 0 && paidAmount >= grandTotal) return "paid";
  if (paidAmount > 0) return "partially_paid";
  return requested;
}

function nextNo(invoices: Invoice[]) {
  const year = new Date().getFullYear();
  const prefix = `INV-${year}-`;

  const max = invoices.reduce((current, invoice) => {
    if (!invoice.invoiceNo.startsWith(prefix)) return current;
    const suffix = Number(invoice.invoiceNo.slice(prefix.length));
    return Number.isFinite(suffix) ? Math.max(current, suffix) : current;
  }, 0);

  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

export async function createInvoice(input: Record<string, unknown>) {
  const [store, workspace, quotationStore] = await Promise.all([
    readInvoiceStore(),
    readWorkspace(),
    readQuotationStore(),
  ]);

  const sourceQuotationId = asText(input.sourceQuotationId) || null;
  const quotation = sourceQuotationId
    ? quotationStore.quotations.find(
        (record) => record.id === sourceQuotationId,
      ) ?? null
    : null;

  const clientId = quotation?.clientId ?? asText(input.clientId);
  const projectId = quotation?.projectId ?? (asText(input.projectId) || null);

  const client = workspace.clients.find(
    (record) => record.id === clientId,
  );

  if (!client) throw new Error("Select an active client.");

  if (projectId) {
    const project = workspace.projects.find(
      (record) =>
        record.id === projectId &&
        record.clientId === clientId,
    );

    if (!project) throw new Error("Project does not belong to this client.");
  }

  const items = quotation
    ? quotation.items.map((item) => ({
        id: randomUUID(),
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        rate: item.rate,
        total: item.total,
      }))
    : normalizeItems(input.items);

  const discount = Math.max(
    0,
    quotation?.discount ?? asNumber(input.discount),
  );
  const vat = Math.max(0, asNumber(input.vat));
  const tax = Math.max(0, asNumber(input.tax));
  const other = Math.max(0, asNumber(input.other));

  const amount = totals({
    items,
    discount,
    vat,
    tax,
    other,
    paidAmount: asNumber(input.paidAmount),
  });

  const requestedStatus =
    (asText(input.status) as InvoiceStatus) || "draft";
  const now = new Date().toISOString();

  const invoice: Invoice = {
    id: randomUUID(),
    invoiceNo: nextNo(store.invoices),
    clientId,
    projectId,
    sourceQuotationId: quotation?.id ?? null,
    sourceQuotationNo: quotation?.quotationNo ?? null,
    sourceQuotationRevisionNo: quotation?.revisionNo ?? null,
    title: asText(input.title) || quotation?.title || "Invoice",
    issueDate: asText(input.issueDate) || now.slice(0, 10),
    dueDate: asText(input.dueDate) || now.slice(0, 10),
    currency: asText(input.currency) || quotation?.currency || "BDT",
    status: statusFor(
      requestedStatus,
      amount.grandTotal,
      amount.paidAmount,
    ),
    items,
    subtotal: amount.subtotal,
    discount,
    vat,
    tax,
    other,
    grandTotal: amount.grandTotal,
    paidAmount: amount.paidAmount,
    balance: amount.balance,
    notes: asText(input.notes),
    duplicatedFromId: null,
    createdAt: now,
    updatedAt: now,
  };

  store.invoices.unshift(invoice);
  await writeStore(store);
  return invoice;
}

export async function updateInvoice(
  input: Partial<Invoice> & { id: string },
) {
  const store = await readInvoiceStore();
  const index = store.invoices.findIndex(
    (record) => record.id === input.id,
  );

  if (index < 0) throw new Error("Invoice not found.");

  const current = store.invoices[index];
  const items =
    input.items === undefined ? current.items : normalizeItems(input.items);

  const discount =
    input.discount === undefined
      ? current.discount
      : Math.max(0, asNumber(input.discount));
  const vat =
    input.vat === undefined
      ? current.vat
      : Math.max(0, asNumber(input.vat));
  const tax =
    input.tax === undefined
      ? current.tax
      : Math.max(0, asNumber(input.tax));
  const other =
    input.other === undefined
      ? current.other
      : Math.max(0, asNumber(input.other));

  const amount = totals({
    items,
    discount,
    vat,
    tax,
    other,
    paidAmount:
      input.paidAmount === undefined
        ? current.paidAmount
        : asNumber(input.paidAmount),
  });

  const requestedStatus =
    input.status === undefined ? current.status : input.status;

  const updated: Invoice = {
    ...current,
    title: asText(input.title) || current.title,
    issueDate: asText(input.issueDate) || current.issueDate,
    dueDate: asText(input.dueDate) || current.dueDate,
    currency: asText(input.currency) || current.currency,
    status: statusFor(
      requestedStatus,
      amount.grandTotal,
      amount.paidAmount,
    ),
    items,
    subtotal: amount.subtotal,
    discount,
    vat,
    tax,
    other,
    grandTotal: amount.grandTotal,
    paidAmount: amount.paidAmount,
    balance: amount.balance,
    notes:
      input.notes === undefined ? current.notes : asText(input.notes),
    updatedAt: new Date().toISOString(),
  };

  store.invoices[index] = updated;
  await writeStore(store);
  return updated;
}

export async function duplicateInvoice(id: string) {
  const store = await readInvoiceStore();
  const source = store.invoices.find((record) => record.id === id);

  if (!source) throw new Error("Source invoice not found.");

  const now = new Date().toISOString();

  const copy: Invoice = {
    ...source,
    id: randomUUID(),
    invoiceNo: nextNo(store.invoices),
    status: "draft",
    paidAmount: 0,
    balance: source.grandTotal,
    items: source.items.map((item) => ({
      ...item,
      id: randomUUID(),
    })),
    duplicatedFromId: source.id,
    createdAt: now,
    updatedAt: now,
  };

  store.invoices.unshift(copy);
  await writeStore(store);
  return copy;
}
