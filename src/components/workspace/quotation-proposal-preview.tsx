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
      <header className={styles.toolbar}>
        <div>
          <a href="/quotations">
            <ArrowLeft size={14} />
            Quotations
          </a>

          <div>
            <strong>
              {quotation.quotationNo} Â· Rev{" "}
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