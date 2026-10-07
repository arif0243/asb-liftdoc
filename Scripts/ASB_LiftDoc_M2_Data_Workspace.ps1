$ErrorActionPreference = "Stop"

$ProjectRoot = "E:\ASB LiftDoc\asb-liftdoc"
$PortFile = Join-Path $ProjectRoot ".liftdoc-port"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " ASB LiftDoc - M2 DATA WORKSPACE" -ForegroundColor Cyan
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
if ($Dirty) {
    Write-Host "Uncommitted changes were found:" -ForegroundColor Yellow
    git status --short
    throw "M2 stopped for safety. Send me the status above."
}

git tag -f checkpoint-m1-ui HEAD | Out-Null
Write-Host "[OK] Rollback checkpoint: checkpoint-m1-ui" -ForegroundColor Green

$Port = 3010
if (Test-Path -LiteralPath $PortFile) {
    $Port = [int](Get-Content -LiteralPath $PortFile -Raw).Trim()
}

$Running = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($Running) {
    Write-Host "Stopping current localhost server on port $Port..." -ForegroundColor Yellow
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
    "src\app\api\clients",
    "src\app\api\projects",
    "src\app\api\search",
    "src\app\api\stats",
    "src\app\search",
    "src\components\workspace"
)

foreach ($Dir in $Dirs) {
    New-Item -ItemType Directory -Path (Join-Path $ProjectRoot $Dir) -Force | Out-Null
}

$GitIgnorePath = Join-Path $ProjectRoot ".gitignore"
$GitIgnore = Get-Content -LiteralPath $GitIgnorePath -Raw
if ($GitIgnore -notmatch "(?m)^/data/workspace\.json$") {
    Add-Content -LiteralPath $GitIgnorePath -Value "`n# ASB LiftDoc local development data`n/data/workspace.json`n"
}

$DataFile = Join-Path $ProjectRoot "data\workspace.json"
if (-not (Test-Path -LiteralPath $DataFile)) {
    @'
{
  "clients": [],
  "projects": []
}
'@ | Set-Content -LiteralPath $DataFile -Encoding UTF8
}

Write-Host "Creating shared workspace types..." -ForegroundColor Yellow

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
  type: "client" | "project";
  title: string;
  subtitle: string;
  meta: string;
  href: string;
};
'@ | Set-Content -LiteralPath (Join-Path $ProjectRoot "src\types\workspace.ts") -Encoding UTF8

Write-Host "Creating local persistence layer..." -ForegroundColor Yellow

@'
import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type {
  Client,
  Project,
  WorkspaceData,
  GlobalSearchResult,
} from "@/types/workspace";

const dataFile = path.join(process.cwd(), "data", "workspace.json");

const emptyData: WorkspaceData = {
  clients: [],
  projects: [],
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

export async function readWorkspace(): Promise<WorkspaceData> {
  await ensureDataFile();

  try {
    const raw = await fs.readFile(dataFile, "utf8");
    const parsed = JSON.parse(raw) as Partial<WorkspaceData>;

    return {
      clients: Array.isArray(parsed.clients) ? parsed.clients : [],
      projects: Array.isArray(parsed.projects) ? parsed.projects : [],
    };
  } catch {
    return structuredClone(emptyData);
  }
}

export async function writeWorkspace(data: WorkspaceData) {
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

function cleanTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => cleanText(item))
      .filter(Boolean)
      .slice(0, 20);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 20);
  }

  return [];
}

export async function createClient(input: Partial<Client>) {
  const data = await readWorkspace();
  const now = new Date().toISOString();
  const name = cleanText(input.name);

  if (!name) {
    throw new Error("Client name is required.");
  }

  const client: Client = {
    id: randomUUID(),
    name,
    companyName: cleanText(input.companyName),
    contactPerson: cleanText(input.contactPerson),
    phone: cleanText(input.phone),
    email: cleanText(input.email),
    address: cleanText(input.address),
    notes: cleanText(input.notes),
    tags: cleanTags(input.tags),
    status: input.status === "archived" ? "archived" : "active",
    createdAt: now,
    updatedAt: now,
  };

  data.clients.unshift(client);
  await writeWorkspace(data);
  return client;
}

export async function updateClient(input: Partial<Client> & { id: string }) {
  const data = await readWorkspace();
  const index = data.clients.findIndex((client) => client.id === input.id);

  if (index === -1) {
    throw new Error("Client not found.");
  }

  const current = data.clients[index];
  const name = input.name === undefined ? current.name : cleanText(input.name);

  if (!name) {
    throw new Error("Client name is required.");
  }

  const updated: Client = {
    ...current,
    ...input,
    name,
    companyName:
      input.companyName === undefined
        ? current.companyName
        : cleanText(input.companyName),
    contactPerson:
      input.contactPerson === undefined
        ? current.contactPerson
        : cleanText(input.contactPerson),
    phone: input.phone === undefined ? current.phone : cleanText(input.phone),
    email: input.email === undefined ? current.email : cleanText(input.email),
    address:
      input.address === undefined ? current.address : cleanText(input.address),
    notes: input.notes === undefined ? current.notes : cleanText(input.notes),
    tags: input.tags === undefined ? current.tags : cleanTags(input.tags),
    status: input.status === "archived" ? "archived" : "active",
    updatedAt: new Date().toISOString(),
  };

  data.clients[index] = updated;
  await writeWorkspace(data);
  return updated;
}

export async function createProject(input: Partial<Project>) {
  const data = await readWorkspace();
  const now = new Date().toISOString();
  const name = cleanText(input.name);
  const clientId = cleanText(input.clientId);

  if (!name) {
    throw new Error("Project name is required.");
  }

  if (!clientId || !data.clients.some((client) => client.id === clientId)) {
    throw new Error("A valid client is required.");
  }

  const allowedStatuses = ["active", "on_hold", "completed", "archived"] as const;
  const status = allowedStatuses.includes(input.status as (typeof allowedStatuses)[number])
    ? (input.status as Project["status"])
    : "active";

  const project: Project = {
    id: randomUUID(),
    clientId,
    name,
    code: cleanText(input.code),
    location: cleanText(input.location),
    description: cleanText(input.description),
    tags: cleanTags(input.tags),
    status,
    createdAt: now,
    updatedAt: now,
  };

  data.projects.unshift(project);
  await writeWorkspace(data);
  return project;
}

export async function updateProject(input: Partial<Project> & { id: string }) {
  const data = await readWorkspace();
  const index = data.projects.findIndex((project) => project.id === input.id);

  if (index === -1) {
    throw new Error("Project not found.");
  }

  const current = data.projects[index];
  const name = input.name === undefined ? current.name : cleanText(input.name);
  const clientId =
    input.clientId === undefined ? current.clientId : cleanText(input.clientId);

  if (!name) {
    throw new Error("Project name is required.");
  }

  if (!data.clients.some((client) => client.id === clientId)) {
    throw new Error("A valid client is required.");
  }

  const allowedStatuses = ["active", "on_hold", "completed", "archived"] as const;
  const status = allowedStatuses.includes(input.status as (typeof allowedStatuses)[number])
    ? (input.status as Project["status"])
    : current.status;

  const updated: Project = {
    ...current,
    ...input,
    name,
    clientId,
    code: input.code === undefined ? current.code : cleanText(input.code),
    location:
      input.location === undefined ? current.location : cleanText(input.location),
    description:
      input.description === undefined
        ? current.description
        : cleanText(input.description),
    tags: input.tags === undefined ? current.tags : cleanTags(input.tags),
    status,
    updatedAt: new Date().toISOString(),
  };

  data.projects[index] = updated;
  await writeWorkspace(data);
  return updated;
}

