$ErrorActionPreference = "Stop"

$ProjectRoot = "E:\ASB LiftDoc\asb-liftdoc"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " ASB LiftDoc - M6 Document Instances" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path -LiteralPath $ProjectRoot)) {
    throw "Project not found: $ProjectRoot"
}

Set-Location -LiteralPath $ProjectRoot

if (-not (Test-Path -LiteralPath ".git")) {
    throw "Git repository not found."
}

$Dirty = git status --porcelain
$UnexpectedDirty = @(
    $Dirty | Where-Object {
        $_ -notmatch '^\?\? Scripts[/\\]' -and
        $_ -notmatch '^\?\? Backups[/\\]'
    }
)

if ($UnexpectedDirty.Count -gt 0) {
    Write-Host "Unexpected uncommitted changes were found:" -ForegroundColor Yellow
    $UnexpectedDirty | ForEach-Object { Write-Host $_ }
    throw "M6 stopped for safety. Send me the status above."
}

git tag -f checkpoint-m5-advanced-layout HEAD | Out-Null
Write-Host "[OK] Rollback checkpoint: checkpoint-m5-advanced-layout" -ForegroundColor Green

$Port = 3010
$PortFile = Join-Path $ProjectRoot ".liftdoc-port"

if (Test-Path -LiteralPath $PortFile) {
    $Port = [int](Get-Content -LiteralPath $PortFile -Raw).Trim()
}

$Running = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue

