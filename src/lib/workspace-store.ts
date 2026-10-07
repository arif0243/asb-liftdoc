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