export async function searchWorkspace(query: string) {
  const data = await readWorkspace();
  const q = query.trim().toLowerCase();

  if (!q) {
    return [] as GlobalSearchResult[];
  }

  const clients: GlobalSearchResult[] = data.clients
    .filter((client) => {
      const haystack = [
        client.name,
        client.companyName,
        client.contactPerson,
        client.phone,
        client.email,
        client.address,
        client.notes,
        ...client.tags,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    })
    .map((client) => ({
      id: client.id,
      type: "client" as const,
      title: client.name,
      subtitle:
        client.companyName ||
        client.contactPerson ||
        client.address ||
        "Client record",
      meta: client.status === "archived" ? "Archived client" : "Client",
      href: `/clients?selected=${encodeURIComponent(client.id)}`,
    }));

  const projects: GlobalSearchResult[] = data.projects
    .filter((project) => {
      const client = data.clients.find((item) => item.id === project.clientId);
      const haystack = [
        project.name,
        project.code,
        project.location,
        project.description,
        project.status,
        client?.name ?? "",
        ...project.tags,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    })
    .map((project) => {
      const client = data.clients.find((item) => item.id === project.clientId);

      return {
        id: project.id,
        type: "project" as const,
        title: project.name,
        subtitle: client?.name || project.location || "Project record",
        meta: project.code ? `Project · ${project.code}` : "Project",
        href: `/projects?selected=${encodeURIComponent(project.id)}`,
      };
    });

  return [...clients, ...projects].slice(0, 50);
}
'@ | Set-Content -LiteralPath (Join-Path $ProjectRoot "src\lib\workspace-store.ts") -Encoding UTF8

Write-Host "Creating API routes..." -ForegroundColor Yellow

@'
import { NextResponse } from "next/server";
import {
  createClient,
  readWorkspace,
  updateClient,
} from "@/lib/workspace-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const data = await readWorkspace();
  return NextResponse.json({ clients: data.clients });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const client = await createClient(body);
    return NextResponse.json({ client }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create client." },
      { status: 400 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();

    if (!body?.id) {
      throw new Error("Client id is required.");
    }

    const client = await updateClient(body);
    return NextResponse.json({ client });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update client." },
      { status: 400 },
    );
  }
}
'@ | Set-Content -LiteralPath (Join-Path $ProjectRoot "src\app\api\clients\route.ts") -Encoding UTF8

@'
import { NextResponse } from "next/server";
import {
  createProject,
  readWorkspace,
  updateProject,
} from "@/lib/workspace-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const data = await readWorkspace();
  return NextResponse.json({
    projects: data.projects,
    clients: data.clients,
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const project = await createProject(body);
    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create project." },
      { status: 400 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();

    if (!body?.id) {
      throw new Error("Project id is required.");
    }

    const project = await updateProject(body);
    return NextResponse.json({ project });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update project." },
      { status: 400 },
    );
  }
}
'@ | Set-Content -LiteralPath (Join-Path $ProjectRoot "src\app\api\projects\route.ts") -Encoding UTF8

@'
import { NextResponse } from "next/server";
import { searchWorkspace } from "@/lib/workspace-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? "";
  const results = await searchWorkspace(query);

  return NextResponse.json({ results });
}
'@ | Set-Content -LiteralPath (Join-Path $ProjectRoot "src\app\api\search\route.ts") -Encoding UTF8

@'
import { NextResponse } from "next/server";
import { readWorkspace } from "@/lib/workspace-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const data = await readWorkspace();

  return NextResponse.json({
    clients: data.clients.filter((client) => client.status === "active").length,
    projects: data.projects.filter((project) => project.status !== "archived").length,
    quotations: 0,
    invoices: 0,
  });
}
'@ | Set-Content -LiteralPath (Join-Path $ProjectRoot "src\app\api\stats\route.ts") -Encoding UTF8

Write-Host "Creating client workspace..." -ForegroundColor Yellow

@'
"use client";

import {
  Archive,
  Building2,
  Edit3,
  Mail,
  MapPin,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Tag,
  UserRound,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Client, Project } from "@/types/workspace";

type ClientForm = {
  id?: string;
  name: string;
  companyName: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  tags: string;
  status: "active" | "archived";
};

const emptyForm: ClientForm = {
  name: "",
  companyName: "",
  contactPerson: "",
  phone: "",
  email: "",
  address: "",
  notes: "",
  tags: "",
  status: "active",
};