if ($Running) {
    Write-Host "Stopping localhost server on port $Port..." -ForegroundColor Yellow
    $Running.OwningProcess | Sort-Object -Unique | ForEach-Object {
        Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 2
}

$Dirs = @(
    "data",
    "src\types",
    "src\lib",
    "src\app\api\documents",
    "src\components\workspace",
    "Backups\M6_Before_Document_Instances"
)

foreach ($Dir in $Dirs) {
    New-Item -ItemType Directory -Path (Join-Path $ProjectRoot $Dir) -Force | Out-Null
}

$GitIgnorePath = Join-Path $ProjectRoot ".gitignore"
$GitIgnore = Get-Content -LiteralPath $GitIgnorePath -Raw

if ($GitIgnore -notmatch "(?m)^/data/documents\.json$") {
    Add-Content -LiteralPath $GitIgnorePath -Value "`n/data/documents.json`n"
}

if ($GitIgnore -notmatch "(?m)^/Backups/$") {
    Add-Content -LiteralPath $GitIgnorePath -Value "/Backups/`n"
}

$BackupRoot = Join-Path $ProjectRoot "Backups\M6_Before_Document_Instances"

$BackupTargets = @(
    "src\types\workspace.ts",
    "src\app\api\search\route.ts",
    "src\components\workspace\global-search-workspace.tsx",
    "src\components\workspace\quotations-workspace.tsx",
    "src\app\documents\page.tsx",
    "src\app\globals.css"
)

foreach ($RelativePath in $BackupTargets) {
    $Source = Join-Path $ProjectRoot $RelativePath

    if (Test-Path -LiteralPath $Source) {
        $SafeName = ($RelativePath -replace '[\\/:*?"<>|]', '_') + ".bak"
        Copy-Item -LiteralPath $Source -Destination (Join-Path $BackupRoot $SafeName) -Force
    }
}

Write-Host "[OK] Safety backup created" -ForegroundColor Green

$DocumentsData = Join-Path $ProjectRoot "data\documents.json"

if (-not (Test-Path -LiteralPath $DocumentsData)) {
@'
{
  "documents": []
}
'@ | Set-Content -LiteralPath $DocumentsData -Encoding UTF8
}

Write-Host "Creating document instance types..." -ForegroundColor Yellow

@'
import type { TemplatePage } from "@/types/document-builder";

export type DocumentStatus = "draft" | "final" | "archived";

export type DocumentInstance = {
  id: string;
  documentNo: string;
  versionNo: number;
  rootDocumentId: string;
  parentDocumentId: string | null;
  duplicatedFromId: string | null;

  quotationId: string;
  quotationNo: string;
  quotationRevisionNo: number;

  clientId: string;
  projectId: string | null;

  templateId: string;
  templateName: string;

  title: string;
  status: DocumentStatus;
  pages: TemplatePage[];

  createdAt: string;
  updatedAt: string;
};

export type DocumentStoreData = {
  documents: DocumentInstance[];
};
'@ | Set-Content -LiteralPath (Join-Path $ProjectRoot "src\types\document-instance.ts") -Encoding UTF8

Write-Host "Extending global search result type..." -ForegroundColor Yellow

$WorkspacePath = Join-Path $ProjectRoot "src\types\workspace.ts"
$WorkspaceText = Get-Content -LiteralPath $WorkspacePath -Raw

if ($WorkspaceText -notmatch '"document"') {
    $WorkspaceText = $WorkspaceText.Replace(
        'type: "client" | "project" | "quotation";',
        'type: "client" | "project" | "quotation" | "document";'
    )
    Set-Content -LiteralPath $WorkspacePath -Value $WorkspaceText -Encoding UTF8
}

Write-Host "Creating document instance store..." -ForegroundColor Yellow

@'
import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import type {
  DocumentInstance,
  DocumentStatus,
  DocumentStoreData,
} from "@/types/document-instance";
import type { TemplatePage } from "@/types/document-builder";
import type { GlobalSearchResult } from "@/types/workspace";
import { readQuotationStore } from "@/lib/quotation-store";
import { readTemplateStore } from "@/lib/template-store";
import { readWorkspace } from "@/lib/workspace-store";

const dataFile = path.join(process.cwd(), "data", "documents.json");

const emptyData: DocumentStoreData = {
  documents: [],
};

let writeQueue = Promise.resolve();

async function ensureDataFile() {
  await fs.mkdir(path.dirname(dataFile), { recursive: true });

  try {
    await fs.access(dataFile);
  } catch {
    await fs.writeFile(dataFile, JSON.stringify(emptyData, null, 2), "utf8");
  }
}

export async function readDocumentStore(): Promise<DocumentStoreData> {
  await ensureDataFile();

  try {
    const raw = await fs.readFile(dataFile, "utf8");
    const parsed = JSON.parse(raw) as Partial<DocumentStoreData>;

    return {
      documents: Array.isArray(parsed.documents) ? parsed.documents : [],
    };
  } catch {
    return structuredClone(emptyData);
  }
}

async function writeDocumentStore(data: DocumentStoreData) {
  writeQueue = writeQueue.then(async () => {
    await ensureDataFile();
    const temporary = `${dataFile}.tmp`;
    await fs.writeFile(temporary, JSON.stringify(data, null, 2), "utf8");
    await fs.rename(temporary, dataFile);
  });

  await writeQueue;
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStatus(value: unknown): DocumentStatus {
  return value === "final" || value === "archived" ? value : "draft";
}

function clonePages(pages: TemplatePage[]): TemplatePage[] {
  return structuredClone(pages);
}

function getNextDocumentNo(documents: DocumentInstance[]) {
  const year = new Date().getFullYear();
  const prefix = `DOC-${year}-`;

  const max = documents.reduce((current, document) => {
    if (!document.documentNo.startsWith(prefix)) {
      return current;
    }

    const suffix = Number(document.documentNo.slice(prefix.length));
    return Number.isFinite(suffix) ? Math.max(current, suffix) : current;
  }, 0);

  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

export async function createDocumentInstance(input: {
  quotationId: string;
  templateId: string;
  title?: string;
}) {
  const quotationId = cleanText(input.quotationId);
  const templateId = cleanText(input.templateId);

  const [documentStore, quotationStore, templateStore] = await Promise.all([
    readDocumentStore(),
    readQuotationStore(),
    readTemplateStore(),
  ]);

  const quotation = quotationStore.quotations.find(
    (record) => record.id === quotationId,
  );

  if (!quotation) {
    throw new Error("Selected quotation was not found.");
  }

  const template = templateStore.templates.find(
    (record) => record.id === templateId,
  );

  if (!template) {
    throw new Error("Selected template was not found.");
  }

  const now = new Date().toISOString();
  const id = randomUUID();

  const document: DocumentInstance = {
    id,
    documentNo: getNextDocumentNo(documentStore.documents),
    versionNo: 0,
    rootDocumentId: id,
    parentDocumentId: null,
    duplicatedFromId: null,

    quotationId: quotation.id,
    quotationNo: quotation.quotationNo,
    quotationRevisionNo: quotation.revisionNo,

    clientId: quotation.clientId,
    projectId: quotation.projectId,

    templateId: template.id,
    templateName: template.name,

    title: cleanText(input.title) || quotation.title,
    status: "draft",
    pages: clonePages(template.pages),

    createdAt: now,
    updatedAt: now,
  };

  documentStore.documents.unshift(document);
  await writeDocumentStore(documentStore);

  return document;
}

export async function updateDocumentInstance(
  input: Partial<DocumentInstance> & { id: string },
) {
  const store = await readDocumentStore();
  const index = store.documents.findIndex((record) => record.id === input.id);

  if (index === -1) {
    throw new Error("Document not found.");
  }

  const current = store.documents[index];

  const updated: DocumentInstance = {
    ...current,
    title:
      input.title === undefined
        ? current.title
        : cleanText(input.title) || current.title,
    status:
      input.status === undefined
        ? current.status
        : normalizeStatus(input.status),
    pages: Array.isArray(input.pages) ? clonePages(input.pages) : current.pages,
    updatedAt: new Date().toISOString(),
  };

  store.documents[index] = updated;
  await writeDocumentStore(store);

  return updated;
}

export async function duplicateDocumentInstance(sourceId: string) {
  const store = await readDocumentStore();
  const source = store.documents.find((record) => record.id === sourceId);

  if (!source) {
    throw new Error("Source document not found.");
  }

  const now = new Date().toISOString();
  const id = randomUUID();

  const copy: DocumentInstance = {
    ...source,
    id,
    documentNo: getNextDocumentNo(store.documents),
    versionNo: 0,
    rootDocumentId: id,
    parentDocumentId: null,
    duplicatedFromId: source.id,
    status: "draft",
    pages: clonePages(source.pages),
    createdAt: now,
    updatedAt: now,
  };

  store.documents.unshift(copy);
  await writeDocumentStore(store);

  return copy;
}

export async function createDocumentVersion(sourceId: string) {
  const store = await readDocumentStore();
  const source = store.documents.find((record) => record.id === sourceId);

  if (!source) {
    throw new Error("Source document not found.");
  }

  const sameSeries = store.documents.filter(
    (record) => record.rootDocumentId === source.rootDocumentId,
  );

  const nextVersion =
    sameSeries.reduce(
      (max, record) => Math.max(max, record.versionNo),
      source.versionNo,
    ) + 1;

  const now = new Date().toISOString();

  const version: DocumentInstance = {
    ...source,
    id: randomUUID(),
    versionNo: nextVersion,
    parentDocumentId: source.id,
    duplicatedFromId: null,
    status: "draft",
    pages: clonePages(source.pages),
    createdAt: now,
    updatedAt: now,
  };

  store.documents.unshift(version);
  await writeDocumentStore(store);

  return version;
}

export async function searchDocuments(
  query: string,
): Promise<GlobalSearchResult[]> {
  const q = query.trim().toLowerCase();

  if (!q) {
    return [];
  }

  const [store, workspace] = await Promise.all([
    readDocumentStore(),
    readWorkspace(),
  ]);

  return store.documents
    .filter((document) => {
      const client = workspace.clients.find(
        (record) => record.id === document.clientId,
      );
      const project = workspace.projects.find(
        (record) => record.id === document.projectId,
      );

      return [
        document.documentNo,
        `version ${document.versionNo}`,
        document.title,
        document.status,
        document.quotationNo,
        `rev ${document.quotationRevisionNo}`,
        document.templateName,
        client?.name ?? "",
        project?.name ?? "",
        ...document.pages.flatMap((page) => [
          page.name,
          page.settings.headerText,
          page.settings.footerText,
          ...page.blocks.map((block) => block.content),
        ]),
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    })
    .map((document) => {
      const client = workspace.clients.find(
        (record) => record.id === document.clientId,
      );

      return {
        id: document.id,
        type: "document" as const,
        title: `${document.documentNo} · V${document.versionNo}`,
        subtitle: [document.title, client?.name ?? ""]
          .filter(Boolean)
          .join(" · "),
        meta: `Document · ${document.status} · ${document.quotationNo} Rev ${document.quotationRevisionNo}`,
        href: `/documents?selected=${encodeURIComponent(document.id)}`,
      };
    });
}
'@ | Set-Content -LiteralPath (Join-Path $ProjectRoot "src\lib\document-instance-store.ts") -Encoding UTF8

Write-Host "Creating document API..." -ForegroundColor Yellow

@'
import { NextResponse } from "next/server";
import {
  createDocumentInstance,
  createDocumentVersion,
  duplicateDocumentInstance,
  readDocumentStore,
  updateDocumentInstance,
} from "@/lib/document-instance-store";
import { readQuotationStore } from "@/lib/quotation-store";
import { readTemplateStore } from "@/lib/template-store";
import { readWorkspace } from "@/lib/workspace-store";

export async function GET() {
  const [documentStore, quotationStore, templateStore, workspace] =
    await Promise.all([
      readDocumentStore(),
      readQuotationStore(),
      readTemplateStore(),
      readWorkspace(),
    ]);

  return NextResponse.json({
    documents: documentStore.documents,
    quotations: quotationStore.quotations,
    templates: templateStore.templates,
    clients: workspace.clients,
    projects: workspace.projects,
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const action = String(body?.action || "create");

    if (action === "duplicate") {
      if (!body?.sourceId) {
        throw new Error("Source document id is required.");
      }

      const document = await duplicateDocumentInstance(body.sourceId);
      return NextResponse.json({ document }, { status: 201 });
    }

    if (action === "version") {
      if (!body?.sourceId) {
        throw new Error("Source document id is required.");
      }

      const document = await createDocumentVersion(body.sourceId);
      return NextResponse.json({ document }, { status: 201 });
    }

    const document = await createDocumentInstance({
      quotationId: String(body?.quotationId || ""),
      templateId: String(body?.templateId || ""),
      title: String(body?.title || ""),
    });

    return NextResponse.json({ document }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to create document.",
      },
      { status: 400 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();

    if (!body?.id) {
      throw new Error("Document id is required.");
    }

    const document = await updateDocumentInstance(body);
    return NextResponse.json({ document });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to save document.",
      },
      { status: 400 },
    );
  }
}
'@ | Set-Content -LiteralPath (Join-Path $ProjectRoot "src\app\api\documents\route.ts") -Encoding UTF8

Write-Host "Extending global search API..." -ForegroundColor Yellow

@'
import { NextResponse } from "next/server";
import { searchWorkspace } from "@/lib/workspace-store";
import { searchQuotations } from "@/lib/quotation-store";
import { searchDocuments } from "@/lib/document-instance-store";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? "";

  const [workspaceResults, quotationResults, documentResults] =
    await Promise.all([
      searchWorkspace(query),
      searchQuotations(query),
      searchDocuments(query),
    ]);

  return NextResponse.json({
    results: [
      ...workspaceResults,
      ...quotationResults,
      ...documentResults,
    ].slice(0, 120),
  });
}
'@ | Set-Content -LiteralPath (Join-Path $ProjectRoot "src\app\api\search\route.ts") -Encoding UTF8

Write-Host "Updating global search page..." -ForegroundColor Yellow

@'
"use client";

import {
  Building2,
  ChevronRight,
  FileStack,
  FileText,
  FolderKanban,
  Search,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { GlobalSearchResult } from "@/types/workspace";

type SearchType =
  | "all"
  | "client"
  | "project"
  | "quotation"
  | "document";

function SearchIcon({ type }: { type: GlobalSearchResult["type"] }) {
  if (type === "client") return <Building2 size={18} />;
  if (type === "project") return <FolderKanban size={18} />;
  if (type === "document") return <FileStack size={18} />;
  return <FileText size={18} />;
}

export function GlobalSearchWorkspace() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [type, setType] = useState<SearchType>("all");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    setQuery(url.searchParams.get("q") ?? "");
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);

      try {
        const response = await fetch(
          `/api/search?q=${encodeURIComponent(query)}`,
          {
            signal: controller.signal,
            cache: "no-store",
          },
        );
        const data = await response.json();
        setResults(data.results ?? []);
      } catch {
        if (!controller.signal.aborted) {
          setResults([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }, 220);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const filtered = useMemo(
    () =>
      type === "all"
        ? results
        : results.filter((result) => result.type === type),
    [results, type],
  );

  const filters: { key: SearchType; label: string }[] = [
    { key: "all", label: "All" },
    { key: "client", label: "Clients" },
    { key: "project", label: "Projects" },
    { key: "quotation", label: "Quotations" },
    { key: "document", label: "Documents" },
  ];

  return (
    <div className="page-stack">
      <div className="page-heading-row">
        <div>
          <div className="eyebrow">Full-site data finder</div>
          <h1>Global Search</h1>
          <p>
            Search clients, projects, quotations and saved document instances
            from one place.
          </p>
        </div>
      </div>

      <section className="search-page-panel">
        <div className="search-page-input">
          <Search size={20} />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search client, project, quotation, document, text..."
          />
        </div>

        <div className="search-filter-row">
          {filters.map((filter) => {
            const count =
              filter.key === "all"
                ? results.length
                : results.filter((result) => result.type === filter.key).length;

            return (
              <button
                type="button"
                key={filter.key}
                className={
                  type === filter.key
                    ? "filter-chip filter-chip-active"
                    : "filter-chip"
                }
                onClick={() => setType(filter.key)}
              >
                {filter.label} ({count})
              </button>
            );
          })}
        </div>

        <div className="search-result-list">
          {!query.trim() ? (
            <div className="search-page-empty">
              Start typing to search the ASB LiftDoc workspace.
            </div>
          ) : loading ? (
            <div className="search-page-empty">Searching...</div>
          ) : filtered.length === 0 ? (
            <div className="search-page-empty">No matching data found.</div>
          ) : (
            filtered.map((result) => (
              <Link
                href={result.href}
                key={`${result.type}-${result.id}`}
                className="full-search-result"
              >
                <span className="full-search-icon">
                  <SearchIcon type={result.type} />
                </span>
                <span className="full-search-copy">
                  <strong>{result.title}</strong>
                  <small>{result.subtitle}</small>
                </span>
                <span className="full-search-meta">{result.meta}</span>
                <ChevronRight size={18} />
              </Link>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
'@ | Set-Content -LiteralPath (Join-Path $ProjectRoot "src\components\workspace\global-search-workspace.tsx") -Encoding UTF8

Write-Host "Creating document workspace UI..." -ForegroundColor Yellow

@'
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
'@ | Set-Content -LiteralPath (Join-Path $ProjectRoot "src\components\workspace\documents-workspace.tsx") -Encoding UTF8

@'
import { DocumentsWorkspace } from "@/components/workspace/documents-workspace";

export default function DocumentsPage() {
  return <DocumentsWorkspace />;
}
'@ | Set-Content -LiteralPath (Join-Path $ProjectRoot "src\app\documents\page.tsx") -Encoding UTF8

Write-Host "Linking quotations to document creation..." -ForegroundColor Yellow

$QuotationPath = Join-Path $ProjectRoot "src\components\workspace\quotations-workspace.tsx"
$QuotationText = Get-Content -LiteralPath $QuotationPath -Raw

if ($QuotationText -notmatch 'Create document') {
    $QuotationText = $QuotationText.Replace(
        '  FilePlus2,' + "`r`n" + '  FileText,',
        '  FilePlus2,' + "`r`n" + '  FileStack,' + "`r`n" + '  FileText,'
    )

    if ($QuotationText -notmatch 'FileStack') {
        $QuotationText = $QuotationText.Replace(
            '  FilePlus2,' + "`n" + '  FileText,',
            '  FilePlus2,' + "`n" + '  FileStack,' + "`n" + '  FileText,'
        )
    }

    $Needle = @'
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => void createCopy(selected, "revision")}
                >
                  <RotateCcw size={16} />
                  New revision
                </button>
'@

    $Replacement = @'
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => void createCopy(selected, "revision")}
                >
                  <RotateCcw size={16} />
                  New revision
                </button>

                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => {
                    window.location.href = `/documents?quotation=${encodeURIComponent(
                      selected.id,
                    )}`;
                  }}
                >
                  <FileStack size={16} />
                  Create document
                </button>
'@

    if (-not $QuotationText.Contains($Needle)) {
        throw "M6 quotation action patch target not found. Send me this error."
    }

    $QuotationText = $QuotationText.Replace($Needle, $Replacement)
    Set-Content -LiteralPath $QuotationPath -Value $QuotationText -Encoding UTF8
}

Write-Host "Adding M6 styles..." -ForegroundColor Yellow

@'

/* M6 document instance engine */

.document-instance-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.65fr) minmax(330px, 0.72fr);
  gap: 18px;
  align-items: start;
}

.document-instance-toolbar {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) 130px 40px;
  gap: 9px;
  padding: 14px;
  border-bottom: 1px solid var(--ink-100);
  background: var(--surface-soft);
}

.document-instance-toolbar select {
  min-height: 40px;
  width: 100%;
  padding: 9px 10px;
  border: 1px solid var(--ink-200);
  border-radius: 9px;
  color: var(--ink-700);
  background: #fff;
  font-size: 10px;
}

.document-instance-grid {
  grid-template-columns: minmax(210px, 1.25fr) minmax(190px, 1fr) 90px;
}

.document-instance-detail {
  min-height: 420px;
}

.document-instance-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  padding-top: 15px;
}

.document-instance-source-note {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 14px;
  padding: 10px;
  border: 1px solid #d7e4ee;
  border-radius: 9px;
  color: var(--brand-700);
  background: var(--brand-50);
  font-size: 8.5px;
  line-height: 1.45;
}

.document-instance-editor-panel {
  overflow: hidden;
  border: 1px solid var(--ink-100);
  border-radius: 16px;
  background: #fff;
  box-shadow: var(--shadow-sm);
}

.document-editor-heading {
  min-height: 64px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--ink-100);
  background: var(--surface-soft);
}

.document-editor-heading h2 {
  margin: 4px 0 0;
  color: var(--brand-950);
  font-size: 15px;
}

.document-editor-actions {
  display: flex;
  gap: 8px;
}

.document-preview-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
  padding: 18px;
  background: #f3f5f8;
}

.document-preview-card {
  min-width: 0;
}

.document-preview-card-top {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 7px;
  color: var(--ink-500);
  font-size: 8px;
}

.document-preview-card-top strong {
  color: var(--ink-700);
}

.document-instance-paper {
  min-height: 560px;
  display: flex;
  flex-direction: column;
  padding: 36px 34px;
  background: #fff;
  border: 1px solid #dfe4ea;
  box-shadow: 0 12px 36px rgba(12, 31, 55, 0.08);
}

.document-instance-header,
.document-instance-footer {
  min-height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ink-500);
  font-size: 7.5px;
}

