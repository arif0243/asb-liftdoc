export type PaperSize =
  | "A3"
  | "A4"
  | "A5"
  | "Letter"
  | "Legal"
  | "Custom";

export type PageOrientation = "portrait" | "landscape";
export type HeaderFooterMode = "none" | "manual" | "image";

export type DocumentBlockType =
  | "heading"
  | "text"
  | "field"
  | "divider"
  | "quotation_table"
  | "custom_table"
  | "totals";

export type BlockFlowSettings = {
  pageBreakBefore: boolean;
  keepTogether: boolean;
  allowSplit: boolean;
};

export type QuotationTableSettings = {
  repeatHeader: boolean;
  autoPaginate: boolean;
  rowHeightMm: number;
};

export type AdvancedTableCell = {
  id: string;
  content: string;
  rowSpan: number;
  colSpan: number;
  hidden: boolean;
  align: "left" | "center" | "right";
};

export type AdvancedTableRow = {
  id: string;
  heightMm: number;
  cells: AdvancedTableCell[];
};

export type AdvancedTableConfig = {
  columnWidths: number[];
  rows: AdvancedTableRow[];
  headerRows: number;
  repeatHeader: boolean;
  autoPaginate: boolean;
  borderWidth: number;
  cellPaddingMm: number;
  rowsPerPage: number;
};

export type DocumentBlock = {
  id: string;
  type: DocumentBlockType;
  content: string;
  align: "left" | "center" | "right";
  flow?: BlockFlowSettings;
  quotationTable?: QuotationTableSettings;
  table?: AdvancedTableConfig;
};

export type PageSettings = {
  paperSize: PaperSize;
  orientation: PageOrientation;
  customWidthMm: number;
  customHeightMm: number;

  marginTopMm: number;
  marginBottomMm: number;
  marginLeftMm: number;
  marginRightMm: number;

  headerMode: HeaderFooterMode;
  headerText: string;
  headerImageData: string;
  headerHeightMm: number;

  footerMode: HeaderFooterMode;
  footerText: string;
  footerImageData: string;
  footerHeightMm: number;
};

export type TemplatePage = {
  id: string;
  name: string;
  settings: PageSettings;
  blocks: DocumentBlock[];
};

export type DocumentTemplate = {
  id: string;
  name: string;
  description: string;
  pages: TemplatePage[];
  createdAt: string;
  updatedAt: string;
};

export type ReusableSection = {
  id: string;
  name: string;
  page: TemplatePage;
  createdAt: string;
};

export type TemplateStoreData = {
  templates: DocumentTemplate[];
  sections: ReusableSection[];
};
