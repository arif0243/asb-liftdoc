"use client";

import {
  ArrowLeft,
  Eye,
  Save,
  Upload,
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
import {
  buildProposalPages,
  QuotationProposalRenderer,
} from "@/components/workspace/quotation-proposal-renderer";
import styles from "./quotation-proposal-editor.module.css";

const EDITOR_FALLBACK_CSS = `
.${styles.page}{display:grid;gap:14px}
.${styles.heading}{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:16px;
}
.${styles.heading}>div{
  display:flex;
  align-items:center;
  gap:13px;
}
.${styles.heading} a,
.${styles.actions} a,
.${styles.actions} button{
  min-height:34px;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  gap:6px;
  padding:7px 10px;
  border:1px solid #ccd8e1;
  border-radius:8px;
  color:#294258;
  background:#fff;
  text-decoration:none;
  font-size:9px;
  font-weight:800;
  cursor:pointer;
}
.${styles.heading} span{
  color:#718391;
  font-size:8px;
  font-weight:800;
}
.${styles.heading} h1{
  margin:3px 0 0;
  color:#173047;
  font-size:22px;
}
.${styles.actions}{display:flex;gap:8px}
.${styles.actions} button{
  color:#fff;
  border-color:#153e62;
  background:#153e62;
}
.${styles.workspace}{
  display:grid;
  grid-template-columns:minmax(400px,520px) minmax(0,1fr);
  gap:15px;
  align-items:start;
}
.${styles.editor}{
  min-width:0;
  overflow:hidden;
  border:1px solid #dbe4eb;
  border-radius:13px;
  background:#fff;
}
.${styles.tabs}{
  display:grid;
  grid-template-columns:repeat(5,1fr);
  border-bottom:1px solid #dce4eb;
  background:#f8fafc;
}
.${styles.tabs} button{
  min-height:44px;
  padding:7px;
  border:0;
  border-right:1px solid #e3e9ee;
  color:#66798a;
  background:transparent;
  font-size:7.5px;
  font-weight:800;
  cursor:pointer;
}
.${styles.activeTab}{
  color:#153e62!important;
  background:#fff!important;
  box-shadow:inset 0 -2px #153e62;
}
.${styles.panel}{
  max-height:calc(100vh - 205px);
  overflow-y:auto;
  display:grid;
  gap:11px;
  padding:14px;
}
.${styles.panel} h2{
  margin:0 0 2px;
  color:#173047;
  font-size:14px;
}
.${styles.panel} label,
.${styles.chromeCard} label{
  display:grid;
  gap:5px;
}
.${styles.panel} label>span,
.${styles.chromeCard} label>span{
  color:#65798a;
  font-size:8px;
  font-weight:800;
}
.${styles.panel} input,
.${styles.panel} select,
.${styles.panel} textarea,
.${styles.chromeCard} input,
.${styles.chromeCard} select,
.${styles.chromeCard} textarea{
  width:100%;
  min-height:36px;
  padding:8px;
  border:1px solid #ccd7e0;
  border-radius:7px;
  box-sizing:border-box;
  color:#263f55;
  background:#fff;
  font-size:9px;
}
.${styles.grid3}{
  display:grid;
  grid-template-columns:repeat(3,1fr);
  gap:8px;
}
.${styles.infoBox}{
  padding:10px;
  border:1px solid #d8e2ea;
  border-radius:8px;
  color:#5f7282;
  background:#f7fafc;
  font-size:8px;
  line-height:1.5;
}
.${styles.chromeCard}{
  display:grid;
  gap:9px;
  padding:11px;
  border:1px solid #dce5ec;
  border-radius:9px;
  background:#f8fafc;
}
.${styles.preview}{
  min-width:0;
  overflow:hidden;
  border:1px solid #d8e1e8;
  border-radius:13px;
  background:#e9edf1;
}
.${styles.previewTitle}{
  display:flex;
  justify-content:space-between;
  gap:10px;
  padding:10px 12px;
  border-bottom:1px solid #d6dee5;
  background:#f8fafc;
}
.${styles.previewScale}{
  max-height:calc(100vh - 205px);
  overflow:auto;
  padding:20px;
}
.${styles.previewScale}>div{zoom:.55}
.${styles.items}{display:grid;gap:5px}
.${styles.items}>div{
  display:flex;
  justify-content:space-between;
  gap:8px;
  padding:7px 8px;
  border:1px solid #e1e7ed;
  border-radius:7px;
  font-size:8px;
}
.${styles.overrideChecks}{
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:8px;
}
.${styles.loading}{
  min-height:300px;
  display:flex;
  align-items:center;
  justify-content:center;
  color:#718291;
}
@media(max-width:1200px){
  .${styles.workspace}{grid-template-columns:1fr}
  .${styles.panel},
  .${styles.previewScale}{max-height:none}
}
`;
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
  | "chrome";

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
      preparedForAddress: "",
      preparedBy: "ASB Lift",
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
    value: ProposalChromeBlock,
  ) => void;
};

