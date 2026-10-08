export type QuotationHeaderFooterMode = "none" | "text" | "image";
export type QuotationHeaderFooterAlign = "left" | "center" | "right";

export type QuotationHeaderFooterBlock = {
  mode: QuotationHeaderFooterMode;
  text: string;
  imageData: string;
  align: QuotationHeaderFooterAlign;
  heightMm: number;
};

export type QuotationLayout = {
  quotationId: string;
  header: QuotationHeaderFooterBlock;
  footer: QuotationHeaderFooterBlock;
  firstPageDifferent: boolean;
  firstPageHeader: QuotationHeaderFooterBlock;
  firstPageFooter: QuotationHeaderFooterBlock;
  showQuotationMeta: boolean;
  showPageNumber: boolean;
  updatedAt: string;
};