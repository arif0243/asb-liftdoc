$ErrorActionPreference = "Stop"

$ProjectRoot = "E:\ASB LiftDoc\asb-liftdoc"
$GuardPath = Join-Path $ProjectRoot "Scripts\Assert-ASBLiftDocVisualLock.ps1"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " ASB LiftDoc - M7B Bills & Invoices" -ForegroundColor Cyan
Write-Host " Visual Lock Protected" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Set-Location -LiteralPath $ProjectRoot

if (-not (Test-Path ".git")) { throw "Git repository not found." }
if (-not (Test-Path $GuardPath)) { throw "Visual lock guard missing." }

powershell -ExecutionPolicy Bypass -File $GuardPath -ProjectRoot $ProjectRoot
if ($LASTEXITCODE -ne 0) { throw "Visual baseline verification failed." }

$Protected = @(
    "src\app\globals.css",
    "src\components\app-shell.tsx",
    "src\components\workspace\dashboard-overview.tsx"
)

$Before = @{}
foreach ($File in $Protected) {
    $Before[$File] = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $ProjectRoot $File)).Hash
}

$Dirty = git status --porcelain
$Unexpected = @(
    $Dirty | Where-Object {
        $_ -notmatch '^\?\? Scripts[/\\]' -and
        $_ -notmatch '^\?\? Backups[/\\]'
    }
)

if ($Unexpected.Count -gt 0) {
    $Unexpected | ForEach-Object { Write-Host $_ -ForegroundColor Yellow }
    throw "M7B stopped because there are uncommitted source changes."
}

$Port = 3010
if (Test-Path ".liftdoc-port") {
    $Port = [int](Get-Content ".liftdoc-port" -Raw).Trim()
}

$Running = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($Running) {
    $Running.OwningProcess | Sort-Object -Unique | ForEach-Object {
        Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 2
}

New-Item -ItemType Directory -Force -Path `
    "data", `
    "src\types", `
    "src\lib", `
    "src\app\api\invoices", `
    "src\components\workspace", `
    "Backups\M7B_Bills_Invoices" | Out-Null

$GitIgnore = Get-Content ".gitignore" -Raw
if ($GitIgnore -notmatch "(?m)^/data/invoices\.json$") {
    Add-Content ".gitignore" "`n/data/invoices.json`n"
}

if (-not (Test-Path "data\invoices.json")) {
@'
{
  "invoices": []
}
'@ | Set-Content "data\invoices.json" -Encoding UTF8
}

@'
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
'@ | Set-Content "src\types\invoice.ts" -Encoding UTF8

@'
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
'@ | Set-Content "src\lib\invoice-store.ts" -Encoding UTF8

@'
import { NextResponse } from "next/server";
import {
  createInvoice,
  duplicateInvoice,
  readInvoiceStore,
  updateInvoice,
} from "@/lib/invoice-store";
import { readQuotationStore } from "@/lib/quotation-store";
import { readWorkspace } from "@/lib/workspace-store";

export async function GET() {
  const [invoiceStore, quotationStore, workspace] =
    await Promise.all([
      readInvoiceStore(),
      readQuotationStore(),
      readWorkspace(),
    ]);

  return NextResponse.json({
    invoices: invoiceStore.invoices,
    quotations: quotationStore.quotations,
    clients: workspace.clients,
    projects: workspace.projects,
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const invoice =
      body?.action === "duplicate"
        ? await duplicateInvoice(String(body?.sourceId || ""))
        : await createInvoice(body);

    return NextResponse.json({ invoice }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to create invoice.",
      },
      { status: 400 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();

    if (!body?.id) throw new Error("Invoice id is required.");

    const invoice = await updateInvoice(body);
    return NextResponse.json({ invoice });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to save invoice.",
      },
      { status: 400 },
    );
  }
}
'@ | Set-Content "src\app\api\invoices\route.ts" -Encoding UTF8

@'
"use client";

import {
  Copy,
  Plus,
  Receipt,
  RefreshCw,
  Save,
  Search,
  X,
} from "lucide-react";
import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Client, Project } from "@/types/workspace";
import type { Quotation } from "@/types/quotation";
import type {
  Invoice,
  InvoiceItem,
  InvoiceStatus,
} from "@/types/invoice";
import styles from "./invoices-workspace.module.css";

type Payload = {
  invoices: Invoice[];
  quotations: Quotation[];
  clients: Client[];
  projects: Project[];
};