function ChromeEditor({
  title,
  block,
  onChange,
}: ChromeEditorProps) {
  const upload = (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];

    if (!file) return;

    const reader = new FileReader();

    reader.onload = () => {
      onChange({
        ...block,
        mode: "image",
        imageData:
          typeof reader.result === "string"
            ? reader.result
            : "",
      });
    };

    reader.readAsDataURL(file);
  };

  return (
    <div className={styles.chromeCard}>
      <div className={styles.cardTitle}>
        <strong>{title}</strong>
        <span>{block.heightMm} mm</span>
      </div>

      <div className={styles.grid3}>
        <label>
          <span>Mode</span>
          <select
            value={block.mode}
            onChange={(event) =>
              onChange({
                ...block,
                mode: event.target.value as ProposalChromeBlock["mode"],
              })
            }
          >
            <option value="none">None</option>
            <option value="text">Text</option>
            <option value="image">Image</option>
          </select>
        </label>

        <label>
          <span>Align</span>
          <select
            value={block.align}
            onChange={(event) =>
              onChange({
                ...block,
                align: event.target.value as ProposalChromeBlock["align"],
              })
            }
          >
            <option value="left">Left</option>
            <option value="center">Center</option>
            <option value="right">Right</option>
          </select>
        </label>

        <label>
          <span>Height</span>
          <input
            type="number"
            min="5"
            max="70"
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
      </div>

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

      {block.mode === "image" && (
        <div className={styles.imageArea}>
          <label className={styles.upload}>
            <Upload size={14} />
            Upload image
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={upload}
            />
          </label>

          {block.imageData && (
            <img
              src={block.imageData}
              alt=""
            />
          )}
        </div>
      )}
    </div>
  );
}

