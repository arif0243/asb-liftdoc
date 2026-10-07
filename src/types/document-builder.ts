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
  | "totals";

export type DocumentBlock = {
  id: string;
  type: DocumentBlockType;
  content: string;
  align: "left" | "center" | "right";
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
