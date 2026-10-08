import { promises as fs } from "fs";
import path from "path";
import type {
  QuotationHeaderFooterBlock,
  QuotationLayout,
} from "@/types/quotation-layout";
import { readQuotationStore } from "@/lib/quotation-store";

type Store = {
  layouts: QuotationLayout[];
};

const dataFile = path.join(
  process.cwd(),
  "data",
  "quotation-layouts.json",
);

let writeQueue = Promise.resolve();

function block(
  text = "",
  heightMm = 18,
): QuotationHeaderFooterBlock {
  return {
    mode: "text",
    text,
    imageData: "",
    align: "center",
    heightMm,
  };
}

export function defaultQuotationLayout(
  quotationId: string,
): QuotationLayout {
  return {
    quotationId,
    header: block("ASB Lift", 18),
    footer: block("", 14),
    firstPageDifferent: false,
    firstPageHeader: block("", 18),
    firstPageFooter: block("", 14),
    showQuotationMeta: true,
    showPageNumber: true,
    updatedAt: "",
  };
}

async function ensureFile() {
  await fs.mkdir(path.dirname(dataFile), {
    recursive: true,
  });

  try {
    await fs.access(dataFile);
  } catch {
    await fs.writeFile(
      dataFile,
      JSON.stringify({ layouts: [] }, null, 2),
      "utf8",
    );
  }
}

async function readStore(): Promise<Store> {
  await ensureFile();

  try {
    const raw = await fs.readFile(dataFile, "utf8");
    const parsed = JSON.parse(raw) as Partial<Store>;

    return {
      layouts: Array.isArray(parsed.layouts)
        ? parsed.layouts
        : [],
    };
  } catch {
    return {
      layouts: [],
    };
  }
}

async function writeStore(data: Store) {
  writeQueue = writeQueue.then(async () => {
    const temporary = `${dataFile}.tmp`;

    await fs.writeFile(
      temporary,
      JSON.stringify(data, null, 2),
      "utf8",
    );

    await fs.rename(temporary, dataFile);
  });

  await writeQueue;
}

function cleanBlock(
  value: Partial<QuotationHeaderFooterBlock> | undefined,
  fallback: QuotationHeaderFooterBlock,
): QuotationHeaderFooterBlock {
  const mode =
    value?.mode === "none" ||
    value?.mode === "text" ||
    value?.mode === "image"
      ? value.mode
      : fallback.mode;

  const align =
    value?.align === "left" ||
    value?.align === "center" ||
    value?.align === "right"
      ? value.align
      : fallback.align;

  const height = Number(value?.heightMm);

  return {
    mode,
    text:
      typeof value?.text === "string"
        ? value.text
        : fallback.text,
    imageData:
      typeof value?.imageData === "string"
        ? value.imageData
        : fallback.imageData,
    align,
    heightMm:
      Number.isFinite(height) &&
      height >= 5 &&
      height <= 80
        ? height
        : fallback.heightMm,
  };
}

export async function getQuotationLayout(
  quotationId: string,
) {
  const store = await readStore();

  return (
    store.layouts.find(
      (layout) => layout.quotationId === quotationId,
    ) ?? defaultQuotationLayout(quotationId)
  );
}

export async function saveQuotationLayout(
  input: Partial<QuotationLayout> & {
    quotationId: string;
  },
) {
  const quotationId = input.quotationId.trim();

  if (!quotationId) {
    throw new Error("Quotation id is required.");
  }

  const quotations = await readQuotationStore();

  if (
    !quotations.quotations.some(
      (quotation) => quotation.id === quotationId,
    )
  ) {
    throw new Error("Quotation not found.");
  }

  const store = await readStore();
  const fallback = defaultQuotationLayout(quotationId);

  const layout: QuotationLayout = {
    quotationId,
    header: cleanBlock(input.header, fallback.header),
    footer: cleanBlock(input.footer, fallback.footer),

    firstPageDifferent: Boolean(
      input.firstPageDifferent,
    ),

    firstPageHeader: cleanBlock(
      input.firstPageHeader,
      fallback.firstPageHeader,
    ),

    firstPageFooter: cleanBlock(
      input.firstPageFooter,
      fallback.firstPageFooter,
    ),

    showQuotationMeta:
      input.showQuotationMeta === undefined
        ? true
        : Boolean(input.showQuotationMeta),

    showPageNumber:
      input.showPageNumber === undefined
        ? true
        : Boolean(input.showPageNumber),

    updatedAt: new Date().toISOString(),
  };

  const index = store.layouts.findIndex(
    (record) => record.quotationId === quotationId,
  );

  if (index >= 0) {
    store.layouts[index] = layout;
  } else {
    store.layouts.push(layout);
  }

  await writeStore(store);

  return layout;
}