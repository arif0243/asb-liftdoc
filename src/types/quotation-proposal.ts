export type ProposalChromeMode = "none" | "text" | "image";
export type ProposalChromeAlign = "left" | "center" | "right";

export type ProposalChromeBlock = {
  mode: ProposalChromeMode;
  text: string;
  imageData: string;
  align: ProposalChromeAlign;
  heightMm: number;
};

export type ProposalPageChromeOverride = {
  useHeader: boolean;
  useFooter: boolean;
  header: ProposalChromeBlock;
  footer: ProposalChromeBlock;
};

export type QuotationProposalCover = {
  proposalTitle: string;
  preparedFor: string;
  preparedForAddress: string;
  preparedBy: string;
  preparedByAddress: string;
  submissionDate: string;
};

export type QuotationProposalLetter = {
  toDesignation: string;
  subject: string;
  greeting: string;
  body: string;
  technicalHeading: string;
  technicalDetails: string;
  signerName: string;
  signerDesignation: string;
  signerCompany: string;
};

export type QuotationProposalTerms = {
  validity: string;
  warranty: string;
  delivery: string;
  payment: string;
  handover: string;
  additionalTerms: string;
  signerName: string;
  signerDesignation: string;
  signerCompany: string;
};

export type QuotationProposal = {
  quotationId: string;
  cover: QuotationProposalCover;
  letter: QuotationProposalLetter;
  terms: QuotationProposalTerms;

  defaultHeader: ProposalChromeBlock;
  defaultFooter: ProposalChromeBlock;
  pageOverrides: Record<string, ProposalPageChromeOverride>;

  showPageNumber: boolean;
  priceRowsPerPage: number;

  updatedAt: string;
};