.document-instance-header {
  margin-bottom: 16px;
  border-bottom: 1px solid var(--ink-100);
}

.document-instance-footer {
  margin-top: auto;
  padding-top: 12px;
  border-top: 1px solid var(--ink-100);
}

.document-instance-content {
  display: grid;
  gap: 10px;
  color: #171c24;
  font-size: 8.5px;
  line-height: 1.5;
}

.document-instance-content h3 {
  margin: 0;
  font-size: 15px;
  line-height: 1.3;
}

.document-instance-content hr {
  width: 100%;
  border: 0;
  border-top: 1px solid #cfd6dd;
}

.document-override-layout {
  display: grid;
  grid-template-columns: 230px minmax(0, 1fr);
  min-height: 580px;
}

.document-override-pages {
  padding: 14px;
  border-right: 1px solid var(--ink-100);
  background: var(--surface-soft);
}

.document-override-pages > label {
  display: block;
  margin-bottom: 10px;
}

.document-override-pages label > span {
  display: block;
  margin-bottom: 5px;
  color: var(--ink-500);
  font-size: 8px;
  font-weight: 800;
}

.document-override-pages input,
.document-override-pages select {
  width: 100%;
  min-height: 36px;
  padding: 7px 8px;
  border: 1px solid var(--ink-200);
  border-radius: 7px;
  background: #fff;
  color: var(--ink-700);
  font-size: 9px;
}

