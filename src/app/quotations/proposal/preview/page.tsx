import { Suspense } from "react";
import { QuotationProposalPreview } from "@/components/workspace/quotation-proposal-preview";

export default function QuotationProposalPreviewPage() {
  return (
    <Suspense fallback={<div>Loading quotation preview...</div>}>
      <QuotationProposalPreview />
    </Suspense>
  );
}