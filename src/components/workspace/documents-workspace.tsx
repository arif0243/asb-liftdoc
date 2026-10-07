"use client";

import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Edit3,
  FilePlus2,
  FileStack,
  FileText,
  Plus,
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
import type { DocumentTemplate, TemplatePage } from "@/types/document-builder";
import type {
  DocumentInstance,
  DocumentStatus,
} from "@/types/document-instance";

type Payload = {
  documents: DocumentInstance[];
  quotations: Quotation[];
  templates: DocumentTemplate[];
  clients: Client[];
  projects: Project[];
};

const money = new Intl.NumberFormat("en-BD", {
  maximumFractionDigits: 2,
});

function resolveTokens(
  content: string,
  quotation: Quotation | null,
  client: Client | null,
  project: Project | null,
) {
  const tokens: Record<string, string> = {
    "{{company.name}}": "ASB Elevator",
    "{{client.name}}": client?.name || "Client Name",
    "{{client.address}}": client?.address || "Client Address",
    "{{client.phone}}": client?.phone || "",
    "{{client.email}}": client?.email || "",
    "{{project.name}}": project?.name || "Project Name",
    "{{project.code}}": project?.code || "",
    "{{project.location}}": project?.location || "",
    "{{quotation.no}}": quotation?.quotationNo || "QT-YYYY-0000",
    "{{quotation.revision}}": String(quotation?.revisionNo ?? 0),
    "{{quotation.title}}": quotation?.title || "Quotation Title",
    "{{quotation.subject}}": quotation?.subject || "Quotation Subject",
    "{{quotation.date}}": quotation?.quotationDate || "YYYY-MM-DD",
    "{{quotation.validityDays}}": String(quotation?.validityDays ?? 10),
    "{{quotation.subtotal}}": quotation
      ? `BDT ${money.format(quotation.subtotal)}`
      : "BDT 0",
    "{{quotation.grandTotal}}": quotation
      ? `BDT ${money.format(quotation.grandTotal)}`
      : "BDT 0",
  };

  let output = content;

  Object.entries(tokens).forEach(([token, value]) => {
    output = output.split(token).join(value);
  });

  return output;
}

function statusClass(status: DocumentStatus) {
  if (status === "final") return "status-completed";
  if (status === "archived") return "status-muted";
  return "status-sent";
}

function clonePages(pages: TemplatePage[]) {
  return structuredClone(pages);
}