.document-override-page-list {
  max-height: 380px;
  overflow: auto;
  margin-top: 14px;
}

.document-override-form {
  padding: 18px;
}

.document-override-blocks {
  display: grid;
  gap: 10px;
  margin-top: 18px;
}

.document-override-block {
  padding: 10px;
  border: 1px solid var(--ink-100);
  border-radius: 9px;
  background: var(--surface-soft);
}

.document-override-block-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 7px;
}

.document-override-block-head strong {
  color: var(--brand-800);
  font-size: 8.5px;
  text-transform: capitalize;
}

.document-override-block-head span {
  color: var(--ink-400);
  font-size: 7px;
}

.document-override-block textarea {
  width: 100%;
  min-height: 70px;
  padding: 8px;
  border: 1px solid var(--ink-200);
  border-radius: 7px;
  color: var(--ink-700);
  background: #fff;
  font-size: 9px;
  resize: vertical;
}

.document-override-block p {
  margin: 0;
  color: var(--ink-400);
  font-size: 8px;
  line-height: 1.45;
}

.document-create-modal {
  width: min(650px, 100%);
}

.document-create-note {
  margin-top: 12px;
  padding: 10px;
  border: 1px solid #d8e4ed;
  border-radius: 8px;
  color: var(--ink-500);
  background: var(--surface-soft);
  font-size: 8.5px;
  line-height: 1.5;
}

