"use client";

import {
  ArrowLeft,
  Edit3,
  Printer,
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
import type { QuotationProposal } from "@/types/quotation-proposal";
import { QuotationProposalRenderer } from "@/components/workspace/quotation-proposal-renderer";
import styles from "./quotation-proposal-preview.module.css";

const PREVIEW_FALLBACK_CSS = `
.${styles.screen}{
  position:fixed;
  inset:0;
  z-index:99999;
  overflow:auto;
  color:#1b2228;
  background:#e6ebef;
}
.${styles.toolbar}{
  position:sticky;
  top:0;
  z-index:3;
  min-height:62px;
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:14px;
  padding:10px 18px;
  border-bottom:1px solid #d5dde4;
  background:rgba(255,255,255,.98);
}
.${styles.toolbar}>div,
.${styles.actions}{
  display:flex;
  align-items:center;
  gap:10px;
}
.${styles.toolbar} a,
.${styles.toolbar} button{
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
.${styles.actions} button{
  color:#fff;
  border-color:#153e62;
  background:#153e62;
}
.${styles.toolbar} strong{
  display:block;
  color:#173047;
  font-size:10px;
}
.${styles.toolbar} span{
  display:block;
  margin-top:2px;
  color:#718291;
  font-size:8px;
}
.${styles.stage}{
  min-height:100vh;
  padding:28px;
}
.${styles.loading}{
  position:fixed;
  inset:0;
  z-index:99999;
  display:flex;
  align-items:center;
  justify-content:center;
  color:#607384;
  background:#eef2f5;
}
@media print{
  .${styles.screen}{
    position:static;
    overflow:visible;
    background:#fff;
  }
  .${styles.toolbar}{display:none!important}
  .${styles.stage}{padding:0}
}
`;
type Payload = {
  quotations: Quotation[];
  clients: Client[];
  projects: Project[];
};

export function QuotationProposalPreview() {
  const searchParams = useSearchParams();
  const quotationId = searchParams.get("id") ?? "";
  const [payload, setPayload] =
    useState<Payload | null>(null);
  const [proposal, setProposal] =
    useState<QuotationProposal | null>(null);
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

        if (
          proposalResponse.ok &&
          proposalPayload.proposal
        ) {
          setProposal(
            proposalPayload.proposal,
          );
        }
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

  if (loading) {
    return (
      <div className={styles.loading}>
        Loading full quotation preview...
      </div>
    );
  }

  if (!quotation || !proposal) {
    return (
      <div className={styles.loading}>
        Quotation proposal not found.
      </div>
    );
  }

  return (
    <div className={styles.screen}>
      <style>{PREVIEW_FALLBACK_CSS}</style>
      <header className={styles.toolbar}>
        <div>
          <a href="/quotations">
            <ArrowLeft size={14} />
            Quotations
          </a>

          <div>
            <strong>
              {quotation.quotationNo} Ã‚Â· Rev{" "}
              {quotation.revisionNo}
            </strong>
            <span>
              Full proposal print preview
            </span>
          </div>
        </div>

        <div className={styles.actions}>
          <a
            href={`/quotations/proposal?id=${encodeURIComponent(
              quotation.id,
            )}`}
          >
            <Edit3 size={14} />
            Edit
          </a>

          <button
            type="button"
            onClick={() => window.print()}
          >
            <Printer size={14} />
            Print / Save PDF
          </button>
        </div>
      </header>

      <main className={styles.stage}>
        <QuotationProposalRenderer
          quotation={quotation}
          client={client}
          project={project}
          proposal={proposal}
        />
      </main>
    </div>
  );
}