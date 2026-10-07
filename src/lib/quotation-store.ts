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
