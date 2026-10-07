"use client";

import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowUp,
  Copy,
  FileImage,
  FilePlus2,
  Heading1,
  ImagePlus,
  Layers3,
  Minus,
  Plus,
  Save,
  Settings2,
  Table2,
  Trash2,
  Type,
} from "lucide-react";
import {
  ChangeEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Client, Project } from "@/types/workspace";
import type { Quotation } from "@/types/quotation";
import type {
  DocumentBlock,
  DocumentBlockType,
  DocumentTemplate,
  PageSettings,
  PaperSize,
  ReusableSection,
  TemplatePage,
} from "@/types/document-builder";

type TemplatePayload = {
  templates: DocumentTemplate[];
  sections: ReusableSection[];
  quotations: Quotation[];
  clients: Client[];
  projects: Project[];
};

const paperSizes: Record<
  Exclude<PaperSize, "Custom">,
  { width: number; height: number }
> = {
  A3: { width: 297, height: 420 },
  A4: { width: 210, height: 297 },
  A5: { width: 148, height: 210 },
  Letter: { width: 215.9, height: 279.4 },
  Legal: { width: 215.9, height: 355.6 },
};

function newBlock(type: DocumentBlockType): DocumentBlock {
  const contentByType: Record<DocumentBlockType, string> = {
    heading: "New Heading",
    text: "Write your text here.",
    field: "{{client.name}}",
    divider: "",
    quotation_table: "",
    totals: "",
  };

  return {
    id: crypto.randomUUID(),
    type,
    content: contentByType[type],
    align: "left",
  };
}

function defaultPageSettings(): PageSettings {
  return {
    paperSize: "A4",
    orientation: "portrait",
    customWidthMm: 210,
    customHeightMm: 297,

    marginTopMm: 18,
    marginBottomMm: 18,
    marginLeftMm: 18,
    marginRightMm: 18,

    headerMode: "none",
    headerText: "",
    headerImageData: "",
    headerHeightMm: 20,

    footerMode: "none",
    footerText: "",
    footerImageData: "",
    footerHeightMm: 16,
  };
}

function newPage(index: number): TemplatePage {
  return {
    id: crypto.randomUUID(),
    name: `Page ${index}`,
    settings: defaultPageSettings(),
    blocks: [newBlock("heading"), newBlock("text")],
  };
}