export function QuotationProposalEditor() {
  const searchParams = useSearchParams();
  const quotationId = searchParams.get("id") ?? "";
  const [payload, setPayload] =
    useState<Payload | null>(null);
  const [proposal, setProposal] =
    useState<QuotationProposal>(() =>
      fallback(""),
    );
  const [tab, setTab] =
    useState<Tab>("cover");
  const [chromePageKey, setChromePageKey] =
    useState("all");
  const [saving, setSaving] =
    useState(false);
  const [loading, setLoading] =
    useState(true);

  useEffect(() => {
    if (!quotationId) return;

    let active = true;

    void (async () => {
      try {
        const [quotationResponse, proposalResponse] =
          await Promise.all([
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

  const pageDescriptors = useMemo(
    () =>
      quotation
        ? buildProposalPages(
            quotation,
            proposal,
          )
        : [],
    [quotation, proposal],
  );

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

  const override: ProposalPageChromeOverride =
    proposal.pageOverrides[
      chromePageKey
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

  const setOverride = (
    next: ProposalPageChromeOverride,
  ) => {
    setProposal((current) => ({
      ...current,
      pageOverrides: {
        ...current.pageOverrides,
        [chromePageKey]: next,
      },
    }));
  };

  if (loading) {
    return (
      <div className={styles.loading}>
        Loading proposal editor...
      </div>
    );
  }

  if (!quotation || !payload) {
    return (
      <div className={styles.loading}>
        Quotation not found.
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <style>{EDITOR_FALLBACK_CSS}</style>
      <header className={styles.heading}>
        <div>
          <a href="/quotations">
            <ArrowLeft size={14} />
            Quotations
          </a>

          <div>
            <span>
              {quotation.quotationNo} Ãƒâ€šÃ‚Â· Rev{" "}
              {quotation.revisionNo}
            </span>
            <h1>Proposal Editor</h1>
          </div>
        </div>

        <div className={styles.actions}>
          <button
            type="button"
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
            Print preview
          </button>

          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
          >
            <Save size={14} />
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </header>

      <div className={styles.workspace}>
        <section className={styles.editor}>
          <nav className={styles.tabs}>
            {[
              ["cover", "Cover"],
              ["letter", "Application Letter"],
              ["price", "Price Details"],
              ["terms", "Terms & Payment"],
              ["chrome", "Header & Footer"],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={
                  tab === key
                    ? styles.activeTab
                    : ""
                }
                onClick={() =>
                  setTab(key as Tab)
                }
              >
                {label}
              </button>
            ))}
          </nav>

          <div className={styles.panel}>
            {tab === "cover" && (
              <>
                <h2>Page 1 - Proposal / Cover</h2>

                <label>
                  <span>Proposal title</span>
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
                  Page 2 - Application /
                  Proposal Letter
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
                  <span>Proposal body</span>
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
                    Technical heading
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
                    Technical details
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

                <div className={styles.grid3}>
                  <label>
                    <span>Signer name</span>
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

                <div className={styles.infoBox}>
                  <strong>
                    {
                      quotation.items.length
                    }{" "}
                    commercial item(s)
                  </strong>
                  <span>
                    Price pages are generated
                    automatically. The final
                    price page shows amount in
                    words, total and signature.
                  </span>
                </div>

                <label>
                  <span>
                    Rows per price page
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

                <div className={styles.items}>
                  {quotation.items.map(
                    (item, index) => (
                      <div key={item.id}>
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

                <div className={styles.infoBox}>
                  To change item, quantity,
                  rate or commercial totals,
                  use the normal quotation
                  commercial editor.
                </div>
              </>
            )}

            {tab === "terms" && (
              <>
                <h2>
                  Last Page - Terms &
                  Payment
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
                          key as keyof typeof proposal.terms
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
                    Additional terms
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

                <div className={styles.grid3}>
                  <label>
                    <span>Signer name</span>
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

            {tab === "chrome" && (
              <>
                <h2>
                  Header & Footer - Every
                  Page
                </h2>

                <div className={styles.infoBox}>
                  Default header/footer applies
                  to every quotation page.
                  Select a specific generated
                  page below to override it.
                </div>

                <label>
                  <span>Edit</span>
                  <select
                    value={chromePageKey}
                    onChange={(event) =>
                      setChromePageKey(
                        event.target.value,
                      )
                    }
                  >
                    <option value="all">
                      All pages - Default
                    </option>

                    {pageDescriptors.map(
                      (page, index) => (
                        <option
                          key={page.key}
                          value={page.key}
                        >
                          Page {index + 1} -{" "}
                          {page.kind === "cover"
                            ? "Cover"
                            : page.kind ===
                                "letter"
                              ? "Application Letter"
                              : page.kind ===
                                  "terms"
                                ? "Terms & Payment"
                                : `Price Details ${
                                    (page.priceIndex ??
                                      0) + 1
                                  }`}
                        </option>
                      ),
                    )}
                  </select>
                </label>

                {chromePageKey === "all" ? (
                  <>
                    <ChromeEditor
                      title="Default Header"
                      block={
                        proposal.defaultHeader
                      }
                      onChange={(
                        defaultHeader,
                      ) =>
                        setProposal(
                          (current) => ({
                            ...current,
                            defaultHeader,
                          }),
                        )
                      }
                    />

                    <ChromeEditor
                      title="Default Footer"
                      block={
                        proposal.defaultFooter
                      }
                      onChange={(
                        defaultFooter,
                      ) =>
                        setProposal(
                          (current) => ({
                            ...current,
                            defaultFooter,
                          }),
                        )
                      }
                    />
                  </>
                ) : (
                  <>
                    <div
                      className={
                        styles.overrideChecks
                      }
                    >
                      <label>
                        <input
                          type="checkbox"
                          checked={
                            override.useHeader
                          }
                          onChange={(event) =>
                            setOverride({
                              ...override,
                              useHeader:
                                event.target
                                  .checked,
                            })
                          }
                        />
                        Custom header for this
                        page
                      </label>

                      <label>
                        <input
                          type="checkbox"
                          checked={
                            override.useFooter
                          }
                          onChange={(event) =>
                            setOverride({
                              ...override,
                              useFooter:
                                event.target
                                  .checked,
                            })
                          }
                        />
                        Custom footer for this
                        page
                      </label>
                    </div>

                    {override.useHeader && (
                      <ChromeEditor
                        title="Page Header"
                        block={override.header}
                        onChange={(header) =>
                          setOverride({
                            ...override,
                            header,
                          })
                        }
                      />
                    )}

                    {override.useFooter && (
                      <ChromeEditor
                        title="Page Footer"
                        block={override.footer}
                        onChange={(footer) =>
                          setOverride({
                            ...override,
                            footer,
                          })
                        }
                      />
                    )}
                  </>
                )}

                <label
                  className={
                    styles.checkbox
                  }
                >
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
                  Show page number
                </label>
              </>
            )}
          </div>
        </section>

        <section className={styles.preview}>
          <div className={styles.previewTitle}>
            <strong>
              Live multi-page preview
            </strong>
            <span>
              Cover ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ Letter ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ Price
              Page(s) ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ Terms
            </span>
          </div>

          <div className={styles.previewScale}>
            <QuotationProposalRenderer
              quotation={quotation}
              client={client}
              project={project}
              proposal={proposal}
              compact
            />
          </div>
        </section>
      </div>
    </div>
  );
}