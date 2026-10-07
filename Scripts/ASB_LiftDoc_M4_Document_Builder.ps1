$ErrorActionPreference = "Stop"

$ProjectRoot = "E:\ASB LiftDoc\asb-liftdoc"
$ScriptsRoot = Join-Path $ProjectRoot "Scripts"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " ASB LiftDoc - M4 Document Builder" -ForegroundColor Cyan
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
    throw "M4 stopped for safety. Send me the status above."
}

git tag -f checkpoint-m3-quotation-engine HEAD | Out-Null
Write-Host "[OK] Rollback checkpoint: checkpoint-m3-quotation-engine" -ForegroundColor Green

$Port = 3010
$PortFile = Join-Path $ProjectRoot ".liftdoc-port"
if (Test-Path -LiteralPath $PortFile) {
    $Port = [int](Get-Content -LiteralPath $PortFile -Raw).Trim()
}

$Running = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($Running) {
    Write-Host "Stopping localhost server on port $Port..." -ForegroundColor Yellow
    $ProcessIds = $Running.OwningProcess | Sort-Object -Unique

    foreach ($ProcId in $ProcessIds) {
        Stop-Process -Id $ProcId -Force -ErrorAction SilentlyContinue
    }

    Start-Sleep -Seconds 2
}

$Dirs = @(
    "data",
    "src\types",
    "src\lib",
    "src\app\api\templates",
    "src\components\workspace",
    "Backups\M4_Before_Document_Builder"
)

foreach ($Dir in $Dirs) {
    New-Item -ItemType Directory -Path (Join-Path $ProjectRoot $Dir) -Force | Out-Null
}

$GitIgnorePath = Join-Path $ProjectRoot ".gitignore"
$GitIgnore = Get-Content -LiteralPath $GitIgnorePath -Raw

if ($GitIgnore -notmatch "(?m)^/data/templates\.json$") {
    Add-Content -LiteralPath $GitIgnorePath -Value "`n/data/templates.json`n"
}

if ($GitIgnore -notmatch "(?m)^/Backups/$") {
    Add-Content -LiteralPath $GitIgnorePath -Value "/Backups/`n"
}

Write-Host "Creating safety backup..." -ForegroundColor Yellow

$BackupRoot = Join-Path $ProjectRoot "Backups\M4_Before_Document_Builder"
$BackupTargets = @(
    "src\app\templates\page.tsx",
    "src\app\globals.css",
    "src\components\workspace\dashboard-overview.tsx"
)

foreach ($RelativePath in $BackupTargets) {
    $Source = Join-Path $ProjectRoot $RelativePath

    if (Test-Path -LiteralPath $Source) {
        $SafeName = ($RelativePath -replace '[\\/:*?"<>|]', '_')
        Copy-Item -LiteralPath $Source -Destination (Join-Path $BackupRoot $SafeName) -Force
    }
}

Write-Host "[OK] Backup created" -ForegroundColor Green

Write-Host "Creating document builder types..." -ForegroundColor Yellow

@'
export type PaperSize =
  | "A3"
  | "A4"
  | "A5"
  | "Letter"
  | "Legal"
  | "Custom";

export type PageOrientation = "portrait" | "landscape";
export type HeaderFooterMode = "none" | "manual" | "image";

export type DocumentBlockType =
  | "heading"
  | "text"
  | "field"
  | "divider"
  | "quotation_table"
  | "totals";

export type DocumentBlock = {
  id: string;
  type: DocumentBlockType;
  content: string;
  align: "left" | "center" | "right";
};

export type PageSettings = {
  paperSize: PaperSize;
  orientation: PageOrientation;
  customWidthMm: number;
  customHeightMm: number;

  marginTopMm: number;
  marginBottomMm: number;
  marginLeftMm: number;
  marginRightMm: number;

  headerMode: HeaderFooterMode;
  headerText: string;
  headerImageData: string;
  headerHeightMm: number;

  footerMode: HeaderFooterMode;
  footerText: string;
  footerImageData: string;
  footerHeightMm: number;
};

export type TemplatePage = {
  id: string;
  name: string;
  settings: PageSettings;
  blocks: DocumentBlock[];
};

export type DocumentTemplate = {
  id: string;
  name: string;
  description: string;
  pages: TemplatePage[];
  createdAt: string;
  updatedAt: string;
};

export type ReusableSection = {
  id: string;
  name: string;
  page: TemplatePage;
  createdAt: string;
};

