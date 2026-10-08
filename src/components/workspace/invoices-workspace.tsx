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
