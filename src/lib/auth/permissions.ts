export const permissionCatalog = [
  { key: "dashboard.view", group: "Dashboard", label: "View dashboard" },
  { key: "search.view", group: "Search", label: "Use global search" },

  { key: "clients.view", group: "Clients", label: "View clients" },
  { key: "clients.manage", group: "Clients", label: "Create and edit clients" },

  { key: "projects.view", group: "Projects", label: "View projects" },
  { key: "projects.manage", group: "Projects", label: "Create and edit projects" },

  { key: "quotations.view", group: "Quotations", label: "View quotations and proposals" },
  { key: "quotations.manage", group: "Quotations", label: "Create and edit quotations and proposals" },

  { key: "documents.view", group: "Documents", label: "View documents" },
  { key: "documents.manage", group: "Documents", label: "Create and edit documents" },

  { key: "invoices.view", group: "Invoices", label: "View invoices and bills" },
  { key: "invoices.manage", group: "Invoices", label: "Create and edit invoices and bills" },

  { key: "templates.view", group: "Templates", label: "View templates" },
  { key: "templates.manage", group: "Templates", label: "Create and edit templates" },

  { key: "products.view", group: "Products", label: "View products" },
  { key: "products.manage", group: "Products", label: "Create and edit products" },

  { key: "archive.view", group: "Archive", label: "View archive" },

  { key: "users.manage", group: "Administration", label: "Manage users and permissions" },
] as const;

export type PermissionKey = (typeof permissionCatalog)[number]["key"];

export const allPermissions = permissionCatalog.map(
  (item) => item.key,
) as PermissionKey[];

const permissionSet = new Set<string>(allPermissions);

export function normalizePermissions(input: unknown): PermissionKey[] {
  if (!Array.isArray(input)) return [];
  return Array.from(
    new Set(
      input.filter(
        (item): item is PermissionKey =>
          typeof item === "string" && permissionSet.has(item),
      ),
    ),
  );
}

export function hasPermission(
  permissions: readonly string[],
  permission: PermissionKey,
) {
  return permissions.includes(permission);
}