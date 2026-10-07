"use client";

import {
  Calculator,
  Copy,
  Edit3,
  FilePlus2,
  FileText,
  Plus,
  RefreshCw,
  RotateCcw,
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
import type {
  Quotation,
  QuotationItem,
  QuotationStatus,
} from "@/types/quotation";

type FormItem = {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  rate: number;
};

type QuotationForm = {
  id?: string;
  clientId: string;
  projectId: string;
  title: string;
  subject: string;
  quotationDate: string;
  validityDays: number;
  status: QuotationStatus;
  items: FormItem[];
  discount: number;
  vatPercent: number;
  taxPercent: number;
  otherCharge: number;
  notes: string;
};

function blankItem(): FormItem {
  return {
    id: crypto.randomUUID(),
    description: "",
    quantity: 1,
    unit: "Pcs",
    rate: 0,
  };
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

const emptyForm: QuotationForm = {
  clientId: "",
  projectId: "",
  title: "",
  subject: "",
  quotationDate: today(),
  validityDays: 10,
  status: "draft",
  items: [blankItem()],
  discount: 0,
  vatPercent: 0,
  taxPercent: 0,
  otherCharge: 0,
  notes: "",
};

const money = new Intl.NumberFormat("en-BD", {
  maximumFractionDigits: 2,
});

function formatMoney(value: number) {
  return `BDT ${money.format(Number(value) || 0)}`;
}

function statusClass(status: QuotationStatus) {
  if (status === "approved") return "status-completed";
  if (status === "sent") return "status-sent";
  if (status === "rejected") return "status-rejected";
  return "status-muted";
}

export function QuotationsWorkspace() {
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [clientFilter, setClientFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<QuotationForm>(emptyForm);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);

    try {
      const response = await fetch("/api/quotations", { cache: "no-store" });
      const data = await response.json();

      setQuotations(data.quotations ?? []);
      setClients(data.clients ?? []);
      setProjects(data.projects ?? []);

      const url = new URL(window.location.href);
      const requested = url.searchParams.get("selected");

      if (requested) {
        setSelectedId(requested);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    return quotations.filter((quotation) => {
      if (statusFilter !== "all" && quotation.status !== statusFilter) {
        return false;
      }

      if (clientFilter !== "all" && quotation.clientId !== clientFilter) {
        return false;
      }

      if (!q) {
        return true;
      }

      const client = clients.find((item) => item.id === quotation.clientId);
      const project = projects.find((item) => item.id === quotation.projectId);

      return [
        quotation.quotationNo,
        quotation.title,
        quotation.subject,
        client?.name ?? "",
        project?.name ?? "",
        project?.code ?? "",
        quotation.status,
        ...quotation.items.map((item) => item.description),
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [
    quotations,
    clients,
    projects,
    query,
    statusFilter,
    clientFilter,
  ]);

  const selected =
    quotations.find((quotation) => quotation.id === selectedId) ?? null;

  const selectedClient = clients.find(
    (client) => client.id === selected?.clientId,
  );

  const selectedProject = projects.find(
    (project) => project.id === selected?.projectId,
  );

  const formProjects = projects.filter(
    (project) =>
      project.clientId === form.clientId && project.status !== "archived",
  );

  const previewTotals = useMemo(() => {
    const subtotal = form.items.reduce(
      (sum, item) =>
        sum + Math.max(0, Number(item.quantity) || 0) * Math.max(0, Number(item.rate) || 0),
      0,
    );
    const discount = Math.min(Math.max(0, Number(form.discount) || 0), subtotal);
    const base = Math.max(0, subtotal - discount);
    const vat = (base * Math.max(0, Number(form.vatPercent) || 0)) / 100;
    const tax = (base * Math.max(0, Number(form.taxPercent) || 0)) / 100;
    const grand =
      base + vat + tax + Math.max(0, Number(form.otherCharge) || 0);

    return { subtotal, discount, vat, tax, grand };
  }, [form]);

  const openCreate = () => {
    setForm({
      ...emptyForm,
      clientId: clients.find((client) => client.status === "active")?.id ?? "",
      quotationDate: today(),
      items: [blankItem()],
    });
    setError("");
    setModalOpen(true);
  };

  const openEdit = (quotation: Quotation) => {
    setForm({
      id: quotation.id,
      clientId: quotation.clientId,
      projectId: quotation.projectId ?? "",
      title: quotation.title,
      subject: quotation.subject,
      quotationDate: quotation.quotationDate,
      validityDays: quotation.validityDays,
      status: quotation.status,
      items:
        quotation.items.length > 0
          ? quotation.items.map((item) => ({
              id: item.id,
              description: item.description,
              quantity: item.quantity,
              unit: item.unit,
              rate: item.rate,
            }))
          : [blankItem()],
      discount: quotation.discount,
      vatPercent: quotation.vatPercent,
      taxPercent: quotation.taxPercent,
      otherCharge: quotation.otherCharge,
      notes: quotation.notes,
    });
    setError("");
    setModalOpen(true);
  };

  const updateItem = (
    id: string,
    patch: Partial<FormItem>,
  ) => {
    setForm((current) => ({
      ...current,
      items: current.items.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    }));
  };

  const removeItem = (id: string) => {
    setForm((current) => ({
      ...current,
      items:
        current.items.length === 1
          ? [blankItem()]
          : current.items.filter((item) => item.id !== id),
    }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      const response = await fetch("/api/quotations", {
        method: form.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          projectId: form.projectId || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to save quotation.");
      }

      setModalOpen(false);
      await load();
      setSelectedId(data.quotation.id);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to save quotation.",
      );
    } finally {
      setSaving(false);
    }
  };

  const createCopy = async (
    source: Quotation,
    action: "duplicate" | "revision",
  ) => {
    const question =
      action === "duplicate"
        ? `Duplicate ${source.quotationNo} Rev ${source.revisionNo} as a new quotation?`
        : `Create the next revision of ${source.quotationNo}?`;

    if (!window.confirm(question)) {
      return;
    }

    const response = await fetch("/api/quotations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        sourceId: source.id,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      window.alert(data.error || "Operation failed.");
      return;
    }

    await load();
    setSelectedId(data.quotation.id);
  };

  return (
    <div className="page-stack">
      <div className="page-heading-row">
        <div>
          <div className="eyebrow">Commercial workspace</div>
          <h1>Quotations</h1>
          <p>
            Create client/project quotations, calculate commercial totals,
            duplicate previous work and preserve revision history.
          </p>
        </div>

        <button
          type="button"
          className="button button-primary"
          onClick={openCreate}
          disabled={clients.filter((client) => client.status === "active").length === 0}
          title={
            clients.length === 0 ? "Add a client before creating a quotation" : undefined
          }
        >
          <Plus size={17} />
          New quotation
        </button>
      </div>

      {clients.length === 0 && !loading && (
        <div className="info-banner">
          Add at least one active client before creating a quotation.
        </div>
      )}

      <section className="quotation-layout">
        <div className="workspace-list-panel">
          <div className="quotation-toolbar">
            <div className="workspace-search">
              <Search size={16} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search quotation no, title, client, project, item..."
              />
            </div>

            <select
              value={clientFilter}
              onChange={(event) => setClientFilter(event.target.value)}
            >
              <option value="all">All clients</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">All status</option>
              <option value="draft">Draft</option>
              <option value="sent">Sent</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>

            <button
              type="button"
              className="icon-button"
              onClick={() => void load()}
              aria-label="Refresh quotations"
            >
              <RefreshCw size={16} />
            </button>
          </div>

          <div className="record-table">
            <div className="record-table-head quotation-grid">
              <span>Quotation</span>
              <span>Client / Project</span>
              <span>Total</span>
              <span>Status</span>
            </div>

            {loading ? (
              <div className="record-empty">Loading quotations...</div>
            ) : filtered.length === 0 ? (
              <div className="record-empty">
                No quotations yet. Create your first quotation.
              </div>
            ) : (
              filtered.map((quotation) => {
                const client = clients.find(
                  (item) => item.id === quotation.clientId,
                );
                const project = projects.find(
                  (item) => item.id === quotation.projectId,
                );

                return (
                  <button
                    type="button"
                    key={quotation.id}
                    className={
                      selectedId === quotation.id
                        ? "record-row quotation-grid record-row-selected"
                        : "record-row quotation-grid"
                    }
                    onClick={() => setSelectedId(quotation.id)}
                  >
                    <span className="record-primary">
                      <strong>
                        {quotation.quotationNo} · Rev {quotation.revisionNo}
                      </strong>
                      <small>{quotation.title}</small>
                    </span>

                    <span className="record-primary">
                      <strong>{client?.name || "Unknown client"}</strong>
                      <small>{project?.name || "Direct quotation"}</small>
                    </span>

                    <span className="record-secondary quotation-total-cell">
                      {formatMoney(quotation.grandTotal)}
                    </span>

                    <span>
                      <span className={`status-pill ${statusClass(quotation.status)}`}>
                        {quotation.status}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <aside className="record-detail-panel quotation-detail-panel">
          {selected ? (
            <>
              <div className="detail-heading">
                <div>
                  <span className="panel-kicker">Quotation</span>
                  <h2>{selected.quotationNo}</h2>
                  <p>
                    Revision {selected.revisionNo} · {selected.status}
                  </p>
                </div>

                <button
                  type="button"
                  className="icon-button"
                  onClick={() => openEdit(selected)}
                  aria-label="Edit quotation"
                >
                  <Edit3 size={16} />
                </button>
              </div>

              <div className="quotation-title-block">
                <strong>{selected.title}</strong>
                <span>{selected.subject || "No subject added"}</span>
              </div>

              <div className="quotation-meta-grid">
                <div>
                  <small>Client</small>
                  <strong>{selectedClient?.name || "Unknown"}</strong>
                </div>
                <div>
                  <small>Project</small>
                  <strong>{selectedProject?.name || "Direct"}</strong>
                </div>
                <div>
                  <small>Date</small>
                  <strong>{selected.quotationDate}</strong>
                </div>
                <div>
                  <small>Validity</small>
                  <strong>{selected.validityDays} days</strong>
                </div>
              </div>

              <div className="detail-section">
                <div className="detail-section-heading">
                  <strong>Commercial items</strong>
                  <span>{selected.items.length}</span>
                </div>

                {selected.items.length === 0 ? (
                  <p className="detail-muted">No item added.</p>
                ) : (
                  <div className="quotation-mini-items">
                    {selected.items.slice(0, 5).map((item) => (
                      <div key={item.id}>
                        <span>
                          <strong>{item.description}</strong>
                          <small>
                            {item.quantity} {item.unit || "unit"} × {money.format(item.rate)}
                          </small>
                        </span>
                        <strong>{money.format(item.total)}</strong>
                      </div>
                    ))}

                    {selected.items.length > 5 && (
                      <div className="quotation-more-items">
                        + {selected.items.length - 5} more item(s)
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="quotation-summary">
                <div>
                  <span>Subtotal</span>
                  <strong>{formatMoney(selected.subtotal)}</strong>
                </div>
                {selected.discount > 0 && (
                  <div>
                    <span>Discount</span>
                    <strong>- {formatMoney(selected.discount)}</strong>
                  </div>
                )}
                {selected.vatAmount > 0 && (
                  <div>
                    <span>VAT ({selected.vatPercent}%)</span>
                    <strong>{formatMoney(selected.vatAmount)}</strong>
                  </div>
                )}
                {selected.taxAmount > 0 && (
                  <div>
                    <span>Tax ({selected.taxPercent}%)</span>
                    <strong>{formatMoney(selected.taxAmount)}</strong>
                  </div>
                )}
                {selected.otherCharge > 0 && (
                  <div>
                    <span>Other charge</span>
                    <strong>{formatMoney(selected.otherCharge)}</strong>
                  </div>
                )}
                <div className="quotation-grand-total">
                  <span>Grand total</span>
                  <strong>{formatMoney(selected.grandTotal)}</strong>
                </div>
              </div>

              <div className="quotation-action-grid">
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => void createCopy(selected, "duplicate")}
                >
                  <Copy size={16} />
                  Duplicate
                </button>

                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => void createCopy(selected, "revision")}
                >
                  <RotateCcw size={16} />
                  New revision
                </button>
              </div>
            </>
          ) : (
            <div className="detail-empty">
              <FileText size={28} />
              <strong>Select a quotation</strong>
              <p>
                Commercial summary, duplicate and revision actions will appear here.
              </p>
            </div>
          )}
        </aside>
      </section>

      {modalOpen && (
        <div className="modal-backdrop" onMouseDown={() => setModalOpen(false)}>
          <div
            className="modal-card quotation-modal"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-heading">
              <div>
                <span className="panel-kicker">
                  {form.id ? "Edit quotation" : "New quotation"}
                </span>
                <h2>{form.id ? form.title || "Quotation" : "Create quotation"}</h2>
              </div>

              <button
                type="button"
                className="icon-button"
                onClick={() => setModalOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <form className="workspace-form" onSubmit={submit}>
              <div className="form-section-title">Quotation information</div>

              <div className="form-grid">
                <label>
                  <span>Client *</span>
                  <select
                    required
                    value={form.clientId}
                    onChange={(event) => {
                      const clientId = event.target.value;
                      const projectStillValid = projects.some(
                        (project) =>
                          project.id === form.projectId &&
                          project.clientId === clientId,
                      );

                      setForm({
                        ...form,
                        clientId,
                        projectId: projectStillValid ? form.projectId : "",
                      });
                    }}
                  >
                    <option value="">Select client</option>
                    {clients
                      .filter((client) => client.status === "active")
                      .map((client) => (
                        <option key={client.id} value={client.id}>
                          {client.name}
                        </option>
                      ))}
                  </select>
                </label>

                <label>
                  <span>Project (optional)</span>
                  <select
                    value={form.projectId}
                    onChange={(event) =>
                      setForm({ ...form, projectId: event.target.value })
                    }
                    disabled={!form.clientId}
                  >
                    <option value="">Direct quotation / no project</option>
                    {formProjects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="form-span-2">
                  <span>Quotation title *</span>
                  <input
                    required
                    value={form.title}
                    onChange={(event) =>
                      setForm({ ...form, title: event.target.value })
                    }
                    placeholder="e.g. Lift modernization proposal"
                  />
                </label>

                <label className="form-span-2">
                  <span>Subject</span>
                  <input
                    value={form.subject}
                    onChange={(event) =>
                      setForm({ ...form, subject: event.target.value })
                    }
                    placeholder="Formal subject line"
                  />
                </label>

                <label>
                  <span>Date</span>
                  <input
                    type="date"
                    value={form.quotationDate}
                    onChange={(event) =>
                      setForm({ ...form, quotationDate: event.target.value })
                    }
                  />
                </label>

                <label>
                  <span>Validity (days)</span>
                  <input
                    type="number"
                    min="1"
                    value={form.validityDays}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        validityDays: Number(event.target.value),
                      })
                    }
                  />
                </label>

                <label>
                  <span>Status</span>
                  <select
                    value={form.status}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        status: event.target.value as QuotationStatus,
                      })
                    }
                  >
                    <option value="draft">Draft</option>
                    <option value="sent">Sent</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </label>
              </div>

              <div className="form-section-title quotation-items-title">
                <span>Commercial items</span>
                <button
                  type="button"
                  className="button button-secondary button-small"
                  onClick={() =>
                    setForm((current) => ({
                      ...current,
                      items: [...current.items, blankItem()],
                    }))
                  }
                >
                  <Plus size={14} />
                  Add item
                </button>
              </div>

              <div className="quotation-item-editor">
                <div className="quotation-item-head">
                  <span>Description</span>
                  <span>Qty</span>
                  <span>Unit</span>
                  <span>Rate</span>
                  <span>Total</span>
                  <span />
                </div>

                {form.items.map((item) => (
                  <div className="quotation-item-row" key={item.id}>
                    <input
                      value={item.description}
                      onChange={(event) =>
                        updateItem(item.id, { description: event.target.value })
                      }
                      placeholder="Item / service description"
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.quantity}
                      onChange={(event) =>
                        updateItem(item.id, {
                          quantity: Number(event.target.value),
                        })
                      }
                    />
                    <input
                      value={item.unit}
                      onChange={(event) =>
                        updateItem(item.id, { unit: event.target.value })
                      }
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.rate}
                      onChange={(event) =>
                        updateItem(item.id, {
                          rate: Number(event.target.value),
                        })
                      }
                    />
                    <strong>
                      {money.format(
                        (Number(item.quantity) || 0) * (Number(item.rate) || 0),
                      )}
                    </strong>
                    <button
                      type="button"
                      className="icon-button quotation-remove-item"
                      onClick={() => removeItem(item.id)}
                      aria-label="Remove item"
                    >
                      <X size={15} />
                    </button>
                  </div>
                ))}
              </div>

              <div className="quotation-commercial-grid">
                <label>
                  <span>Discount (BDT)</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.discount}
                    onChange={(event) =>
                      setForm({ ...form, discount: Number(event.target.value) })
                    }
                  />
                </label>

                <label>
                  <span>VAT (%)</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.vatPercent}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        vatPercent: Number(event.target.value),
                      })
                    }
                  />
                </label>

                <label>
                  <span>Tax (%)</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.taxPercent}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        taxPercent: Number(event.target.value),
                      })
                    }
                  />
                </label>

                <label>
                  <span>Other charge (BDT)</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.otherCharge}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        otherCharge: Number(event.target.value),
                      })
                    }
                  />
                </label>
              </div>

              <div className="quotation-live-summary">
                <span>
                  <Calculator size={16} />
                  Live calculation
                </span>
                <div>
                  <small>Subtotal</small>
                  <strong>{formatMoney(previewTotals.subtotal)}</strong>
                </div>
                <div>
                  <small>Grand total</small>
                  <strong>{formatMoney(previewTotals.grand)}</strong>
                </div>
              </div>

              <label className="quotation-notes-label">
                <span>Internal / quotation notes</span>
                <textarea
                  rows={3}
                  value={form.notes}
                  onChange={(event) =>
                    setForm({ ...form, notes: event.target.value })
                  }
                />
              </label>

              {error && <div className="form-error">{error}</div>}

              <div className="modal-actions">
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setModalOpen(false)}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="button button-primary"
                  disabled={saving}
                >
                  <FilePlus2 size={16} />
                  {saving
                    ? "Saving..."
                    : form.id
                      ? "Save quotation"
                      : "Create quotation"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
