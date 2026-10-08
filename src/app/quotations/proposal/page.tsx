import { Suspense } from "react";
import { QuotationProposalEditor } from "@/components/workspace/quotation-proposal-editor";

export default function QuotationProposalPage() {
  return (
    <Suspense fallback={<div>Loading proposal editor...</div>}>
      <QuotationProposalEditor />
    </Suspense>
  );
}