function blankItem(): InvoiceItem {
  return {
    id: crypto.randomUUID(),
    description: "",
    quantity: 1,
    unit: "pcs",
    rate: 0,
    total: 0,
  };
}

function money(value: number) {
  return new Intl.NumberFormat("en-BD", {
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

export function InvoicesWorkspace() {
  const [data, setData] = useState<Payload>({
    invoices: [],
    quotations: [],
    clients: [],
    projects: [],
  });
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [sourceQuotationId, setSourceQuotationId] = useState("");
  const [clientId, setClientId] = useState("");
  const [title, setTitle] = useState("Invoice");
  const [issueDate, setIssueDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [status, setStatus] = useState<InvoiceStatus>("draft");
  const [items, setItems] = useState<InvoiceItem[]>([
    {
      id: "initial-item",
      description: "",
      quantity: 1,
      unit: "pcs",
      rate: 0,
      total: 0,
    },
  ]);
  const [discount, setDiscount] = useState(0);
  const [vat, setVat] = useState(0);
  const [tax, setTax] = useState(0);
  const [other, setOther] = useState(0);
  const [paidAmount, setPaidAmount] = useState(0);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async (preferId?: string) => {
    const response = await fetch("/api/invoices", { cache: "no-store" });
    const payload = (await response.json()) as Payload;
    setData(payload);

    const id =
      preferId ??
      new URL(window.location.href).searchParams.get("selected") ??
      payload.invoices[0]?.id ??
      "";

    setSelectedId(id);
  };

  useEffect(() => {
    void load();
  }, []);

  const selected =
    data.invoices.find((invoice) => invoice.id === selectedId) ?? null;

  const selectedClient =
    data.clients.find((client) => client.id === selected?.clientId) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return data.invoices;

    return data.invoices.filter((invoice) => {
      const client = data.clients.find(
        (record) => record.id === invoice.clientId,
      );

      return [
        invoice.invoiceNo,
        invoice.title,
        invoice.status,
        invoice.sourceQuotationNo ?? "",
        client?.name ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [data, query]);

  const subtotal = items.reduce(
    (sum, item) =>
      sum + Number(item.quantity || 0) * Number(item.rate || 0),
    0,
  );
  const grandTotal = Math.max(
    0,
    subtotal - discount + vat + tax + other,
  );

  const reset = () => {
    const today = new Date().toISOString().slice(0, 10);
    setEditingId(null);
    setSourceQuotationId("");
    setClientId(data.clients[0]?.id ?? "");
    setTitle("Invoice");
    setIssueDate(today);
    setDueDate(today);
    setStatus("draft");
    setItems([blankItem()]);
    setDiscount(0);
    setVat(0);
    setTax(0);
    setOther(0);
    setPaidAmount(0);
    setNotes("");
  };

  const openNew = () => {
    reset();
    setModal(true);
  };

  const openEdit = (invoice: Invoice) => {
    setEditingId(invoice.id);
    setSourceQuotationId(invoice.sourceQuotationId ?? "");
    setClientId(invoice.clientId);
    setTitle(invoice.title);
    setIssueDate(invoice.issueDate);
    setDueDate(invoice.dueDate);
    setStatus(invoice.status);
    setItems(invoice.items.map((item) => ({ ...item })));
    setDiscount(invoice.discount);
    setVat(invoice.vat);
    setTax(invoice.tax);
    setOther(invoice.other);
    setPaidAmount(invoice.paidAmount);
    setNotes(invoice.notes);
    setModal(true);
  };

  const applyQuotation = (id: string) => {
    setSourceQuotationId(id);
    const quotation = data.quotations.find((record) => record.id === id);
    if (!quotation) return;

    setClientId(quotation.clientId);
    setTitle(quotation.title);
    setItems(
      quotation.items.map((item) => ({
        id: crypto.randomUUID(),
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        rate: item.rate,
        total: item.total,
      })),
    );
    setDiscount(quotation.discount);
    setVat(0);
    setTax(0);
    setOther(0);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);

    try {
      const response = await fetch("/api/invoices", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(editingId ? { id: editingId } : {}),
          sourceQuotationId: editingId ? undefined : sourceQuotationId || null,
          clientId,
          title,
          issueDate,
          dueDate,
          currency: "BDT",
          status,
          items,
          discount,
          vat,
          tax,
          other,
          paidAmount,
          notes,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Unable to save invoice.");
      }

      setModal(false);
      await load(result.invoice.id);
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : "Unable to save invoice.",
      );
    } finally {
      setSaving(false);
    }
  };

  const duplicate = async () => {
    if (!selected) return;

    const response = await fetch("/api/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "duplicate",
        sourceId: selected.id,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      window.alert(result.error || "Unable to duplicate invoice.");
      return;
    }

    await load(result.invoice.id);
  };

  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <div>
          <span>Bills & Invoices</span>
          <h1>Invoice Workspace</h1>
          <p>Create direct invoices or generate them from quotation revisions.</p>
        </div>

        <button type="button" onClick={openNew}>
          <Plus size={15} />
          New invoice
        </button>
      </header>

      <section className={styles.layout}>
        <div className={styles.list}>
          <div className={styles.toolbar}>
            <div>
              <Search size={14} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search invoice, client, quotation..."
              />
            </div>
            <button type="button" onClick={() => void load()}>
              <RefreshCw size={14} />
            </button>
          </div>

          {filtered.map((invoice) => {
            const client = data.clients.find(
              (record) => record.id === invoice.clientId,
            );

            return (
              <button
                type="button"
                key={invoice.id}
                className={`${styles.row} ${
                  invoice.id === selectedId ? styles.active : ""
                }`}
                onClick={() => setSelectedId(invoice.id)}
              >
                <span>
                  <strong>{invoice.invoiceNo}</strong>
                  <small>{invoice.title}</small>
                </span>
                <span>
                  <strong>{client?.name || "Unknown"}</strong>
                  <small>
                    {invoice.sourceQuotationNo
                      ? `${invoice.sourceQuotationNo} Rev ${
                          invoice.sourceQuotationRevisionNo ?? 0
                        }`
                      : "Direct invoice"}
                  </small>
                </span>
                <span>
                  <strong>BDT {money(invoice.grandTotal)}</strong>
                  <small>Balance {money(invoice.balance)}</small>
                </span>
                <span>{invoice.status.replaceAll("_", " ")}</span>
              </button>
            );
          })}

          {filtered.length === 0 && (
            <div className={styles.empty}>No invoices found.</div>
          )}
        </div>

        <aside className={styles.detail}>
          {selected ? (
            <>
              <div className={styles.detailHead}>
                <div>
                  <span>Invoice</span>
                  <h2>{selected.invoiceNo}</h2>
                  <p>{selected.title}</p>
                </div>
                <Receipt size={24} />
              </div>

              <div className={styles.cards}>
                <div>
                  <span>Client</span>
                  <strong>{selectedClient?.name || "Unknown"}</strong>
                </div>
                <div>
                  <span>Total</span>
                  <strong>BDT {money(selected.grandTotal)}</strong>
                </div>
                <div>
                  <span>Paid</span>
                  <strong>{money(selected.paidAmount)}</strong>
                </div>
                <div>
                  <span>Balance</span>
                  <strong>{money(selected.balance)}</strong>
                </div>
              </div>

              <div className={styles.actions}>
                <button type="button" onClick={() => openEdit(selected)}>
                  <Save size={14} />
                  Edit
                </button>
                <button type="button" onClick={() => void duplicate()}>
                  <Copy size={14} />
                  Duplicate
                </button>
              </div>
            </>
          ) : (
            <div className={styles.empty}>Select an invoice.</div>
          )}
        </aside>
      </section>

      {modal && (
        <div className={styles.backdrop} onMouseDown={() => setModal(false)}>
          <form
            className={styles.modal}
            onSubmit={submit}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className={styles.modalHead}>
              <div>
                <span>{editingId ? "Edit invoice" : "New invoice"}</span>
                <h2>{editingId ? "Update invoice" : "Create invoice"}</h2>
              </div>
              <button type="button" onClick={() => setModal(false)}>
                <X size={16} />
              </button>
            </div>

            {!editingId && (
              <label className={styles.full}>
                <span>Quotation revision (optional)</span>
                <select
                  value={sourceQuotationId}
                  onChange={(event) => applyQuotation(event.target.value)}
                >
                  <option value="">Direct invoice</option>
                  {data.quotations.map((quotation) => (
                    <option key={quotation.id} value={quotation.id}>
                      {quotation.quotationNo} Â· Rev {quotation.revisionNo} Â·{" "}
                      {quotation.title}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label>
              <span>Client *</span>
              <select
                required
                value={clientId}
                onChange={(event) => setClientId(event.target.value)}
                disabled={Boolean(sourceQuotationId) && !editingId}
              >
                <option value="">Select client</option>
                {data.clients
                  
                  .map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
              </select>
            </label>

            <label>
              <span>Status</span>
              <select
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as InvoiceStatus)
                }
              >
                <option value="draft">Draft</option>
                <option value="sent">Sent</option>
                <option value="partially_paid">Partially paid</option>
                <option value="paid">Paid</option>
                <option value="overdue">Overdue</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </label>

            <label className={styles.full}>
              <span>Title</span>
              <input value={title} onChange={(event) => setTitle(event.target.value)} />
            </label>

            <label>
              <span>Issue date</span>
              <input
                type="date"
                value={issueDate}
                onChange={(event) => setIssueDate(event.target.value)}
              />
            </label>

            <label>
              <span>Due date</span>
              <input
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
              />
            </label>

            <div className={`${styles.full} ${styles.items}`}>
              <div className={styles.itemsHead}>
                <strong>Items</strong>
                <button
                  type="button"
                  onClick={() => setItems((current) => [...current, blankItem()])}
                >
                  <Plus size={13} />
                  Add row
                </button>
              </div>

              {items.map((item, index) => (
                <div className={styles.itemRow} key={item.id}>
                  <span>{index + 1}</span>
                  <input
                    value={item.description}
                    placeholder="Description"
                    onChange={(event) =>
                      setItems((current) =>
                        current.map((record) =>
                          record.id === item.id
                            ? { ...record, description: event.target.value }
                            : record,
                        ),
                      )
                    }
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.quantity}
                    onChange={(event) =>
                      setItems((current) =>
                        current.map((record) =>
                          record.id === item.id
                            ? {
                                ...record,
                                quantity: Number(event.target.value),
                              }
                            : record,
                        ),
                      )
                    }
                  />
                  <input
                    value={item.unit}
                    onChange={(event) =>
                      setItems((current) =>
                        current.map((record) =>
                          record.id === item.id
                            ? { ...record, unit: event.target.value }
                            : record,
                        ),
                      )
                    }
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.rate}
                    onChange={(event) =>
                      setItems((current) =>
                        current.map((record) =>
                          record.id === item.id
                            ? { ...record, rate: Number(event.target.value) }
                            : record,
                        ),
                      )
                    }
                  />
                  <strong>{money(item.quantity * item.rate)}</strong>
                  <button
                    type="button"
                    onClick={() =>
                      setItems((current) =>
                        current.length <= 1
                          ? current
                          : current.filter((record) => record.id !== item.id),
                      )
                    }
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>

            <div className={`${styles.full} ${styles.moneyGrid}`}>
              {[
                ["Discount", discount, setDiscount],
                ["VAT", vat, setVat],
                ["Tax", tax, setTax],
                ["Other", other, setOther],
                ["Paid", paidAmount, setPaidAmount],
              ].map(([label, value, setter]) => (
                <label key={String(label)}>
                  <span>{String(label)}</span>
                  <input
                    type="number"
                    min="0"
                    value={Number(value)}
                    onChange={(event) =>
                      (setter as (value: number) => void)(
                        Number(event.target.value),
                      )
                    }
                  />
                </label>
              ))}
            </div>

            <div className={`${styles.full} ${styles.totalBar}`}>
              <span>Subtotal: BDT {money(subtotal)}</span>
              <strong>Grand Total: BDT {money(grandTotal)}</strong>
              <span>
                Balance: BDT {money(Math.max(0, grandTotal - paidAmount))}
              </span>
            </div>

            <label className={styles.full}>
              <span>Notes</span>
              <textarea
                rows={3}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </label>

            <div className={`${styles.full} ${styles.modalActions}`}>
              <button type="button" onClick={() => setModal(false)}>
                Cancel
              </button>
              <button type="submit" disabled={saving}>
                <Save size={14} />
                {saving ? "Saving..." : "Save invoice"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
'@ | Set-Content "src\components\workspace\invoices-workspace.tsx" -Encoding UTF8

@'
.page { display: grid; gap: 18px; }
.heading { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
.heading span, .detailHead span, .modalHead span { color: #6e8090; font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; }
.heading h1 { margin: 5px 0 3px; color: #173047; font-size: 24px; }
.heading p, .detailHead p { margin: 0; color: #6d7e8d; font-size: 11px; }
.heading button, .actions button, .itemsHead button, .modalActions button { min-height: 36px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 8px 11px; border: 1px solid #cad6df; border-radius: 8px; background: #fff; color: #294258; font-size: 9px; font-weight: 800; cursor: pointer; }
.heading > button, .modalActions button:last-child { color: #fff; border-color: #153e62; background: #153e62; }
.layout { display: grid; grid-template-columns: minmax(0,1.6fr) minmax(300px,.72fr); gap: 16px; align-items: start; }
.list, .detail { overflow: hidden; border: 1px solid #dbe4eb; border-radius: 14px; background: #fff; box-shadow: 0 6px 22px rgba(15,38,61,.05); }
.toolbar { display: grid; grid-template-columns: 1fr 38px; gap: 8px; padding: 12px; border-bottom: 1px solid #e4e9ee; background: #f8fafc; }
.toolbar > div { display: flex; align-items: center; gap: 7px; min-height: 38px; padding: 0 10px; border: 1px solid #d4dde5; border-radius: 8px; background: #fff; }
.toolbar input { width: 100%; border: 0; outline: 0; font-size: 9px; }
.toolbar > button { border: 1px solid #d4dde5; border-radius: 8px; background: #fff; color: #405a70; }
.row { width: 100%; display: grid; grid-template-columns: 1fr 1.15fr .9fr .7fr; gap: 10px; align-items: center; padding: 11px 12px; border: 0; border-bottom: 1px solid #edf1f4; background: #fff; text-align: left; cursor: pointer; }
.row:hover, .active { background: #f6f9fb; }
.row strong { display: block; color: #21394f; font-size: 9px; }
.row small { display: block; margin-top: 3px; color: #7d8c98; font-size: 7px; }
.row > span:last-child { width: fit-content; padding: 5px 7px; border-radius: 999px; background: #eaf1f6; color: #34536d; font-size: 7px; font-weight: 800; text-transform: capitalize; }
.detail { padding: 14px; }
.detailHead { display: flex; justify-content: space-between; gap: 12px; }
.detailHead h2 { margin: 5px 0 3px; color: #173047; font-size: 18px; }
.cards { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 14px; }
.cards > div { padding: 9px; border: 1px solid #e1e7ed; border-radius: 8px; background: #f9fbfc; }
.cards span { display: block; color: #7b8995; font-size: 7px; }
.cards strong { display: block; margin-top: 3px; color: #223b51; font-size: 9px; }
.actions { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; margin-top: 12px; }
.empty { padding: 28px 16px; color: #7d8b97; text-align: center; font-size: 9px; }
.backdrop { position: fixed; inset: 0; z-index: 100; display: flex; align-items: center; justify-content: center; padding: 24px; background: rgba(12,24,36,.55); }
.modal { width: min(960px,100%); max-height: 90vh; overflow: auto; display: grid; grid-template-columns: 1fr 1fr; gap: 11px; padding: 16px; border-radius: 16px; background: #fff; }
.modalHead { grid-column: 1/-1; display: flex; justify-content: space-between; align-items: center; padding-bottom: 10px; border-bottom: 1px solid #e0e6ec; }
.modalHead h2 { margin: 3px 0 0; color: #173047; font-size: 17px; }
.modalHead > button, .itemRow > button { min-width: 32px; min-height: 32px; border: 1px solid #d4dde5; border-radius: 7px; background: #fff; }
.modal label > span { display: block; margin-bottom: 5px; color: #65798a; font-size: 8px; font-weight: 800; }
.modal input, .modal select, .modal textarea { width: 100%; min-height: 36px; padding: 8px; border: 1px solid #ccd7e0; border-radius: 7px; box-sizing: border-box; color: #243e54; background: #fff; font-size: 9px; }
.full { grid-column: 1/-1; }
.items { overflow-x: auto; padding: 10px; border: 1px solid #dce5ec; border-radius: 10px; background: #f8fafc; }
.itemsHead { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.itemsHead strong { color: #314a60; font-size: 9px; }
.itemRow { min-width: 760px; display: grid; grid-template-columns: 25px minmax(220px,1fr) 80px 80px 100px 90px 34px; gap: 6px; align-items: center; margin-bottom: 6px; }
.itemRow > span, .itemRow > strong { color: #53687a; font-size: 8px; }
.moneyGrid { display: grid; grid-template-columns: repeat(5,1fr); gap: 8px; }
.totalBar { display: flex; justify-content: space-between; gap: 12px; padding: 10px; border: 1px solid #dce5ec; border-radius: 8px; background: #f8fafc; color: #52697c; font-size: 9px; }
.totalBar strong { color: #173047; }
.modalActions { display: flex; justify-content: flex-end; gap: 8px; }
@media (max-width: 1000px) { .layout { grid-template-columns: 1fr; } }
@media (max-width: 760px) { .heading { flex-direction: column; } .row { grid-template-columns: 1fr auto; } .row > span:nth-child(2), .row > span:nth-child(3) { display: none; } .modal { grid-template-columns: 1fr; } .full { grid-column: 1; } .moneyGrid { grid-template-columns: 1fr; } .totalBar { flex-direction: column; } }
'@ | Set-Content "src\components\workspace\invoices-workspace.module.css" -Encoding UTF8

@'
import { InvoicesWorkspace } from "@/components/workspace/invoices-workspace";

export default function InvoicesPage() {
  return <InvoicesWorkspace />;
}
'@ | Set-Content "src\app\invoices\page.tsx" -Encoding UTF8

@'
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
'@ | Set-Content "docs\M7B_INVOICE_ACCEPTANCE_TESTS.md" -Encoding UTF8

Set-Content ".liftdoc-milestone" -Value "M7B" -Encoding ASCII

Write-Host ""
Write-Host "Checking visual lock before build..." -ForegroundColor Yellow
powershell -ExecutionPolicy Bypass -File $GuardPath -ProjectRoot $ProjectRoot
if ($LASTEXITCODE -ne 0) { throw "Visual lock failed before build." }

foreach ($File in $Protected) {
    $Hash = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $ProjectRoot $File)).Hash
    if ($Hash -ne $Before[$File]) {
        throw "Protected visual file changed: $File"
    }
}

Write-Host "[OK] Visual baseline unchanged" -ForegroundColor Green

Write-Host ""
Write-Host "Running production build..." -ForegroundColor Yellow
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "M7B build failed. Do not rollback." -ForegroundColor Red
    Write-Host "Send me the complete new build error." -ForegroundColor Yellow
    throw "M7B production build failed."
}

Write-Host "[OK] Production build successful" -ForegroundColor Green

powershell -ExecutionPolicy Bypass -File $GuardPath -ProjectRoot $ProjectRoot
if ($LASTEXITCODE -ne 0) { throw "Visual lock failed after build." }

foreach ($File in $Protected) {
    $Hash = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $ProjectRoot $File)).Hash
    if ($Hash -ne $Before[$File]) {
        throw "Protected visual file changed after build: $File"
    }
}

Write-Host "[OK] Visual baseline still identical" -ForegroundColor Green

git add -- `
    ".gitignore" `
    ".liftdoc-milestone" `
    "src/types/invoice.ts" `
    "src/lib/invoice-store.ts" `
    "src/app/api/invoices/route.ts" `
    "src/app/invoices/page.tsx" `
    "src/components/workspace/invoices-workspace.tsx" `
    "src/components/workspace/invoices-workspace.module.css" `
    "docs/M7B_INVOICE_ACCEPTANCE_TESTS.md"

if ($LASTEXITCODE -ne 0) { throw "git add failed." }

$Changes = git status --porcelain
if ($Changes) {
    git commit -m "Add visual locked bills and invoices engine"

    if ($LASTEXITCODE -eq 0) {
        git tag -f checkpoint-m7b-invoice-engine HEAD | Out-Null
    }
}

powershell -ExecutionPolicy Bypass -File $GuardPath -ProjectRoot $ProjectRoot
if ($LASTEXITCODE -ne 0) { throw "Final visual lock verification failed." }

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host " M7B BILLS & INVOICES COMPLETE" -ForegroundColor Green
Write-Host " VISUAL BASELINE UNCHANGED" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "URL: http://localhost:$Port/invoices" -ForegroundColor Cyan

powershell -ExecutionPolicy Bypass -File (Join-Path $ProjectRoot "Start-ASBLiftDoc.ps1")

Write-Host ""
Write-Host "If everything works, send: M7B confirmed" -ForegroundColor Green
