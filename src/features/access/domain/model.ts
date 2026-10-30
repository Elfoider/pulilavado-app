import type { Permission, PermissionMap } from "./permissions";
export type Status = "active" | "invited" | "suspended" | "archived";
export type Profile = { uid: string; organizationId: string; displayName: string; email: string; status: Status };
export type Organization = { id: string; name: string; status: Status; currency: string };
export type Branch = { id: string; organizationId: string; name: string; status: Status };
export type Role = { id: string; organizationId: string; name: string; status: Status; permissions: PermissionMap };
export type Membership = { uid: string; organizationId: string; roleId: string; branchIds: string[]; allBranches: boolean; status: Status; grants: PermissionMap; denies: Permission[] };
export type AccessContext = { profile: Profile; organization: Organization; membership: Membership; role: Role; branches: Branch[] };
export type BranchScope = Readonly<{ organizationId: string; branchId: string }>;
export class AccessError extends Error {
  constructor(public readonly code: "auth" | "profile" | "membership" | "organization" | "role" | "branch" | "permission" | "data", message: string) { super(message); this.name = "AccessError"; }
}
export function identifier(value: unknown): string {
  if (typeof value !== "string" || !value || value.length > 128 || value === "." || value === ".." || /^__.*__$/.test(value) || !/^[A-Za-z0-9_-]+$/.test(value)) throw new AccessError("data", "Identificador de acceso inválido.");
  return value;
}
export function branchPath(scope: BranchScope): string {
  return `organizations/${identifier(scope.organizationId)}/branches/${identifier(scope.branchId)}`;
}
