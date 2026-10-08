"use client";

import {
  ArrowLeft,
  FileText,
  Printer,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
} from "react";
import type {
  Client,
  Project,
} from "@/types/workspace";
import type { Quotation } from "@/types/quotation";
import type {
  QuotationHeaderFooterBlock,
  QuotationLayout,
} from "@/types/quotation-layout";
import styles from "./quotation-print-preview.module.css";

type QuotationPayload = {
  quotations: Quotation[];
  clients: Client[];
  projects: Project[];
};

function defaultBlock(
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

function fallbackLayout(
  quotationId: string,
): QuotationLayout {
  return {
    quotationId,
    header: defaultBlock("ASB Lift", 18),
    footer: defaultBlock("", 14),
    firstPageDifferent: false,
    firstPageHeader: defaultBlock("", 18),
    firstPageFooter: defaultBlock("", 14),
    showQuotationMeta: true,
    showPageNumber: true,
    updatedAt: "",
  };
}

function money(value: number) {
  return new Intl.NumberFormat("en-BD", {
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function chunks<T>(
  values: T[],
  size: number,
): T[][] {
  const output: T[][] = [];

  for (let index = 0; index < values.length; index += size) {
    output.push(values.slice(index, index + size));
  }

  return output.length > 0 ? output : [[]];
}

function HeaderFooter({
  block,
  className,
}: {
  block: QuotationHeaderFooterBlock;
  className: string;
}) {
  if (block.mode === "none") return null;

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

export function QuotationPrintPreview() {
  const [quotationId, setQuotationId] =
    useState("");
  const [payload, setPayload] =
    useState<QuotationPayload | null>(null);
  const [layout, setLayout] =
    useState<QuotationLayout | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setQuotationId(
      new URLSearchParams(window.location.search).get("id") ??
        "",
    );
  }, []);

  useEffect(() => {
    if (!quotationId) return;

    let active = true;

    void (async () => {
      try {
        const [quotationResponse, layoutResponse] =
          await Promise.all([
            fetch("/api/quotations", {
              cache: "no-store",
            }),
            fetch(
              `/api/quotation-layouts?quotationId=${encodeURIComponent(
                quotationId,
              )}`,
              {
                cache: "no-store",
              },
            ),
          ]);

        const quotationPayload =
          (await quotationResponse.json()) as QuotationPayload;

        const layoutPayload =
          await layoutResponse.json();

        if (!active) return;

        setPayload(quotationPayload);

        setLayout(
          layoutResponse.ok && layoutPayload.layout
            ? layoutPayload.layout
            : fallbackLayout(quotationId),
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
        (record) => record.id === quotationId,
      ) ?? null,
    [payload, quotationId],
  );

  const client = useMemo(
    () =>
      payload?.clients.find(
        (record) => record.id === quotation?.clientId,
      ) ?? null,
    [payload, quotation],
  );

  const project = useMemo(
    () =>
      payload?.projects.find(
        (record) => record.id === quotation?.projectId,
      ) ?? null,
    [payload, quotation],
  );

  const pages = useMemo(
    () =>
      quotation
        ? chunks(quotation.items, 12)
        : [[]],
    [quotation],
  );

  if (loading) {
    return (
      <div className={styles.loading}>
        Loading quotation preview...
      </div>
    );
  }

  if (!quotation || !layout) {
    return (
      <div className={styles.loading}>
        Quotation not found.
      </div>
    );
  }

  return (
    <div className={styles.screen}>
      <header className={styles.toolbar}>
        <div>
          <a
            href={`/quotations?selected=${encodeURIComponent(
              quotation.id,
            )}`}
          >
            <ArrowLeft size={14} />
            Back
          </a>

          <div>
            <strong>
              {quotation.quotationNo} · Rev{" "}
              {quotation.revisionNo}
            </strong>
            <span>Print preview</span>
          </div>
        </div>

        <div className={styles.toolbarActions}>
          <a
            href={`/quotations/header-footer?id=${encodeURIComponent(
              quotation.id,
            )}`}
          >
            <FileText size={14} />
            Header & Footer
          </a>

          <button
            type="button"
            onClick={() => window.print()}
          >
            <Printer size={14} />
            Print
          </button>
        </div>
      </header>

      <main className={styles.stage}>
        {pages.map((items, pageIndex) => {
          const first = pageIndex === 0;
          const last = pageIndex === pages.length - 1;

          const header =
            first && layout.firstPageDifferent
              ? layout.firstPageHeader
              : layout.header;

          const footer =
            first && layout.firstPageDifferent
              ? layout.firstPageFooter
              : layout.footer;

          return (
            <article
              key={pageIndex}
              className={styles.paper}
            >
              <HeaderFooter
                block={header}
                className={styles.paperHeader}
              />

              <div className={styles.body}>
                {first && layout.showQuotationMeta && (
                  <div className={styles.meta}>
                    <div>
                      <span>Quotation</span>
                      <strong>
                        {quotation.quotationNo}
                      </strong>
                    </div>

                    <div>
                      <span>Revision</span>
                      <strong>
                        {quotation.revisionNo}
                      </strong>
                    </div>

                    <div>
                      <span>Date</span>
                      <strong>
                        {quotation.quotationDate}
                      </strong>
                    </div>

                    <div>
                      <span>Validity</span>
                      <strong>
                        {quotation.validityDays} days
                      </strong>
                    </div>
                  </div>
                )}

                {first && (
                  <>
                    <div className={styles.clientBlock}>
                      <span>Client</span>
                      <strong>
                        {client?.name || "Unknown client"}
                      </strong>
                      <small>
                        {project?.name || "Direct quotation"}
                      </small>
                    </div>

                    <div className={styles.subject}>
                      <span>Subject</span>
                      <h1>
                        {quotation.subject ||
                          quotation.title}
                      </h1>
                    </div>
                  </>
                )}

                {!first && (
                  <div className={styles.continued}>
                    {quotation.quotationNo} · Continued
                  </div>
                )}

                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>SL</th>
                      <th>Description</th>
                      <th>Qty</th>
                      <th>Rate</th>
                      <th>Total</th>
                    </tr>
                  </thead>

                  <tbody>
                    {items.map((item, itemIndex) => (
                      <tr key={item.id}>
                        <td>
                          {pageIndex * 12 +
                            itemIndex +
                            1}
                        </td>
                        <td>{item.description}</td>
                        <td>
                          {item.quantity}{" "}
                          {item.unit || "unit"}
                        </td>
                        <td>
                          {money(item.rate)}
                        </td>
                        <td>
                          {money(item.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {last && (
                  <>
                    <div className={styles.totals}>
                      <div>
                        <span>Subtotal</span>
                        <strong>
                          {quotation.currency}{" "}
                          {money(quotation.subtotal)}
                        </strong>
                      </div>

                      {quotation.discount > 0 && (
                        <div>
                          <span>Discount</span>
                          <strong>
                            - {quotation.currency}{" "}
                            {money(quotation.discount)}
                          </strong>
                        </div>
                      )}

                      {quotation.vatAmount > 0 && (
                        <div>
                          <span>
                            VAT ({quotation.vatPercent}%)
                          </span>
                          <strong>
                            {quotation.currency}{" "}
                            {money(quotation.vatAmount)}
                          </strong>
                        </div>
                      )}

                      {quotation.taxAmount > 0 && (
                        <div>
                          <span>
                            Tax ({quotation.taxPercent}%)
                          </span>
                          <strong>
                            {quotation.currency}{" "}
                            {money(quotation.taxAmount)}
                          </strong>
                        </div>
                      )}

                      {quotation.otherCharge > 0 && (
                        <div>
                          <span>Other charge</span>
                          <strong>
                            {quotation.currency}{" "}
                            {money(
                              quotation.otherCharge,
                            )}
                          </strong>
                        </div>
                      )}

                      <div className={styles.grand}>
                        <span>Grand Total</span>
                        <strong>
                          {quotation.currency}{" "}
                          {money(
                            quotation.grandTotal,
                          )}
                        </strong>
                      </div>
                    </div>

                    {quotation.notes && (
                      <div className={styles.notes}>
                        <strong>Notes</strong>
                        <p>{quotation.notes}</p>
                      </div>
                    )}
                  </>
                )}
              </div>

              <HeaderFooter
                block={footer}
                className={styles.paperFooter}
              />

              {layout.showPageNumber && (
                <div className={styles.pageNumber}>
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