export function DocumentsWorkspace() {
  const [documents, setDocuments] = useState<DocumentInstance[]>([]);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [createQuotationId, setCreateQuotationId] = useState("");
  const [createTemplateId, setCreateTemplateId] = useState("");
  const [createTitle, setCreateTitle] = useState("");
  const [creating, setCreating] = useState(false);

  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editStatus, setEditStatus] = useState<DocumentStatus>("draft");
  const [editPages, setEditPages] = useState<TemplatePage[]>([]);
  const [editPageIndex, setEditPageIndex] = useState(0);
  const [saving, setSaving] = useState(false);

  const load = async (preferId?: string) => {
    setLoading(true);

    try {
      const response = await fetch("/api/documents", { cache: "no-store" });
      const data = (await response.json()) as Payload;

      setDocuments(data.documents ?? []);
      setQuotations(data.quotations ?? []);
      setTemplates(data.templates ?? []);
      setClients(data.clients ?? []);
      setProjects(data.projects ?? []);

      const url = new URL(window.location.href);
      const requested = preferId ?? url.searchParams.get("selected");
      const quotationRequest = url.searchParams.get("quotation");

      if (requested && data.documents.some((item) => item.id === requested)) {
        setSelectedId(requested);
      } else if (!selectedId && data.documents[0]) {
        setSelectedId(data.documents[0].id);
      }

      if (
        quotationRequest &&
        data.quotations.some((item) => item.id === quotationRequest)
      ) {
        const quotation = data.quotations.find(
          (item) => item.id === quotationRequest,
        );

        setCreateQuotationId(quotationRequest);
        setCreateTitle(quotation?.title ?? "");
        setCreateTemplateId(data.templates[0]?.id ?? "");
        setCreateOpen(true);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const selected =
    documents.find((document) => document.id === selectedId) ?? null;

  const selectedQuotation =
    quotations.find(
      (quotation) => quotation.id === selected?.quotationId,
    ) ?? null;

  const selectedClient =
    clients.find((client) => client.id === selected?.clientId) ?? null;

  const selectedProject =
    projects.find((project) => project.id === selected?.projectId) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    return documents.filter((document) => {
      if (statusFilter !== "all" && document.status !== statusFilter) {
        return false;
      }

      if (!q) {
        return true;
      }

      const client = clients.find(
        (item) => item.id === document.clientId,
      );

      return [
        document.documentNo,
        document.title,
        document.quotationNo,
        document.templateName,
        document.status,
        client?.name ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [documents, clients, query, statusFilter]);

  const beginEdit = () => {
    if (!selected) return;

    setEditTitle(selected.title);
    setEditStatus(selected.status);
    setEditPages(clonePages(selected.pages));
    setEditPageIndex(0);
    setEditing(true);
  };

  const activeEditPage = editPages[editPageIndex] ?? null;

  const setActiveEditPage = (page: TemplatePage) => {
    setEditPages((current) =>
      current.map((item, index) =>
        index === editPageIndex ? page : item,
      ),
    );
  };

  const submitCreate = async (event: FormEvent) => {
    event.preventDefault();
    setCreating(true);

    try {
      const response = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quotationId: createQuotationId,
          templateId: createTemplateId,
          title: createTitle,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to create document.");
      }

      setCreateOpen(false);
      await load(data.document.id);
      setSelectedId(data.document.id);
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : "Unable to create document.",
      );
    } finally {
      setCreating(false);
    }
  };

  const saveDocument = async () => {
    if (!selected) return;

    setSaving(true);

    try {
      const response = await fetch("/api/documents", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selected.id,
          title: editTitle,
          status: editStatus,
          pages: editPages,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to save document.");
      }

      setEditing(false);
      await load(data.document.id);
      setSelectedId(data.document.id);
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : "Unable to save document.",
      );
    } finally {
      setSaving(false);
    }
  };

  const createAction = async (
    action: "duplicate" | "version",
    source: DocumentInstance,
  ) => {
    const question =
      action === "duplicate"
        ? `Duplicate ${source.documentNo} V${source.versionNo} as a new document?`
        : `Create the next saved version of ${source.documentNo}?`;

    if (!window.confirm(question)) return;

    const response = await fetch("/api/documents", {
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

    await load(data.document.id);
    setSelectedId(data.document.id);
  };

  const openCreate = () => {
    const quotation = quotations[0];

    setCreateQuotationId(quotation?.id ?? "");
    setCreateTemplateId(templates[0]?.id ?? "");
    setCreateTitle(quotation?.title ?? "");
    setCreateOpen(true);
  };

  return (
    <div className="page-stack">
      <div className="page-heading-row">
        <div>
          <div className="eyebrow">Quotation-linked output workspace</div>
          <h1>Documents</h1>
          <p>
            Create independent document instances from quotation revisions and
            master templates. Edit the document without changing the template.
          </p>
        </div>

        <button
          type="button"
          className="button button-primary"
          onClick={openCreate}
          disabled={quotations.length === 0 || templates.length === 0}
        >
          <Plus size={17} />
          New document
        </button>
      </div>

      <section className="document-instance-layout">
        <div className="workspace-list-panel">
          <div className="document-instance-toolbar">
            <div className="workspace-search">
              <Search size={16} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search document no, title, quotation, client..."
              />
            </div>

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">All status</option>
              <option value="draft">Draft</option>
              <option value="final">Final</option>
              <option value="archived">Archived</option>
            </select>

            <button
              type="button"
              className="icon-button"
              onClick={() => void load()}
              aria-label="Refresh documents"
            >
              <RefreshCw size={16} />
            </button>
          </div>

          <div className="record-table">
            <div className="record-table-head document-instance-grid">
              <span>Document</span>
              <span>Source</span>
              <span>Status</span>
            </div>

            {loading ? (
              <div className="record-empty">Loading documents...</div>
            ) : filtered.length === 0 ? (
              <div className="record-empty">
                No documents yet. Create one from a quotation and template.
              </div>
            ) : (
              filtered.map((document) => {
                const client = clients.find(
                  (item) => item.id === document.clientId,
                );

                return (
                  <button
                    type="button"
                    key={document.id}
                    className={
                      selectedId === document.id
                        ? "record-row document-instance-grid record-row-selected"
                        : "record-row document-instance-grid"
                    }
                    onClick={() => {
                      setSelectedId(document.id);
                      setEditing(false);
                    }}
                  >
                    <span className="record-primary">
                      <strong>
                        {document.documentNo} · V{document.versionNo}
                      </strong>
                      <small>{document.title}</small>
                    </span>

                    <span className="record-primary">
                      <strong>
                        {document.quotationNo} · Rev{" "}
                        {document.quotationRevisionNo}
                      </strong>
                      <small>{client?.name || document.templateName}</small>
                    </span>

                    <span>
                      <span
                        className={`status-pill ${statusClass(document.status)}`}
                      >
                        {document.status}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <aside className="record-detail-panel document-instance-detail">
          {selected ? (
            <>
              <div className="detail-heading">
                <div>
                  <span className="panel-kicker">Saved document</span>
                  <h2>{selected.documentNo}</h2>
                  <p>
                    Version {selected.versionNo} · {selected.status}
                  </p>
                </div>

                <button
                  type="button"
                  className="icon-button"
                  onClick={beginEdit}
                  aria-label="Edit document"
                >
                  <Edit3 size={16} />
                </button>
              </div>

              <div className="quotation-title-block">
                <strong>{selected.title}</strong>
                <span>
                  Master template snapshot: {selected.templateName}
                </span>
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
                  <small>Quotation</small>
                  <strong>
                    {selected.quotationNo} Rev{" "}
                    {selected.quotationRevisionNo}
                  </strong>
                </div>
                <div>
                  <small>Pages</small>
                  <strong>{selected.pages.length}</strong>
                </div>
              </div>

              <div className="document-instance-actions">
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => void createAction("duplicate", selected)}
                >
                  <Copy size={15} />
                  Duplicate
                </button>

                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => void createAction("version", selected)}
                >
                  <FilePlus2 size={15} />
                  New version
                </button>
              </div>

              <div className="document-instance-source-note">
                <FileText size={15} />
                <span>
                  Linked to {selectedQuotation?.quotationNo || selected.quotationNo}.
                  Changes here do not modify the master template or quotation.
                </span>
              </div>
            </>
          ) : (
            <div className="detail-empty">
              <FileStack size={28} />
              <strong>Select a document</strong>
              <p>Document versions and override actions will appear here.</p>
            </div>
          )}
        </aside>
      </section>

      {selected && (
        <section className="document-instance-editor-panel">
          <div className="document-editor-heading">
            <div>
              <span className="panel-kicker">
                {editing ? "Document override editor" : "Document preview"}
              </span>
              <h2>
                {selected.documentNo} · V{selected.versionNo}
              </h2>
            </div>

            <div className="document-editor-actions">
              {editing ? (
                <>
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => setEditing(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="button button-primary"
                    onClick={() => void saveDocument()}
                    disabled={saving}
                  >
                    <Save size={15} />
                    {saving ? "Saving..." : "Save document"}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={beginEdit}
                >
                  <Edit3 size={15} />
                  Edit this document
                </button>
              )}
            </div>
          </div>

          {editing ? (
            <div className="document-override-layout">
              <aside className="document-override-pages">
                <label>
                  <span>Document title</span>
                  <input
                    value={editTitle}
                    onChange={(event) => setEditTitle(event.target.value)}
                  />
                </label>

                <label>
                  <span>Status</span>
                  <select
                    value={editStatus}
                    onChange={(event) =>
                      setEditStatus(event.target.value as DocumentStatus)
                    }
                  >
                    <option value="draft">Draft</option>
                    <option value="final">Final</option>
                    <option value="archived">Archived</option>
                  </select>
                </label>

                <div className="document-override-page-list">
                  {editPages.map((page, index) => (
                    <button
                      type="button"
                      key={page.id}
                      className={
                        editPageIndex === index
                          ? "builder-page-card builder-page-card-active"
                          : "builder-page-card"
                      }
                      onClick={() => setEditPageIndex(index)}
                    >
                      <span className="builder-page-number">{index + 1}</span>
                      <span>
                        <strong>{page.name}</strong>
                        <small>{page.settings.paperSize}</small>
                      </span>
                    </button>
                  ))}
                </div>
              </aside>

              <div className="document-override-form">
                {activeEditPage && (
                  <>
                    <div className="form-grid">
                      <label>
                        <span>Page name</span>
                        <input
                          value={activeEditPage.name}
                          onChange={(event) =>
                            setActiveEditPage({
                              ...activeEditPage,
                              name: event.target.value,
                            })
                          }
                        />
                      </label>

                      <label>
                        <span>Header text</span>
                        <input
                          value={activeEditPage.settings.headerText}
                          onChange={(event) =>
                            setActiveEditPage({
                              ...activeEditPage,
                              settings: {
                                ...activeEditPage.settings,
                                headerText: event.target.value,
                              },
                            })
                          }
                        />
                      </label>

                      <label className="form-span-2">
                        <span>Footer text</span>
                        <input
                          value={activeEditPage.settings.footerText}
                          onChange={(event) =>
                            setActiveEditPage({
                              ...activeEditPage,
                              settings: {
                                ...activeEditPage.settings,
                                footerText: event.target.value,
                              },
                            })
                          }
                        />
                      </label>
                    </div>

                    <div className="document-override-blocks">
                      {activeEditPage.blocks.map((block, blockIndex) => (
                        <div className="document-override-block" key={block.id}>
                          <div className="document-override-block-head">
                            <strong>
                              {blockIndex + 1}. {block.type.replaceAll("_", " ")}
                            </strong>
                            <span>{block.align}</span>
                          </div>

                          {![
                            "divider",
                            "quotation_table",
                            "custom_table",
                            "totals",
                          ].includes(block.type) ? (
                            <textarea
                              rows={block.type === "heading" ? 2 : 4}
                              value={block.content}
                              onChange={(event) =>
                                setActiveEditPage({
                                  ...activeEditPage,
                                  blocks: activeEditPage.blocks.map(
                                    (item, currentIndex) =>
                                      currentIndex === blockIndex
                                        ? {
                                            ...item,
                                            content: event.target.value,
                                          }
                                        : item,
                                  ),
                                })
                              }
                            />
                          ) : (
                            <p>
                              Structural block inherited from the template. Its
                              saved layout remains independent inside this
                              document snapshot.
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="document-preview-grid">
              {selected.pages.map((page, pageIndex) => (
                <div className="document-preview-card" key={page.id}>
                  <div className="document-preview-card-top">
                    <strong>
                      Page {pageIndex + 1}: {page.name}
                    </strong>
                    <span>
                      {page.settings.paperSize} ·{" "}
                      {page.settings.orientation}
                    </span>
                  </div>

                  <div className="document-instance-paper">
                    {page.settings.headerMode !== "none" && (
                      <div className="document-instance-header">
                        {page.settings.headerMode === "manual"
                          ? resolveTokens(
                              page.settings.headerText,
                              selectedQuotation,
                              selectedClient,
                              selectedProject,
                            )
                          : "Header image"}
                      </div>
                    )}

                    <div className="document-instance-content">
                      {page.blocks.map((block) => {
                        if (block.type === "divider") {
                          return <hr key={block.id} />;
                        }

                        if (block.type === "quotation_table") {
                          return (
                            <div
                              className="document-preview-table"
                              key={block.id}
                            >
                              <div className="document-preview-table-head">
                                <span>SL</span>
                                <span>Description</span>
                                <span>Qty</span>
                                <span>Rate</span>
                                <span>Total</span>
                              </div>

                              {(selectedQuotation?.items ?? []).map(
                                (item, index) => (
                                  <div
                                    className="document-preview-table-row"
                                    key={item.id}
                                  >
                                    <span>{index + 1}</span>
                                    <span>{item.description}</span>
                                    <span>
                                      {item.quantity} {item.unit}
                                    </span>
                                    <span>{money.format(item.rate)}</span>
                                    <span>{money.format(item.total)}</span>
                                  </div>
                                ),
                              )}
                            </div>
                          );
                        }

                        if (block.type === "custom_table" && block.table) {
                          const totalWidth = block.table.columnWidths.reduce(
                            (sum, width) => sum + Number(width || 1),
                            0,
                          );

                          return (
                            <table
                              className="document-advanced-table"
                              key={block.id}
                            >
                              <colgroup>
                                {block.table.columnWidths.map(
                                  (width, index) => (
                                    <col
                                      key={index}
                                      style={{
                                        width: `${
                                          ((Number(width) || 1) /
                                            totalWidth) *
                                          100
                                        }%`,
                                      }}
                                    />
                                  ),
                                )}
                              </colgroup>
                              <tbody>
                                {block.table.rows.map((row) => (
                                  <tr key={row.id}>
                                    {row.cells.map((cell) => {
                                      if (cell.hidden) return null;

                                      return (
                                        <td
                                          key={cell.id}
                                          rowSpan={cell.rowSpan}
                                          colSpan={cell.colSpan}
                                          style={{ textAlign: cell.align }}
                                        >
                                          {resolveTokens(
                                            cell.content,
                                            selectedQuotation,
                                            selectedClient,
                                            selectedProject,
                                          )}
                                        </td>
                                      );
                                    })}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          );
                        }

                        if (block.type === "totals") {
                          return (
                            <div
                              className="document-preview-totals"
                              key={block.id}
                            >
                              <div>
                                <span>Subtotal</span>
                                <strong>
                                  BDT{" "}
                                  {money.format(
                                    selectedQuotation?.subtotal ?? 0,
                                  )}
                                </strong>
                              </div>
                              <div>
                                <span>Grand Total</span>
                                <strong>
                                  BDT{" "}
                                  {money.format(
                                    selectedQuotation?.grandTotal ?? 0,
                                  )}
                                </strong>
                              </div>
                            </div>
                          );
                        }

                        const resolved = resolveTokens(
                          block.content,
                          selectedQuotation,
                          selectedClient,
                          selectedProject,
                        );

                        return block.type === "heading" ? (
                          <h3
                            key={block.id}
                            style={{ textAlign: block.align }}
                          >
                            {resolved}
                          </h3>
                        ) : (
                          <div
                            key={block.id}
                            style={{
                              textAlign: block.align,
                              whiteSpace: "pre-wrap",
                            }}
                          >
                            {resolved}
                          </div>
                        );
                      })}
                    </div>

                    {page.settings.footerMode !== "none" && (
                      <div className="document-instance-footer">
                        {page.settings.footerMode === "manual"
                          ? resolveTokens(
                              page.settings.footerText,
                              selectedQuotation,
                              selectedClient,
                              selectedProject,
                            )
                          : "Footer image"}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {createOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={() => setCreateOpen(false)}
        >
          <div
            className="modal-card document-create-modal"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-heading">
              <div>
                <span className="panel-kicker">New document instance</span>
                <h2>Quotation → Document</h2>
              </div>

              <button
                type="button"
                className="icon-button"
                onClick={() => setCreateOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <form className="workspace-form" onSubmit={submitCreate}>
              <div className="form-grid">
                <label className="form-span-2">
                  <span>Quotation revision *</span>
                  <select
                    required
                    value={createQuotationId}
                    onChange={(event) => {
                      const id = event.target.value;
                      const quotation = quotations.find(
                        (item) => item.id === id,
                      );

                      setCreateQuotationId(id);

                      if (!createTitle.trim()) {
                        setCreateTitle(quotation?.title ?? "");
                      }
                    }}
                  >
                    <option value="">Select quotation</option>
                    {quotations.map((quotation) => (
                      <option key={quotation.id} value={quotation.id}>
                        {quotation.quotationNo} · Rev{" "}
                        {quotation.revisionNo} · {quotation.title}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="form-span-2">
                  <span>Master template *</span>
                  <select
                    required
                    value={createTemplateId}
                    onChange={(event) =>
                      setCreateTemplateId(event.target.value)
                    }
                  >
                    <option value="">Select template</option>
                    {templates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name} · {template.pages.length} page(s)
                      </option>
                    ))}
                  </select>
                </label>

                <label className="form-span-2">
                  <span>Document title</span>
                  <input
                    value={createTitle}
                    onChange={(event) =>
                      setCreateTitle(event.target.value)
                    }
                    placeholder="Document title"
                  />
                </label>
              </div>

              <div className="document-create-note">
                A snapshot of the selected template will be saved inside this
                document. Later document edits will not change the master
                template.
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setCreateOpen(false)}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="button button-primary"
                  disabled={creating}
                >
                  <FilePlus2 size={15} />
                  {creating ? "Creating..." : "Create document"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
