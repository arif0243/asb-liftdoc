import { promises as fs } from "fs";
import path from "path";
import type {
  ProposalChromeBlock,
  ProposalPageChromeOverride,
  QuotationProposal,
} from "@/types/quotation-proposal";
import { readQuotationStore } from "@/lib/quotation-store";

type Store = {
  proposals: QuotationProposal[];
};

const dataFile = path.join(
  process.cwd(),
  "data",
  "quotation-proposals.json",
);

let writeQueue = Promise.resolve();

function chrome(
  text = "",
  heightMm = 17,
): ProposalChromeBlock {
  return {
    mode: "text",
    text,
    imageData: "",
    align: "center",
    heightMm,
  };
}

export function defaultQuotationProposal(
  quotationId: string,
  title = "Financial Proposal",
  subject = "",
): QuotationProposal {
  return {
    quotationId,

    cover: {
      proposalTitle: title || "Financial Proposal",
      preparedFor: "",
      preparedForAddress: "",
      preparedBy: "ASB Lift",
      preparedByAddress: "",
      submissionDate: "",
    },

    letter: {
      toDesignation: "President/Secretary",
      subject:
        subject ||
        "Financial Proposal for Installation, Commissioning & Modernization of Elevator System.",
      greeting: "Dear Sir,",
      body:
        "We are pleased to submit our financial proposal for the requested elevator works. We remain committed to quality products, professional service and customer satisfaction.",
      technicalHeading: "Technical Satisfactory Details",
      technicalDetails: "",
      signerName: "",
      signerDesignation: "",
      signerCompany: "ASB Lift",
    },

    terms: {
      validity: "10 (Ten) days from the date of submission.",
      warranty:
        "2 years warranty for supplied spare parts, subject to applicable warranty conditions.",
      delivery: "FROM READY STOCK.",
      payment:
        "80% of the total amount before starting the work. Remaining 20% during handover.",
      handover:
        "Project can be handed over within 10 (Ten) working days after first payment.",
      additionalTerms: "",
      signerName: "",
      signerDesignation: "",
      signerCompany: "ASB Lift",
    },

    defaultHeader: chrome("ASB Lift", 18),
    defaultFooter: chrome("", 13),
    pageOverrides: {},

    showPageNumber: true,
    priceRowsPerPage: 12,

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
      JSON.stringify({ proposals: [] }, null, 2),
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
      proposals: Array.isArray(parsed.proposals)
        ? parsed.proposals
        : [],
    };
  } catch {
    return {
      proposals: [],
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

function stringValue(
  value: unknown,
  fallback = "",
) {
  return typeof value === "string"
    ? value
    : fallback;
}

function cleanChrome(
  value: Partial<ProposalChromeBlock> | undefined,
  fallback: ProposalChromeBlock,
): ProposalChromeBlock {
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
    text: stringValue(value?.text, fallback.text),
    imageData: stringValue(
      value?.imageData,
      fallback.imageData,
    ),
    align,
    heightMm:
      Number.isFinite(height) &&
      height >= 5 &&
      height <= 70
        ? height
        : fallback.heightMm,
  };
}

function cleanOverrides(
  value: unknown,
  fallbackHeader: ProposalChromeBlock,
  fallbackFooter: ProposalChromeBlock,
): Record<string, ProposalPageChromeOverride> {
  if (!value || typeof value !== "object") {
    return {};
  }

  const output: Record<
    string,
    ProposalPageChromeOverride
  > = {};

  Object.entries(
    value as Record<string, Partial<ProposalPageChromeOverride>>,
  ).forEach(([key, override]) => {
    output[key] = {
      useHeader: Boolean(override?.useHeader),
      useFooter: Boolean(override?.useFooter),
      header: cleanChrome(
        override?.header,
        fallbackHeader,
      ),
      footer: cleanChrome(
        override?.footer,
        fallbackFooter,
      ),
    };
  });

  return output;
}

export async function getQuotationProposal(
  quotationId: string,
) {
  const [store, quotationStore] =
    await Promise.all([
      readStore(),
      readQuotationStore(),
    ]);

  const quotation = quotationStore.quotations.find(
    (record) => record.id === quotationId,
  );

  if (!quotation) {
    throw new Error("Quotation not found.");
  }

  return (
    store.proposals.find(
      (proposal) =>
        proposal.quotationId === quotationId,
    ) ??
    defaultQuotationProposal(
      quotationId,
      quotation.subject || "Financial Proposal",
      quotation.subject,
    )
  );
}

export async function saveQuotationProposal(
  input: Partial<QuotationProposal> & {
    quotationId: string;
  },
) {
  const quotationId =
    typeof input.quotationId === "string"
      ? input.quotationId.trim()
      : "";

  if (!quotationId) {
    throw new Error("Quotation id is required.");
  }

  const quotationStore = await readQuotationStore();
  const quotation = quotationStore.quotations.find(
    (record) => record.id === quotationId,
  );

  if (!quotation) {
    throw new Error("Quotation not found.");
  }

  const store = await readStore();

  const fallback = defaultQuotationProposal(
    quotationId,
    quotation.subject || "Financial Proposal",
    quotation.subject,
  );

  const header = cleanChrome(
    input.defaultHeader,
    fallback.defaultHeader,
  );

  const footer = cleanChrome(
    input.defaultFooter,
    fallback.defaultFooter,
  );

  const rows = Number(input.priceRowsPerPage);

  const proposal: QuotationProposal = {
    quotationId,

    cover: {
      proposalTitle: stringValue(
        input.cover?.proposalTitle,
        fallback.cover.proposalTitle,
      ),
      preparedFor: stringValue(
        input.cover?.preparedFor,
        "",
      ),
      preparedForAddress: stringValue(
        input.cover?.preparedForAddress,
        "",
      ),
      preparedBy: stringValue(
        input.cover?.preparedBy,
        fallback.cover.preparedBy,
      ),
      preparedByAddress: stringValue(
        input.cover?.preparedByAddress,
        "",
      ),
      submissionDate: stringValue(
        input.cover?.submissionDate,
        "",
      ),
    },

    letter: {
      toDesignation: stringValue(
        input.letter?.toDesignation,
        fallback.letter.toDesignation,
      ),
      subject: stringValue(
        input.letter?.subject,
        fallback.letter.subject,
      ),
      greeting: stringValue(
        input.letter?.greeting,
        fallback.letter.greeting,
      ),
      body: stringValue(
        input.letter?.body,
        fallback.letter.body,
      ),
      technicalHeading: stringValue(
        input.letter?.technicalHeading,
        fallback.letter.technicalHeading,
      ),
      technicalDetails: stringValue(
        input.letter?.technicalDetails,
        "",
      ),
      signerName: stringValue(
        input.letter?.signerName,
        "",
      ),
      signerDesignation: stringValue(
        input.letter?.signerDesignation,
        "",
      ),
      signerCompany: stringValue(
        input.letter?.signerCompany,
        fallback.letter.signerCompany,
      ),
    },

    terms: {
      validity: stringValue(
        input.terms?.validity,
        fallback.terms.validity,
      ),
      warranty: stringValue(
        input.terms?.warranty,
        fallback.terms.warranty,
      ),
      delivery: stringValue(
        input.terms?.delivery,
        fallback.terms.delivery,
      ),
      payment: stringValue(
        input.terms?.payment,
        fallback.terms.payment,
      ),
      handover: stringValue(
        input.terms?.handover,
        fallback.terms.handover,
      ),
      additionalTerms: stringValue(
        input.terms?.additionalTerms,
        "",
      ),
      signerName: stringValue(
        input.terms?.signerName,
        "",
      ),
      signerDesignation: stringValue(
        input.terms?.signerDesignation,
        "",
      ),
      signerCompany: stringValue(
        input.terms?.signerCompany,
        fallback.terms.signerCompany,
      ),
    },

    defaultHeader: header,
    defaultFooter: footer,

    pageOverrides: cleanOverrides(
      input.pageOverrides,
      header,
      footer,
    ),

    showPageNumber:
      input.showPageNumber === undefined
        ? true
        : Boolean(input.showPageNumber),

    priceRowsPerPage:
      Number.isFinite(rows) &&
      rows >= 5 &&
      rows <= 25
        ? Math.round(rows)
        : fallback.priceRowsPerPage,

    updatedAt: new Date().toISOString(),
  };

  const index = store.proposals.findIndex(
    (record) =>
      record.quotationId === quotationId,
  );

  if (index >= 0) {
    store.proposals[index] = proposal;
  } else {
    store.proposals.push(proposal);
  }

  await writeStore(store);

  return proposal;
}