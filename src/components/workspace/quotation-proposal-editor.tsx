"use client";

import {
  Eye,
  Save,
} from "lucide-react";
import {
  ChangeEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useSearchParams } from "next/navigation";
import type {
  Client,
  Project,
} from "@/types/workspace";
import type { Quotation } from "@/types/quotation";
import type {
  ProposalChromeBlock,
  ProposalPageChromeOverride,
  QuotationProposal,
} from "@/types/quotation-proposal";

type Payload = {
  quotations: Quotation[];
  clients: Client[];
  projects: Project[];
};

type Tab =
  | "cover"
  | "letter"
  | "price"
  | "terms"
  | "headerFooter";

const CSS = `
.asb-editor {
  display: grid;
  gap: 14px;
  min-width: 0;
}

.asb-editor-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}

.asb-editor-title span {
  display: block;
  color: #738493;
  font-size: 9px;
  font-weight: 800;
}

.asb-editor-title h1 {
  margin: 3px 0 0;
  color: #173047;
  font-size: 22px;
}

.asb-editor-actions {
  display: flex;
  gap: 8px;
}

.asb-btn {
  min-height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 11px;
  border: 1px solid #ccd8e1;
  border-radius: 8px;
  color: #294258;
  background: #fff;
  font-size: 9px;
  font-weight: 800;
  cursor: pointer;
}

.asb-btn-primary {
  border-color: #153e62;
  color: #fff;
  background: #153e62;
}

.asb-editor-layout {
  display: grid;
  grid-template-columns: minmax(430px, 520px) minmax(0, 1fr);
  gap: 14px;
  align-items: start;
}

.asb-editor-left {
  min-width: 0;
  overflow: hidden;
  border: 1px solid #dbe4eb;
  border-radius: 12px;
  background: #fff;
}

.asb-tabs {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  border-bottom: 1px solid #dce4eb;
  background: #f7f9fb;
}

.asb-tabs button {
  min-height: 46px;
  padding: 7px 5px;
  border: 0;
  border-right: 1px solid #e2e8ee;
  color: #6a7d8d;
  background: transparent;
  font-size: 8px;
  font-weight: 800;
  cursor: pointer;
}

.asb-tabs button:last-child {
  border-right: 0;
}

.asb-tabs button.active {
  color: #153e62;
  background: #fff;
  box-shadow: inset 0 -2px #153e62;
}

.asb-panel {
  max-height: calc(100vh - 210px);
  overflow-y: auto;
  display: grid;
  gap: 11px;
  padding: 14px;
}

.asb-panel h2 {
  margin: 0 0 2px;
  color: #173047;
  font-size: 14px;
}

.asb-panel label {
  display: grid;
  gap: 5px;
}

.asb-panel label > span {
  color: #65798a;
  font-size: 8px;
  font-weight: 800;
}

.asb-panel input,
.asb-panel select,
.asb-panel textarea {
  width: 100%;
  min-height: 36px;
  padding: 8px 9px;
  border: 1px solid #ccd7e0;
  border-radius: 7px;
  box-sizing: border-box;
  color: #263f55;
  background: #fff;
  font-size: 9px;
  outline: none;
}

.asb-panel textarea {
  resize: vertical;
}

.asb-grid-3 {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.asb-cover-logo-tools {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.asb-cover-logo-upload {
  min-height: 34px;
  display: inline-flex !important;
  grid-auto-flow: column;
  align-items: center;
  justify-content: center;
  gap: 6px !important;
  width: fit-content;
  padding: 7px 10px;
  border: 1px solid #ccd8e1;
  border-radius: 7px;
  color: #294258;
  background: #fff;
  font-size: 8px;
  font-weight: 800;
  cursor: pointer;
}

.asb-cover-logo-upload input {
  display: none;
}

.asb-cover-logo-remove {
  min-height: 34px;
  padding: 7px 10px;
  border: 1px solid #e1c9c9;
  border-radius: 7px;
  color: #8a3434;
  background: #fff;
  font-size: 8px;
  font-weight: 800;
  cursor: pointer;
}

.asb-cover-logo-preview {
  width: 88px;
  height: 58px;
  object-fit: contain;
  padding: 5px;
  border: 1px solid #dce4eb;
  border-radius: 7px;
  background: #fff;
}

.asb-logo-size-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 8px;
}

.asb-logo-ratio-row {
  display: flex !important;
  align-items: center;
  gap: 7px !important;
  margin-top: 8px;
  color: #40586d;
  font-size: 8px;
  font-weight: 700;
}

.asb-logo-ratio-row input {
  width: auto;
  min-height: auto;
}

.asb-logo-size-note {
  margin-top: 5px;
  color: #82909b;
  font-size: 7.5px;
}

.asb-info {
  padding: 10px;
  border: 1px solid #d8e2ea;
  border-radius: 8px;
  color: #5f7282;
  background: #f7fafc;
  font-size: 8px;
  line-height: 1.5;
}

.asb-items {
  display: grid;
  gap: 5px;
}

.asb-item {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 8px;
  border: 1px solid #e0e7ed;
  border-radius: 7px;
  color: #465f72;
  font-size: 8px;
}

.asb-editor-right {
  min-width: 0;
  overflow: hidden;
  border: 1px solid #d8e1e8;
  border-radius: 12px;
  background: #e8edf1;
}

.asb-preview-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border-bottom: 1px solid #d5dee5;
  background: #fff;
}

.asb-preview-head strong {
  color: #294258;
  font-size: 9px;
}

.asb-preview-head span {
  color: #758592;
  font-size: 8px;
}

.asb-preview-frame {
  width: 100%;
  height: calc(100vh - 220px);
  min-height: 620px;
  display: block;
  border: 0;
  background: #e8edf1;
}

.asb-chrome-card {
  display: grid;
  gap: 9px;
  padding: 11px;
  border: 1px solid #dce5ec;
  border-radius: 9px;
  background: #f8fafc;
}

.asb-chrome-title {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  color: #294258;
  font-size: 9px;
  font-weight: 800;
}

.asb-upload input {
  display: none;
}

.asb-upload {
  width: fit-content;
  min-height: 34px;
  display: inline-flex !important;
  grid-auto-flow: column;
  align-items: center;
  gap: 6px !important;
  padding: 7px 9px;
  border: 1px solid #ccd8e1;
  border-radius: 7px;
  background: #fff;
  cursor: pointer;
}

.asb-upload-preview {
  width: 100%;
  max-height: 110px;
  object-fit: contain;
  border: 1px solid #dde5eb;
  border-radius: 7px;
  background: #fff;
}

.asb-chrome-upload-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.asb-hf-align-buttons {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}

.asb-hf-align-buttons button {
  min-height: 34px;
  padding: 7px 8px;
  border: 1px solid #ccd8e1;
  border-radius: 7px;
  color: #52697b;
  background: #fff;
  font-size: 8px;
  font-weight: 800;
  cursor: pointer;
}

.asb-hf-align-buttons button.active {
  border-color: #153e62;
  color: #153e62;
  background: #eef5fb;
}

.asb-hf-size-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.asb-hf-ratio-row {
  display: flex !important;
  align-items: center;
  gap: 7px !important;
  color: #40586d;
  font-size: 8px;
  font-weight: 700;
}

.asb-hf-ratio-row input {
  width: auto !important;
  min-height: auto !important;
}

.asb-hf-ratio-button {
  min-height: 34px;
  width: fit-content;
  padding: 7px 10px;
  border: 1px solid #ccd8e1;
  border-radius: 7px;
  color: #294258;
  background: #fff;
  font-size: 8px;
  font-weight: 800;
  cursor: pointer;
}

.asb-hf-note {
  color: #81909c;
  font-size: 7.5px;
  line-height: 1.45;
}
.asb-chrome-remove {
  min-height: 34px;
  padding: 7px 9px;
  border: 1px solid #e2caca;
  border-radius: 7px;
  color: #8a3434;
  background: #fff;
  font-size: 8px;
  font-weight: 800;
  cursor: pointer;
}

.asb-check {
  display: flex !important;
  align-items: center;
  gap: 7px !important;
  padding: 8px;
  border: 1px solid #dce5ec;
  border-radius: 7px;
  background: #fff;
  color: #40586d;
  font-size: 8px;
  font-weight: 700;
}

.asb-check input {
  width: auto;
  min-height: auto;
}

.asb-loading {
  min-height: 320px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6c7d8a;
}

@media (max-width: 1200px) {
  .asb-editor-layout {
    grid-template-columns: 1fr;
  }

  .asb-panel {
    max-height: none;
  }

  .asb-preview-frame {
    height: 760px;
  }
}

@media (max-width: 700px) {
  .asb-editor-top {
    align-items: flex-start;
    flex-direction: column;
  }

  .asb-tabs {
    grid-template-columns: 1fr 1fr;
  }

  .asb-grid-3 {
    grid-template-columns: 1fr;
  }
}
`;

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