.document-instance-paper .document-advanced-table td {
  padding: 4px;
}

@media (max-width: 1050px) {
  .document-instance-layout {
    grid-template-columns: 1fr;
  }

  .document-preview-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .document-instance-toolbar {
    grid-template-columns: 1fr;
  }

  .document-instance-toolbar select,
  .document-instance-toolbar .icon-button {
    display: none;
  }

  .document-instance-grid {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .document-instance-grid > :nth-child(2) {
    display: none;
  }

  .document-override-layout {
    grid-template-columns: 1fr;
  }

  .document-override-pages {
    border-right: 0;
    border-bottom: 1px solid var(--ink-100);
  }

  .document-instance-paper {
    min-width: 540px;
  }

  .document-preview-card {
    overflow-x: auto;
  }

  .document-editor-heading {
    align-items: flex-start;
    flex-direction: column;
  }
}
'@ | Add-Content -LiteralPath (Join-Path $ProjectRoot "src\app\globals.css") -Encoding UTF8

Write-Host "Creating M6 acceptance checklist..." -ForegroundColor Yellow

@'
# M6 Acceptance Checklist

## Create from quotation
1. Open Quotations.
2. Select a quotation revision.
3. Click Create document.
4. Choose a saved template.
5. Create the document.

Expected:
- New document number such as DOC-2026-0001.
- Version starts at V0.
- The exact quotation revision is linked.
- Client and project come from that quotation.
- Template pages are copied into the document.

## Master template protection
1. Open a document.
2. Click Edit this document.
3. Change:
   - document title
   - page name
   - header/footer text
   - heading/text/dynamic-field content
4. Save.
5. Open Templates.

Expected:
The master template has NOT changed.

## Saved document persistence
1. Refresh the browser.
2. Reopen the document.
3. Confirm the overrides remain.

## Duplicate document
1. Select a document.
2. Click Duplicate.

Expected:
- A new DOC number is created.
- Version is V0.
- Existing pages and overrides are copied.
- Original document remains unchanged.

## New saved version
1. Select a document.
2. Click New version.

Expected:
- Document number stays the same.
- Version increases from V0 to V1.
- The previous version remains available.
- New version starts as Draft.

Create another version and confirm V2.

## Quotation revision integration
Create a document from a quotation Rev 0.
Then create or select Rev 1 and create another document.

Expected:
Each document preserves the exact quotation revision it was created from.

## Preview
Confirm the Documents page preview resolves:
- client fields
- project fields
- quotation fields
- quotation item table
- totals
- advanced custom tables

## Global search
Use Ctrl+K or Global Search and search by:
- Document number
- Document title
- Quotation number
- Client name
- Text inside the saved document snapshot

Confirm Documents filter works.

## Status
Change a document between:
- Draft
- Final
- Archived

Save and refresh.

## Data safety
Document instances are stored locally in:
data/documents.json

The file is excluded from Git.

## Next milestone
M7 will add export/output:
- Print-ready rendering
- PDF export
- Page image export
- Word export foundation
- Excel export for commercial tables
- File naming and download workflow
'@ | Set-Content -LiteralPath (Join-Path $ProjectRoot "docs\M6_ACCEPTANCE_TESTS.md") -Encoding UTF8

Set-Content -LiteralPath (Join-Path $ProjectRoot ".liftdoc-milestone") -Value "M6" -Encoding ASCII

Write-Host ""
Write-Host "Running production build..." -ForegroundColor Yellow

npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "M6 build failed. Do not rollback yet." -ForegroundColor Red
    Write-Host "Send me the complete new build error for one consolidated fix." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Emergency rollback only:" -ForegroundColor DarkGray
    Write-Host "git reset --hard checkpoint-m5-advanced-layout" -ForegroundColor DarkGray
    throw "M6 production build failed."
}

