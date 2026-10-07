$ErrorActionPreference = "Stop"

$ProjectRoot = "E:\ASB LiftDoc\asb-liftdoc"
$ScriptsRoot = Join-Path $ProjectRoot "Scripts"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " ASB LiftDoc - M3 Quotation Engine" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path -LiteralPath $ProjectRoot)) {
    throw "Project not found: $ProjectRoot"
}

Set-Location -LiteralPath $ProjectRoot

if (-not (Test-Path -LiteralPath ".git")) {
    throw "Git repository not found."
}

# Ignore a newly copied milestone script itself, but stop for any other unexpected changes.
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
    throw "M3 stopped for safety. Send me the status above."
}

git tag -f checkpoint-m2-data-workspace HEAD | Out-Null
Write-Host "[OK] Rollback checkpoint: checkpoint-m2-data-workspace" -ForegroundColor Green

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
    "src\app\api\quotations",
    "src\components\workspace",
    "Backups\M3_Before_Quotation_Engine"
)

foreach ($Dir in $Dirs) {
    New-Item -ItemType Directory -Path (Join-Path $ProjectRoot $Dir) -Force | Out-Null
}

Write-Host "Creating safety backup..." -ForegroundColor Yellow

$BackupRoot = Join-Path $ProjectRoot "Backups\M3_Before_Quotation_Engine"
$BackupTargets = @(
    "src\types\workspace.ts",
    "src\app\api\search\route.ts",
    "src\app\api\stats\route.ts",
    "src\components\app-shell.tsx",
    "src\components\workspace\global-search-workspace.tsx",
    "src\components\workspace\dashboard-overview.tsx",
    "src\app\quotations\page.tsx",
    "src\app\globals.css"
)

foreach ($RelativePath in $BackupTargets) {
    $Source = Join-Path $ProjectRoot $RelativePath
    if (Test-Path -LiteralPath $Source) {
        $SafeName = ($RelativePath -replace '[\\/:*?"<>|]', '_')
        Copy-Item -LiteralPath $Source -Destination (Join-Path $BackupRoot $SafeName) -Force
    }
}

Write-Host "[OK] Backup created" -ForegroundColor Green

$GitIgnorePath = Join-Path $ProjectRoot ".gitignore"
$GitIgnore = Get-Content -LiteralPath $GitIgnorePath -Raw
if ($GitIgnore -notmatch "(?m)^/data/quotations\.json$") {
    Add-Content -LiteralPath $GitIgnorePath -Value "`n/data/quotations.json`n"
}

$QuotationDataFile = Join-Path $ProjectRoot "data\quotations.json"
if (-not (Test-Path -LiteralPath $QuotationDataFile)) {
@'
{
  "quotations": []
}
'@ | Set-Content -LiteralPath $QuotationDataFile -Encoding UTF8
}

Write-Host "Creating quotation types..." -ForegroundColor Yellow

@'
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
'@ | Set-Content -LiteralPath (Join-Path $ProjectRoot "src\types\quotation.ts") -Encoding UTF8

Write-Host "Extending global search result types..." -ForegroundColor Yellow

@'
export type ClientStatus = "active" | "archived";

export type Client = {
  id: string;
  name: string;
  companyName: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  tags: string[];
  status: ClientStatus;
  createdAt: string;
  updatedAt: string;
};

export type ProjectStatus = "active" | "on_hold" | "completed" | "archived";