function fallback(
  quotationId: string,
): QuotationProposal {
  return {
    quotationId,

    cover: {
      proposalTitle: "Financial Proposal",
      preparedFor: "",
      preparedForLogoData: "",
      preparedForLogoWidthMm: 45,
      preparedForLogoHeightMm: 20,
      preparedForLogoLockRatio: true,
      preparedForLogoAspectRatio: 2.25,
      preparedForAddress: "",
      preparedBy: "ASB Lift",
      preparedByLogoData: "",
      preparedByLogoWidthMm: 45,
      preparedByLogoHeightMm: 20,
      preparedByLogoLockRatio: true,
      preparedByLogoAspectRatio: 2.25,
      preparedByAddress: "",
      submissionDate: "",
    },

    letter: {
      toDesignation: "President/Secretary",
      subject: "Financial Proposal",
      greeting: "Dear Sir,",
      body: "",
      technicalHeading:
        "Technical Satisfactory Details",
      technicalDetails: "",
      signerName: "",
      signerDesignation: "",
      signerCompany: "ASB Lift",
    },

    terms: {
      validity:
        "10 (Ten) days from the date of submission.",
      warranty:
        "2 years warranty for supplied spare parts.",
      delivery: "FROM READY STOCK.",
      payment:
        "80% before starting work and remaining 20% during handover.",
      handover:
        "Within 10 (Ten) working days after first payment.",
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

type ChromeEditorProps = {
  title: string;
  block: ProposalChromeBlock;
  onChange: (
    block: ProposalChromeBlock,
  ) => void;
};

function ChromeEditor({
  title,
  block,
  onChange,
}: ChromeEditorProps) {
  const isFooter =
    title.toLowerCase().includes("footer");

  const edgeLabel = isFooter
    ? "Footer distance from bottom edge (mm)"
    : "Header distance from top edge (mm)";
  const MAX_WIDTH_MM = 159.2;

  const upload = (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];

    if (!file) return;

    const reader = new FileReader();

    reader.onload = () => {
      const data =
        typeof reader.result === "string"
          ? reader.result
          : "";

      if (!data) return;

      const image = new Image();

      image.onload = () => {
        const ratio =
          image.naturalWidth > 0 &&
          image.naturalHeight > 0
            ? image.naturalWidth /
              image.naturalHeight
            : 1;

        let widthMm = MAX_WIDTH_MM;
        let heightMm =
          Math.round(
            (widthMm / ratio) * 10,
          ) / 10;

        if (heightMm > 60) {
          heightMm = 60;
          widthMm =
            Math.round(
              heightMm * ratio * 10,
            ) / 10;
        }

        onChange({
          ...block,
          mode: "image",
          imageData: data,
          imageWidthMm: Math.min(
            MAX_WIDTH_MM,
            widthMm,
          ),
          imageHeightMm: Math.max(
            5,
            heightMm,
          ),
          imageLockRatio: true,
          imageAspectRatio: ratio,
        });
      };

      image.src = data;
    };

    reader.readAsDataURL(file);
    event.target.value = "";
  };

  const setSize = (
    dimension: "width" | "height",
    rawValue: number,
  ) => {
    const ratio =
      Number(block.imageAspectRatio) > 0
        ? Number(block.imageAspectRatio)
        : 1;

    const lock =
      block.imageLockRatio !== false;

    const width =
      Number(block.imageWidthMm) > 0
        ? Number(block.imageWidthMm)
        : MAX_WIDTH_MM;

    const height =
      Number(block.imageHeightMm) > 0
        ? Number(block.imageHeightMm)
        : Math.max(
            5,
            Math.round(
              (width / ratio) * 10,
            ) / 10,
          );

    if (dimension === "width") {
      const nextWidth = Math.max(
        10,
        Math.min(
          MAX_WIDTH_MM,
          Number(rawValue) || 10,
        ),
      );

      onChange({
        ...block,
        imageWidthMm: nextWidth,
        imageHeightMm: lock
          ? Math.max(
              5,
              Math.min(
                60,
                Math.round(
                  (nextWidth / ratio) *
                    10,
                ) / 10,
              ),
            )
          : height,
      });

      return;
    }

    const nextHeight = Math.max(
      5,
      Math.min(
        60,
        Number(rawValue) || 5,
      ),
    );

    onChange({
      ...block,
      imageHeightMm: nextHeight,
      imageWidthMm: lock
        ? Math.max(
            10,
            Math.min(
              MAX_WIDTH_MM,
              Math.round(
                nextHeight *
                  ratio *
                  10,
              ) / 10,
            ),
          )
        : width,
    });
  };

  const applyAspectRatio = () => {
    const ratio =
      Number(block.imageAspectRatio) > 0
        ? Number(block.imageAspectRatio)
        : 1;

    const width = Math.max(
      10,
      Math.min(
        MAX_WIDTH_MM,
        Number(block.imageWidthMm) ||
          MAX_WIDTH_MM,
      ),
    );

    onChange({
      ...block,
      imageWidthMm: width,
      imageHeightMm: Math.max(
        5,
        Math.min(
          60,
          Math.round(
            (width / ratio) * 10,
          ) / 10,
        ),
      ),
      imageLockRatio: true,
    });
  };

  return (
    <section className="asb-chrome-card">
      <div className="asb-chrome-title">
        <strong>{title}</strong>
        <span>
          {block.imageData
            ? "Image"
            : block.mode}
        </span>
      </div>

      <label>
        <span>Mode</span>
        <select
          value={block.mode}
          onChange={(event) =>
            onChange({
              ...block,
              mode:
                event.target
                  .value as ProposalChromeBlock["mode"],
            })
          }
        >
          <option value="none">None</option>
          <option value="text">Text</option>
          <option value="image">Image</option>
        </select>
      </label>

      <div>
        <span
          style={{
            display: "block",
            marginBottom: 5,
            color: "#65798a",
            fontSize: 8,
            fontWeight: 800,
          }}
        >
          Alignment
        </span>

        <div className="asb-hf-align-buttons">
          {[
            ["left", "Left"],
            ["center", "Center"],
            ["right", "Right"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={
                block.align === value
                  ? "active"
                  : ""
              }
              onClick={() =>
                onChange({
                  ...block,
                  align:
                    value as ProposalChromeBlock["align"],
                })
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <label>
        <span>{edgeLabel}</span>
        <input
          type="number"
          min="0"
          max="40"
          step="1"
          value={block.pageEdgeGapMm ?? 10}
          onChange={(event) =>
            onChange({
              ...block,
              pageEdgeGapMm: Math.max(
                0,
                Math.min(
                  40,
                  Number(event.target.value) || 0,
                ),
              ),
            })
          }
        />
      </label>

      <label>
        <span>Header / Footer Area Height (mm)</span>
        <input
          type="number"
          min="5"
          max="70"
          step="1"
          value={block.heightMm}
          onChange={(event) =>
            onChange({
              ...block,
              heightMm: Number(
                event.target.value,
              ),
            })
          }
        />
      </label>

      {block.mode === "text" && (
        <label>
          <span>Text</span>
          <textarea
            rows={3}
            value={block.text}
            onChange={(event) =>
              onChange({
                ...block,
                text: event.target.value,
              })
            }
          />
        </label>
      )}

      <div className="asb-chrome-upload-row">
        <label className="asb-upload">
          {block.imageData
            ? "Change Image"
            : "Upload Image"}

          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={upload}
          />
        </label>

        {block.imageData && (
          <button
            type="button"
            className="asb-chrome-remove"
            onClick={() =>
              onChange({
                ...block,
                mode: "text",
                imageData: "",
              })
            }
          >
            Remove Image
          </button>
        )}
      </div>

      {block.imageData && (
        <>
          <img
            className="asb-upload-preview"
            src={block.imageData}
            alt=""
          />

          <div className="asb-hf-size-grid">
            <label>
              <span>Image Width (mm)</span>
              <input
                type="number"
                min="10"
                max="159.2"
                step="1"
                value={
                  block.imageWidthMm ??
                  159.2
                }
                onChange={(event) =>
                  setSize(
                    "width",
                    Number(
                      event.target.value,
                    ),
                  )
                }
              />
            </label>

            <label>
              <span>Image Height (mm)</span>
              <input
                type="number"
                min="5"
                max="60"
                step="1"
                value={
                  block.imageHeightMm ??
                  30
                }
                onChange={(event) =>
                  setSize(
                    "height",
                    Number(
                      event.target.value,
                    ),
                  )
                }
              />
            </label>
          </div>

          <label className="asb-hf-ratio-row">
            <input
              type="checkbox"
              checked={
                block.imageLockRatio !==
                false
              }
              onChange={(event) =>
                onChange({
                  ...block,
                  imageLockRatio:
                    event.target.checked,
                })
              }
            />
            Lock Aspect Ratio
          </label>

          <button
            type="button"
            className="asb-hf-ratio-button"
            onClick={applyAspectRatio}
          >
            Apply Aspect Ratio
          </button>

          <div className="asb-hf-note">
            Left alignment starts at the
            1-inch safe boundary. Right
            alignment ends at the 1-inch safe
            boundary. Maximum image width is
            159.2 mm.
          </div>
        </>
      )}
    </section>
  );
}

export function QuotationProposalEditor() {
  const searchParams = useSearchParams();
  const quotationId =
    searchParams.get("id") ?? "";

  const [payload, setPayload] =
    useState<Payload | null>(null);

  const [proposal, setProposal] =
    useState<QuotationProposal>(() =>
      fallback(quotationId),
    );

  const [tab, setTab] =
    useState<Tab>("cover");

  const [saving, setSaving] =
    useState(false);

  const [loading, setLoading] =
    useState(true);

  const [previewVersion, setPreviewVersion] =
    useState(0);

  const [pageOverrideKey, setPageOverrideKey] =
    useState("cover");

  useEffect(() => {
    if (!quotationId) {
      setLoading(false);
      return;
    }

    let active = true;

    void (async () => {
      try {
        const [
          quotationResponse,
          proposalResponse,
        ] = await Promise.all([
          fetch("/api/quotations", {
            cache: "no-store",
          }),
          fetch(
            `/api/quotation-proposals?quotationId=${encodeURIComponent(
              quotationId,
            )}`,
            {
              cache: "no-store",
            },
          ),
        ]);

        const quotationPayload =
          (await quotationResponse.json()) as Payload;

        const proposalPayload =
          await proposalResponse.json();

        if (!active) return;

        setPayload(quotationPayload);

        setProposal(
          proposalResponse.ok &&
            proposalPayload.proposal
            ? proposalPayload.proposal
            : fallback(quotationId),
        );
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [quotationId]);

  const quotation = useMemo(
    () =>
      payload?.quotations.find(
        (record) =>
          record.id === quotationId,
      ) ?? null,
    [payload, quotationId],
  );

  const client = useMemo(
    () =>
      payload?.clients.find(
        (record) =>
          record.id === quotation?.clientId,
      ) ?? null,
    [payload, quotation],
  );

  const project = useMemo(
    () =>
      payload?.projects.find(
        (record) =>
          record.id === quotation?.projectId,
      ) ?? null,
    [payload, quotation],
  );

  const pricePageCount = useMemo(() => {
    if (!quotation) return 1;

    return Math.max(
      1,
      Math.ceil(
        quotation.items.length /
          Math.max(
            5,
            Number(
              proposal.priceRowsPerPage,
            ) || 12,
          ),
      ),
    );
  }, [
    quotation,
    proposal.priceRowsPerPage,
  ]);

  const generatedPageKeys = useMemo(() => {
    const keys = [
      {
        key: "cover",
        label: "Page 1 - Cover",
      },
      {
        key: "letter",
        label:
          "Page 2 - Application Letter",
      },
    ];

    for (
      let index = 0;
      index < pricePageCount;
      index += 1
    ) {
      keys.push({
        key: `price-${index + 1}`,
        label: `Price Page ${index + 1}`,
      });
    }

    keys.push({
      key: "terms",
      label: "Last Page - Terms",
    });

    return keys;
  }, [pricePageCount]);
  const uploadCoverLogo = (
    field:
      | "preparedForLogoData"
      | "preparedByLogoData",
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];

    if (!file) return;

    const reader = new FileReader();

    reader.onload = () => {
      const data =
        typeof reader.result === "string"
          ? reader.result
          : "";

      if (!data) return;

      const image = new Image();

      image.onload = () => {
        const ratio =
          image.naturalWidth > 0 &&
          image.naturalHeight > 0
            ? image.naturalWidth /
              image.naturalHeight
            : 2.25;

        const widthMm = 45;
        const heightMm = Math.max(
          5,
          Math.min(
            45,
            Math.round(
              (widthMm / ratio) * 10,
            ) / 10,
          ),
        );

        setProposal((current) => {
          if (
            field ===
            "preparedForLogoData"
          ) {
            return {
              ...current,
              cover: {
                ...current.cover,
                preparedForLogoData:
                  data,
                preparedForLogoWidthMm:
                  widthMm,
                preparedForLogoHeightMm:
                  heightMm,
                preparedForLogoLockRatio:
                  true,
                preparedForLogoAspectRatio:
                  ratio,
              },
            };
          }

          return {
            ...current,
            cover: {
              ...current.cover,
              preparedByLogoData: data,
              preparedByLogoWidthMm:
                widthMm,
              preparedByLogoHeightMm:
                heightMm,
              preparedByLogoLockRatio:
                true,
              preparedByLogoAspectRatio:
                ratio,
            },
          };
        });
      };

      image.src = data;
    };

    reader.readAsDataURL(file);
    event.target.value = "";
  };

  const updateCoverLogoSize = (
    target: "preparedFor" | "preparedBy",
    dimension: "width" | "height",
    value: number,
  ) => {
    const safeValue = Math.max(
      dimension === "width" ? 10 : 5,
      Math.min(
        dimension === "width" ? 100 : 60,
        Number(value) || 0,
      ),
    );

    setProposal((current) => {
      const cover = current.cover;

      if (target === "preparedFor") {
        const ratio =
          Number(
            cover.preparedForLogoAspectRatio,
          ) > 0
            ? Number(
                cover.preparedForLogoAspectRatio,
              )
            : 1;

        if (
          cover.preparedForLogoLockRatio
        ) {
          return {
            ...current,
            cover: {
              ...cover,
              preparedForLogoWidthMm:
                dimension === "width"
                  ? safeValue
                  : Math.round(
                      safeValue *
                        ratio *
                        10,
                    ) / 10,
              preparedForLogoHeightMm:
                dimension === "height"
                  ? safeValue
                  : Math.round(
                      (safeValue /
                        ratio) *
                        10,
                    ) / 10,
            },
          };
        }

        return {
          ...current,
          cover: {
            ...cover,
            preparedForLogoWidthMm:
              dimension === "width"
                ? safeValue
                : cover.preparedForLogoWidthMm,
            preparedForLogoHeightMm:
              dimension === "height"
                ? safeValue
                : cover.preparedForLogoHeightMm,
          },
        };
      }

      const ratio =
        Number(
          cover.preparedByLogoAspectRatio,
        ) > 0
          ? Number(
              cover.preparedByLogoAspectRatio,
            )
          : 1;

      if (
        cover.preparedByLogoLockRatio
      ) {
        return {
          ...current,
          cover: {
            ...cover,
            preparedByLogoWidthMm:
              dimension === "width"
                ? safeValue
                : Math.round(
                    safeValue *
                      ratio *
                      10,
                  ) / 10,
            preparedByLogoHeightMm:
              dimension === "height"
                ? safeValue
                : Math.round(
                    (safeValue /
                      ratio) *
                      10,
                  ) / 10,
          },
        };
      }

      return {
        ...current,
        cover: {
          ...cover,
          preparedByLogoWidthMm:
            dimension === "width"
              ? safeValue
              : cover.preparedByLogoWidthMm,
          preparedByLogoHeightMm:
            dimension === "height"
              ? safeValue
              : cover.preparedByLogoHeightMm,
        },
      };
    });
  };

  const save = async () => {
    if (!quotationId) return;

    setSaving(true);

    try {
      const response = await fetch(
        "/api/quotation-proposals",
        {
          method: "PUT",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            ...proposal,
            quotationId,
          }),
        },
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error ||
            "Unable to save proposal.",
        );
      }

      setProposal(result.proposal);

      setPreviewVersion(
        (current) => current + 1,
      );
    } catch (error) {
      window.alert(
        error instanceof Error
          ? error.message
          : "Unable to save proposal.",
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="asb-loading">
        <style>{CSS}</style>
        Loading proposal editor...
      </div>
    );
  }

  if (!quotation || !payload) {
    return (
      <div className="asb-loading">
        <style>{CSS}</style>
        Quotation not found.
      </div>
    );
  }

  const currentOverride:
    ProposalPageChromeOverride =
    proposal.pageOverrides[
      pageOverrideKey
    ] ?? {
      useHeader: false,
      useFooter: false,
      header: {
        ...proposal.defaultHeader,
      },
      footer: {
        ...proposal.defaultFooter,
      },
    };

  const updateOverride = (
    next: ProposalPageChromeOverride,
  ) => {
    setProposal((current) => ({
      ...current,
      pageOverrides: {
        ...current.pageOverrides,
        [pageOverrideKey]: next,
      },
    }));
  };

  return (
    <div className="asb-editor">
      <style>{CSS}</style>

      <header className="asb-editor-top">
        <div className="asb-editor-title">
          <span>
            {quotation.quotationNo} - Rev{" "}
            {quotation.revisionNo}
          </span>
          <h1>Proposal Editor</h1>
        </div>

        <div className="asb-editor-actions">
          <button
            type="button"
            className="asb-btn"
            onClick={() => setTab("headerFooter")}
          >
            All Page Header & Footer
          </button>

          <button
            type="button"
            className="asb-btn"
            onClick={() =>
              window.open(
                `/quotations/proposal/preview?id=${encodeURIComponent(
                  quotation.id,
                )}`,
                "asbQuotationPreview",
                "popup=yes,width=1280,height=900,resizable=yes,scrollbars=yes",
              )
            }
          >
            <Eye size={14} />
            Preview
          </button>

          <button
            type="button"
            className="asb-btn asb-btn-primary"
            onClick={() => void save()}
            disabled={saving}
          >
            <Save size={14} />
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </header>

      <div className="asb-editor-layout">
        <section className="asb-editor-left">
          <nav className="asb-tabs">
            {[
              ["cover", "Cover"],
              ["letter", "Letter"],
              ["price", "Price"],
              ["terms", "Terms"],
              [
                "headerFooter",
                "Header/Footer",
              ],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={
                  tab === key ? "active" : ""
                }
                onClick={() =>
                  setTab(key as Tab)
                }
              >
                {label}
              </button>
            ))}
          </nav>

          <div className="asb-panel">
            {tab === "cover" && (
              <>
                <h2>
                  Page 1 - Proposal / Cover
                </h2>

                <label>
                  <span>Proposal Title</span>
                  <input
                    value={
                      proposal.cover
                        .proposalTitle
                    }
                    onChange={(event) =>
                      setProposal(
                        (current) => ({
                          ...current,
                          cover: {
                            ...current.cover,
                            proposalTitle:
                              event.target
                                .value,
                          },
                        }),
                      )
                    }
                  />
                </label>

                <label>
                  <span>Prepared For</span>
                  <input
                    value={
                      proposal.cover
                        .preparedFor
                    }
                    placeholder={
                      project?.name ||
                      quotation.title ||
                      client?.name ||
                      ""
                    }
                    onChange={(event) =>
                      setProposal(
                        (current) => ({
                          ...current,
                          cover: {
                            ...current.cover,
                            preparedFor:
                              event.target
                                .value,
                          },
                        }),
                      )
                    }
                  />
                </label>
                <div>
                  <span style={{ display: "block", marginBottom: 5, color: "#65798a", fontSize: 8, fontWeight: 800 }}>
                    Prepared For Logo
                  </span>

                  <div className="asb-cover-logo-tools">
                    <label className="asb-cover-logo-upload">
                      Upload Logo
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={(event) =>
                          uploadCoverLogo(
                            "preparedForLogoData",
                            event,
                          )
                        }
                      />
                    </label>

                    {proposal.cover.preparedForLogoData && (
                      <>
                        <img
                          className="asb-cover-logo-preview"
                          src={proposal.cover.preparedForLogoData}
                          alt="Prepared For logo"
                        />

                        <button
                          type="button"
                          className="asb-cover-logo-remove"
                          onClick={() =>
                            setProposal((current) => ({
                              ...current,
                              cover: {
                                ...current.cover,
                                preparedForLogoData: "",
      preparedForLogoWidthMm: 45,
      preparedForLogoHeightMm: 20,
      preparedForLogoLockRatio: true,
      preparedForLogoAspectRatio: 2.25,
                              },
                            }))
                          }
                        >
                          Remove
                        </button>
                      </>
                    )}
                  </div>

                  {proposal.cover.preparedForLogoData && (
                    <>
                      <div
                        style={{
                          marginTop: 8,
                          color: "#294258",
                          fontSize: 8,
                          fontWeight: 800,
                        }}
                      >
                        Prepared For Logo Size
                      </div>

                      <div className="asb-logo-size-grid">
                        <label>
                          <span>Width (mm)</span>
                          <input
                            type="number"
                            min="10"
                            max="100"
                            step="1"
                            value={
                              proposal.cover
                                .preparedForLogoWidthMm
                            }
                            onChange={(event) =>
                              updateCoverLogoSize(
                                "preparedFor",
                                "width",
                                Number(
                                  event.target.value,
                                ),
                              )
                            }
                          />
                        </label>

                        <label>
                          <span>Height (mm)</span>
                          <input
                            type="number"
                            min="5"
                            max="60"
                            step="1"
                            value={
                              proposal.cover
                                .preparedForLogoHeightMm
                            }
                            onChange={(event) =>
                              updateCoverLogoSize(
                                "preparedFor",
                                "height",
                                Number(
                                  event.target.value,
                                ),
                              )
                            }
                          />
                        </label>
                      </div>

                      <label className="asb-logo-ratio-row">
                        <input
                          type="checkbox"
                          checked={
                            proposal.cover
                              .preparedForLogoLockRatio
                          }
                          onChange={(event) =>
                            setProposal(
                              (current) => ({
                                ...current,
                                cover: {
                                  ...current.cover,
                                  preparedForLogoLockRatio:
                                    event.target.checked,
                                },
                              }),
                            )
                          }
                        />
                        Lock aspect ratio
                      </label>

                      <div className="asb-logo-size-note">
                        Locked: changing width automatically changes height, and vice versa.
                      </div>
                    </>
                  )}
                </div>

                <label>
                  <span>
                    Prepared For Address
                  </span>
                  <textarea
                    rows={3}
                    value={
                      proposal.cover
                        .preparedForAddress
                    }
                    placeholder={
                      client?.address || ""
                    }
                    onChange={(event) =>
                      setProposal(
                        (current) => ({
                          ...current,
                          cover: {
                            ...current.cover,
                            preparedForAddress:
                              event.target
                                .value,
                          },
                        }),
                      )
                    }
                  />
                </label>

                <label>
                  <span>Prepared By</span>
                  <input
                    value={
                      proposal.cover
                        .preparedBy
                    }
                    onChange={(event) =>
                      setProposal(
                        (current) => ({
                          ...current,
                          cover: {
                            ...current.cover,
                            preparedBy:
                              event.target
                                .value,
                          },
                        }),
                      )
                    }
                  />
                </label>
                <div>
                  <span style={{ display: "block", marginBottom: 5, color: "#65798a", fontSize: 8, fontWeight: 800 }}>
                    Prepared By Logo
                  </span>

                  <div className="asb-cover-logo-tools">
                    <label className="asb-cover-logo-upload">
                      Upload Logo
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={(event) =>
                          uploadCoverLogo(
                            "preparedByLogoData",
                            event,
                          )
                        }
                      />
                    </label>

                    {proposal.cover.preparedByLogoData && (
                      <>
                        <img
                          className="asb-cover-logo-preview"
                          src={proposal.cover.preparedByLogoData}
                          alt="Prepared By logo"
                        />

                        <button
                          type="button"
                          className="asb-cover-logo-remove"
                          onClick={() =>
                            setProposal((current) => ({
                              ...current,
                              cover: {
                                ...current.cover,
                                preparedByLogoData: "",
      preparedByLogoWidthMm: 45,
      preparedByLogoHeightMm: 20,
      preparedByLogoLockRatio: true,
      preparedByLogoAspectRatio: 2.25,
                              },
                            }))
                          }
                        >
                          Remove
                        </button>
                      </>
                    )}
                  </div>

                  {proposal.cover.preparedByLogoData && (
                    <>
                      <div
                        style={{
                          marginTop: 8,
                          color: "#294258",
                          fontSize: 8,
                          fontWeight: 800,
                        }}
                      >
                        Prepared By Logo Size
                      </div>

                      <div className="asb-logo-size-grid">
                        <label>
                          <span>Width (mm)</span>
                          <input
                            type="number"
                            min="10"
                            max="100"
                            step="1"
                            value={
                              proposal.cover
                                .preparedByLogoWidthMm
                            }
                            onChange={(event) =>
                              updateCoverLogoSize(
                                "preparedBy",
                                "width",
                                Number(
                                  event.target.value,
                                ),
                              )
                            }
                          />
                        </label>

                        <label>
                          <span>Height (mm)</span>
                          <input
                            type="number"
                            min="5"
                            max="60"
                            step="1"
                            value={
                              proposal.cover
                                .preparedByLogoHeightMm
                            }
                            onChange={(event) =>
                              updateCoverLogoSize(
                                "preparedBy",
                                "height",
                                Number(
                                  event.target.value,
                                ),
                              )
                            }
                          />
                        </label>
                      </div>

                      <label className="asb-logo-ratio-row">
                        <input
                          type="checkbox"
                          checked={
                            proposal.cover
                              .preparedByLogoLockRatio
                          }
                          onChange={(event) =>
                            setProposal(
                              (current) => ({
                                ...current,
                                cover: {
                                  ...current.cover,
                                  preparedByLogoLockRatio:
                                    event.target.checked,
                                },
                              }),
                            )
                          }
                        />
                        Lock aspect ratio
                      </label>

                      <div className="asb-logo-size-note">
                        Locked: changing width automatically changes height, and vice versa.
                      </div>
                    </>
                  )}
                </div>

                <label>
                  <span>
                    Prepared By Address
                  </span>
                  <textarea
                    rows={3}
                    value={
                      proposal.cover
                        .preparedByAddress
                    }
                    onChange={(event) =>
                      setProposal(
                        (current) => ({
                          ...current,
                          cover: {
                            ...current.cover,
                            preparedByAddress:
                              event.target
                                .value,
                          },
                        }),
                      )
                    }
                  />
                </label>

                <label>
                  <span>Submission Date</span>
                  <input
                    type="date"
                    value={
                      proposal.cover
                        .submissionDate
                    }
                    onChange={(event) =>
                      setProposal(
                        (current) => ({
                          ...current,
                          cover: {
                            ...current.cover,
                            submissionDate:
                              event.target
                                .value,
                          },
                        }),
                      )
                    }
                  />
                </label>
              </>
            )}

            {tab === "letter" && (
              <>
                <h2>
                  Page 2 - Application Letter
                </h2>

                <label>
                  <span>To / Designation</span>
                  <input
                    value={
                      proposal.letter
                        .toDesignation
                    }
                    onChange={(event) =>
                      setProposal(
                        (current) => ({
                          ...current,
                          letter: {
                            ...current.letter,
                            toDesignation:
                              event.target
                                .value,
                          },
                        }),
                      )
                    }
                  />
                </label>

                <label>
                  <span>Subject</span>
                  <textarea
                    rows={2}
                    value={
                      proposal.letter.subject
                    }
                    onChange={(event) =>
                      setProposal(
                        (current) => ({
                          ...current,
                          letter: {
                            ...current.letter,
                            subject:
                              event.target
                                .value,
                          },
                        }),
                      )
                    }
                  />
                </label>

                <label>
                  <span>Greeting</span>
                  <input
                    value={
                      proposal.letter.greeting
                    }
                    onChange={(event) =>
                      setProposal(
                        (current) => ({
                          ...current,
                          letter: {
                            ...current.letter,
                            greeting:
                              event.target
                                .value,
                          },
                        }),
                      )
                    }
                  />
                </label>

                <label>
                  <span>Letter Body</span>
                  <textarea
                    rows={7}
                    value={
                      proposal.letter.body
                    }
                    onChange={(event) =>
                      setProposal(
                        (current) => ({
                          ...current,
                          letter: {
                            ...current.letter,
                            body:
                              event.target
                                .value,
                          },
                        }),
                      )
                    }
                  />
                </label>

                <label>
                  <span>
                    Technical Heading
                  </span>
                  <input
                    value={
                      proposal.letter
                        .technicalHeading
                    }
                    onChange={(event) =>
                      setProposal(
                        (current) => ({
                          ...current,
                          letter: {
                            ...current.letter,
                            technicalHeading:
                              event.target
                                .value,
                          },
                        }),
                      )
                    }
                  />
                </label>

                <label>
                  <span>
                    Technical Details
                  </span>
                  <textarea
                    rows={6}
                    value={
                      proposal.letter
                        .technicalDetails
                    }
                    onChange={(event) =>
                      setProposal(
                        (current) => ({
                          ...current,
                          letter: {
                            ...current.letter,
                            technicalDetails:
                              event.target
                                .value,
                          },
                        }),
                      )
                    }
                  />
                </label>

                <div className="asb-grid-3">
                  <label>
                    <span>Signer Name</span>
                    <input
                      value={
                        proposal.letter
                          .signerName
                      }
                      onChange={(event) =>
                        setProposal(
                          (current) => ({
                            ...current,
                            letter: {
                              ...current.letter,
                              signerName:
                                event.target
                                  .value,
                            },
                          }),
                        )
                      }
                    />
                  </label>

                  <label>
                    <span>Designation</span>
                    <input
                      value={
                        proposal.letter
                          .signerDesignation
                      }
                      onChange={(event) =>
                        setProposal(
                          (current) => ({
                            ...current,
                            letter: {
                              ...current.letter,
                              signerDesignation:
                                event.target
                                  .value,
                            },
                          }),
                        )
                      }
                    />
                  </label>

                  <label>
                    <span>Company</span>
                    <input
                      value={
                        proposal.letter
                          .signerCompany
                      }
                      onChange={(event) =>
                        setProposal(
                          (current) => ({
                            ...current,
                            letter: {
                              ...current.letter,
                              signerCompany:
                                event.target
                                  .value,
                            },
                          }),
                        )
                      }
                    />
                  </label>
                </div>
              </>
            )}

            {tab === "price" && (
              <>
                <h2>
                  Page 3+ - Price Details
                </h2>

                <div className="asb-info">
                  Commercial item, quantity,
                  rate and total come from the
                  quotation. Price pages grow
                  automatically.
                </div>

                <label>
                  <span>
                    Rows per Price Page
                  </span>
                  <input
                    type="number"
                    min="5"
                    max="25"
                    value={
                      proposal.priceRowsPerPage
                    }
                    onChange={(event) =>
                      setProposal(
                        (current) => ({
                          ...current,
                          priceRowsPerPage:
                            Number(
                              event.target
                                .value,
                            ),
                        }),
                      )
                    }
                  />
                </label>

                <div className="asb-items">
                  {quotation.items.map(
                    (item, index) => (
                      <div
                        className="asb-item"
                        key={item.id}
                      >
                        <span>
                          {index + 1}.{" "}
                          {item.description}
                        </span>
                        <strong>
                          {item.quantity}{" "}
                          {item.unit}
                        </strong>
                      </div>
                    ),
                  )}
                </div>

                <div className="asb-info">
                  To edit the commercial item
                  list itself, use the normal
                  quotation commercial data.
                </div>
              </>
            )}

            {tab === "terms" && (
              <>
                <h2>
                  Last Page - Terms & Payment
                </h2>

                {[
                  ["validity", "Validity"],
                  ["warranty", "Warranty"],
                  ["delivery", "Delivery"],
                  ["payment", "Payment"],
                  ["handover", "Handover"],
                ].map(([key, label]) => (
                  <label key={key}>
                    <span>{label}</span>
                    <textarea
                      rows={3}
                      value={
                        proposal.terms[
                          key as
                            | "validity"
                            | "warranty"
                            | "delivery"
                            | "payment"
                            | "handover"
                        ]
                      }
                      onChange={(event) =>
                        setProposal(
                          (current) => ({
                            ...current,
                            terms: {
                              ...current.terms,
                              [key]:
                                event.target
                                  .value,
                            },
                          }),
                        )
                      }
                    />
                  </label>
                ))}

                <label>
                  <span>
                    Additional Terms
                  </span>
                  <textarea
                    rows={4}
                    value={
                      proposal.terms
                        .additionalTerms
                    }
                    onChange={(event) =>
                      setProposal(
                        (current) => ({
                          ...current,
                          terms: {
                            ...current.terms,
                            additionalTerms:
                              event.target
                                .value,
                          },
                        }),
                      )
                    }
                  />
                </label>

                <div className="asb-grid-3">
                  <label>
                    <span>Signer Name</span>
                    <input
                      value={
                        proposal.terms
                          .signerName
                      }
                      onChange={(event) =>
                        setProposal(
                          (current) => ({
                            ...current,
                            terms: {
                              ...current.terms,
                              signerName:
                                event.target
                                  .value,
                            },
                          }),
                        )
                      }
                    />
                  </label>

                  <label>
                    <span>Designation</span>
                    <input
                      value={
                        proposal.terms
                          .signerDesignation
                      }
                      onChange={(event) =>
                        setProposal(
                          (current) => ({
                            ...current,
                            terms: {
                              ...current.terms,
                              signerDesignation:
                                event.target
                                  .value,
                            },
                          }),
                        )
                      }
                    />
                  </label>

                  <label>
                    <span>Company</span>
                    <input
                      value={
                        proposal.terms
                          .signerCompany
                      }
                      onChange={(event) =>
                        setProposal(
                          (current) => ({
                            ...current,
                            terms: {
                              ...current.terms,
                              signerCompany:
                                event.target
                                  .value,
                            },
                          }),
                        )
                      }
                    />
                  </label>
                </div>
              </>
            )}

            {tab === "headerFooter" && (
              <>
                <h2>
                  All Page Header & Footer
                </h2>

                <div className="asb-info">
                  Default header/footer applies
                  to all quotation pages. Any
                  generated page can override
                  it.
                </div>

                <ChromeEditor
                  title="All Page Header"
                  block={
                    proposal.defaultHeader
                  }
                  onChange={(defaultHeader) =>
                    setProposal(
                      (current) => ({
                        ...current,
                        defaultHeader,
                      }),
                    )
                  }
                />

                <ChromeEditor
                  title="All Page Footer"
                  block={
                    proposal.defaultFooter
                  }
                  onChange={(defaultFooter) =>
                    setProposal(
                      (current) => ({
                        ...current,
                        defaultFooter,
                      }),
                    )
                  }
                />

                <label>
                  <span>Page Override</span>
                  <select
                    value={pageOverrideKey}
                    onChange={(event) =>
                      setPageOverrideKey(
                        event.target.value,
                      )
                    }
                  >
                    {generatedPageKeys.map(
                      (page) => (
                        <option
                          key={page.key}
                          value={page.key}
                        >
                          {page.label}
                        </option>
                      ),
                    )}
                  </select>
                </label>

                <label className="asb-check">
                  <input
                    type="checkbox"
                    checked={
                      currentOverride.useHeader
                    }
                    onChange={(event) =>
                      updateOverride({
                        ...currentOverride,
                        useHeader:
                          event.target.checked,
                      })
                    }
                  />
                  Custom Header for this Page
                </label>

                {currentOverride.useHeader && (
                  <ChromeEditor
                    title="Page Header"
                    block={
                      currentOverride.header
                    }
                    onChange={(header) =>
                      updateOverride({
                        ...currentOverride,
                        header,
                      })
                    }
                  />
                )}

                <label className="asb-check">
                  <input
                    type="checkbox"
                    checked={
                      currentOverride.useFooter
                    }
                    onChange={(event) =>
                      updateOverride({
                        ...currentOverride,
                        useFooter:
                          event.target.checked,
                      })
                    }
                  />
                  Custom Footer for this Page
                </label>

                {currentOverride.useFooter && (
                  <ChromeEditor
                    title="Page Footer"
                    block={
                      currentOverride.footer
                    }
                    onChange={(footer) =>
                      updateOverride({
                        ...currentOverride,
                        footer,
                      })
                    }
                  />
                )}

                <label className="asb-check">
                  <input
                    type="checkbox"
                    checked={
                      proposal.showPageNumber
                    }
                    onChange={(event) =>
                      setProposal(
                        (current) => ({
                          ...current,
                          showPageNumber:
                            event.target
                              .checked,
                        }),
                      )
                    }
                  />
                  Show Page Number
                </label>
              </>
            )}
          </div>
        </section>

        <section className="asb-editor-right">
          <div className="asb-preview-head">
            <div>
              <strong>
                Full Proposal Preview
              </strong>
              <span>
                Cover / Letter / Price Page(s) / Terms
              </span>
            </div>
          </div>

          <iframe
            key={previewVersion}
            className="asb-preview-frame"
            title="Quotation proposal preview"
            src={`/quotations/proposal/preview?id=${encodeURIComponent(
              quotation.id,
            )}&embed=1&v=${previewVersion}`}
          />
        </section>
      </div>
    </div>
  );
}