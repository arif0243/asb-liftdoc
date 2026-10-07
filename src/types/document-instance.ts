import type { TemplatePage } from "@/types/document-builder";

export type DocumentStatus = "draft" | "final" | "archived";

export type DocumentInstance = {
  id: string;
  documentNo: string;
  versionNo: number;
  rootDocumentId: string;
  parentDocumentId: string | null;
  duplicatedFromId: string | null;

  quotationId: string;
  quotationNo: string;
  quotationRevisionNo: number;

  clientId: string;
  projectId: string | null;

  templateId: string;
  templateName: string;

  title: string;
  status: DocumentStatus;
  pages: TemplatePage[];

  createdAt: string;
  updatedAt: string;
};

export type DocumentStoreData = {
  documents: DocumentInstance[];
};