export function ClientsWorkspace() {
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "archived">("active");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<ClientForm>(emptyForm);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);

    try {
      const [clientResponse, projectResponse] = await Promise.all([
        fetch("/api/clients", { cache: "no-store" }),
        fetch("/api/projects", { cache: "no-store" }),
      ]);

      const clientData = await clientResponse.json();
      const projectData = await projectResponse.json();

      setClients(clientData.clients ?? []);
      setProjects(projectData.projects ?? []);

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

    return clients.filter((client) => {
      if (statusFilter !== "all" && client.status !== statusFilter) {
        return false;
      }

      if (!q) {
        return true;
      }

      return [
        client.name,
        client.companyName,
        client.contactPerson,
        client.phone,
        client.email,
        client.address,
        ...client.tags,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [clients, query, statusFilter]);

  const selected = clients.find((client) => client.id === selectedId) ?? null;
  const selectedProjects = projects.filter(
    (project) => project.clientId === selected?.id,
  );

  const openCreate = () => {
    setForm(emptyForm);
    setError("");
    setModalOpen(true);
  };

  const openEdit = (client: Client) => {
    setForm({
      id: client.id,
      name: client.name,
      companyName: client.companyName,
      contactPerson: client.contactPerson,
      phone: client.phone,
      email: client.email,
      address: client.address,
      notes: client.notes,
      tags: client.tags.join(", "),
      status: client.status,
    });
    setError("");
    setModalOpen(true);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      const response = await fetch("/api/clients", {
        method: form.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          tags: form.tags
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to save client.");
      }

      setModalOpen(false);
      await load();
      setSelectedId(data.client.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save client.");
    } finally {
      setSaving(false);
    }
  };

  const toggleArchive = async (client: Client) => {
    await fetch("/api/clients", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: client.id,
        status: client.status === "archived" ? "active" : "archived",
      }),
    });

    await load();
  };

  return (
    <div className="page-stack">
      <div className="page-heading-row">
        <div>
          <div className="eyebrow">Workspace organization</div>
          <h1>Clients</h1>
          <p>
            Keep client contacts, projects and future quotations or invoices
            grouped under one record.
          </p>
        </div>

        <button className="button button-primary" type="button" onClick={openCreate}>
          <Plus size={17} />
          Add client
        </button>
      </div>

      <section className="workspace-layout">
        <div className="workspace-list-panel">
          <div className="workspace-toolbar">
            <div className="workspace-search">
              <Search size={16} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search clients..."
              />
            </div>

            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as "all" | "active" | "archived")
              }
            >
              <option value="active">Active</option>
              <option value="archived">Archived</option>
              <option value="all">All clients</option>
            </select>

            <button type="button" className="icon-button" onClick={() => void load()}>
              <RefreshCw size={16} />
            </button>
          </div>

          <div className="record-table">
            <div className="record-table-head client-grid">
              <span>Client</span>
              <span>Contact</span>
              <span>Projects</span>
              <span>Status</span>
            </div>

            {loading ? (
              <div className="record-empty">Loading clients...</div>
            ) : filtered.length === 0 ? (
              <div className="record-empty">
                No matching clients. Use “Add client” to create the first one.
              </div>
            ) : (
              filtered.map((client) => {
                const projectCount = projects.filter(
                  (project) => project.clientId === client.id,
                ).length;

                return (
                  <button
                    type="button"
                    key={client.id}
                    className={
                      selectedId === client.id
                        ? "record-row client-grid record-row-selected"
                        : "record-row client-grid"
                    }
                    onClick={() => setSelectedId(client.id)}
                  >
                    <span className="record-primary">
                      <strong>{client.name}</strong>
                      <small>{client.companyName || client.address || "Client record"}</small>
                    </span>
                    <span className="record-secondary">
                      {client.contactPerson || client.phone || client.email || "—"}
                    </span>
                    <span className="record-secondary">{projectCount}</span>
                    <span>
                      <span
                        className={
                          client.status === "archived"
                            ? "status-pill status-muted"
                            : "status-pill status-active"
                        }
                      >
                        {client.status}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <aside className="record-detail-panel">
          {selected ? (
            <>
              <div className="detail-heading">
                <div>
                  <span className="panel-kicker">Client profile</span>
                  <h2>{selected.name}</h2>
                  <p>{selected.companyName || "No company name added"}</p>
                </div>

                <button
                  type="button"
                  className="icon-button"
                  onClick={() => openEdit(selected)}
                  aria-label="Edit client"
                >
                  <Edit3 size={16} />
                </button>
              </div>

              <div className="detail-info-list">
                <div>
                  <UserRound size={16} />
                  <span>
                    <small>Contact person</small>
                    <strong>{selected.contactPerson || "Not added"}</strong>
                  </span>
                </div>
                <div>
                  <Phone size={16} />
                  <span>
                    <small>Phone</small>
                    <strong>{selected.phone || "Not added"}</strong>
                  </span>
                </div>
                <div>
                  <Mail size={16} />
                  <span>
                    <small>Email</small>
                    <strong>{selected.email || "Not added"}</strong>
                  </span>
                </div>
                <div>
                  <MapPin size={16} />
                  <span>
                    <small>Address</small>
                    <strong>{selected.address || "Not added"}</strong>
                  </span>
                </div>
              </div>

              {selected.tags.length > 0 && (
                <div className="detail-tags">
                  <div className="detail-section-title">
                    <Tag size={15} />
                    Tags
                  </div>
                  <div className="tag-row">
                    {selected.tags.map((tag) => (
                      <span key={tag} className="tag-chip">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="detail-section">
                <div className="detail-section-heading">
                  <strong>Projects</strong>
                  <span>{selectedProjects.length}</span>
                </div>

                {selectedProjects.length === 0 ? (
                  <p className="detail-muted">No project added for this client yet.</p>
                ) : (
                  <div className="mini-record-list">
                    {selectedProjects.map((project) => (
                      <div key={project.id}>
                        <span className="mini-record-icon">
                          <Building2 size={15} />
                        </span>
                        <span>
                          <strong>{project.name}</strong>
                          <small>{project.code || project.location || project.status}</small>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {selected.notes && (
                <div className="detail-section">
                  <div className="detail-section-heading">
                    <strong>Notes</strong>
                  </div>
                  <p className="detail-notes">{selected.notes}</p>
                </div>
              )}

              <button
                type="button"
                className="button button-secondary detail-archive"
                onClick={() => void toggleArchive(selected)}
              >
                <Archive size={16} />
                {selected.status === "archived" ? "Restore client" : "Archive client"}
              </button>
            </>
          ) : (
            <div className="detail-empty">
              <Building2 size={28} />
              <strong>Select a client</strong>
              <p>Client details and project grouping will appear here.</p>
            </div>
          )}
        </aside>
      </section>

      {modalOpen && (
        <div className="modal-backdrop" onMouseDown={() => setModalOpen(false)}>
          <div className="modal-card" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-heading">
              <div>
                <span className="panel-kicker">{form.id ? "Edit client" : "New client"}</span>
                <h2>{form.id ? form.name || "Client" : "Add client"}</h2>
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
              <div className="form-grid">
                <label>
                  <span>Client name *</span>
                  <input
                    required
                    value={form.name}
                    onChange={(event) => setForm({ ...form, name: event.target.value })}
                  />
                </label>

                <label>
                  <span>Company / organization</span>
                  <input
                    value={form.companyName}
                    onChange={(event) =>
                      setForm({ ...form, companyName: event.target.value })
                    }
                  />
                </label>

                <label>
                  <span>Contact person</span>
                  <input
                    value={form.contactPerson}
                    onChange={(event) =>
                      setForm({ ...form, contactPerson: event.target.value })
                    }
                  />
                </label>

                <label>
                  <span>Phone</span>
                  <input
                    value={form.phone}
                    onChange={(event) => setForm({ ...form, phone: event.target.value })}
                  />
                </label>

                <label>
                  <span>Email</span>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(event) => setForm({ ...form, email: event.target.value })}
                  />
                </label>

                <label>
                  <span>Tags</span>
                  <input
                    value={form.tags}
                    onChange={(event) => setForm({ ...form, tags: event.target.value })}
                    placeholder="e.g. Dhaka, Modernization"
                  />
                </label>

                <label className="form-span-2">
                  <span>Address</span>
                  <textarea
                    rows={2}
                    value={form.address}
                    onChange={(event) =>
                      setForm({ ...form, address: event.target.value })
                    }
                  />
                </label>

                <label className="form-span-2">
                  <span>Notes</span>
                  <textarea
                    rows={3}
                    value={form.notes}
                    onChange={(event) =>
                      setForm({ ...form, notes: event.target.value })
                    }
                  />
                </label>
              </div>

              {error && <div className="form-error">{error}</div>}

              <div className="modal-actions">
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="button button-primary" disabled={saving}>
                  {saving ? "Saving..." : form.id ? "Save changes" : "Create client"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
'@ | Set-Content -LiteralPath (Join-Path $ProjectRoot "src\components\workspace\clients-workspace.tsx") -Encoding UTF8

Write-Host "Creating project workspace..." -ForegroundColor Yellow

@'
"use client";

import {
  Edit3,
  FolderKanban,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  Tag,
  UserRound,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Client, Project, ProjectStatus } from "@/types/workspace";

type ProjectForm = {
  id?: string;
  clientId: string;
  name: string;
  code: string;
  location: string;
  description: string;
  tags: string;
  status: ProjectStatus;
};

const emptyForm: ProjectForm = {
  clientId: "",
  name: "",
  code: "",
  location: "",
  description: "",
  tags: "",
  status: "active",
};

export function ProjectsWorkspace() {
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [clientFilter, setClientFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<ProjectForm>(emptyForm);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);

    try {
      const response = await fetch("/api/projects", { cache: "no-store" });
      const data = await response.json();

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

    return projects.filter((project) => {
      if (clientFilter !== "all" && project.clientId !== clientFilter) {
        return false;
      }

      if (statusFilter !== "all" && project.status !== statusFilter) {
        return false;
      }

      if (!q) {
        return true;
      }

      const client = clients.find((item) => item.id === project.clientId);

      return [
        project.name,
        project.code,
        project.location,
        project.description,
        project.status,
        client?.name ?? "",
        ...project.tags,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [projects, clients, clientFilter, statusFilter, query]);

  const selected = projects.find((project) => project.id === selectedId) ?? null;
  const selectedClient = clients.find((client) => client.id === selected?.clientId);

  const openCreate = () => {
    setForm({
      ...emptyForm,
      clientId: clients[0]?.id ?? "",
    });
    setError("");
    setModalOpen(true);
  };

  const openEdit = (project: Project) => {
    setForm({
      id: project.id,
      clientId: project.clientId,
      name: project.name,
      code: project.code,
      location: project.location,
      description: project.description,
      tags: project.tags.join(", "),
      status: project.status,
    });
    setError("");
    setModalOpen(true);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      const response = await fetch("/api/projects", {
        method: form.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          tags: form.tags
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to save project.");
      }

      setModalOpen(false);
      await load();
      setSelectedId(data.project.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save project.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-stack">
      <div className="page-heading-row">
        <div>
          <div className="eyebrow">Client-wise organization</div>
          <h1>Projects</h1>
          <p>
            Group quotations, revisions, invoices and future project documents
            under the correct client and project.
          </p>
        </div>

        <button
          className="button button-primary"
          type="button"
          onClick={openCreate}
          disabled={clients.length === 0}
          title={clients.length === 0 ? "Add a client first" : undefined}
        >
          <Plus size={17} />
          Add project
        </button>
      </div>

      {clients.length === 0 && !loading && (
        <div className="info-banner">
          Add at least one client before creating a project.
        </div>
      )}

      <section className="workspace-layout">
        <div className="workspace-list-panel">
          <div className="workspace-toolbar workspace-toolbar-projects">
            <div className="workspace-search">
              <Search size={16} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search projects..."
              />
            </div>

            <select
              value={clientFilter}
              onChange={(event) => setClientFilter(event.target.value)}
            >
              <option value="all">All clients</option>
              {clients.map((client) => (
                <option value={client.id} key={client.id}>
                  {client.name}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">All status</option>
              <option value="active">Active</option>
              <option value="on_hold">On hold</option>
              <option value="completed">Completed</option>
              <option value="archived">Archived</option>
            </select>

            <button type="button" className="icon-button" onClick={() => void load()}>
              <RefreshCw size={16} />
            </button>
          </div>

          <div className="record-table">
            <div className="record-table-head project-grid">
              <span>Project</span>
              <span>Client</span>
              <span>Location</span>
              <span>Status</span>
            </div>

            {loading ? (
              <div className="record-empty">Loading projects...</div>
            ) : filtered.length === 0 ? (
              <div className="record-empty">
                No matching projects. Create a project after adding a client.
              </div>
            ) : (
              filtered.map((project) => {
                const client = clients.find(
                  (item) => item.id === project.clientId,
                );

                return (
                  <button
                    type="button"
                    key={project.id}
                    className={
                      selectedId === project.id
                        ? "record-row project-grid record-row-selected"
                        : "record-row project-grid"
                    }
                    onClick={() => setSelectedId(project.id)}
                  >
                    <span className="record-primary">
                      <strong>{project.name}</strong>
                      <small>{project.code || "No project code"}</small>
                    </span>
                    <span className="record-secondary">{client?.name || "—"}</span>
                    <span className="record-secondary">{project.location || "—"}</span>
                    <span>
                      <span
                        className={`status-pill ${
                          project.status === "active"
                            ? "status-active"
                            : project.status === "completed"
                              ? "status-completed"
                              : "status-muted"
                        }`}
                      >
                        {project.status.replace("_", " ")}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <aside className="record-detail-panel">
          {selected ? (
            <>
              <div className="detail-heading">
                <div>
                  <span className="panel-kicker">Project profile</span>
                  <h2>{selected.name}</h2>
                  <p>{selected.code || "No project code"}</p>
                </div>

                <button
                  type="button"
                  className="icon-button"
                  onClick={() => openEdit(selected)}
                >
                  <Edit3 size={16} />
                </button>
              </div>

              <div className="detail-info-list">
                <div>
                  <UserRound size={16} />
                  <span>
                    <small>Client</small>
                    <strong>{selectedClient?.name || "Unknown client"}</strong>
                  </span>
                </div>

                <div>
                  <MapPin size={16} />
                  <span>
                    <small>Location</small>
                    <strong>{selected.location || "Not added"}</strong>
                  </span>
                </div>
              </div>

              {selected.tags.length > 0 && (
                <div className="detail-tags">
                  <div className="detail-section-title">
                    <Tag size={15} />
                    Tags
                  </div>
                  <div className="tag-row">
                    {selected.tags.map((tag) => (
                      <span key={tag} className="tag-chip">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="detail-section">
                <div className="detail-section-heading">
                  <strong>Description</strong>
                </div>
                <p className="detail-notes">
                  {selected.description || "No project description added."}
                </p>
              </div>

              <div className="project-document-summary">
                <div>
                  <strong>0</strong>
                  <span>Quotations</span>
                </div>
                <div>
                  <strong>0</strong>
                  <span>Invoices</span>
                </div>
                <div>
                  <strong>0</strong>
                  <span>Documents</span>
                </div>
              </div>
            </>
          ) : (
            <div className="detail-empty">
              <FolderKanban size={28} />
              <strong>Select a project</strong>
              <p>Project details and document grouping will appear here.</p>
            </div>
          )}
        </aside>
      </section>

      {modalOpen && (
        <div className="modal-backdrop" onMouseDown={() => setModalOpen(false)}>
          <div className="modal-card" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-heading">
              <div>
                <span className="panel-kicker">{form.id ? "Edit project" : "New project"}</span>
                <h2>{form.id ? form.name || "Project" : "Add project"}</h2>
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
              <div className="form-grid">
                <label>
                  <span>Client *</span>
                  <select
                    required
                    value={form.clientId}
                    onChange={(event) =>
                      setForm({ ...form, clientId: event.target.value })
                    }
                  >
                    <option value="">Select client</option>
                    {clients
                      .filter((client) => client.status === "active")
                      .map((client) => (
                        <option value={client.id} key={client.id}>
                          {client.name}
                        </option>
                      ))}
                  </select>
                </label>

                <label>
                  <span>Project name *</span>
                  <input
                    required
                    value={form.name}
                    onChange={(event) => setForm({ ...form, name: event.target.value })}
                  />
                </label>

                <label>
                  <span>Project code / reference</span>
                  <input
                    value={form.code}
                    onChange={(event) => setForm({ ...form, code: event.target.value })}
                  />
                </label>

                <label>
                  <span>Status</span>
                  <select
                    value={form.status}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        status: event.target.value as ProjectStatus,
                      })
                    }
                  >
                    <option value="active">Active</option>
                    <option value="on_hold">On hold</option>
                    <option value="completed">Completed</option>
                    <option value="archived">Archived</option>
                  </select>
                </label>

                <label>
                  <span>Location</span>
                  <input
                    value={form.location}
                    onChange={(event) =>
                      setForm({ ...form, location: event.target.value })
                    }
                  />
                </label>

                <label>
                  <span>Tags</span>
                  <input
                    value={form.tags}
                    onChange={(event) => setForm({ ...form, tags: event.target.value })}
                    placeholder="e.g. Lift-1, Modernization"
                  />
                </label>

                <label className="form-span-2">
                  <span>Description</span>
                  <textarea
                    rows={4}
                    value={form.description}
                    onChange={(event) =>
                      setForm({ ...form, description: event.target.value })
                    }
                  />
                </label>
              </div>

              {error && <div className="form-error">{error}</div>}

              <div className="modal-actions">
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="button button-primary" disabled={saving}>
                  {saving ? "Saving..." : form.id ? "Save changes" : "Create project"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
'@ | Set-Content -LiteralPath (Join-Path $ProjectRoot "src\components\workspace\projects-workspace.tsx") -Encoding UTF8

Write-Host "Creating full-site search workspace..." -ForegroundColor Yellow

@'
"use client";

import {
  Building2,
  ChevronRight,
  FolderKanban,
  Search,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { GlobalSearchResult } from "@/types/workspace";

export function GlobalSearchWorkspace() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [type, setType] = useState<"all" | "client" | "project">("all");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    const initial = url.searchParams.get("q") ?? "";
    setQuery(initial);
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

  return (
    <div className="page-stack">
      <div className="page-heading-row">
        <div>
          <div className="eyebrow">Full-site data finder</div>
          <h1>Global Search</h1>
          <p>
            Search client and project data now. Quotations, invoices and document
            text will join this same search index in later milestones.
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
            placeholder="Search name, phone, email, address, project code, location, tags..."
          />
        </div>

        <div className="search-filter-row">
          {(["all", "client", "project"] as const).map((item) => (
            <button
              type="button"
              key={item}
              className={type === item ? "filter-chip filter-chip-active" : "filter-chip"}
              onClick={() => setType(item)}
            >
              {item === "all"
                ? `All (${results.length})`
                : `${item === "client" ? "Clients" : "Projects"} (${
                    results.filter((result) => result.type === item).length
                  })`}
            </button>
          ))}
        </div>

        <div className="search-result-list">
          {!query.trim() ? (
            <div className="search-page-empty">
              Start typing to search the full ASB LiftDoc workspace.
            </div>
          ) : loading ? (
            <div className="search-page-empty">Searching...</div>
          ) : filtered.length === 0 ? (
            <div className="search-page-empty">No matching data found.</div>
          ) : (
            filtered.map((result) => {
              const Icon = result.type === "client" ? Building2 : FolderKanban;

              return (
                <Link href={result.href} key={`${result.type}-${result.id}`} className="full-search-result">
                  <span className="full-search-icon">
                    <Icon size={18} />
                  </span>
                  <span className="full-search-copy">
                    <strong>{result.title}</strong>
                    <small>{result.subtitle}</small>
                  </span>
                  <span className="full-search-meta">{result.meta}</span>
                  <ChevronRight size={18} />
                </Link>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
'@ | Set-Content -LiteralPath (Join-Path $ProjectRoot "src\components\workspace\global-search-workspace.tsx") -Encoding UTF8

Write-Host "Updating dashboard with live counts..." -ForegroundColor Yellow

@'
"use client";

import {
  ArrowRight,
  Copy,
  FileDown,
  FileText,
  FolderKanban,
  Plus,
  ReceiptText,
  Search,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

type Stats = {
  clients: number;
  projects: number;
  quotations: number;
  invoices: number;
};

const initialStats: Stats = {
  clients: 0,
  projects: 0,
  quotations: 0,
  invoices: 0,
};

export function DashboardOverview() {
  const [stats, setStats] = useState(initialStats);

  useEffect(() => {
    fetch("/api/stats", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => setStats({ ...initialStats, ...data }))
      .catch(() => undefined);
  }, []);

  const statCards = [
    {
      label: "Clients",
      value: stats.clients,
      helper: "Active client records",
      icon: Users,
      href: "/clients",
    },
    {
      label: "Projects",
      value: stats.projects,
      helper: "Active project records",
      icon: FolderKanban,
      href: "/projects",
    },
    {
      label: "Quotations",
      value: stats.quotations,
      helper: "Quotation engine starts in M3",
      icon: FileText,
      href: "/quotations",
    },
    {
      label: "Bills & invoices",
      value: stats.invoices,
      helper: "Billing engine starts in M3",
      icon: ReceiptText,
      href: "/invoices",
    },
  ];

  const quickActions = [
    {
      label: "Add client",
      description: "Create a client record",
      icon: Users,
      href: "/clients",
    },
    {
      label: "Add project",
      description: "Organize work under a client",
      icon: FolderKanban,
      href: "/projects",
    },
    {
      label: "Find data",
      description: "Search the full workspace",
      icon: Search,
      href: "/search",
    },
    {
      label: "Duplicate previous",
      description: "Quotation duplication starts in M3",
      icon: Copy,
      href: "/quotations",
    },
    {
      label: "Create quotation",
      description: "Quotation builder starts in M3",
      icon: Plus,
      href: "/quotations",
    },
    {
      label: "Export center",
      description: "PDF, print, Word and Excel later",
      icon: FileDown,
      href: "/documents",
    },
  ];

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <div className="hero-copy">
          <div className="eyebrow">Document workspace</div>
          <h1>Welcome to ASB LiftDoc</h1>
          <p>
            Manage client-wise and project-wise quotations, bills, invoices and
            custom business documents from one searchable workspace.
          </p>

          <div className="hero-actions">
            <Link href="/clients" className="button button-primary">
              <Plus size={17} />
              Add client
            </Link>
            <Link href="/search" className="button button-secondary">
              <Search size={17} />
              Global search
            </Link>
          </div>
        </div>

        <div className="hero-visual">
          <div className="paper-stack paper-back" />
          <div className="paper-stack paper-middle" />
          <div className="paper-card">
            <div className="paper-brand">
              <span>ASB Lift</span>
              <span className="brand-d">D</span>
              <span>oc</span>
            </div>
            <span className="paper-label">QUOTATION</span>
            <div className="paper-line paper-line-lg" />
            <div className="paper-line paper-line-md" />
            <div className="paper-table">
              <div />
              <div />
              <div />
              <div />
              <div />
              <div />
            </div>
            <div className="paper-total" />
          </div>
        </div>
      </section>

      <section className="stats-grid">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <Link key={stat.label} href={stat.href} className="stat-card">
              <div className="stat-card-top">
                <span className="stat-icon">
                  <Icon size={20} />
                </span>
                <ArrowRight size={17} className="stat-arrow" />
              </div>
              <strong className="stat-value">{stat.value}</strong>
              <span className="stat-label">{stat.label}</span>
              <span className="stat-helper">{stat.helper}</span>
            </Link>
          );
        })}
      </section>

      <section className="dashboard-grid">
        <div className="panel">
          <div className="panel-heading">
            <div>
              <span className="panel-kicker">Fast workflow</span>
              <h2>Quick actions</h2>
            </div>
          </div>

          <div className="quick-actions-grid">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <Link href={action.href} key={action.label} className="quick-action">
                  <span className="quick-action-icon">
                    <Icon size={20} />
                  </span>
                  <span>
                    <strong>{action.label}</strong>
                    <small>{action.description}</small>
                  </span>
                  <ArrowRight size={17} />
                </Link>
              );
            })}
          </div>
        </div>

        <div className="panel">
          <div className="panel-heading">
            <div>
              <span className="panel-kicker">Workspace status</span>
              <h2>Build progress</h2>
            </div>
          </div>

          <div className="progress-list">
            <div className="progress-row progress-done">
              <div className="progress-number">M0</div>
              <div>
                <strong>Foundation</strong>
                <span>Next.js, build, Git, local start/stop</span>
              </div>
              <span className="progress-pill">Done</span>
            </div>

            <div className="progress-row progress-done">
              <div className="progress-number">M1</div>
              <div>
                <strong>Application shell</strong>
                <span>Brand, dashboard, navigation, responsive UI</span>
              </div>
              <span className="progress-pill">Done</span>
            </div>

            <div className="progress-row progress-current">
              <div className="progress-number">M2</div>
              <div>
                <strong>Clients, projects & search</strong>
                <span>Persistent local data and full-site search</span>
              </div>
              <span className="progress-pill">Current</span>
            </div>
          </div>
        </div>
      </section>

      <section className="panel recent-panel">
        <div className="panel-heading panel-heading-row">
          <div>
            <span className="panel-kicker">Next workflow</span>
            <h2>Quotation engine</h2>
          </div>
          <Link href="/quotations" className="text-link">
            Open quotations
            <ArrowRight size={16} />
          </Link>
        </div>

        <div className="empty-state">
          <div className="empty-state-icon">
            <FileText size={26} />
          </div>
          <strong>Client and project foundation is ready</strong>
          <p>
            After M2 acceptance, M3 will connect quotation numbering, client/project
            selection, duplicate, revision and commercial items.
          </p>
        </div>
      </section>
    </div>
  );
}
'@ | Set-Content -LiteralPath (Join-Path $ProjectRoot "src\components\workspace\dashboard-overview.tsx") -Encoding UTF8

@'
import { DashboardOverview } from "@/components/workspace/dashboard-overview";

export default function DashboardPage() {
  return <DashboardOverview />;
}
'@ | Set-Content -LiteralPath (Join-Path $ProjectRoot "src\app\page.tsx") -Encoding UTF8

@'
import { ClientsWorkspace } from "@/components/workspace/clients-workspace";

export default function ClientsPage() {
  return <ClientsWorkspace />;
}
'@ | Set-Content -LiteralPath (Join-Path $ProjectRoot "src\app\clients\page.tsx") -Encoding UTF8

@'
import { ProjectsWorkspace } from "@/components/workspace/projects-workspace";

export default function ProjectsPage() {
  return <ProjectsWorkspace />;
}
'@ | Set-Content -LiteralPath (Join-Path $ProjectRoot "src\app\projects\page.tsx") -Encoding UTF8

@'
import { GlobalSearchWorkspace } from "@/components/workspace/global-search-workspace";

export default function SearchPage() {
  return <GlobalSearchWorkspace />;
}
'@ | Set-Content -LiteralPath (Join-Path $ProjectRoot "src\app\search\page.tsx") -Encoding UTF8

Write-Host "Connecting real global search to top bar..." -ForegroundColor Yellow

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
        setSearchResults((data.results ?? []).slice(0, 7));
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
            <span>M2 Data Workspace</span>
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
                placeholder="Search clients, projects, quotations, invoices..."
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
                      {searchResults.map((result) => {
                        const Icon =
                          result.type === "client" ? Building2 : FolderKanban;

                        return (
                          <Link
                            key={`${result.type}-${result.id}`}
                            href={result.href}
                            className="search-result"
                            onClick={() => setSearchValue("")}
                          >
                            <span className="search-result-icon">
                              <Icon size={17} />
                            </span>
                            <span className="search-result-copy">
                              <strong>{result.title}</strong>
                              <small>{result.subtitle}</small>
                            </span>
                            <ChevronRight size={16} />
                          </Link>
                        );
                      })}

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

Write-Host "Extending workspace styles..." -ForegroundColor Yellow

@'

/* M2 workspace */

.workspace-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.7fr) minmax(320px, 0.7fr);
  gap: 18px;
  align-items: start;
}

.workspace-list-panel,
.record-detail-panel,
.search-page-panel {
  border: 1px solid var(--ink-100);
  border-radius: 16px;
  background: #ffffff;
  box-shadow: var(--shadow-sm);
}

.workspace-list-panel {
  min-width: 0;
  overflow: hidden;
}

.workspace-toolbar {
  display: grid;
  grid-template-columns: minmax(200px, 1fr) 145px 40px;
  gap: 9px;
  padding: 14px;
  border-bottom: 1px solid var(--ink-100);
  background: var(--surface-soft);
}

.workspace-toolbar-projects {
  grid-template-columns: minmax(190px, 1fr) 170px 130px 40px;
}

.workspace-search {
  position: relative;
  min-width: 0;
}

.workspace-search svg {
  position: absolute;
  top: 50%;
  left: 12px;
  transform: translateY(-50%);
  color: var(--ink-400);
  pointer-events: none;
}

.workspace-search input {
  width: 100%;
  padding-left: 37px !important;
}

.workspace-toolbar input,
.workspace-toolbar select,
.workspace-form input,
.workspace-form select,
.workspace-form textarea,
.search-page-input input {
  min-height: 40px;
  width: 100%;
  padding: 9px 11px;
  border: 1px solid var(--ink-200);
  border-radius: 9px;
  outline: none;
  color: var(--ink-800);
  background: #ffffff;
  font-size: 12px;
  transition:
    border-color 150ms ease,
    box-shadow 150ms ease;
}

.workspace-toolbar input:focus,
.workspace-toolbar select:focus,
.workspace-form input:focus,
.workspace-form select:focus,
.workspace-form textarea:focus,
.search-page-input input:focus {
  border-color: #9ec2e1;
  box-shadow: 0 0 0 3px rgba(36, 119, 198, 0.08);
}

.record-table {
  min-width: 0;
}

.record-table-head,
.record-row {
  display: grid;
  gap: 12px;
  align-items: center;
}

.client-grid {
  grid-template-columns: minmax(220px, 1.7fr) minmax(150px, 1fr) 70px 90px;
}

.project-grid {
  grid-template-columns: minmax(220px, 1.5fr) minmax(150px, 1fr) minmax(130px, 0.85fr) 100px;
}

.record-table-head {
  min-height: 38px;
  padding: 0 15px;
  color: var(--ink-400);
  background: #ffffff;
  border-bottom: 1px solid var(--ink-100);
  font-size: 9px;
  font-weight: 850;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}

.record-row {
  width: 100%;
  min-height: 64px;
  padding: 10px 15px;
  border: 0;
  border-bottom: 1px solid var(--ink-100);
  text-align: left;
  color: inherit;
  background: #ffffff;
  transition: background 140ms ease;
}

.record-row:hover {
  background: #f8fbfe;
}

.record-row-selected {
  background: var(--brand-50);
  box-shadow: inset 3px 0 0 var(--brand-600);
}

.record-primary,
.record-primary strong,
.record-primary small {
  min-width: 0;
  display: block;
}

.record-primary strong {
  overflow: hidden;
  color: var(--ink-800);
  font-size: 12px;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.record-primary small,
.record-secondary {
  overflow: hidden;
  color: var(--ink-500);
  font-size: 10.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.record-primary small {
  margin-top: 4px;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 62px;
  padding: 5px 7px;
  border-radius: 999px;
  font-size: 8.5px;
  font-weight: 850;
  text-transform: capitalize;
}

.status-active {
  color: #147a53;
  background: #e8f7f0;
}

.status-completed {
  color: #135f9b;
  background: #e8f2fb;
}

.status-muted {
  color: var(--ink-500);
  background: var(--ink-50);
}

.record-empty {
  display: grid;
  min-height: 260px;
  place-items: center;
  padding: 30px;
  text-align: center;
  color: var(--ink-400);
  font-size: 11px;
}

.record-detail-panel {
  position: sticky;
  top: calc(var(--topbar-height) + 18px);
  min-height: 520px;
  padding: 19px;
}

.detail-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--ink-100);
}

.detail-heading h2 {
  margin: 5px 0 0;
  color: var(--brand-950);
  font-size: 19px;
  letter-spacing: -0.025em;
}

.detail-heading p {
  margin: 5px 0 0;
  color: var(--ink-400);
  font-size: 10.5px;
}

.detail-info-list {
  display: grid;
  gap: 8px;
  padding: 16px 0;
  border-bottom: 1px solid var(--ink-100);
}

.detail-info-list > div {
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
}

.detail-info-list > div > svg {
  color: var(--brand-600);
}

.detail-info-list small,
.detail-info-list strong {
  display: block;
}

.detail-info-list small {
  color: var(--ink-400);
  font-size: 9px;
}

.detail-info-list strong {
  margin-top: 2px;
  overflow-wrap: anywhere;
  color: var(--ink-700);
  font-size: 10.5px;
  font-weight: 700;
}

.detail-tags,
.detail-section {
  padding: 16px 0;
  border-bottom: 1px solid var(--ink-100);
}

.detail-section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
  color: var(--ink-600);
  font-size: 10px;
  font-weight: 800;
}

.tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tag-chip {
  padding: 5px 8px;
  border: 1px solid #d8e5ef;
  border-radius: 999px;
  color: var(--brand-700);
  background: var(--brand-50);
  font-size: 8.5px;
  font-weight: 750;
}

.detail-section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.detail-section-heading strong {
  color: var(--ink-700);
  font-size: 10.5px;
}

.detail-section-heading span {
  min-width: 24px;
  padding: 4px 6px;
  border-radius: 999px;
  text-align: center;
  color: var(--brand-700);
  background: var(--brand-50);
  font-size: 8px;
  font-weight: 850;
}

.detail-muted,
.detail-notes {
  margin: 0;
  color: var(--ink-500);
  font-size: 10.5px;
  line-height: 1.6;
}

.mini-record-list {
  display: grid;
  gap: 7px;
}

.mini-record-list > div {
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-radius: 9px;
  background: var(--surface-soft);
}

.mini-record-icon {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  color: var(--brand-700);
  background: #ffffff;
  border: 1px solid var(--ink-100);
}

.mini-record-list strong,
.mini-record-list small {
  display: block;
}

.mini-record-list strong {
  color: var(--ink-700);
  font-size: 9.5px;
}

.mini-record-list small {
  margin-top: 3px;
  color: var(--ink-400);
  font-size: 8.5px;
}

.detail-archive {
  width: 100%;
  margin-top: 16px;
}

.detail-empty {
  min-height: 470px;
  display: grid;
  place-items: center;
  align-content: center;
  text-align: center;
  color: var(--ink-400);
}

.detail-empty svg {
  margin-bottom: 9px;
  color: var(--brand-500);
}

.detail-empty strong {
  color: var(--ink-700);
  font-size: 12px;
}

.detail-empty p {
  max-width: 220px;
  margin: 6px 0 0;
  font-size: 10px;
  line-height: 1.5;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(4, 16, 31, 0.48);
  backdrop-filter: blur(3px);
}

.modal-card {
  width: min(680px, 100%);
  max-height: calc(100vh - 40px);
  overflow: auto;
  border: 1px solid var(--ink-100);
  border-radius: 18px;
  background: #ffffff;
  box-shadow: var(--shadow-lg);
}

.modal-heading {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  padding: 18px 20px 15px;
  border-bottom: 1px solid var(--ink-100);
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(10px);
}

.modal-heading h2 {
  margin: 5px 0 0;
  color: var(--brand-950);
  font-size: 19px;
}

.workspace-form {
  padding: 20px;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 13px;
}

.workspace-form label > span {
  display: block;
  margin-bottom: 6px;
  color: var(--ink-600);
  font-size: 9.5px;
  font-weight: 800;
}

.workspace-form textarea {
  resize: vertical;
}

.form-span-2 {
  grid-column: 1 / -1;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 18px;
  padding-top: 15px;
  border-top: 1px solid var(--ink-100);
}

.form-error {
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: 9px;
  color: #9d1f2a;
  background: #fff0f1;
  font-size: 10.5px;
}

.info-banner {
  padding: 12px 14px;
  border: 1px solid #d7e5ef;
  border-radius: 11px;
  color: var(--brand-800);
  background: var(--brand-50);
  font-size: 11px;
}

.project-document-summary {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 7px;
  margin-top: 16px;
}

.project-document-summary > div {
  padding: 12px 8px;
  text-align: center;
  border-radius: 10px;
  background: var(--surface-soft);
  border: 1px solid var(--ink-100);
}

.project-document-summary strong,
.project-document-summary span {
  display: block;
}

.project-document-summary strong {
  color: var(--brand-900);
  font-size: 18px;
}

.project-document-summary span {
  margin-top: 4px;
  color: var(--ink-400);
  font-size: 8px;
}

.search-result-copy {
  min-width: 0;
}

.search-result-copy strong,
.search-result-copy small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.search-result-copy strong {
  font-size: 11px;
}

.search-result-copy small {
  margin-top: 3px;
  color: var(--ink-400);
  font-size: 8.5px;
  font-weight: 500;
}

.search-view-all {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 38px;
  margin-top: 5px;
  padding: 0 10px;
  border-top: 1px solid var(--ink-100);
  color: var(--brand-700);
  font-size: 10px;
  font-weight: 800;
}

.search-page-panel {
  padding: 18px;
}

.search-page-input {
  position: relative;
}

.search-page-input svg {
  position: absolute;
  top: 50%;
  left: 15px;
  transform: translateY(-50%);
  color: var(--ink-400);
}

.search-page-input input {
  min-height: 52px;
  padding-left: 45px;
  font-size: 13px;
}

.search-filter-row {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  padding: 14px 0;
}

.filter-chip {
  padding: 7px 10px;
  border: 1px solid var(--ink-200);
  border-radius: 999px;
  color: var(--ink-500);
  background: #ffffff;
  font-size: 9.5px;
  font-weight: 800;
}

.filter-chip-active {
  color: var(--brand-700);
  border-color: #bdd4e6;
  background: var(--brand-50);
}

.search-result-list {
  overflow: hidden;
  border: 1px solid var(--ink-100);
  border-radius: 12px;
}

.full-search-result {
  min-height: 64px;
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) auto 18px;
  align-items: center;
  gap: 11px;
  padding: 10px 13px;
  border-bottom: 1px solid var(--ink-100);
}

.full-search-result:last-child {
  border-bottom: 0;
}

.full-search-result:hover {
  background: var(--brand-50);
}

.full-search-icon {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border-radius: 10px;
  color: var(--brand-700);
  background: var(--brand-100);
}

.full-search-copy {
  min-width: 0;
}

.full-search-copy strong,
.full-search-copy small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.full-search-copy strong {
  color: var(--ink-800);
  font-size: 11.5px;
}

.full-search-copy small {
  margin-top: 4px;
  color: var(--ink-400);
  font-size: 9.5px;
}

.full-search-meta {
  color: var(--ink-500);
  font-size: 9px;
  font-weight: 750;
}

.search-page-empty {
  display: grid;
  min-height: 220px;
  place-items: center;
  padding: 30px;
  text-align: center;
  color: var(--ink-400);
  font-size: 11px;
}

@media (max-width: 1180px) {
  .workspace-layout {
    grid-template-columns: minmax(0, 1fr) 320px;
  }

  .workspace-toolbar-projects {
    grid-template-columns: 1fr 150px;
  }

  .workspace-toolbar-projects select:nth-of-type(2) {
    display: none;
  }

  .workspace-toolbar-projects .icon-button {
    display: none;
  }

  .client-grid {
    grid-template-columns: minmax(190px, 1.5fr) minmax(130px, 1fr) 60px 80px;
  }

  .project-grid {
    grid-template-columns: minmax(190px, 1.4fr) minmax(130px, 1fr) 90px;
  }

  .project-grid > :nth-child(3) {
    display: none;
  }
}

@media (max-width: 900px) {
  .workspace-layout {
    grid-template-columns: 1fr;
  }

  .record-detail-panel {
    position: static;
    min-height: auto;
  }

  .detail-empty {
    min-height: 230px;
  }
}

@media (max-width: 680px) {
  .workspace-toolbar,
  .workspace-toolbar-projects {
    grid-template-columns: 1fr;
  }

  .workspace-toolbar .icon-button,
  .workspace-toolbar-projects .icon-button {
    display: none;
  }

  .record-table-head {
    display: none;
  }

  .client-grid,
  .project-grid {
    grid-template-columns: 1fr auto;
  }

  .client-grid > :nth-child(2),
  .client-grid > :nth-child(3),
  .project-grid > :nth-child(2),
  .project-grid > :nth-child(3) {
    display: none;
  }

  .form-grid {
    grid-template-columns: 1fr;
  }

  .form-span-2 {
    grid-column: auto;
  }

  .full-search-result {
    grid-template-columns: 38px minmax(0, 1fr) 18px;
  }

  .full-search-meta {
    display: none;
  }
}
'@ | Add-Content -LiteralPath (Join-Path $ProjectRoot "src\app\globals.css") -Encoding UTF8

Write-Host "Creating M2 acceptance checklist..." -ForegroundColor Yellow

@'
# M2 Acceptance Checklist

## Client test
1. Open Clients.
2. Add a client with:
   - Client name
   - Contact person
   - Phone
   - Email
   - Address
   - At least one tag
3. Confirm the client remains after browser refresh.
4. Select the client and confirm details show in the right panel.
5. Edit one field and save.
6. Confirm client search works.

## Project test
1. Open Projects.
2. Add a project under the client created above.
3. Add project code, location, description and tag.
4. Confirm the project remains after browser refresh.
5. Confirm client filter and project search work.
6. Edit the project and save.

## Global search test
1. Press Ctrl+K.
2. Search using:
   - Client name
   - Client phone
   - Project name
   - Project code
   - Project location
   - Tag
3. Confirm matching client/project results appear.
4. Open Global Search from the sidebar.
5. Search again and filter between Clients and Projects.

## Dashboard
1. Confirm the client count is updated.
2. Confirm the project count is updated.

## Persistence
Local development data is stored in:
data/workspace.json

This file is intentionally excluded from Git so real local business data does not become source-code history.

## M2 architecture note
M2 uses a local server-side JSON storage adapter for localhost-first development.
The UI/API boundaries are intentionally separated so persistent storage can later be replaced by Supabase/PostgreSQL without rebuilding the client/project screens.
'@ | Set-Content -LiteralPath (Join-Path $ProjectRoot "docs\M2_ACCEPTANCE_TESTS.md") -Encoding UTF8

Set-Content -LiteralPath (Join-Path $ProjectRoot ".liftdoc-milestone") -Value "M2" -Encoding ASCII

Write-Host ""
Write-Host "Running production build..." -ForegroundColor Yellow
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "M2 build failed. Do not rollback yet." -ForegroundColor Red
    Write-Host "Send me the complete build error for one consolidated fix." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Emergency rollback only:" -ForegroundColor DarkGray
    Write-Host "git reset --hard checkpoint-m1-ui" -ForegroundColor DarkGray
    throw "M2 production build failed."
}

Write-Host "[OK] Production build successful" -ForegroundColor Green

Write-Host ""
Write-Host "Saving M2 Git checkpoint..." -ForegroundColor Yellow
git add .
if ($LASTEXITCODE -ne 0) {
    throw "git add failed."
}

git commit -m "Add clients projects and global workspace search"
if ($LASTEXITCODE -ne 0) {
    Write-Warning "Application build passed, but Git commit failed. Send me the Git message."
}
else {
    git tag -f checkpoint-m2-data-workspace HEAD | Out-Null
    Write-Host "[OK] Git checkpoint created: checkpoint-m2-data-workspace" -ForegroundColor Green
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host " M2 DATA WORKSPACE COMPLETE" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Local URL: http://localhost:$Port" -ForegroundColor Cyan
Write-Host "Acceptance checklist: docs\M2_ACCEPTANCE_TESTS.md" -ForegroundColor Cyan
Write-Host ""
Write-Host "Starting ASB LiftDoc..." -ForegroundColor Yellow

powershell -ExecutionPolicy Bypass -File (Join-Path $ProjectRoot "Start-ASBLiftDoc.ps1")

Write-Host ""
Write-Host "Run the M2 acceptance test, then send me:" -ForegroundColor Yellow
Write-Host "'M2 confirmed' if everything works, or a screenshot/error if not." -ForegroundColor Yellow