Write-Host "[OK] Production build successful" -ForegroundColor Green

Write-Host ""
Write-Host "Saving M6 Git checkpoint..." -ForegroundColor Yellow

git add .

if ($LASTEXITCODE -ne 0) {
    throw "git add failed."
}

$Changes = git status --porcelain

if ($Changes) {
    git commit -m "Add quotation linked document instances and versioning"

    if ($LASTEXITCODE -ne 0) {
        Write-Warning "Build passed, but Git commit failed. Send me the Git message."
    }
    else {
        git tag -f checkpoint-m6-document-instances HEAD | Out-Null
        Write-Host "[OK] Git checkpoint: checkpoint-m6-document-instances" -ForegroundColor Green
    }
}
else {
    git tag -f checkpoint-m6-document-instances HEAD | Out-Null
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host " M6 DOCUMENT INSTANCES COMPLETE" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Local URL: http://localhost:$Port/documents" -ForegroundColor Cyan
Write-Host "Checklist: docs\M6_ACCEPTANCE_TESTS.md" -ForegroundColor Cyan
Write-Host ""

powershell -ExecutionPolicy Bypass -File (Join-Path $ProjectRoot "Start-ASBLiftDoc.ps1")

Write-Host ""
Write-Host "If everything works, send: M6 confirmed" -ForegroundColor Green