export type TemplateStoreData = {
  templates: DocumentTemplate[];
  sections: ReusableSection[];
};
'@ | Set-Content -LiteralPath (Join-Path $ProjectRoot "src\types\document-builder.ts") -Encoding UTF8

Write-Host "Creating document template persistence..." -ForegroundColor Yellow

@'
import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import type {
  DocumentBlock,
  DocumentTemplate,
  PageSettings,
  ReusableSection,
  TemplatePage,
  TemplateStoreData,
} from "@/types/document-builder";

const dataFile = path.join(process.cwd(), "data", "templates.json");

const defaultPageSettings: PageSettings = {
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

function block(
  type: DocumentBlock["type"],
  content: string,
  align: DocumentBlock["align"] = "left",
): DocumentBlock {
  return {
    id: randomUUID(),
    type,
    content,
    align,
  };
}

function page(
  name: string,
  blocks: DocumentBlock[],
  settings: Partial<PageSettings> = {},
): TemplatePage {
  return {
    id: randomUUID(),
    name,
    settings: {
      ...defaultPageSettings,
      ...settings,
    },
    blocks,
  };
}

function createDefaultTemplate(): DocumentTemplate {
  const now = new Date().toISOString();

  return {
    id: randomUUID(),
    name: "Elevator Financial Proposal",
    description:
      "Starter multi-page elevator quotation template for ASB LiftDoc.",
    pages: [
      page(
        "Cover",
        [
          block("heading", "{{quotation.title}}", "center"),
          block("text", "Prepared For", "center"),
          block("field", "{{client.name}}", "center"),
          block("field", "{{project.name}}", "center"),
          block("divider", "", "center"),
          block("text", "Submission Date", "center"),
          block("field", "{{quotation.date}}", "center"),
        ],
        {
          marginTopMm: 35,
          marginBottomMm: 25,
          marginLeftMm: 25,
          marginRightMm: 25,
        },
      ),
      page(
        "Proposal Letter",
        [
          block("field", "{{quotation.date}}"),
          block("text", "To"),
          block("field", "{{client.name}}"),
          block("field", "{{client.address}}"),
          block("heading", "{{quotation.subject}}"),
          block(
            "text",
            "Dear Sir/Madam,\n\nPlease find our proposal based on the requested scope. This page can be edited, duplicated or replaced with client-specific content.",
          ),
        ],
        {
          headerMode: "manual",
          headerText: "ASB LiftDoc | Proposal",
          footerMode: "manual",
          footerText: "ASB Elevator",
        },
      ),
      page(
        "Commercial Offer",
        [
          block("heading", "Product Details of This Offer", "center"),
          block("quotation_table", ""),
          block("totals", ""),
        ],
        {
          headerMode: "manual",
          headerText: "ASB LiftDoc | Commercial Offer",
          footerMode: "manual",
          footerText: "{{quotation.no}}",
        },
      ),
      page(
        "Terms & Conditions",
        [
          block("heading", "Terms & Conditions"),
          block(
            "text",
            "Validity: {{quotation.validityDays}} days from the date of submission.\n\nPayment: Add or edit payment terms here.\n\nDelivery: Add delivery terms here.\n\nWarranty: Add warranty terms here.",
          ),
        ],
        {
          headerMode: "manual",
          headerText: "ASB LiftDoc | Terms & Conditions",
          footerMode: "manual",
          footerText: "{{quotation.no}}",
        },
      ),
    ],
    createdAt: now,
    updatedAt: now,
  };
}

function createInitialData(): TemplateStoreData {
  return {
    templates: [createDefaultTemplate()],
    sections: [],
  };
}

let writeQueue = Promise.resolve();

async function ensureDataFile() {
  await fs.mkdir(path.dirname(dataFile), { recursive: true });

  try {
    await fs.access(dataFile);
  } catch {
    await fs.writeFile(
      dataFile,
      JSON.stringify(createInitialData(), null, 2),
      "utf8",
    );
  }
}

export async function readTemplateStore(): Promise<TemplateStoreData> {
  await ensureDataFile();

  try {
    const raw = await fs.readFile(dataFile, "utf8");
    const parsed = JSON.parse(raw) as Partial<TemplateStoreData>;

    if (!Array.isArray(parsed.templates) || parsed.templates.length === 0) {
      const fresh = createInitialData();
      await writeTemplateStore(fresh);
      return fresh;
    }

    return {
      templates: parsed.templates,
      sections: Array.isArray(parsed.sections) ? parsed.sections : [],
    };
  } catch {
    const fresh = createInitialData();
    await writeTemplateStore(fresh);
    return fresh;
  }
}

async function writeTemplateStore(data: TemplateStoreData) {
  writeQueue = writeQueue.then(async () => {
    await ensureDataFile();
    const temporary = `${dataFile}.tmp`;
    await fs.writeFile(temporary, JSON.stringify(data, null, 2), "utf8");
    await fs.rename(temporary, dataFile);
  });

  await writeQueue;
}

function clonePage(page: TemplatePage): TemplatePage {
  return {
    ...page,
    id: randomUUID(),
    settings: {
      ...page.settings,
    },
    blocks: page.blocks.map((item) => ({
      ...item,
      id: randomUUID(),
    })),
  };
}

function cleanTemplate(input: DocumentTemplate): DocumentTemplate {
  return {
    ...input,
    name: String(input.name || "Untitled Template").trim(),
    description: String(input.description || "").trim(),
    pages: Array.isArray(input.pages)
      ? input.pages.map((sourcePage) => ({
          ...sourcePage,
          name: String(sourcePage.name || "Untitled Page").trim(),
          settings: {
            ...defaultPageSettings,
            ...(sourcePage.settings ?? {}),
          },
          blocks: Array.isArray(sourcePage.blocks)
            ? sourcePage.blocks.map((sourceBlock) => ({
                ...sourceBlock,
                content: String(sourceBlock.content ?? ""),
              }))
            : [],
        }))
      : [],
  };
}

export async function createTemplate(name: string) {
  const store = await readTemplateStore();
  const now = new Date().toISOString();

  const template: DocumentTemplate = {
    id: randomUUID(),
    name: name.trim() || "Untitled Template",
    description: "",
    pages: [
      page("Page 1", [
        block("heading", "New Document"),
        block("text", "Start building this page."),
      ]),
    ],
    createdAt: now,
    updatedAt: now,
  };

  store.templates.unshift(template);
  await writeTemplateStore(store);

  return template;
}

export async function updateTemplate(input: DocumentTemplate) {
  const store = await readTemplateStore();
  const index = store.templates.findIndex((item) => item.id === input.id);

  if (index === -1) {
    throw new Error("Template not found.");
  }

  const current = store.templates[index];
  const updated = cleanTemplate({
    ...input,
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString(),
  });

  store.templates[index] = updated;
  await writeTemplateStore(store);

  return updated;
}

export async function duplicateTemplate(id: string) {
  const store = await readTemplateStore();
  const source = store.templates.find((item) => item.id === id);

  if (!source) {
    throw new Error("Template not found.");
  }

  const now = new Date().toISOString();

  const copy: DocumentTemplate = {
    ...source,
    id: randomUUID(),
    name: `${source.name} Copy`,
    pages: source.pages.map(clonePage),
    createdAt: now,
    updatedAt: now,
  };

  store.templates.unshift(copy);
  await writeTemplateStore(store);

  return copy;
}

export async function deleteTemplate(id: string) {
  const store = await readTemplateStore();

  if (store.templates.length <= 1) {
    throw new Error("At least one template must remain.");
  }

  const nextTemplates = store.templates.filter((item) => item.id !== id);

  if (nextTemplates.length === store.templates.length) {
    throw new Error("Template not found.");
  }

  store.templates = nextTemplates;
  await writeTemplateStore(store);

  return true;
}

export async function saveReusableSection(name: string, sourcePage: TemplatePage) {
  const store = await readTemplateStore();

  const section: ReusableSection = {
    id: randomUUID(),
    name: name.trim() || sourcePage.name || "Reusable Page",
    page: clonePage(sourcePage),
    createdAt: new Date().toISOString(),
  };

  store.sections.unshift(section);
  await writeTemplateStore(store);

  return section;
}
'@ | Set-Content -LiteralPath (Join-Path $ProjectRoot "src\lib\template-store.ts") -Encoding UTF8

Write-Host "Creating template API..." -ForegroundColor Yellow

@'
import { NextResponse } from "next/server";
import { readQuotationStore } from "@/lib/quotation-store";
import { readWorkspace } from "@/lib/workspace-store";
import {
  createTemplate,
  deleteTemplate,
  duplicateTemplate,
  readTemplateStore,
  saveReusableSection,
  updateTemplate,
} from "@/lib/template-store";

export async function GET() {
  const [templateStore, quotationStore, workspace] = await Promise.all([
    readTemplateStore(),
    readQuotationStore(),
    readWorkspace(),
  ]);

  return NextResponse.json({
    templates: templateStore.templates,
    sections: templateStore.sections,
    quotations: quotationStore.quotations,
    clients: workspace.clients,
    projects: workspace.projects,
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const action = String(body?.action || "create");

    if (action === "duplicate") {
      if (!body?.id) {
        throw new Error("Template id is required.");
      }

      const template = await duplicateTemplate(body.id);
      return NextResponse.json({ template }, { status: 201 });
    }

    if (action === "save_section") {
      if (!body?.page) {
        throw new Error("Page data is required.");
      }

      const section = await saveReusableSection(
        String(body?.name || ""),
        body.page,
      );

      return NextResponse.json({ section }, { status: 201 });
    }

    const template = await createTemplate(String(body?.name || ""));
    return NextResponse.json({ template }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to create template.",
      },
      { status: 400 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();

    if (!body?.id) {
      throw new Error("Template id is required.");
    }

    const template = await updateTemplate(body);
    return NextResponse.json({ template });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to save template.",
      },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");

    if (!id) {
      throw new Error("Template id is required.");
    }

    await deleteTemplate(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to delete template.",
      },
      { status: 400 },
    );
  }
}
'@ | Set-Content -LiteralPath (Join-Path $ProjectRoot "src\app\api\templates\route.ts") -Encoding UTF8

Write-Host "Creating document builder UI..." -ForegroundColor Yellow

@'
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
'@ | Set-Content -LiteralPath (Join-Path $ProjectRoot "src\components\workspace\template-builder-workspace.tsx") -Encoding UTF8

@'
import { TemplateBuilderWorkspace } from "@/components/workspace/template-builder-workspace";

export default function TemplatesPage() {
  return <TemplateBuilderWorkspace />;
}
'@ | Set-Content -LiteralPath (Join-Path $ProjectRoot "src\app\templates\page.tsx") -Encoding UTF8

Write-Host "Adding document builder styles..." -ForegroundColor Yellow

@'

/* M4 document builder */

.builder-heading-row {
  align-items: flex-start;
}

.builder-top-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.builder-message {
  padding: 10px 12px;
  border: 1px solid #cfe7dc;
  border-radius: 10px;
  color: var(--success);
  background: var(--success-soft);
  font-size: 10.5px;
  font-weight: 750;
}

.builder-toolbar {
  display: grid;
  grid-template-columns: 230px minmax(220px, 1fr) minmax(240px, 1fr) auto;
  gap: 10px;
  align-items: end;
  padding: 14px;
  border: 1px solid var(--ink-100);
  border-radius: 14px;
  background: #fff;
  box-shadow: var(--shadow-sm);
}

.builder-toolbar label > span,
.builder-field > span {
  display: block;
  margin-bottom: 6px;
  color: var(--ink-500);
  font-size: 8.5px;
  font-weight: 800;
  letter-spacing: 0.03em;
}

.builder-toolbar input,
.builder-toolbar select,
.builder-field input,
.builder-field select,
.builder-field textarea,
.builder-block-card select,
.builder-block-content {
  width: 100%;
  min-height: 38px;
  padding: 8px 10px;
  border: 1px solid var(--ink-200);
  border-radius: 8px;
  outline: none;
  color: var(--ink-700);
  background: #fff;
  font-size: 10px;
}

.builder-field textarea,
.builder-block-content {
  resize: vertical;
}

.document-builder-layout {
  min-height: 760px;
  display: grid;
  grid-template-columns: 230px minmax(520px, 1fr) 330px;
  gap: 14px;
  align-items: start;
}

.builder-pages-panel,
.builder-canvas-panel,
.builder-settings-panel {
  min-width: 0;
  border: 1px solid var(--ink-100);
  border-radius: 16px;
  background: #fff;
  box-shadow: var(--shadow-sm);
}

.builder-pages-panel,
.builder-settings-panel {
  position: sticky;
  top: calc(var(--topbar-height) + 16px);
  max-height: calc(100vh - var(--topbar-height) - 34px);
  overflow: hidden;
}

.builder-panel-title {
  min-height: 52px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--ink-100);
  background: var(--surface-soft);
}

