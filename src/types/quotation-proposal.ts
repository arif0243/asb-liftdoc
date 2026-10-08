export type ProposalChromeMode = "none" | "text" | "image";
export type ProposalChromeAlign = "left" | "center" | "right";

export type ProposalChromeBlock = {
  mode: ProposalChromeMode;
  text: string;
  imageData: string;
  imageWidthMm?: number;
  imageHeightMm?: number;
  imageLockRatio?: boolean;
  imageAspectRatio?: number;
  align: ProposalChromeAlign;
  heightMm: number;
  pageEdgeGapMm?: number;
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
  preparedForLogoData: string;
  preparedForLogoWidthMm: number;
  preparedForLogoHeightMm: number;
  preparedForLogoLockRatio: boolean;
  preparedForLogoAspectRatio: number;
  preparedForAddress: string;
  preparedBy: string;
  preparedByLogoData: string;
  preparedByLogoWidthMm: number;
  preparedByLogoHeightMm: number;
  preparedByLogoLockRatio: boolean;
  preparedByLogoAspectRatio: number;
  preparedByAddress: string;
  preparedByAddressFontSizePt?: number;
  preparedByAddressColor?: string;
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
  boldAllText?: boolean;
  priceRowsPerPage: number;

  updatedAt: string;
};