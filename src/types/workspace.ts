export type ClientStatus = "active" | "archived";

export type Client = {
  id: string;
  name: string;
  companyName: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  tags: string[];
  status: ClientStatus;
  createdAt: string;
  updatedAt: string;
};

export type ProjectStatus = "active" | "on_hold" | "completed" | "archived";

export type Project = {
  id: string;
  clientId: string;
  name: string;
  code: string;
  location: string;
  description: string;
  tags: string[];
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceData = {
  clients: Client[];
  projects: Project[];
};

export type GlobalSearchResult = {
  id: string;
  type: "client" | "project";
  title: string;
  subtitle: string;
  meta: string;
  href: string;
};
