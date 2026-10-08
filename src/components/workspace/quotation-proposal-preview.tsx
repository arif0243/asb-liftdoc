"use client";

import {
  Edit3,
  Printer,
  X,
} from "lucide-react";
import {
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

type ProposalPage = {
  key: string;
  kind: "cover" | "letter" | "price" | "terms";
  priceIndex?: number;
  start?: number;
  end?: number;
};

const CSS = `
* {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  padding: 0;
}

.asb-q-preview {
  position: fixed;
  inset: 0;
  z-index: 999999;
  overflow: auto;
  color: #161b20;
  background: #dfe5ea;
  font-family: Arial, Helvetica, sans-serif;
}

.asb-q-preview.asb-q-embed {
  position: relative;
  inset: auto;
  z-index: auto;
  width: 100%;
  min-height: 100%;
  overflow-x: hidden;
  overflow-y: auto;
  background: #e6ebef;
}

.asb-q-toolbar {
  position: sticky;
  top: 0;
  z-index: 10;
  min-height: 64px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 18px;
  border-bottom: 1px solid #d2dae1;
  background: rgba(255,255,255,.98);
  box-shadow: 0 3px 16px rgba(18,35,50,.08);
}

.asb-q-embed .asb-q-toolbar {
  display: none;
}

.asb-q-toolbar-left,
.asb-q-toolbar-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.asb-q-toolbar-title strong {
  display: block;
  color: #132b42;
  font-size: 13px;
}

.asb-q-toolbar-title span {
  display: block;
  margin-top: 3px;
  color: #71808d;
  font-size: 10px;
}

.asb-q-btn {
  min-height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 8px 11px;
  border: 1px solid #cad5de;
  border-radius: 8px;
  background: #fff;
  color: #284157;
  font-size: 10px;
  font-weight: 800;
  text-decoration: none;
  cursor: pointer;
}

.asb-q-btn-primary {
  border-color: #153e62;
  background: #153e62;
  color: #fff;
}

.asb-q-stage {
  display: grid;
  justify-items: center;
  gap: 28px;
  padding: 30px 20px 48px;
}

.asb-q-embed .asb-q-stage {
  gap: 18px;
  padding: 18px 10px 30px;
}

.asb-q-page {
  position: relative;
  width: 210mm;
  height: 297mm;
  display: flex;
  flex-direction: column;
  overflow: hidden;

  /* Fixed 1 inch blank area at left and right */
  padding: 10mm 25.4mm 10mm;

  color: #111;
  background: #fff;
  box-shadow: 0 16px 42px rgba(16,32,48,.18);
  page-break-after: always;
}

.asb-q-embed .asb-q-page {
  zoom: .52;
  box-shadow: 0 10px 26px rgba(16,32,48,.16);
}

.asb-q-page:last-child {
  page-break-after: auto;
}

.asb-q-header,
.asb-q-footer {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  overflow: hidden;
  white-space: pre-wrap;
  color: #1e2933;
  font-size: 8.5pt;
}

.asb-q-header {
  border-bottom: .25mm solid #d2d8de;
}

.asb-q-footer {
  margin-top: auto;
  border-top: .25mm solid #d2d8de;
}

.asb-q-header img,
.asb-q-footer img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.asb-q-body {
  flex: 1 1 auto;
  min-height: 0;
  padding-top: 5mm;
}

.asb-q-cover {
  height: 100%;
  display: grid;
  grid-template-rows: auto 1fr 1fr auto;
  align-items: center;
  text-align: center;
}

.asb-q-cover h1 {
  max-width: 150mm;
  margin: 8mm auto 0;
  font-family: Georgia, "Times New Roman", serif;
  font-size: 22pt;
  line-height: 1.35;
  font-weight: 500;
  overflow-wrap: anywhere;
}

.asb-q-cover-block {
  display: grid;
  justify-items: center;
  gap: 2mm;
}

.asb-q-cover-block span {
  font-size: 9.5pt;
  font-weight: 700;
}

.asb-q-cover-block strong {
  color: #142c43;
  font-size: 15pt;
}

.asb-q-cover-block p {
  max-width: 145mm;
  margin: 0;
  font-size: 10pt;
  line-height: 1.4;
  white-space: pre-wrap;
}

.asb-q-cover-logo {
  max-width: 100%;
  object-fit: contain;
  margin: 1mm 0 2mm;
}

.asb-q-submission {
  padding-bottom: 8mm;
  font-size: 10pt;
  font-weight: 700;
}

.asb-q-letter,
.asb-q-price,
.asb-q-terms {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  color: #111;
  font-family: Georgia, "Times New Roman", serif;
  font-size: 10.5pt;
  line-height: 1.42;
}

.asb-q-date {
  margin-bottom: 7mm;
  text-align: right;
}

.asb-q-to {
  display: grid;
  gap: .5mm;
  margin-bottom: 10mm;
}

.asb-q-subject {
  margin-bottom: 5mm;
}

.asb-q-subject span {
  font-weight: 700;
  text-decoration: underline;
}

.asb-q-letter p {
  margin: 0 0 5mm;
}

.asb-q-pre {
  white-space: pre-wrap;
}

.asb-q-tech-title {
  margin: 6mm 0 2mm;
  font-size: 10.5pt;
  text-decoration: underline;
}

.asb-q-signature {
  width: fit-content;
  display: grid;
  gap: .5mm;
  margin-top: auto;
  padding-bottom: 8mm;
}

.asb-q-signature strong {
  min-height: 10mm;
}

.asb-q-price h2,
.asb-q-terms h2 {
  margin: 0 0 5mm;
  font-size: 13pt;
  text-decoration: underline;
}

.asb-q-price h2 {
  text-align: center;
}

.asb-q-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.asb-q-table th,
.asb-q-table td {
  padding: 1.8mm;
  border: .25mm solid #222;
  vertical-align: top;
  font-size: 8.4pt;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.asb-q-table th {
  font-weight: 700;
  text-align: center;
}

.asb-q-table th:nth-child(1),
.asb-q-table td:nth-child(1) {
  width: 9mm;
  text-align: center;
}

.asb-q-table th:nth-child(3),
.asb-q-table td:nth-child(3) {
  width: 25mm;
  text-align: center;
}

.asb-q-table th:nth-child(4),
.asb-q-table td:nth-child(4),
.asb-q-table th:nth-child(5),
.asb-q-table td:nth-child(5) {
  width: 27mm;
  text-align: right;
}

.asb-q-total-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8mm;
  align-items: center;
  padding: 2.8mm;
  border: .25mm solid #222;
  border-top: 0;
  font-size: 9pt;
}

.asb-q-total-value {
  display: flex;
  align-items: center;
  gap: 5mm;
}

.asb-q-continued {
  margin-top: auto;
  padding-bottom: 8mm;
  color: #6a7580;
  font-style: italic;
  text-align: right;
}

.asb-q-terms-grid {
  display: grid;
  grid-template-columns: 32mm 1fr;
  gap: 4mm 7mm;
  margin-top: 3mm;
}

.asb-q-terms-grid strong {
  text-align: right;
}

.asb-q-page-no {
  position: absolute;
  right: 25.4mm;
  bottom: 3.5mm;
  color: #7f8992;
  font-size: 6.5pt;
}

.asb-q-loading {
  min-height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #eef2f5;
  color: #5f7180;
  font-size: 14px;
}

@media print {
  @page {
    size: A4 portrait;
    margin: 0;
  }

  html,
  body {
    margin: 0 !important;
    padding: 0 !important;
    background: #fff !important;
  }

  .asb-q-preview {
    position: static;
    overflow: visible;
    background: #fff;
  }

  .asb-q-toolbar {
    display: none !important;
  }

  .asb-q-stage {
    display: block;
    padding: 0;
  }

  .asb-q-page,
  .asb-q-embed .asb-q-page {
    zoom: 1;
    margin: 0;
    box-shadow: none;
    break-after: page;
    page-break-after: always;
  }

  .asb-q-page:last-child {
    break-after: auto;
    page-break-after: auto;
  }
}
`;

function money(value: number) {
  return new Intl.NumberFormat("en-BD", {
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function underThousand(value: number) {
  const ones = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
  ];

  const tens = [
    "",
    "",
    "Twenty",
    "Thirty",
    "Forty",
    "Fifty",
    "Sixty",
    "Seventy",
    "Eighty",
    "Ninety",
  ];

  let number = value;
  const parts: string[] = [];

  if (number >= 100) {
    parts.push(
      `${ones[Math.floor(number / 100)]} Hundred`,
    );
    number %= 100;
  }

  if (number >= 20) {
    parts.push(tens[Math.floor(number / 10)]);
    number %= 10;
  }

  if (number > 0) {
    parts.push(ones[number]);
  }

  return parts.join(" ");
}

function amountInWords(value: number) {
  const number = Math.max(
    0,
    Math.round(Number(value) || 0),
  );

  if (number === 0) {
    return "Zero Taka Only";
  }

  const crore = Math.floor(number / 10000000);
  const lakh = Math.floor(
    (number % 10000000) / 100000,
  );
  const thousand = Math.floor(
    (number % 100000) / 1000,
  );
  const rest = number % 1000;

  const parts: string[] = [];

  if (crore) {
    parts.push(
      `${underThousand(crore)} Crore`,
    );
  }

  if (lakh) {
    parts.push(
      `${underThousand(lakh)} Lakh`,
    );
  }

  if (thousand) {
    parts.push(
      `${underThousand(thousand)} Thousand`,
    );
  }

  if (rest) {
    parts.push(underThousand(rest));
  }

  return `${parts.join(" ")} Taka Only`;
}

function buildPages(
  quotation: Quotation,
  proposal: QuotationProposal,
): ProposalPage[] {
  const rows = Math.max(
    5,
    Number(proposal.priceRowsPerPage) || 12,
  );

  const priceCount = Math.max(
    1,
    Math.ceil(quotation.items.length / rows),
  );

  const pages: ProposalPage[] = [
    {
      key: "cover",
      kind: "cover",
    },
    {
      key: "letter",
      kind: "letter",
    },
  ];

  for (
    let index = 0;
    index < priceCount;
    index += 1
  ) {
    pages.push({
      key: `price-${index + 1}`,
      kind: "price",
      priceIndex: index,
      start: index * rows,
      end: Math.min(
        quotation.items.length,
        (index + 1) * rows,
      ),
    });
  }

  pages.push({
    key: "terms",
    kind: "terms",
  });

  return pages;
}

function resolveChrome(
  proposal: QuotationProposal,
  pageKey: string,
  type: "header" | "footer",
): ProposalChromeBlock {
  const override:
    | ProposalPageChromeOverride
    | undefined =
    proposal.pageOverrides?.[pageKey];

  if (
    type === "header" &&
    override?.useHeader
  ) {
    return override.header;
  }

  if (
    type === "footer" &&
    override?.useFooter
  ) {
    return override.footer;
  }

  return type === "header"
    ? proposal.defaultHeader
    : proposal.defaultFooter;
}

function Chrome({
  value,
  className,
}: {
  value: ProposalChromeBlock;
  className: string;
}) {
  if (!value || value.mode === "none") {
    return null;
  }

  const imageWidth =
    Number(value.imageWidthMm) > 0
      ? Math.min(
          159.2,
          Number(value.imageWidthMm),
        )
      : 159.2;

  const imageHeight =
    Number(value.imageHeightMm) > 0
      ? Math.min(
          60,
          Number(value.imageHeightMm),
        )
      : 30;

  const areaHeight =
    value.mode === "image" &&
    value.imageData
      ? Math.max(
          Number(value.heightMm) || 12,
          imageHeight + 2,
        )
      : Number(value.heightMm) || 12;

  return (
    <div
      className={className}
      style={{
        minHeight: `${areaHeight}mm`,
        justifyContent:
          value.align === "left"
            ? "flex-start"
            : value.align === "right"
              ? "flex-end"
              : "center",
        textAlign:
          value.align || "center",
      }}
    >
      {value.mode === "image" &&
      value.imageData ? (
        <img
          src={value.imageData}
          alt=""
          style={{
            width: `${imageWidth}mm`,
            height: `${imageHeight}mm`,
            maxWidth: "100%",
            objectFit: "contain",
            flex: "0 0 auto",
          }}
        />
      ) : (
        <div>{value.text}</div>
      )}
    </div>
  );
}

export function QuotationProposalPreview() {
  const searchParams = useSearchParams();

  const quotationId =
    searchParams.get("id") ?? "";

  const embed =
    searchParams.get("embed") === "1";

  const [payload, setPayload] =
    useState<Payload | null>(null);

  const [proposal, setProposal] =
    useState<QuotationProposal | null>(null);

  const [loading, setLoading] =
    useState(Boolean(quotationId));

  useEffect(() => {
    if (!quotationId) {
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

        if (!active) {
          return;
        }

        setPayload(quotationPayload);

        setProposal(
          proposalResponse.ok &&
            proposalPayload.proposal
            ? proposalPayload.proposal
            : null,
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

  const pages = useMemo(
    () =>
      quotation && proposal
        ? buildPages(
            quotation,
            proposal,
          )
        : [],
    [quotation, proposal],
  );

  if (loading) {
    return (
      <div className="asb-q-loading">
        <style>{CSS}</style>
        Loading quotation preview...
      </div>
    );
  }

  if (!quotation || !proposal) {
    return (
      <div className="asb-q-loading">
        <style>{CSS}</style>
        Quotation proposal not found.
      </div>
    );
  }

  const pricePages = pages.filter(
    (page) => page.kind === "price",
  );

  return (
    <div
      className={
        embed
          ? "asb-q-preview asb-q-embed"
          : "asb-q-preview"
      }
    >
      <style>{CSS}</style>

      {!embed && (
        <header className="asb-q-toolbar">
          <div className="asb-q-toolbar-left">
            <button
              type="button"
              className="asb-q-btn"
              onClick={() => {
                if (
                  window.opener &&
                  !window.opener.closed
                ) {
                  window.close();
                  return;
                }

                window.location.href =
                  "/quotations";
              }}
            >
              <X size={14} />
              Close
            </button>

            <div className="asb-q-toolbar-title">
              <strong>
                {quotation.quotationNo} - Rev{" "}
                {quotation.revisionNo}
              </strong>
              <span>
                Full Proposal Preview -{" "}
                {pages.length} pages
              </span>
            </div>
          </div>

          <div className="asb-q-toolbar-right">
            <button
              type="button"
              className="asb-q-btn"
              onClick={() => {
                const editUrl =
                  `/quotations/proposal?id=${encodeURIComponent(
                    quotation.id,
                  )}`;

                if (
                  window.opener &&
                  !window.opener.closed
                ) {
                  window.opener.location.href =
                    editUrl;
                  window.opener.focus();
                  window.close();
                  return;
                }

                window.location.href =
                  editUrl;
              }}
            >
              <Edit3 size={14} />
              Edit
            </button>

            <button
              type="button"
              className="asb-q-btn asb-q-btn-primary"
              onClick={() => window.print()}
            >
              <Printer size={14} />
              Print / Save PDF
            </button>
          </div>
        </header>
      )}

      <main className="asb-q-stage">
        {pages.map((page, pageIndex) => {
          const header = resolveChrome(
            proposal,
            page.key,
            "header",
          );

          const footer = resolveChrome(
            proposal,
            page.key,
            "footer",
          );

          const priceItems =
            page.kind === "price"
              ? quotation.items.slice(
                  page.start ?? 0,
                  page.end ??
                    quotation.items.length,
                )
              : [];

          const isLastPrice =
            page.kind === "price" &&
            page.priceIndex ===
              pricePages.length - 1;

          const preparedFor =
            proposal.cover.preparedFor ||
            project?.name ||
            quotation.title ||
            client?.name ||
            "Client";

          const preparedForAddress =
            proposal.cover
              .preparedForAddress ||
            client?.address ||
            "";

          const submissionDate =
            proposal.cover.submissionDate ||
            quotation.quotationDate;

          return (
            <article
              key={page.key}
              className="asb-q-page"
            >
              <Chrome
                value={header}
                className="asb-q-header"
              />

              <div className="asb-q-body">
                {page.kind === "cover" && (
                  <section className="asb-q-cover">
                    <h1>
                      {proposal.cover
                        .proposalTitle ||
                        quotation.subject ||
                        quotation.title}
                    </h1>

                    <div className="asb-q-cover-block">
                      <span>Prepared For:</span>

                      {proposal.cover
                        .preparedForLogoData && (
                        <img
                          className="asb-q-cover-logo"
                          src={
                            proposal.cover
                              .preparedForLogoData
                          }
                          alt="Prepared For logo"
                          style={{
                            width: `${
                              proposal.cover
                                .preparedForLogoWidthMm ||
                              45
                            }mm`,
                            height: `${
                              proposal.cover
                                .preparedForLogoHeightMm ||
                              20
                            }mm`,
                          }}
                        />
                      )}

                      <strong>
                        {preparedFor}
                      </strong>

                      <p>
                        {preparedForAddress}
                      </p>
                    </div>

                    <div className="asb-q-cover-block">
                      <span>Prepared By:</span>

                      {proposal.cover
                        .preparedByLogoData && (
                        <img
                          className="asb-q-cover-logo"
                          src={
                            proposal.cover
                              .preparedByLogoData
                          }
                          alt="Prepared By logo"
                          style={{
                            width: `${
                              proposal.cover
                                .preparedByLogoWidthMm ||
                              45
                            }mm`,
                            height: `${
                              proposal.cover
                                .preparedByLogoHeightMm ||
                              20
                            }mm`,
                          }}
                        />
                      )}

                      <strong>
                        {proposal.cover
                          .preparedBy ||
                          "ASB Lift"}
                      </strong>

                      <p>
                        {
                          proposal.cover
                            .preparedByAddress
                        }
                      </p>
                    </div>

                    <div className="asb-q-submission">
                      Submission Date:{" "}
                      {submissionDate}
                    </div>
                  </section>
                )}

                {page.kind === "letter" && (
                  <section className="asb-q-letter">
                    <div className="asb-q-date">
                      {submissionDate}
                    </div>

                    <div className="asb-q-to">
                      <strong>To</strong>
                      <strong>
                        {
                          proposal.letter
                            .toDesignation
                        }
                      </strong>
                      <span>
                        {preparedFor}
                      </span>
                      <span>
                        {preparedForAddress}
                      </span>
                    </div>

                    <div className="asb-q-subject">
                      <strong>Subject:</strong>{" "}
                      <span>
                        {proposal.letter
                          .subject ||
                          quotation.subject}
                      </span>
                    </div>

                    <p>
                      {proposal.letter.greeting}
                    </p>

                    <p className="asb-q-pre">
                      {proposal.letter.body}
                    </p>

                    {proposal.letter
                      .technicalDetails && (
                      <>
                        <h3 className="asb-q-tech-title">
                          {
                            proposal.letter
                              .technicalHeading
                          }
                        </h3>

                        <p className="asb-q-pre">
                          {
                            proposal.letter
                              .technicalDetails
                          }
                        </p>
                      </>
                    )}

                    <div className="asb-q-signature">
                      <strong>
                        {
                          proposal.letter
                            .signerName
                        }
                      </strong>
                      <span>
                        {
                          proposal.letter
                            .signerDesignation
                        }
                      </span>
                      <span>
                        {
                          proposal.letter
                            .signerCompany
                        }
                      </span>
                    </div>
                  </section>
                )}

                {page.kind === "price" && (
                  <section className="asb-q-price">
                    <div className="asb-q-date">
                      {submissionDate}
                    </div>

                    <h2>
                      PRODUCT DETAILS OF THIS OFFER
                    </h2>

                    <table className="asb-q-table">
                      <thead>
                        <tr>
                          <th>SL</th>
                          <th>Description</th>
                          <th>Quantity</th>
                          <th>Rate</th>
                          <th>Total</th>
                        </tr>
                      </thead>

                      <tbody>
                        {priceItems.length >
                        0 ? (
                          priceItems.map(
                            (
                              item,
                              localIndex,
                            ) => (
                              <tr key={item.id}>
                                <td>
                                  {(page.start ??
                                    0) +
                                    localIndex +
                                    1}
                                </td>
                                <td>
                                  {
                                    item.description
                                  }
                                </td>
                                <td>
                                  {item.quantity}{" "}
                                  {item.unit}
                                </td>
                                <td>
                                  {money(
                                    item.rate,
                                  )}
                                </td>
                                <td>
                                  {money(
                                    item.total,
                                  )}
                                </td>
                              </tr>
                            ),
                          )
                        ) : (
                          <tr>
                            <td>1</td>
                            <td colSpan={4}>
                              No commercial item
                              added.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>

                    {isLastPrice ? (
                      <>
                        <div className="asb-q-total-row">
                          <span>
                            {amountInWords(
                              quotation.grandTotal,
                            )}
                          </span>

                          <div className="asb-q-total-value">
                            <span>Total</span>
                            <strong>
                              {
                                quotation.currency
                              }{" "}
                              {money(
                                quotation.grandTotal,
                              )}
                            </strong>
                          </div>
                        </div>

                        <div className="asb-q-signature">
                          <strong>
                            {
                              proposal.letter
                                .signerName
                            }
                          </strong>
                          <span>
                            {
                              proposal.letter
                                .signerDesignation
                            }
                          </span>
                          <span>
                            {
                              proposal.letter
                                .signerCompany
                            }
                          </span>
                        </div>
                      </>
                    ) : (
                      <div className="asb-q-continued">
                        Continued on next page
                      </div>
                    )}
                  </section>
                )}

                {page.kind === "terms" && (
                  <section className="asb-q-terms">
                    <div className="asb-q-date">
                      {submissionDate}
                    </div>

                    <h2>
                      Terms & Conditions:
                    </h2>

                    <div className="asb-q-terms-grid">
                      <strong>Validity</strong>
                      <span>
                        {
                          proposal.terms
                            .validity
                        }
                      </span>

                      <strong>Warranty</strong>
                      <span>
                        {
                          proposal.terms
                            .warranty
                        }
                      </span>

                      <strong>Delivery</strong>
                      <span>
                        {
                          proposal.terms
                            .delivery
                        }
                      </span>

                      <strong>Payment</strong>
                      <span>
                        {
                          proposal.terms
                            .payment
                        }
                      </span>

                      <strong>Handover</strong>
                      <span>
                        {
                          proposal.terms
                            .handover
                        }
                      </span>
                    </div>

                    {proposal.terms
                      .additionalTerms && (
                      <p className="asb-q-pre">
                        {
                          proposal.terms
                            .additionalTerms
                        }
                      </p>
                    )}

                    <div className="asb-q-signature">
                      <strong>
                        {
                          proposal.terms
                            .signerName
                        }
                      </strong>
                      <span>
                        {
                          proposal.terms
                            .signerDesignation
                        }
                      </span>
                      <span>
                        {
                          proposal.terms
                            .signerCompany
                        }
                      </span>
                    </div>
                  </section>
                )}
              </div>

              <Chrome
                value={footer}
                className="asb-q-footer"
              />

              {proposal.showPageNumber && (
                <div className="asb-q-page-no">
                  Page {pageIndex + 1} of{" "}
                  {pages.length}
                </div>
              )}
            </article>
          );
        })}
      </main>
    </div>
  );
}