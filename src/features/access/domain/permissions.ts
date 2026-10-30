/** Permission identifiers reviewed against the Pulix V2 source snapshot. */
export const PERMISSIONS = [
  "dashboard.view", "clients.view", "clients.create", "clients.edit", "clients.archive",
  "vehicles.view", "vehicles.create", "vehicles.edit", "vehicles.archive",
  "services.view", "services.create", "services.edit", "services.assign", "services.change_status", "services.cancel",
  "washers.view", "washers.create", "washers.edit", "washers.archive", "catalog.view", "catalog.manage",
  "payments.view", "payments.charge", "payments.correct", "payments.refund",
  "cash.view", "cash.open", "cash.move", "cash.expense", "cash.close", "cash.reopen",
  "inventory.view", "inventory.create", "inventory.edit", "inventory.receive", "inventory.adjust",
  "sales.view", "sales.create", "sales.cancel", "reports.view", "reports.export", "reports.consolidated",
  "settings.view", "settings.manage", "admin.users.view", "admin.users.create", "admin.users.edit", "admin.users.suspend",
  "admin.roles.view", "admin.roles.create", "admin.roles.edit", "admin.roles.delete", "admin.roles.assign",
  "admin.branches.view", "admin.branches.create", "admin.branches.edit", "admin.branches.archive", "audit.view", "audit.export",
] as const;
export type Permission = typeof PERMISSIONS[number];
export type PermissionScope = "branch" | "organization";
export type PermissionMap = Partial<Record<Permission, PermissionScope>>;
export const organizationOnly = (permission: Permission) => permission.startsWith("admin.") || permission.startsWith("audit.") || permission.startsWith("settings.") || permission === "reports.consolidated";
