"use client";

import type {
  Client,
  Project,
} from "@/types/workspace";
import type { Quotation } from "@/types/quotation";
import type {
  ProposalChromeBlock,
  QuotationProposal,
} from "@/types/quotation-proposal";
import styles from "./quotation-proposal-renderer.module.css";

type PageDescriptor = {
  key: string;
  kind: "cover" | "letter" | "price" | "terms";
  priceIndex?: number;
  itemsStart?: number;
  itemsEnd?: number;
};

function money(value: number) {
  return new Intl.NumberFormat("en-BD", {
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function wordsUnderThousand(value: number) {
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
  const output: string[] = [];

  if (number >= 100) {
    output.push(
      `${ones[Math.floor(number / 100)]} Hundred`,
    );
    number %= 100;
  }

  if (number >= 20) {
    output.push(tens[Math.floor(number / 10)]);
    number %= 10;
  }

  if (number > 0) {
    output.push(ones[number]);
  }

  return output.join(" ");
}

function amountInWords(value: number) {
  const number = Math.max(
    0,
    Math.round(Number(value) || 0),
  );

  if (number === 0) return "Zero Taka Only";

  const crore = Math.floor(number / 10000000);
  const lakh = Math.floor(
    (number % 10000000) / 100000,
  );
  const thousand = Math.floor(
    (number % 100000) / 1000,
  );
  const remainder = number % 1000;

  const parts: string[] = [];

  if (crore) {
    parts.push(
      `${wordsUnderThousand(crore)} Crore`,
    );
  }
  if (lakh) {
    parts.push(
      `${wordsUnderThousand(lakh)} Lakh`,
    );
  }
  if (thousand) {
    parts.push(
      `${wordsUnderThousand(thousand)} Thousand`,
    );
  }
  if (remainder) {
    parts.push(
      wordsUnderThousand(remainder),
    );
  }

  return `${parts.join(" ")} Taka Only`;
}

export function buildProposalPages(
  quotation: Quotation,
  proposal: QuotationProposal,
): PageDescriptor[] {
  const rows = Math.max(
    5,
    proposal.priceRowsPerPage || 12,
  );

  const pricePageCount = Math.max(
    1,
    Math.ceil(quotation.items.length / rows),
  );

  const pages: PageDescriptor[] = [
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
    let priceIndex = 0;
    priceIndex < pricePageCount;
    priceIndex += 1
  ) {
    pages.push({
      key: `price-${priceIndex + 1}`,
      kind: "price",
      priceIndex,
      itemsStart: priceIndex * rows,
      itemsEnd: Math.min(
        quotation.items.length,
        (priceIndex + 1) * rows,
      ),
    });
  }

  pages.push({
    key: "terms",
    kind: "terms",
  });

  return pages;
}

function effectiveChrome(
  pageKey: string,
  type: "header" | "footer",
  proposal: QuotationProposal,
): ProposalChromeBlock {
  const override =
    proposal.pageOverrides[pageKey];

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
  block,
  className,
}: {
  block: ProposalChromeBlock;
  className: string;
}) {
  if (block.mode === "none") {
    return null;
  }

  return (
    <div
      className={className}
      style={{
        minHeight: `${block.heightMm}mm`,
        textAlign: block.align,
      }}
    >
      {block.mode === "text" ? (
        <div>{block.text}</div>
      ) : block.imageData ? (
        <img
          src={block.imageData}
          alt=""
        />
      ) : null}
    </div>
  );
}

type Props = {
  quotation: Quotation;
  client: Client | null;
  project: Project | null;
  proposal: QuotationProposal;
  compact?: boolean;
};

export function QuotationProposalRenderer({
  quotation,
  client,
  project,
  proposal,
  compact = false,
}: Props) {
  const pages = buildProposalPages(
    quotation,
    proposal,
  );

  const pricePages = pages.filter(
    (page) => page.kind === "price",
  );

  return (
    <div
      className={`${styles.stack} ${
        compact ? styles.compact : ""
      }`}
    >
      {pages.map((page, pageIndex) => {
        const header = effectiveChrome(
          page.key,
          "header",
          proposal,
        );

        const footer = effectiveChrome(
          page.key,
          "footer",
          proposal,
        );

        const isFinalPrice =
          page.kind === "price" &&
          page.priceIndex ===
            pricePages.length - 1;

        const items =
          page.kind === "price"
            ? quotation.items.slice(
                page.itemsStart ?? 0,
                page.itemsEnd ??
                  quotation.items.length,
              )
            : [];

        return (
          <article
            key={page.key}
            className={styles.paper}
            data-proposal-page={page.key}
          >
            <Chrome
              block={header}
              className={styles.header}
            />

            <div className={styles.body}>
              {page.kind === "cover" && (
                <section className={styles.cover}>
                  <h1>
                    {proposal.cover.proposalTitle}
                  </h1>

                  <div className={styles.coverPrepared}>
                    <span>Prepared For :</span>
                    <strong>
                      {proposal.cover.preparedFor ||
                        project?.name ||
                        client?.name ||
                        "Client"}
                    </strong>
                    <p>
                      {proposal.cover
                        .preparedForAddress ||
                        client?.address ||
                        ""}
                    </p>
                  </div>

                  <div className={styles.coverPrepared}>
                    <span>Prepared By:</span>
                    <strong>
                      {proposal.cover.preparedBy}
                    </strong>
                    <p>
                      {proposal.cover
                        .preparedByAddress}
                    </p>
                  </div>

                  <div className={styles.submission}>
                    Submission Date:{" "}
                    {proposal.cover
                      .submissionDate ||
                      quotation.quotationDate}
                  </div>
                </section>
              )}

              {page.kind === "letter" && (
                <section className={styles.letter}>
                  <div className={styles.dateRight}>
                    {proposal.cover.submissionDate ||
                      quotation.quotationDate}
                  </div>

                  <div className={styles.toBlock}>
                    <strong>To</strong>
                    <strong>
                      {proposal.letter.toDesignation}
                    </strong>
                    <span>
                      {project?.name ||
                        client?.name ||
                        ""}
                    </span>
                    <span>
                      {client?.address || ""}
                    </span>
                  </div>

                  <div className={styles.letterSubject}>
                    <strong>Subject:</strong>{" "}
                    <span>
                      {proposal.letter.subject}
                    </span>
                  </div>

                  <p>{proposal.letter.greeting}</p>

                  <p className={styles.preWrap}>
                    {proposal.letter.body}
                  </p>

                  {proposal.letter
                    .technicalDetails && (
                    <div>
                      <h3>
                        {
                          proposal.letter
                            .technicalHeading
                        }
                      </h3>

                      <p
                        className={styles.preWrap}
                      >
                        {
                          proposal.letter
                            .technicalDetails
                        }
                      </p>
                    </div>
                  )}

                  <div className={styles.signature}>
                    <strong>
                      {proposal.letter.signerName}
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
                <section className={styles.price}>
                  <div className={styles.dateRight}>
                    {proposal.cover.submissionDate ||
                      quotation.quotationDate}
                  </div>

                  <h2>
                    PRODUCT DETAILS OF THIS OFFER
                  </h2>

                  <table className={styles.table}>
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
                      {items.map(
                        (item, localIndex) => (
                          <tr key={item.id}>
                            <td>
                              {(page.itemsStart ??
                                0) +
                                localIndex +
                                1}
                            </td>
                            <td>
                              {item.description}
                            </td>
                            <td>
                              {item.quantity}{" "}
                              {item.unit}
                            </td>
                            <td>
                              {money(item.rate)}
                            </td>
                            <td>
                              {money(item.total)}
                            </td>
                          </tr>
                        ),
                      )}

                      {items.length === 0 && (
                        <tr>
                          <td>1</td>
                          <td colSpan={4}>
                            No commercial item added.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>

                  {isFinalPrice && (
                    <>
                      <div className={styles.amountRow}>
                        <span>
                          {amountInWords(
                            quotation.grandTotal,
                          )}
                        </span>

                        <div>
                          <span>Total</span>
                          <strong>
                            {quotation.currency}{" "}
                            {money(
                              quotation.grandTotal,
                            )}
                          </strong>
                        </div>
                      </div>

                      <div
                        className={styles.signature}
                      >
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
                  )}

                  {!isFinalPrice && (
                    <div
                      className={
                        styles.continued
                      }
                    >
                      Continued on next page
                    </div>
                  )}
                </section>
              )}

              {page.kind === "terms" && (
                <section className={styles.terms}>
                  <div className={styles.dateRight}>
                    {proposal.cover.submissionDate ||
                      quotation.quotationDate}
                  </div>

                  <h2>Terms & Conditions:</h2>

                  <div className={styles.termGrid}>
                    <strong>Validity</strong>
                    <span>
                      {proposal.terms.validity}
                    </span>

                    <strong>Warranty</strong>
                    <span>
                      {proposal.terms.warranty}
                    </span>

                    <strong>Delivery</strong>
                    <span>
                      {proposal.terms.delivery}
                    </span>

                    <strong>Payment</strong>
                    <span>
                      {proposal.terms.payment}
                    </span>

                    <strong>Handover</strong>
                    <span>
                      {proposal.terms.handover}
                    </span>
                  </div>

                  {proposal.terms
                    .additionalTerms && (
                    <p className={styles.preWrap}>
                      {
                        proposal.terms
                          .additionalTerms
                      }
                    </p>
                  )}

                  <div className={styles.signature}>
                    <strong>
                      {proposal.terms.signerName}
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
              block={footer}
              className={styles.footer}
            />

            {proposal.showPageNumber && (
              <div className={styles.pageNumber}>
                Page {pageIndex + 1} of{" "}
                {pages.length}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}