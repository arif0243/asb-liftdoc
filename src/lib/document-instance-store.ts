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