.builder-panel-title > div {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--brand-800);
}

.builder-panel-title strong {
  font-size: 10.5px;
}

.builder-page-list {
  max-height: 360px;
  overflow: auto;
  padding: 9px;
}

.builder-page-card {
  width: 100%;
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  padding: 9px;
  border: 1px solid transparent;
  border-radius: 9px;
  text-align: left;
  color: inherit;
  background: transparent;
}

.builder-page-card:hover {
  background: var(--surface-soft);
}

.builder-page-card-active {
  border-color: #bfd6e7;
  background: var(--brand-50);
}

.builder-page-number {
  width: 28px;
  height: 34px;
  display: grid;
  place-items: center;
  border: 1px solid var(--ink-200);
  border-radius: 5px;
  color: var(--ink-500);
  background: #fff;
  font-size: 8.5px;
  font-weight: 850;
}

.builder-page-card strong,
.builder-page-card small {
  display: block;
}

.builder-page-card strong {
  overflow: hidden;
  color: var(--ink-700);
  font-size: 9.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.builder-page-card small {
  margin-top: 3px;
  color: var(--ink-400);
  font-size: 8px;
}

.builder-page-actions {
  display: grid;
  gap: 7px;
  padding: 10px;
  border-top: 1px solid var(--ink-100);
}

.builder-inline-actions {
  display: flex;
  gap: 6px;
}

.builder-page-actions .builder-inline-actions {
  justify-content: center;
}

.builder-section-library {
  padding: 12px;
  border-top: 1px solid var(--ink-100);
}

.builder-subtitle {
  display: block;
  margin: 4px 0 8px;
  color: var(--ink-500);
  font-size: 8.5px;
  font-weight: 850;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.builder-library-save,
.builder-library-item {
  width: 100%;
  min-height: 32px;
  margin-top: 5px;
  padding: 7px 8px;
  border: 1px solid var(--ink-100);
  border-radius: 7px;
  color: var(--ink-600);
  background: #fff;
  font-size: 8.5px;
  font-weight: 700;
}

.builder-library-item {
  display: flex;
  align-items: center;
  gap: 5px;
  text-align: left;
}

.builder-library-save:hover,
.builder-library-item:hover {
  border-color: #c7dbea;
  color: var(--brand-700);
  background: var(--brand-50);
}

.builder-section-library p {
  margin: 7px 0 0;
  color: var(--ink-400);
  font-size: 8.5px;
  line-height: 1.45;
}

.builder-canvas-panel {
  min-height: 760px;
  overflow: hidden;
}

.builder-canvas-meta {
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 0 14px;
  border-bottom: 1px solid var(--ink-100);
  color: var(--ink-400);
  background: var(--surface-soft);
  font-size: 8.5px;
  font-weight: 700;
}

.paper-stage {
  min-height: 714px;
  overflow: auto;
  display: flex;
  justify-content: center;
  padding: 28px;
  background:
    linear-gradient(45deg, #edf0f4 25%, transparent 25%),
    linear-gradient(-45deg, #edf0f4 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #edf0f4 75%),
    linear-gradient(-45deg, transparent 75%, #edf0f4 75%),
    #f5f7fa;
  background-size: 18px 18px;
  background-position:
    0 0,
    0 9px,
    9px -9px,
    -9px 0;
}

.document-paper {
  width: min(760px, 100%);
  min-width: 430px;
  align-self: flex-start;
  background: #fff;
  border: 1px solid #dfe4ea;
  box-shadow: 0 18px 55px rgba(12, 31, 55, 0.14);
}

.document-paper-inner {
  min-height: 100%;
  display: flex;
  flex-direction: column;
}

.document-preview-header,
.document-preview-footer {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ink-500);
  border-color: var(--ink-100);
  font-size: 8px;
}

.document-preview-header {
  margin-bottom: 12px;
  border-bottom: 1px solid var(--ink-100);
}

.document-preview-footer {
  margin-top: auto;
  padding-top: 10px;
  border-top: 1px solid var(--ink-100);
}

.document-preview-image {
  width: 100%;
  min-height: inherit;
  background-position: center;
  background-repeat: no-repeat;
  background-size: contain;
}

.document-preview-content {
  display: grid;
  gap: 10px;
  color: #121821;
  font-family: Arial, sans-serif;
}

.document-preview-content h3 {
  margin: 0;
  font-size: clamp(14px, 2vw, 22px);
  line-height: 1.25;
}

.document-preview-text,
.document-preview-field {
  font-size: clamp(8px, 1vw, 11px);
  line-height: 1.55;
}

.document-preview-field {
  font-weight: 700;
}

.document-preview-content hr {
  width: 100%;
  margin: 5px 0;
  border: 0;
  border-top: 1px solid #ccd3db;
}

.document-preview-table {
  overflow: hidden;
  border: 1px solid #bfc8d2;
  font-size: 7px;
}

.document-preview-table-head,
.document-preview-table-row {
  display: grid;
  grid-template-columns: 28px minmax(150px, 1fr) 70px 75px 80px;
}

.document-preview-table-head {
  font-weight: 800;
  background: #eef2f6;
}

.document-preview-table-head span,
.document-preview-table-row span {
  padding: 6px 5px;
  border-right: 1px solid #d2d8df;
  border-bottom: 1px solid #d2d8df;
}

.document-preview-table-head span:last-child,
.document-preview-table-row span:last-child {
  border-right: 0;
}

.document-preview-table-empty {
  padding: 14px;
  color: var(--ink-400);
  text-align: center;
}

.document-preview-totals {
  width: min(290px, 60%);
  margin-left: auto;
  display: grid;
  gap: 6px;
}

.document-preview-totals > div {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 0;
  border-bottom: 1px solid #e0e5eb;
  font-size: 8px;
}

.document-preview-totals > div:last-child {
  color: var(--brand-900);
  font-weight: 850;
}

.builder-settings-scroll {
  max-height: calc(100vh - var(--topbar-height) - 88px);
  overflow: auto;
  padding: 12px;
}

.builder-field {
  display: block;
  margin-bottom: 10px;
}

.builder-field-grid,
.builder-margin-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.builder-upload {
  position: relative;
  min-height: 42px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  margin-bottom: 10px;
  padding: 8px;
  overflow: hidden;
  border: 1px dashed #bfd3e2;
  border-radius: 8px;
  color: var(--brand-700);
  background: var(--brand-50);
  font-size: 8.5px;
  font-weight: 750;
  cursor: pointer;
}

.builder-upload input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.builder-block-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 14px;
}

.builder-block-heading > div {
  display: flex;
  gap: 4px;
}

.builder-block-heading .icon-button,
.builder-block-card .icon-button,
.builder-inline-actions .icon-button {
  width: 30px;
  height: 30px;
}

.builder-block-list {
  display: grid;
  gap: 8px;
}

.builder-block-card {
  padding: 9px;
  border: 1px solid var(--ink-100);
  border-radius: 9px;
  background: var(--surface-soft);
}

.builder-block-top {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 7px;
  align-items: center;
}

.builder-block-top select {
  min-height: 30px;
  padding: 5px 7px;
  font-size: 8.5px;
}

.builder-block-content {
  min-height: 62px;
  margin-top: 7px;
  font-size: 8.5px !important;
}

select.builder-block-content {
  min-height: 34px;
}

.builder-align-row {
  display: flex;
  gap: 4px;
  margin-top: 6px;
}

.builder-align-row .icon-button {
  width: 28px;
  height: 28px;
}

.builder-align-active {
  color: var(--brand-700);
  border-color: #b9d1e4;
  background: var(--brand-50);
}

@media (max-width: 1320px) {
  .document-builder-layout {
    grid-template-columns: 205px minmax(460px, 1fr) 300px;
  }

  .builder-toolbar {
    grid-template-columns: 200px 1fr 1fr;
  }

  .builder-delete-template {
    display: none;
  }
}

@media (max-width: 1080px) {
  .document-builder-layout {
    grid-template-columns: 190px minmax(0, 1fr);
  }

  .builder-settings-panel {
    position: static;
    grid-column: 1 / -1;
    max-height: none;
  }

  .builder-settings-scroll {
    max-height: none;
  }
}

@media (max-width: 760px) {
  .builder-top-actions {
    justify-content: flex-start;
  }

  .builder-toolbar {
    grid-template-columns: 1fr;
  }

  .document-builder-layout {
    grid-template-columns: 1fr;
  }

  .builder-pages-panel,
  .builder-settings-panel {
    position: static;
    max-height: none;
  }

  .builder-page-list {
    max-height: 260px;
  }

  .document-paper {
    min-width: 500px;
  }

  .paper-stage {
    justify-content: flex-start;
  }

  .builder-field-grid,
  .builder-margin-grid {
    grid-template-columns: 1fr 1fr;
  }
}
'@ | Add-Content -LiteralPath (Join-Path $ProjectRoot "src\app\globals.css") -Encoding UTF8

Write-Host "Creating M4 acceptance checklist..." -ForegroundColor Yellow

@'
# M4 Acceptance Checklist

## Template
1. Open Templates.
2. Confirm "Elevator Financial Proposal" exists.
3. Change its name slightly, click Save Template, refresh browser.
4. Confirm the change remains.
5. Duplicate the template.
6. Create a blank new template.

## Page management
1. Select a template.
2. Add at least 2 extra pages.
3. Rename the pages.
4. Move a page up/down.
5. Duplicate one page.
6. Delete one page.
7. Save and refresh.
8. Confirm page order and names remain.

Expected:
There is no fixed middle-page limit.

## Page size
Test different pages with:
- A4
- Legal
- A5
- Custom width/height
- Portrait
- Landscape

Confirm each page keeps its own independent setting.

## Margins
Change:
- Top
- Bottom
- Left
- Right

Confirm preview changes independently for the selected page.

## Header / Footer
Test:
1. None
2. Manual text
3. Image upload

Use different settings on two different pages.

Expected:
Page 1 and Page 2 can have completely different header/footer designs.

## Blocks
Add and test:
- Heading
- Text
- Dynamic field
- Divider
- Quotation table
- Totals

Move blocks up/down and delete a block.

## Dynamic quotation preview
If an M3 quotation exists:
1. Select it in Preview quotation.
2. Confirm client/project/quotation tokens resolve.
3. Confirm quotation table uses saved commercial items.
4. Confirm totals show saved values.

## Reusable page/section
1. Select a page.
2. Save current page to reusable library.
3. Add that saved section back into the template.
4. Save and refresh.

## Notes
M4 is the document-builder foundation.

M5 will add the advanced layout engine:
- Better custom table designer
- Cell merge/split model
- Automatic long-table page overflow
- Repeat table headers
- Section page-break rules
- More precise page rendering behavior
'@ | Set-Content -LiteralPath (Join-Path $ProjectRoot "docs\M4_ACCEPTANCE_TESTS.md") -Encoding UTF8

Set-Content -LiteralPath (Join-Path $ProjectRoot ".liftdoc-milestone") -Value "M4" -Encoding ASCII

Write-Host ""
Write-Host "Running production build..." -ForegroundColor Yellow

npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "M4 build failed. Do not rollback yet." -ForegroundColor Red
    Write-Host "Send me the complete new build error for one consolidated fix." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Emergency rollback only:" -ForegroundColor DarkGray
    Write-Host "git reset --hard checkpoint-m3-quotation-engine" -ForegroundColor DarkGray
    throw "M4 production build failed."
}

Write-Host "[OK] Production build successful" -ForegroundColor Green

Write-Host ""
Write-Host "Saving M4 Git checkpoint..." -ForegroundColor Yellow

git add .

if ($LASTEXITCODE -ne 0) {
    throw "git add failed."
}

$Changes = git status --porcelain

if ($Changes) {
    git commit -m "Add custom multi-page document template builder"

    if ($LASTEXITCODE -ne 0) {
        Write-Warning "Build passed, but Git commit failed. Send me the Git message."
    }
    else {
        git tag -f checkpoint-m4-document-builder HEAD | Out-Null
        Write-Host "[OK] Git checkpoint: checkpoint-m4-document-builder" -ForegroundColor Green
    }
}
else {
    Write-Host "No Git changes remained to commit." -ForegroundColor DarkGray
    git tag -f checkpoint-m4-document-builder HEAD | Out-Null
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host " M4 DOCUMENT BUILDER COMPLETE" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Local URL: http://localhost:$Port/templates" -ForegroundColor Cyan
Write-Host "Acceptance checklist: docs\M4_ACCEPTANCE_TESTS.md" -ForegroundColor Cyan
Write-Host ""

Write-Host "Starting ASB LiftDoc..." -ForegroundColor Yellow
powershell -ExecutionPolicy Bypass -File (Join-Path $ProjectRoot "Start-ASBLiftDoc.ps1")

Write-Host ""
Write-Host "Run the M4 acceptance tests." -ForegroundColor Yellow
Write-Host "If everything works, send: M4 confirmed" -ForegroundColor Green