export type Project = {
  id: string;
  clientId: string;
  name: string;
  code: string;
  location: string;
  description: string;
  tags: string[];
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceData = {
  clients: Client[];
  projects: Project[];
};

export type GlobalSearchResult = {
  id: string;
  type: "client" | "project" | "quotation";
  title: string;
  subtitle: string;
  meta: string;
  href: string;
};
'@ | Set-Content -LiteralPath (Join-Path $ProjectRoot "src\types\workspace.ts") -Encoding UTF8

Write-Host "Creating quotation persistence and business rules..." -ForegroundColor Yellow

@'
import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { readWorkspace } from "@/lib/workspace-store";
import type {
  Quotation,
  QuotationItem,
  QuotationStatus,
  QuotationStoreData,
} from "@/types/quotation";
import type { GlobalSearchResult } from "@/types/workspace";

const dataFile = path.join(process.cwd(), "data", "quotations.json");

const emptyData: QuotationStoreData = {
  quotations: [],
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

export async function readQuotationStore(): Promise<QuotationStoreData> {
  await ensureDataFile();

  try {
    const raw = await fs.readFile(dataFile, "utf8");
    const parsed = JSON.parse(raw) as Partial<QuotationStoreData>;

    return {
      quotations: Array.isArray(parsed.quotations) ? parsed.quotations : [],
    };
  } catch {
    return structuredClone(emptyData);
  }
}

async function writeQuotationStore(data: QuotationStoreData) {
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

function cleanNumber(value: unknown, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function cleanPositiveNumber(value: unknown, fallback = 0) {
  return Math.max(0, cleanNumber(value, fallback));
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalizeStatus(value: unknown): QuotationStatus {
  const allowed: QuotationStatus[] = ["draft", "sent", "approved", "rejected"];
  return allowed.includes(value as QuotationStatus)
    ? (value as QuotationStatus)
    : "draft";
}

function normalizeItems(value: unknown): QuotationItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((raw) => {
      const item = raw as Partial<QuotationItem>;
      const quantity = cleanPositiveNumber(item.quantity, 1);
      const rate = cleanPositiveNumber(item.rate);
      const description = cleanText(item.description);

      return {
        id: cleanText(item.id) || randomUUID(),
        description,
        quantity,
        unit: cleanText(item.unit),
        rate,
        total: roundMoney(quantity * rate),
      };
    })
    .filter((item) => item.description || item.rate > 0);
}

function calculateCommercials(
  items: QuotationItem[],
  discountInput: unknown,
  vatPercentInput: unknown,
  taxPercentInput: unknown,
  otherChargeInput: unknown,
) {
  const subtotal = roundMoney(
    items.reduce((sum, item) => sum + cleanPositiveNumber(item.total), 0),
  );
  const discount = Math.min(cleanPositiveNumber(discountInput), subtotal);
  const taxableBase = Math.max(0, subtotal - discount);
  const vatPercent = cleanPositiveNumber(vatPercentInput);
  const taxPercent = cleanPositiveNumber(taxPercentInput);
  const otherCharge = cleanPositiveNumber(otherChargeInput);
  const vatAmount = roundMoney((taxableBase * vatPercent) / 100);
  const taxAmount = roundMoney((taxableBase * taxPercent) / 100);
  const grandTotal = roundMoney(
    taxableBase + vatAmount + taxAmount + otherCharge,
  );

  return {
    subtotal,
    discount,
    vatPercent,
    vatAmount,
    taxPercent,
    taxAmount,
    otherCharge,
    grandTotal,
  };
}

async function validateRelations(clientId: string, projectId: string | null) {
  const workspace = await readWorkspace();

  const client = workspace.clients.find(
    (record) => record.id === clientId && record.status !== "archived",
  );

  if (!client) {
    throw new Error("A valid active client is required.");
  }

  if (projectId) {
    const project = workspace.projects.find((record) => record.id === projectId);

    if (!project) {
      throw new Error("Selected project was not found.");
    }

    if (project.clientId !== clientId) {
      throw new Error("Selected project does not belong to the selected client.");
    }
  }
}

function getNextQuotationNumber(quotations: Quotation[], dateValue?: string) {
  const date = dateValue ? new Date(`${dateValue}T00:00:00`) : new Date();
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const year = safeDate.getFullYear();
  const prefix = `QT-${year}-`;

  const max = quotations.reduce((currentMax, quotation) => {
    if (!quotation.quotationNo.startsWith(prefix)) {
      return currentMax;
    }

    const suffix = Number(quotation.quotationNo.slice(prefix.length));
    return Number.isFinite(suffix) ? Math.max(currentMax, suffix) : currentMax;
  }, 0);

  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

function normalizeDate(value: unknown) {
  const text = cleanText(value);

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }

  return new Date().toISOString().slice(0, 10);
}

type QuotationInput = Partial<Quotation>;

export async function createQuotation(input: QuotationInput) {
  const store = await readQuotationStore();

  const clientId = cleanText(input.clientId);
  const projectId = cleanText(input.projectId) || null;
  const title = cleanText(input.title);
  const quotationDate = normalizeDate(input.quotationDate);

  if (!title) {
    throw new Error("Quotation title is required.");
  }

  await validateRelations(clientId, projectId);

  const items = normalizeItems(input.items);
  const commercials = calculateCommercials(
    items,
    input.discount,
    input.vatPercent,
    input.taxPercent,
    input.otherCharge,
  );

  const now = new Date().toISOString();
  const id = randomUUID();

  const quotation: Quotation = {
    id,
    quotationNo: getNextQuotationNumber(store.quotations, quotationDate),
    revisionNo: 0,
    rootQuotationId: id,
    parentQuotationId: null,
    duplicatedFromId: null,

    clientId,
    projectId,

    title,
    subject: cleanText(input.subject),
    quotationDate,
    validityDays: Math.max(1, Math.round(cleanPositiveNumber(input.validityDays, 10))),
    currency: "BDT",
    status: normalizeStatus(input.status),

    items,
    ...commercials,

    notes: cleanText(input.notes),

    createdAt: now,
    updatedAt: now,
  };

  store.quotations.unshift(quotation);
  await writeQuotationStore(store);

  return quotation;
}

export async function updateQuotation(input: QuotationInput & { id: string }) {
  const store = await readQuotationStore();
  const index = store.quotations.findIndex((record) => record.id === input.id);

  if (index === -1) {
    throw new Error("Quotation not found.");
  }

  const current = store.quotations[index];
  const clientId =
    input.clientId === undefined ? current.clientId : cleanText(input.clientId);
  const projectId =
    input.projectId === undefined
      ? current.projectId
      : cleanText(input.projectId) || null;
  const title =
    input.title === undefined ? current.title : cleanText(input.title);

  if (!title) {
    throw new Error("Quotation title is required.");
  }

  await validateRelations(clientId, projectId);

  const items =
    input.items === undefined ? current.items : normalizeItems(input.items);

  const commercials = calculateCommercials(
    items,
    input.discount === undefined ? current.discount : input.discount,
    input.vatPercent === undefined ? current.vatPercent : input.vatPercent,
    input.taxPercent === undefined ? current.taxPercent : input.taxPercent,
    input.otherCharge === undefined ? current.otherCharge : input.otherCharge,
  );

  const updated: Quotation = {
    ...current,

    clientId,
    projectId,

    title,
    subject:
      input.subject === undefined ? current.subject : cleanText(input.subject),
    quotationDate:
      input.quotationDate === undefined
        ? current.quotationDate
        : normalizeDate(input.quotationDate),
    validityDays:
      input.validityDays === undefined
        ? current.validityDays
        : Math.max(1, Math.round(cleanPositiveNumber(input.validityDays, 10))),
    status:
      input.status === undefined ? current.status : normalizeStatus(input.status),

    items,
    ...commercials,

    notes: input.notes === undefined ? current.notes : cleanText(input.notes),

    updatedAt: new Date().toISOString(),
  };

  store.quotations[index] = updated;
  await writeQuotationStore(store);

  return updated;
}

export async function duplicateQuotation(sourceId: string) {
  const store = await readQuotationStore();
  const source = store.quotations.find((record) => record.id === sourceId);

  if (!source) {
    throw new Error("Source quotation not found.");
  }

  await validateRelations(source.clientId, source.projectId);

  const now = new Date().toISOString();
  const id = randomUUID();
  const items = source.items.map((item) => ({
    ...item,
    id: randomUUID(),
  }));

  const quotation: Quotation = {
    ...source,
    id,
    quotationNo: getNextQuotationNumber(store.quotations),
    revisionNo: 0,
    rootQuotationId: id,
    parentQuotationId: null,
    duplicatedFromId: source.id,
    status: "draft",
    items,
    createdAt: now,
    updatedAt: now,
  };

  store.quotations.unshift(quotation);
  await writeQuotationStore(store);

  return quotation;
}

export async function createRevision(sourceId: string) {
  const store = await readQuotationStore();
  const source = store.quotations.find((record) => record.id === sourceId);

  if (!source) {
    throw new Error("Source quotation not found.");
  }

  await validateRelations(source.clientId, source.projectId);

  const sameSeries = store.quotations.filter(
    (record) => record.rootQuotationId === source.rootQuotationId,
  );

  const nextRevision =
    sameSeries.reduce(
      (max, record) => Math.max(max, record.revisionNo),
      source.revisionNo,
    ) + 1;

  const now = new Date().toISOString();

  const revision: Quotation = {
    ...source,
    id: randomUUID(),
    revisionNo: nextRevision,
    parentQuotationId: source.id,
    duplicatedFromId: null,
    status: "draft",
    items: source.items.map((item) => ({
      ...item,
      id: randomUUID(),
    })),
    createdAt: now,
    updatedAt: now,
  };

  store.quotations.unshift(revision);
  await writeQuotationStore(store);

  return revision;
}

export async function searchQuotations(
  query: string,
): Promise<GlobalSearchResult[]> {
  const q = query.trim().toLowerCase();

  if (!q) {
    return [];
  }

  const [store, workspace] = await Promise.all([
    readQuotationStore(),
    readWorkspace(),
  ]);

  return store.quotations
    .filter((quotation) => {
      const client = workspace.clients.find(
        (record) => record.id === quotation.clientId,
      );
      const project = workspace.projects.find(
        (record) => record.id === quotation.projectId,
      );

      return [
        quotation.quotationNo,
        `rev ${quotation.revisionNo}`,
        quotation.title,
        quotation.subject,
        quotation.status,
        quotation.notes,
        client?.name ?? "",
        project?.name ?? "",
        project?.code ?? "",
        ...quotation.items.map((item) => item.description),
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    })
    .map((quotation) => {
      const client = workspace.clients.find(
        (record) => record.id === quotation.clientId,
      );
      const project = workspace.projects.find(
        (record) => record.id === quotation.projectId,
      );

      return {
        id: quotation.id,
        type: "quotation" as const,
        title: `${quotation.quotationNo} · Rev ${quotation.revisionNo}`,
        subtitle: [
          quotation.title,
          client?.name ?? "",
          project?.name ?? "",
        ]
          .filter(Boolean)
          .join(" · "),
        meta: `Quotation · ${quotation.status}`,
        href: `/quotations?selected=${encodeURIComponent(quotation.id)}`,
      };
    });
}
'@ | Set-Content -LiteralPath (Join-Path $ProjectRoot "src\lib\quotation-store.ts") -Encoding UTF8

Write-Host "Creating quotation API..." -ForegroundColor Yellow

@'
import { NextResponse } from "next/server";
import { readWorkspace } from "@/lib/workspace-store";
import {
  createQuotation,
  createRevision,
  duplicateQuotation,
  readQuotationStore,
  updateQuotation,
} from "@/lib/quotation-store";

export async function GET() {
  const [quotationStore, workspace] = await Promise.all([
    readQuotationStore(),
    readWorkspace(),
  ]);

  return NextResponse.json({
    quotations: quotationStore.quotations,
    clients: workspace.clients,
    projects: workspace.projects,
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const action = typeof body?.action === "string" ? body.action : "create";

    if (action === "duplicate") {
      if (!body?.sourceId) {
        throw new Error("Source quotation id is required.");
      }

      const quotation = await duplicateQuotation(body.sourceId);
      return NextResponse.json({ quotation }, { status: 201 });
    }

    if (action === "revision") {
      if (!body?.sourceId) {
        throw new Error("Source quotation id is required.");
      }

      const quotation = await createRevision(body.sourceId);
      return NextResponse.json({ quotation }, { status: 201 });
    }

    const quotation = await createQuotation(body);
    return NextResponse.json({ quotation }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to create quotation.",
      },
      { status: 400 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();

    if (!body?.id) {
      throw new Error("Quotation id is required.");
    }

    const quotation = await updateQuotation(body);
    return NextResponse.json({ quotation });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to update quotation.",
      },
      { status: 400 },
    );
  }
}
'@ | Set-Content -LiteralPath (Join-Path $ProjectRoot "src\app\api\quotations\route.ts") -Encoding UTF8

Write-Host "Extending search and dashboard stats..." -ForegroundColor Yellow

@'
import { NextResponse } from "next/server";
import { searchWorkspace } from "@/lib/workspace-store";
import { searchQuotations } from "@/lib/quotation-store";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? "";

  const [workspaceResults, quotationResults] = await Promise.all([
    searchWorkspace(query),
    searchQuotations(query),
  ]);

  return NextResponse.json({
    results: [...workspaceResults, ...quotationResults].slice(0, 100),
  });
}
'@ | Set-Content -LiteralPath (Join-Path $ProjectRoot "src\app\api\search\route.ts") -Encoding UTF8

@'
import { NextResponse } from "next/server";
import { readWorkspace } from "@/lib/workspace-store";
import { readQuotationStore } from "@/lib/quotation-store";

export async function GET() {
  const [workspace, quotationStore] = await Promise.all([
    readWorkspace(),
    readQuotationStore(),
  ]);

  return NextResponse.json({
    clients: workspace.clients.filter((client) => client.status === "active").length,
    projects: workspace.projects.filter((project) => project.status !== "archived").length,
    quotations: quotationStore.quotations.length,
    invoices: 0,
  });
}
'@ | Set-Content -LiteralPath (Join-Path $ProjectRoot "src\app\api\stats\route.ts") -Encoding UTF8

Write-Host "Creating quotation workspace UI..." -ForegroundColor Yellow

@'
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
'@ | Set-Content -LiteralPath (Join-Path $ProjectRoot "src\components\workspace\quotations-workspace.tsx") -Encoding UTF8

@'
import { QuotationsWorkspace } from "@/components/workspace/quotations-workspace";

export default function QuotationsPage() {
  return <QuotationsWorkspace />;
}
'@ | Set-Content -LiteralPath (Join-Path $ProjectRoot "src\app\quotations\page.tsx") -Encoding UTF8

Write-Host "Updating top-bar global search for quotations..." -ForegroundColor Yellow

@'
"use client";

import {
  Archive,
  Bell,
  BriefcaseBusiness,
  Building2,
  ChevronRight,
  FileStack,
  FileText,
  FolderKanban,
  LayoutDashboard,
  LayoutTemplate,
  Menu,
  Package,
  Plus,
  ReceiptText,
  Search,
  Settings,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { Brand } from "@/components/brand";
import type { GlobalSearchResult } from "@/types/workspace";

type NavItem = {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
};

const navigation: NavItem[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Clients", href: "/clients", icon: Users },
  { label: "Projects", href: "/projects", icon: FolderKanban },
  { label: "Quotations", href: "/quotations", icon: FileText },
  { label: "Bills & Invoices", href: "/invoices", icon: ReceiptText },
  { label: "Documents", href: "/documents", icon: FileStack },
  { label: "Global Search", href: "/search", icon: Search },
  { label: "Templates", href: "/templates", icon: LayoutTemplate },
  { label: "Products & Services", href: "/products", icon: Package },
];

const utilityNavigation: NavItem[] = [
  { label: "Archive", href: "/archive", icon: Archive },
  { label: "Settings", href: "/settings", icon: Settings },
];

function ResultIcon({ type }: { type: GlobalSearchResult["type"] }) {
  if (type === "client") {
    return <Building2 size={17} />;
  }

  if (type === "project") {
    return <FolderKanban size={17} />;
  }

  return <FileText size={17} />;
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [searchResults, setSearchResults] = useState<GlobalSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  useEffect(() => {
    const query = searchValue.trim();

    if (!query) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);

      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        const data = await response.json();
        setSearchResults((data.results ?? []).slice(0, 8));
      } catch {
        if (!controller.signal.aborted) {
          setSearchResults([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setSearching(false);
        }
      }
    }, 180);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [searchValue]);

  const renderNavItem = (item: NavItem) => {
    const Icon = item.icon;
    const active =
      item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);

    return (
      <Link
        key={item.href}
        href={item.href}
        className={active ? "nav-item nav-item-active" : "nav-item"}
        onClick={() => setSidebarOpen(false)}
      >
        <Icon size={18} strokeWidth={1.9} />
        <span>{item.label}</span>
      </Link>
    );
  };

  return (
    <div className="app-root">
      <div
        className={sidebarOpen ? "sidebar-overlay sidebar-overlay-open" : "sidebar-overlay"}
        onClick={() => setSidebarOpen(false)}
      />

      <aside className={sidebarOpen ? "sidebar sidebar-open" : "sidebar"}>
        <div className="sidebar-brand-row">
          <Brand />
          <button
            type="button"
            className="icon-button sidebar-close"
            aria-label="Close menu"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={19} />
          </button>
        </div>

        <div className="sidebar-section-label">Workspace</div>
        <nav className="sidebar-nav">{navigation.map(renderNavItem)}</nav>

        <div className="sidebar-section-label sidebar-section-gap">System</div>
        <nav className="sidebar-nav">{utilityNavigation.map(renderNavItem)}</nav>

        <div className="sidebar-footer">
          <div className="sidebar-footer-icon">
            <BriefcaseBusiness size={18} />
          </div>
          <div>
            <strong>Local Workspace</strong>
            <span>M3 Quotation Engine</span>
          </div>
        </div>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <div className="topbar-left">
            <button
              type="button"
              className="icon-button menu-button"
              aria-label="Open menu"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={21} />
            </button>

            <div className="search-wrap">
              <Search size={18} className="search-icon" />
              <input
                ref={searchRef}
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                placeholder="Search clients, projects, quotations..."
                aria-label="Global search"
              />
              <span className="search-shortcut">Ctrl K</span>

              {searchValue.trim() && (
                <div className="search-popover">
                  <div className="search-popover-title">Global search</div>

                  {searching ? (
                    <div className="search-empty">Searching...</div>
                  ) : searchResults.length > 0 ? (
                    <>
                      {searchResults.map((result) => (
                        <Link
                          key={`${result.type}-${result.id}`}
                          href={result.href}
                          className="search-result"
                          onClick={() => setSearchValue("")}
                        >
                          <span className="search-result-icon">
                            <ResultIcon type={result.type} />
                          </span>
                          <span className="search-result-copy">
                            <strong>{result.title}</strong>
                            <small>{result.subtitle}</small>
                          </span>
                          <ChevronRight size={16} />
                        </Link>
                      ))}

                      <Link
                        href={`/search?q=${encodeURIComponent(searchValue)}`}
                        className="search-view-all"
                        onClick={() => setSearchValue("")}
                      >
                        View all search results
                        <ChevronRight size={15} />
                      </Link>
                    </>
                  ) : (
                    <div className="search-empty">No matching workspace data found.</div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="topbar-actions">
            <Link href="/quotations" className="button button-primary desktop-create">
              <Plus size={17} />
              New quotation
            </Link>

            <button className="icon-button notification-button" type="button" aria-label="Notifications">
              <Bell size={19} />
              <span className="notification-dot" />
            </button>

            <div className="profile-chip">
              <div className="profile-avatar">ASB</div>
              <div className="profile-copy">
                <strong>Administrator</strong>
                <span>Local account</span>
              </div>
            </div>
          </div>
        </header>

        <main className="content">{children}</main>
      </div>
    </div>
  );
}
'@ | Set-Content -LiteralPath (Join-Path $ProjectRoot "src\components\app-shell.tsx") -Encoding UTF8

Write-Host "Updating global search page..." -ForegroundColor Yellow

@'
"use client";

import {
  Building2,
  ChevronRight,
  FileText,
  FolderKanban,
  Search,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { GlobalSearchResult } from "@/types/workspace";

type SearchType = "all" | "client" | "project" | "quotation";

function SearchIcon({ type }: { type: GlobalSearchResult["type"] }) {
  if (type === "client") return <Building2 size={18} />;
  if (type === "project") return <FolderKanban size={18} />;
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
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
          cache: "no-store",
        });
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
    () => (type === "all" ? results : results.filter((result) => result.type === type)),
    [results, type],
  );

  const filters: { key: SearchType; label: string }[] = [
    { key: "all", label: "All" },
    { key: "client", label: "Clients" },
    { key: "project", label: "Projects" },
    { key: "quotation", label: "Quotations" },
  ];

  return (
    <div className="page-stack">
      <div className="page-heading-row">
        <div>
          <div className="eyebrow">Full-site data finder</div>
          <h1>Global Search</h1>
          <p>
            Search client, project and quotation data from one place. Invoice and
            document content will join this same index in later milestones.
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
            placeholder="Search client, phone, project, quotation no, item, tag..."
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

Write-Host "Updating dashboard milestone status..." -ForegroundColor Yellow

$DashboardPath = Join-Path $ProjectRoot "src\components\workspace\dashboard-overview.tsx"
$DashboardContent = Get-Content -LiteralPath $DashboardPath -Raw
$DashboardContent = $DashboardContent.Replace(
    'helper: "Quotation engine starts in M3",',
    'helper: "Quotation records and revisions",'
)
$DashboardContent = $DashboardContent.Replace(
    'description: "Quotation duplication starts in M3",',
    'description: "Reuse a previous quotation",'
)
$DashboardContent = $DashboardContent.Replace(
    'description: "Quotation builder starts in M3",',
    'description: "Create a commercial quotation",'
)
$DashboardContent = $DashboardContent.Replace(
    '<div className="progress-row progress-current">' + "`r`n" + '              <div className="progress-number">M2</div>',
    '<div className="progress-row progress-done">' + "`r`n" + '              <div className="progress-number">M2</div>'
)
$DashboardContent = $DashboardContent.Replace(
    '<span className="progress-pill">Current</span>' + "`r`n" + '            </div>' + "`r`n" + '          </div>',
    '<span className="progress-pill">Done</span>' + "`r`n" + '            </div>' + "`r`n" +
    '            <div className="progress-row progress-current">' + "`r`n" +
    '              <div className="progress-number">M3</div>' + "`r`n" +
    '              <div>' + "`r`n" +
    '                <strong>Quotation engine</strong>' + "`r`n" +
    '                <span>Numbering, items, duplicate and revisions</span>' + "`r`n" +
    '              </div>' + "`r`n" +
    '              <span className="progress-pill">Current</span>' + "`r`n" +
    '            </div>' + "`r`n" +
    '          </div>'
)
Set-Content -LiteralPath $DashboardPath -Value $DashboardContent -Encoding UTF8

Write-Host "Adding quotation styles..." -ForegroundColor Yellow

@'

/* M3 quotation engine */

.quotation-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.7fr) minmax(340px, 0.72fr);
  gap: 18px;
  align-items: start;
}

.quotation-toolbar {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) 170px 125px 40px;
  gap: 9px;
  padding: 14px;
  border-bottom: 1px solid var(--ink-100);
  background: var(--surface-soft);
}

.quotation-toolbar select {
  min-height: 40px;
  width: 100%;
  padding: 9px 10px;
  border: 1px solid var(--ink-200);
  border-radius: 9px;
  color: var(--ink-700);
  background: #fff;
  font-size: 11px;
  outline: none;
}

.quotation-grid {
  grid-template-columns:
    minmax(210px, 1.25fr)
    minmax(180px, 1fr)
    125px
    86px;
}

.quotation-total-cell {
  font-weight: 750;
  color: var(--ink-700);
}

.status-sent {
  color: #75510d;
  background: #fff4d7;
}

.status-rejected {
  color: #9d1f2a;
  background: #fff0f1;
}

.quotation-detail-panel {
  min-height: 590px;
}

.quotation-title-block {
  padding: 16px 0;
  border-bottom: 1px solid var(--ink-100);
}

.quotation-title-block strong,
.quotation-title-block span {
  display: block;
}

.quotation-title-block strong {
  color: var(--brand-950);
  font-size: 13px;
}

.quotation-title-block span {
  margin-top: 5px;
  color: var(--ink-500);
  font-size: 10px;
  line-height: 1.45;
}

.quotation-meta-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  padding: 15px 0;
  border-bottom: 1px solid var(--ink-100);
}

.quotation-meta-grid > div {
  min-width: 0;
  padding: 10px;
  border-radius: 9px;
  background: var(--surface-soft);
}

.quotation-meta-grid small,
.quotation-meta-grid strong {
  display: block;
}

.quotation-meta-grid small {
  color: var(--ink-400);
  font-size: 8.5px;
}

.quotation-meta-grid strong {
  margin-top: 4px;
  overflow: hidden;
  color: var(--ink-700);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.quotation-mini-items {
  display: grid;
  gap: 7px;
}

.quotation-mini-items > div:not(.quotation-more-items) {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  padding: 8px 9px;
  border-radius: 8px;
  background: var(--surface-soft);
}

.quotation-mini-items span strong,
.quotation-mini-items span small {
  display: block;
}

.quotation-mini-items span strong {
  overflow: hidden;
  color: var(--ink-700);
  font-size: 9.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.quotation-mini-items span small {
  margin-top: 3px;
  color: var(--ink-400);
  font-size: 8px;
}

.quotation-mini-items > div > strong {
  color: var(--ink-700);
  font-size: 9px;
}

.quotation-more-items {
  padding: 5px 2px;
  color: var(--ink-400);
  font-size: 8.5px;
}

.quotation-summary {
  display: grid;
  gap: 7px;
  padding: 15px 0;
  border-bottom: 1px solid var(--ink-100);
}

.quotation-summary > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  color: var(--ink-500);
  font-size: 9.5px;
}

.quotation-summary > div strong {
  color: var(--ink-700);
}

.quotation-grand-total {
  margin-top: 3px;
  padding-top: 10px;
  border-top: 1px solid var(--ink-100);
}

.quotation-grand-total span,
.quotation-grand-total strong {
  color: var(--brand-900) !important;
  font-size: 11px !important;
  font-weight: 850;
}

.quotation-action-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  padding-top: 15px;
}

.quotation-modal {
  width: min(1040px, 100%);
}

.form-section-title {
  margin: 2px 0 12px;
  color: var(--brand-800);
  font-size: 10px;
  font-weight: 850;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}

.quotation-items-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 22px;
}

.button-small {
  min-height: 32px;
  padding: 0 10px;
  font-size: 9.5px;
}

.quotation-item-editor {
  overflow-x: auto;
  border: 1px solid var(--ink-100);
  border-radius: 11px;
}

.quotation-item-head,
.quotation-item-row {
  min-width: 820px;
  display: grid;
  grid-template-columns:
    minmax(280px, 1fr)
    80px
    90px
    120px
    115px
    40px;
  gap: 7px;
  align-items: center;
}

.quotation-item-head {
  min-height: 34px;
  padding: 0 9px;
  color: var(--ink-400);
  background: var(--surface-soft);
  font-size: 8px;
  font-weight: 850;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.quotation-item-row {
  padding: 8px 9px;
  border-top: 1px solid var(--ink-100);
}

.quotation-item-row input {
  min-width: 0;
  height: 36px;
  padding: 7px 9px;
  border: 1px solid var(--ink-200);
  border-radius: 8px;
  outline: none;
  color: var(--ink-700);
  background: #fff;
  font-size: 10px;
}

.quotation-item-row input:focus {
  border-color: #9ec2e1;
  box-shadow: 0 0 0 3px rgba(36, 119, 198, 0.07);
}

.quotation-item-row > strong {
  text-align: right;
  color: var(--ink-700);
  font-size: 9.5px;
}

.quotation-remove-item {
  width: 34px;
  height: 34px;
}

.quotation-commercial-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  margin-top: 14px;
}

.quotation-commercial-grid label > span,
.quotation-notes-label > span {
  display: block;
  margin-bottom: 6px;
  color: var(--ink-600);
  font-size: 9px;
  font-weight: 800;
}

.quotation-commercial-grid input,
.quotation-notes-label textarea {
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

.quotation-live-summary {
  display: grid;
  grid-template-columns: minmax(150px, 1fr) auto auto;
  align-items: center;
  gap: 24px;
  margin-top: 14px;
  padding: 13px 14px;
  border: 1px solid #d5e4f0;
  border-radius: 10px;
  background: var(--brand-50);
}

.quotation-live-summary > span {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--brand-700);
  font-size: 9.5px;
  font-weight: 850;
}

.quotation-live-summary small,
.quotation-live-summary strong {
  display: block;
  text-align: right;
}

.quotation-live-summary small {
  color: var(--ink-400);
  font-size: 8px;
}

.quotation-live-summary strong {
  margin-top: 3px;
  color: var(--brand-900);
  font-size: 11px;
}

.quotation-notes-label {
  display: block;
  margin-top: 14px;
}

@media (max-width: 1180px) {
  .quotation-layout {
    grid-template-columns: minmax(0, 1fr) 330px;
  }

  .quotation-toolbar {
    grid-template-columns: 1fr 145px;
  }

  .quotation-toolbar select:nth-of-type(2),
  .quotation-toolbar .icon-button {
    display: none;
  }

  .quotation-grid {
    grid-template-columns: minmax(190px, 1.2fr) minmax(150px, 1fr) 110px;
  }

  .quotation-grid > :nth-child(4) {
    display: none;
  }

  .quotation-commercial-grid {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 900px) {
  .quotation-layout {
    grid-template-columns: 1fr;
  }

  .quotation-detail-panel {
    min-height: auto;
  }
}

@media (max-width: 680px) {
  .quotation-toolbar {
    grid-template-columns: 1fr;
  }

  .quotation-toolbar select,
  .quotation-toolbar .icon-button {
    display: none;
  }

  .quotation-grid {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .quotation-grid > :nth-child(2),
  .quotation-grid > :nth-child(4) {
    display: none;
  }

  .quotation-commercial-grid {
    grid-template-columns: 1fr;
  }

  .quotation-live-summary {
    grid-template-columns: 1fr;
    gap: 9px;
  }

  .quotation-live-summary small,
  .quotation-live-summary strong {
    text-align: left;
  }

  .quotation-action-grid {
    grid-template-columns: 1fr;
  }
}
'@ | Add-Content -LiteralPath (Join-Path $ProjectRoot "src\app\globals.css") -Encoding UTF8

Write-Host "Creating M3 acceptance checklist..." -ForegroundColor Yellow

@'
# M3 Acceptance Checklist

## Prerequisite
Create at least one active Client in M2.
A Project is optional.

## Create quotation
1. Open Quotations.
2. Click New quotation.
3. Select a Client.
4. Optionally select a Project.
5. Enter a quotation title.
6. Add at least 2 commercial items.
7. Set quantity and rate.
8. Optionally add discount, VAT, Tax or Other charge.
9. Confirm the live Grand Total changes correctly.
10. Save.

Expected:
- Automatic quotation number such as QT-2026-0001.
- Revision starts at Rev 0.
- Saved quotation remains after browser refresh.

## Edit
1. Select the quotation.
2. Click Edit.
3. Change one item rate or status.
4. Save.
5. Confirm totals/status update.

## Duplicate
1. Select a quotation.
2. Click Duplicate.
3. Confirm.
4. Verify:
   - A new quotation number is created.
   - Revision is Rev 0.
   - Client, project, items and terms/data are copied.
   - New copy status is Draft.
   - Original quotation remains unchanged.

## Revision
1. Select a quotation.
2. Click New revision.
3. Confirm.
4. Verify:
   - Quotation number stays the same.
   - Revision increases to Rev 1.
   - Previous revision still exists.
   - New revision status is Draft.

Create another revision and confirm Rev 2 is generated.

## Global search
Use Ctrl+K and search by:
- Quotation number
- Quotation title
- Client name
- Project name
- Commercial item description

Open Global Search and verify the Quotations filter.

## Dashboard
Confirm Quotation count is updated.

## Local persistence
Quotation data is stored in:
data/quotations.json

The file is excluded from Git.

## Next milestone
M4 will begin the Custom Document Builder:
- Page/section model
- A4/Legal/custom page settings foundation
- Different page layouts
- Header/footer model
- Reusable sections
- Quotation data mapped into document fields
'@ | Set-Content -LiteralPath (Join-Path $ProjectRoot "docs\M3_ACCEPTANCE_TESTS.md") -Encoding UTF8

Set-Content -LiteralPath (Join-Path $ProjectRoot ".liftdoc-milestone") -Value "M3" -Encoding ASCII

Write-Host ""
Write-Host "Running production build..." -ForegroundColor Yellow

npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "M3 build failed. Do not rollback yet." -ForegroundColor Red
    Write-Host "Send me the complete new build error for one consolidated fix." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Emergency rollback only:" -ForegroundColor DarkGray
    Write-Host "git reset --hard checkpoint-m2-data-workspace" -ForegroundColor DarkGray
    throw "M3 production build failed."
}

Write-Host "[OK] Production build successful" -ForegroundColor Green

Write-Host ""
Write-Host "Saving M3 Git checkpoint..." -ForegroundColor Yellow

git add .
if ($LASTEXITCODE -ne 0) {
    throw "git add failed."
}

$Changes = git status --porcelain

if ($Changes) {
    git commit -m "Add quotation engine numbering duplicate and revisions"

    if ($LASTEXITCODE -ne 0) {
        Write-Warning "Build passed, but Git commit failed. Send me the Git message."
    }
    else {
        git tag -f checkpoint-m3-quotation-engine HEAD | Out-Null
        Write-Host "[OK] Git checkpoint: checkpoint-m3-quotation-engine" -ForegroundColor Green
    }
}
else {
    Write-Host "No Git changes remained to commit." -ForegroundColor DarkGray
    git tag -f checkpoint-m3-quotation-engine HEAD | Out-Null
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host " M3 QUOTATION ENGINE COMPLETE" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Local URL: http://localhost:$Port" -ForegroundColor Cyan
Write-Host "Acceptance checklist: docs\M3_ACCEPTANCE_TESTS.md" -ForegroundColor Cyan
Write-Host ""

Write-Host "Starting ASB LiftDoc..." -ForegroundColor Yellow
powershell -ExecutionPolicy Bypass -File (Join-Path $ProjectRoot "Start-ASBLiftDoc.ps1")

Write-Host ""
Write-Host "Run the M3 acceptance tests." -ForegroundColor Yellow
Write-Host "If everything works, send: M3 confirmed" -ForegroundColor Green
