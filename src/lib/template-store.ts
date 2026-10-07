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