function deepClonePage(source: TemplatePage): TemplatePage {
  return {
    ...source,
    id: crypto.randomUUID(),
    settings: { ...source.settings },
    blocks: source.blocks.map((block) => ({
      ...block,
      id: crypto.randomUUID(),
    })),
  };
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-BD", {
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function tokenMap(
  quotation: Quotation | null,
  client: Client | null,
  project: Project | null,
) {
  return {
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
      ? `BDT ${formatMoney(quotation.subtotal)}`
      : "BDT 0",
    "{{quotation.grandTotal}}": quotation
      ? `BDT ${formatMoney(quotation.grandTotal)}`
      : "BDT 0",
    "{{company.name}}": "ASB Elevator",
  };
}

function resolveTokens(
  content: string,
  quotation: Quotation | null,
  client: Client | null,
  project: Project | null,
) {
  let output = content;
  const tokens = tokenMap(quotation, client, project);

  Object.entries(tokens).forEach(([token, value]) => {
    output = output.split(token).join(value);
  });

  return output;
}

function pageDimensions(settings: PageSettings) {
  const base =
    settings.paperSize === "Custom"
      ? {
          width: Math.max(50, Number(settings.customWidthMm) || 210),
          height: Math.max(50, Number(settings.customHeightMm) || 297),
        }
      : paperSizes[settings.paperSize];

  if (settings.orientation === "landscape") {
    return {
      width: base.height,
      height: base.width,
    };
  }

  return base;
}

function uploadImage(
  event: ChangeEvent<HTMLInputElement>,
  onLoad: (data: string) => void,
) {
  const file = event.target.files?.[0];

  if (!file) {
    return;
  }

  const reader = new FileReader();

  reader.onload = () => {
    if (typeof reader.result === "string") {
      onLoad(reader.result);
    }
  };

  reader.readAsDataURL(file);
}

export function TemplateBuilderWorkspace() {
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [sections, setSections] = useState<ReusableSection[]>([]);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);

  const [templateId, setTemplateId] = useState("");
  const [pageId, setPageId] = useState("");
  const [previewQuotationId, setPreviewQuotationId] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const load = async (preferTemplateId?: string) => {
    setLoading(true);

    try {
      const response = await fetch("/api/templates", { cache: "no-store" });
      const data = (await response.json()) as TemplatePayload;

      setTemplates(data.templates ?? []);
      setSections(data.sections ?? []);
      setQuotations(data.quotations ?? []);
      setClients(data.clients ?? []);
      setProjects(data.projects ?? []);

      const chosenTemplate =
        data.templates.find((item) => item.id === preferTemplateId) ??
        data.templates.find((item) => item.id === templateId) ??
        data.templates[0];

      if (chosenTemplate) {
        setTemplateId(chosenTemplate.id);

        const chosenPage =
          chosenTemplate.pages.find((item) => item.id === pageId) ??
          chosenTemplate.pages[0];

        setPageId(chosenPage?.id ?? "");
      }

      const url = new URL(window.location.href);
      const requestedQuotation = url.searchParams.get("quotation");

      if (
        requestedQuotation &&
        data.quotations.some((item) => item.id === requestedQuotation)
      ) {
        setPreviewQuotationId(requestedQuotation);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const activeTemplate =
    templates.find((template) => template.id === templateId) ?? null;

  const activePage =
    activeTemplate?.pages.find((page) => page.id === pageId) ?? null;

  const previewQuotation =
    quotations.find((quotation) => quotation.id === previewQuotationId) ?? null;

  const previewClient =
    clients.find((client) => client.id === previewQuotation?.clientId) ?? null;

  const previewProject =
    projects.find((project) => project.id === previewQuotation?.projectId) ?? null;

  const dimensions = activePage
    ? pageDimensions(activePage.settings)
    : { width: 210, height: 297 };

  const updateTemplateLocal = (
    updater: (template: DocumentTemplate) => DocumentTemplate,
  ) => {
    setTemplates((current) =>
      current.map((template) =>
        template.id === templateId ? updater(template) : template,
      ),
    );
  };

  const updatePage = (patch: Partial<TemplatePage>) => {
    if (!activePage) {
      return;
    }

    updateTemplateLocal((template) => ({
      ...template,
      pages: template.pages.map((page) =>
        page.id === activePage.id ? { ...page, ...patch } : page,
      ),
    }));
  };

  const updatePageSettings = (patch: Partial<PageSettings>) => {
    if (!activePage) {
      return;
    }

    updatePage({
      settings: {
        ...activePage.settings,
        ...patch,
      },
    });
  };

  const updateBlock = (id: string, patch: Partial<DocumentBlock>) => {
    if (!activePage) {
      return;
    }

    updatePage({
      blocks: activePage.blocks.map((block) =>
        block.id === id ? { ...block, ...patch } : block,
      ),
    });
  };

  const moveBlock = (id: string, direction: -1 | 1) => {
    if (!activePage) {
      return;
    }

    const index = activePage.blocks.findIndex((block) => block.id === id);
    const target = index + direction;

    if (index < 0 || target < 0 || target >= activePage.blocks.length) {
      return;
    }

    const next = [...activePage.blocks];
    [next[index], next[target]] = [next[target], next[index]];

    updatePage({ blocks: next });
  };

  const movePage = (id: string, direction: -1 | 1) => {
    if (!activeTemplate) {
      return;
    }

    const index = activeTemplate.pages.findIndex((page) => page.id === id);
    const target = index + direction;

    if (index < 0 || target < 0 || target >= activeTemplate.pages.length) {
      return;
    }

    updateTemplateLocal((template) => {
      const pages = [...template.pages];
      [pages[index], pages[target]] = [pages[target], pages[index]];

      return {
        ...template,
        pages,
      };
    });
  };

  const addPage = () => {
    if (!activeTemplate) {
      return;
    }

    const created = newPage(activeTemplate.pages.length + 1);

    updateTemplateLocal((template) => ({
      ...template,
      pages: [...template.pages, created],
    }));

    setPageId(created.id);
  };

  const duplicatePage = () => {
    if (!activeTemplate || !activePage) {
      return;
    }

    const copy = deepClonePage(activePage);
    copy.name = `${activePage.name} Copy`;

    const index = activeTemplate.pages.findIndex(
      (page) => page.id === activePage.id,
    );

    updateTemplateLocal((template) => {
      const pages = [...template.pages];
      pages.splice(index + 1, 0, copy);

      return {
        ...template,
        pages,
      };
    });

    setPageId(copy.id);
  };

  const deletePage = () => {
    if (!activeTemplate || !activePage) {
      return;
    }

    if (activeTemplate.pages.length <= 1) {
      window.alert("A template must keep at least one page.");
      return;
    }

    if (!window.confirm(`Delete "${activePage.name}"?`)) {
      return;
    }

    const index = activeTemplate.pages.findIndex(
      (page) => page.id === activePage.id,
    );

    const nextPages = activeTemplate.pages.filter(
      (page) => page.id !== activePage.id,
    );

    updateTemplateLocal((template) => ({
      ...template,
      pages: nextPages,
    }));

    setPageId(nextPages[Math.max(0, index - 1)]?.id ?? nextPages[0]?.id ?? "");
  };

  const addSectionPage = (section: ReusableSection) => {
    if (!activeTemplate) {
      return;
    }

    const created = deepClonePage(section.page);

    updateTemplateLocal((template) => ({
      ...template,
      pages: [...template.pages, created],
    }));

    setPageId(created.id);
  };

  const saveCurrentPageAsSection = async () => {
    if (!activePage) {
      return;
    }

    const name = window.prompt("Reusable section name:", activePage.name);

    if (!name) {
      return;
    }

    const response = await fetch("/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "save_section",
        name,
        page: activePage,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      window.alert(data.error || "Unable to save reusable section.");
      return;
    }

    await load(templateId);
    setMessage("Reusable section saved.");
  };

  const saveTemplate = async () => {
    if (!activeTemplate) {
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      const response = await fetch("/api/templates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(activeTemplate),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to save template.");
      }

      await load(data.template.id);
      setMessage("Template saved.");
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : "Unable to save template.",
      );
    } finally {
      setSaving(false);
    }
  };

  const createTemplate = async () => {
    const name = window.prompt("Template name:", "New Template");

    if (!name) {
      return;
    }

    const response = await fetch("/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create",
        name,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      window.alert(data.error || "Unable to create template.");
      return;
    }

    await load(data.template.id);
  };

  const duplicateTemplate = async () => {
    if (!activeTemplate) {
      return;
    }

    const response = await fetch("/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "duplicate",
        id: activeTemplate.id,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      window.alert(data.error || "Unable to duplicate template.");
      return;
    }

    await load(data.template.id);
  };

  const deleteTemplate = async () => {
    if (!activeTemplate) {
      return;
    }

    if (!window.confirm(`Delete template "${activeTemplate.name}"?`)) {
      return;
    }

    const response = await fetch(
      `/api/templates?id=${encodeURIComponent(activeTemplate.id)}`,
      { method: "DELETE" },
    );

    const data = await response.json();

    if (!response.ok) {
      window.alert(data.error || "Unable to delete template.");
      return;
    }

    setTemplateId("");
    setPageId("");
    await load();
  };

  const availableTokens = useMemo(
    () => [
      "{{company.name}}",
      "{{client.name}}",
      "{{client.address}}",
      "{{client.phone}}",
      "{{client.email}}",
      "{{project.name}}",
      "{{project.code}}",
      "{{project.location}}",
      "{{quotation.no}}",
      "{{quotation.revision}}",
      "{{quotation.title}}",
      "{{quotation.subject}}",
      "{{quotation.date}}",
      "{{quotation.validityDays}}",
      "{{quotation.subtotal}}",
      "{{quotation.grandTotal}}",
    ],
    [],
  );

  if (loading && templates.length === 0) {
    return <div className="record-empty">Loading document builder...</div>;
  }

  return (
    <div className="page-stack">
      <div className="page-heading-row builder-heading-row">
        <div>
          <div className="eyebrow">Custom document system</div>
          <h1>Template Builder</h1>
          <p>
            Build unlimited page structures with independent page sizes, margins,
            headers, footers and quotation-linked content.
          </p>
        </div>

        <div className="builder-top-actions">
          <button
            type="button"
            className="button button-secondary"
            onClick={() => void createTemplate()}
          >
            <FilePlus2 size={16} />
            New template
          </button>

          <button
            type="button"
            className="button button-secondary"
            onClick={() => void duplicateTemplate()}
            disabled={!activeTemplate}
          >
            <Copy size={16} />
            Duplicate template
          </button>

          <button
            type="button"
            className="button button-primary"
            onClick={() => void saveTemplate()}
            disabled={!activeTemplate || saving}
          >
            <Save size={16} />
            {saving ? "Saving..." : "Save template"}
          </button>
        </div>
      </div>

      {message && <div className="builder-message">{message}</div>}

      <section className="builder-toolbar">
        <label>
          <span>Template</span>
          <select
            value={templateId}
            onChange={(event) => {
              const nextId = event.target.value;
              setTemplateId(nextId);

              const next = templates.find((item) => item.id === nextId);
              setPageId(next?.pages[0]?.id ?? "");
            }}
          >
            {templates.map((template) => (
              <option value={template.id} key={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </label>

        <label className="builder-template-name">
          <span>Template name</span>
          <input
            value={activeTemplate?.name ?? ""}
            onChange={(event) =>
              updateTemplateLocal((template) => ({
                ...template,
                name: event.target.value,
              }))
            }
          />
        </label>

        <label>
          <span>Preview quotation</span>
          <select
            value={previewQuotationId}
            onChange={(event) => setPreviewQuotationId(event.target.value)}
          >
            <option value="">Demo values</option>
            {quotations.map((quotation) => (
              <option value={quotation.id} key={quotation.id}>
                {quotation.quotationNo} · Rev {quotation.revisionNo} ·{" "}
                {quotation.title}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          className="button button-secondary builder-delete-template"
          onClick={() => void deleteTemplate()}
        >
          <Trash2 size={15} />
          Delete template
        </button>
      </section>

      <section className="document-builder-layout">
        <aside className="builder-pages-panel">
          <div className="builder-panel-title">
            <div>
              <Layers3 size={16} />
              <strong>Pages</strong>
            </div>
            <button type="button" className="icon-button" onClick={addPage}>
              <Plus size={15} />
            </button>
          </div>

          <div className="builder-page-list">
            {activeTemplate?.pages.map((page, index) => (
              <button
                type="button"
                key={page.id}
                className={
                  page.id === pageId
                    ? "builder-page-card builder-page-card-active"
                    : "builder-page-card"
                }
                onClick={() => setPageId(page.id)}
              >
                <span className="builder-page-number">{index + 1}</span>
                <span>
                  <strong>{page.name}</strong>
                  <small>
                    {page.settings.paperSize} · {page.settings.orientation}
                  </small>
                </span>
              </button>
            ))}
          </div>

          <div className="builder-page-actions">
            <button
              type="button"
              className="button button-secondary"
              onClick={duplicatePage}
            >
              <Copy size={14} />
              Duplicate page
            </button>

            <div className="builder-inline-actions">
              <button
                type="button"
                className="icon-button"
                onClick={() => activePage && movePage(activePage.id, -1)}
              >
                <ArrowUp size={15} />
              </button>
              <button
                type="button"
                className="icon-button"
                onClick={() => activePage && movePage(activePage.id, 1)}
              >
                <ArrowDown size={15} />
              </button>
              <button
                type="button"
                className="icon-button"
                onClick={deletePage}
              >
                <Trash2 size={15} />
              </button>
            </div>
          </div>

          <div className="builder-section-library">
            <span className="builder-subtitle">Reusable sections</span>

            <button
              type="button"
              className="builder-library-save"
              onClick={() => void saveCurrentPageAsSection()}
            >
              Save current page to library
            </button>

            {sections.length === 0 ? (
              <p>No reusable sections saved yet.</p>
            ) : (
              sections.map((section) => (
                <button
                  type="button"
                  key={section.id}
                  className="builder-library-item"
                  onClick={() => addSectionPage(section)}
                >
                  <Plus size={13} />
                  {section.name}
                </button>
              ))
            )}
          </div>
        </aside>

        <div className="builder-canvas-panel">
          {activePage ? (
            <>
              <div className="builder-canvas-meta">
                <span>
                  {activePage.settings.paperSize} · {Math.round(dimensions.width)} ×{" "}
                  {Math.round(dimensions.height)} mm ·{" "}
                  {activePage.settings.orientation}
                </span>
                <span>Page preview</span>
              </div>

              <div className="paper-stage">
                <div
                  className="document-paper"
                  style={{
                    aspectRatio: `${dimensions.width} / ${dimensions.height}`,
                  }}
                >
                  <div
                    className="document-paper-inner"
                    style={{
                      paddingTop: `${Math.max(
                        2,
                        (activePage.settings.marginTopMm / dimensions.height) * 100,
                      )}%`,
                      paddingBottom: `${Math.max(
                        2,
                        (activePage.settings.marginBottomMm / dimensions.height) * 100,
                      )}%`,
                      paddingLeft: `${Math.max(
                        2,
                        (activePage.settings.marginLeftMm / dimensions.width) * 100,
                      )}%`,
                      paddingRight: `${Math.max(
                        2,
                        (activePage.settings.marginRightMm / dimensions.width) * 100,
                      )}%`,
                    }}
                  >
                    {activePage.settings.headerMode !== "none" && (
                      <div
                        className="document-preview-header"
                        style={{
                          minHeight: `${Math.max(
                            24,
                            activePage.settings.headerHeightMm * 2,
                          )}px`,
                        }}
                      >
                        {activePage.settings.headerMode === "manual" ? (
                          resolveTokens(
                            activePage.settings.headerText,
                            previewQuotation,
                            previewClient,
                            previewProject,
                          )
                        ) : activePage.settings.headerImageData ? (
                          <div
                            className="document-preview-image"
                            style={{
                              backgroundImage: `url("${activePage.settings.headerImageData}")`,
                            }}
                          />
                        ) : (
                          <span>Header image not selected</span>
                        )}
                      </div>
                    )}

                    <div className="document-preview-content">
                      {activePage.blocks.map((block) => {
                        if (block.type === "divider") {
                          return <hr key={block.id} />;
                        }

                        if (block.type === "quotation_table") {
                          return (
                            <div className="document-preview-table" key={block.id}>
                              <div className="document-preview-table-head">
                                <span>SL</span>
                                <span>Description</span>
                                <span>Qty</span>
                                <span>Rate</span>
                                <span>Total</span>
                              </div>

                              {(previewQuotation?.items ?? []).length === 0 ? (
                                <div className="document-preview-table-empty">
                                  Quotation items will appear here.
                                </div>
                              ) : (
                                previewQuotation?.items.map((item, index) => (
                                  <div
                                    className="document-preview-table-row"
                                    key={item.id}
                                  >
                                    <span>{index + 1}</span>
                                    <span>{item.description}</span>
                                    <span>
                                      {item.quantity} {item.unit}
                                    </span>
                                    <span>{formatMoney(item.rate)}</span>
                                    <span>{formatMoney(item.total)}</span>
                                  </div>
                                ))
                              )}
                            </div>
                          );
                        }

                        if (block.type === "totals") {
                          return (
                            <div className="document-preview-totals" key={block.id}>
                              <div>
                                <span>Subtotal</span>
                                <strong>
                                  {previewQuotation
                                    ? `BDT ${formatMoney(previewQuotation.subtotal)}`
                                    : "BDT 0"}
                                </strong>
                              </div>
                              <div>
                                <span>Grand Total</span>
                                <strong>
                                  {previewQuotation
                                    ? `BDT ${formatMoney(previewQuotation.grandTotal)}`
                                    : "BDT 0"}
                                </strong>
                              </div>
                            </div>
                          );
                        }

                        const resolved = resolveTokens(
                          block.content,
                          previewQuotation,
                          previewClient,
                          previewProject,
                        );

                        if (block.type === "heading") {
                          return (
                            <h3
                              key={block.id}
                              style={{ textAlign: block.align }}
                            >
                              {resolved || "Heading"}
                            </h3>
                          );
                        }

                        return (
                          <div
                            key={block.id}
                            className={
                              block.type === "field"
                                ? "document-preview-field"
                                : "document-preview-text"
                            }
                            style={{
                              textAlign: block.align,
                              whiteSpace: "pre-wrap",
                            }}
                          >
                            {resolved || " "}
                          </div>
                        );
                      })}
                    </div>

                    {activePage.settings.footerMode !== "none" && (
                      <div
                        className="document-preview-footer"
                        style={{
                          minHeight: `${Math.max(
                            20,
                            activePage.settings.footerHeightMm * 2,
                          )}px`,
                        }}
                      >
                        {activePage.settings.footerMode === "manual" ? (
                          resolveTokens(
                            activePage.settings.footerText,
                            previewQuotation,
                            previewClient,
                            previewProject,
                          )
                        ) : activePage.settings.footerImageData ? (
                          <div
                            className="document-preview-image"
                            style={{
                              backgroundImage: `url("${activePage.settings.footerImageData}")`,
                            }}
                          />
                        ) : (
                          <span>Footer image not selected</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="detail-empty">
              <Layers3 size={28} />
              <strong>Select a page</strong>
            </div>
          )}
        </div>

        <aside className="builder-settings-panel">
          {activePage && (
            <>
              <div className="builder-panel-title">
                <div>
                  <Settings2 size={16} />
                  <strong>Page settings</strong>
                </div>
              </div>

              <div className="builder-settings-scroll">
                <label className="builder-field">
                  <span>Page name</span>
                  <input
                    value={activePage.name}
                    onChange={(event) =>
                      updatePage({ name: event.target.value })
                    }
                  />
                </label>

                <div className="builder-field-grid">
                  <label className="builder-field">
                    <span>Paper size</span>
                    <select
                      value={activePage.settings.paperSize}
                      onChange={(event) =>
                        updatePageSettings({
                          paperSize: event.target.value as PaperSize,
                        })
                      }
                    >
                      <option value="A3">A3</option>
                      <option value="A4">A4</option>
                      <option value="A5">A5</option>
                      <option value="Letter">Letter</option>
                      <option value="Legal">Legal</option>
                      <option value="Custom">Custom</option>
                    </select>
                  </label>

                  <label className="builder-field">
                    <span>Orientation</span>
                    <select
                      value={activePage.settings.orientation}
                      onChange={(event) =>
                        updatePageSettings({
                          orientation: event.target.value as
                            | "portrait"
                            | "landscape",
                        })
                      }
                    >
                      <option value="portrait">Portrait</option>
                      <option value="landscape">Landscape</option>
                    </select>
                  </label>
                </div>

                {activePage.settings.paperSize === "Custom" && (
                  <div className="builder-field-grid">
                    <label className="builder-field">
                      <span>Width (mm)</span>
                      <input
                        type="number"
                        min="50"
                        value={activePage.settings.customWidthMm}
                        onChange={(event) =>
                          updatePageSettings({
                            customWidthMm: Number(event.target.value),
                          })
                        }
                      />
                    </label>

                    <label className="builder-field">
                      <span>Height (mm)</span>
                      <input
                        type="number"
                        min="50"
                        value={activePage.settings.customHeightMm}
                        onChange={(event) =>
                          updatePageSettings({
                            customHeightMm: Number(event.target.value),
                          })
                        }
                      />
                    </label>
                  </div>
                )}

                <span className="builder-subtitle">Margins (mm)</span>

                <div className="builder-margin-grid">
                  {[
                    ["Top", "marginTopMm"],
                    ["Bottom", "marginBottomMm"],
                    ["Left", "marginLeftMm"],
                    ["Right", "marginRightMm"],
                  ].map(([label, key]) => (
                    <label className="builder-field" key={key}>
                      <span>{label}</span>
                      <input
                        type="number"
                        min="0"
                        value={
                          activePage.settings[
                            key as
                              | "marginTopMm"
                              | "marginBottomMm"
                              | "marginLeftMm"
                              | "marginRightMm"
                          ]
                        }
                        onChange={(event) =>
                          updatePageSettings({
                            [key]: Number(event.target.value),
                          })
                        }
                      />
                    </label>
                  ))}
                </div>

                <span className="builder-subtitle">Header</span>

                <label className="builder-field">
                  <span>Header type</span>
                  <select
                    value={activePage.settings.headerMode}
                    onChange={(event) =>
                      updatePageSettings({
                        headerMode: event.target.value as
                          | "none"
                          | "manual"
                          | "image",
                      })
                    }
                  >
                    <option value="none">None</option>
                    <option value="manual">Manual text</option>
                    <option value="image">Image</option>
                  </select>
                </label>

                {activePage.settings.headerMode === "manual" && (
                  <label className="builder-field">
                    <span>Header text</span>
                    <textarea
                      rows={2}
                      value={activePage.settings.headerText}
                      onChange={(event) =>
                        updatePageSettings({
                          headerText: event.target.value,
                        })
                      }
                    />
                  </label>
                )}

                {activePage.settings.headerMode === "image" && (
                  <label className="builder-upload">
                    <ImagePlus size={16} />
                    <span>
                      {activePage.settings.headerImageData
                        ? "Replace header image"
                        : "Upload header image"}
                    </span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(event) =>
                        uploadImage(event, (data) =>
                          updatePageSettings({ headerImageData: data }),
                        )
                      }
                    />
                  </label>
                )}

                <span className="builder-subtitle">Footer</span>

                <label className="builder-field">
                  <span>Footer type</span>
                  <select
                    value={activePage.settings.footerMode}
                    onChange={(event) =>
                      updatePageSettings({
                        footerMode: event.target.value as
                          | "none"
                          | "manual"
                          | "image",
                      })
                    }
                  >
                    <option value="none">None</option>
                    <option value="manual">Manual text</option>
                    <option value="image">Image</option>
                  </select>
                </label>

                {activePage.settings.footerMode === "manual" && (
                  <label className="builder-field">
                    <span>Footer text</span>
                    <textarea
                      rows={2}
                      value={activePage.settings.footerText}
                      onChange={(event) =>
                        updatePageSettings({
                          footerText: event.target.value,
                        })
                      }
                    />
                  </label>
                )}

                {activePage.settings.footerMode === "image" && (
                  <label className="builder-upload">
                    <FileImage size={16} />
                    <span>
                      {activePage.settings.footerImageData
                        ? "Replace footer image"
                        : "Upload footer image"}
                    </span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(event) =>
                        uploadImage(event, (data) =>
                          updatePageSettings({ footerImageData: data }),
                        )
                      }
                    />
                  </label>
                )}

                <div className="builder-block-heading">
                  <span className="builder-subtitle">Page blocks</span>
                  <div>
                    <button
                      type="button"
                      className="icon-button"
                      title="Add heading"
                      onClick={() =>
                        updatePage({
                          blocks: [...activePage.blocks, newBlock("heading")],
                        })
                      }
                    >
                      <Heading1 size={14} />
                    </button>

                    <button
                      type="button"
                      className="icon-button"
                      title="Add text"
                      onClick={() =>
                        updatePage({
                          blocks: [...activePage.blocks, newBlock("text")],
                        })
                      }
                    >
                      <Type size={14} />
                    </button>

                    <button
                      type="button"
                      className="icon-button"
                      title="Add field"
                      onClick={() =>
                        updatePage({
                          blocks: [...activePage.blocks, newBlock("field")],
                        })
                      }
                    >
                      <Plus size={14} />
                    </button>

                    <button
                      type="button"
                      className="icon-button"
                      title="Add divider"
                      onClick={() =>
                        updatePage({
                          blocks: [...activePage.blocks, newBlock("divider")],
                        })
                      }
                    >
                      <Minus size={14} />
                    </button>

                    <button
                      type="button"
                      className="icon-button"
                      title="Add quotation table"
                      onClick={() =>
                        updatePage({
                          blocks: [
                            ...activePage.blocks,
                            newBlock("quotation_table"),
                          ],
                        })
                      }
                    >
                      <Table2 size={14} />
                    </button>
                  </div>
                </div>

                <div className="builder-block-list">
                  {activePage.blocks.map((block, index) => (
                    <div className="builder-block-card" key={block.id}>
                      <div className="builder-block-top">
                        <select
                          value={block.type}
                          onChange={(event) =>
                            updateBlock(block.id, {
                              type: event.target.value as DocumentBlockType,
                            })
                          }
                        >
                          <option value="heading">Heading</option>
                          <option value="text">Text</option>
                          <option value="field">Dynamic field</option>
                          <option value="divider">Divider</option>
                          <option value="quotation_table">
                            Quotation table
                          </option>
                          <option value="totals">Totals</option>
                        </select>

                        <div className="builder-inline-actions">
                          <button
                            type="button"
                            className="icon-button"
                            disabled={index === 0}
                            onClick={() => moveBlock(block.id, -1)}
                          >
                            <ArrowUp size={13} />
                          </button>
                          <button
                            type="button"
                            className="icon-button"
                            disabled={index === activePage.blocks.length - 1}
                            onClick={() => moveBlock(block.id, 1)}
                          >
                            <ArrowDown size={13} />
                          </button>
                          <button
                            type="button"
                            className="icon-button"
                            onClick={() =>
                              updatePage({
                                blocks: activePage.blocks.filter(
                                  (item) => item.id !== block.id,
                                ),
                              })
                            }
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>

                      {!["divider", "quotation_table", "totals"].includes(
                        block.type,
                      ) && (
                        <>
                          {block.type === "field" ? (
                            <select
                              className="builder-block-content"
                              value={block.content}
                              onChange={(event) =>
                                updateBlock(block.id, {
                                  content: event.target.value,
                                })
                              }
                            >
                              {availableTokens.map((token) => (
                                <option value={token} key={token}>
                                  {token}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <textarea
                              className="builder-block-content"
                              rows={block.type === "heading" ? 2 : 4}
                              value={block.content}
                              onChange={(event) =>
                                updateBlock(block.id, {
                                  content: event.target.value,
                                })
                              }
                            />
                          )}

                          <div className="builder-align-row">
                            {[
                              ["left", AlignLeft],
                              ["center", AlignCenter],
                              ["right", AlignRight],
                            ].map(([align, Icon]) => {
                              const AlignIcon = Icon as typeof AlignLeft;

                              return (
                                <button
                                  type="button"
                                  key={String(align)}
                                  className={
                                    block.align === align
                                      ? "icon-button builder-align-active"
                                      : "icon-button"
                                  }
                                  onClick={() =>
                                    updateBlock(block.id, {
                                      align: align as
                                        | "left"
                                        | "center"
                                        | "right",
                                    })
                                  }
                                >
                                  <AlignIcon size={13} />
                                </button>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </aside>
      </section>
    </div>
  );
}
