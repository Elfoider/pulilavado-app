import { AccessError, type AccessContext, type BranchScope } from "./model";
import { PERMISSIONS, organizationOnly, type Permission, type PermissionMap } from "./permissions";
export function effectivePermissions(context: AccessContext): PermissionMap {
  const { profile: p, organization: o, membership: m, role: r } = context;
  if ([p.status, o.status, m.status, r.status].some(status => status !== "active") || p.uid !== m.uid || [p.organizationId, m.organizationId, r.organizationId].some(id => id !== o.id) || r.id !== m.roleId) return {};
  const result: PermissionMap = {};
  for (const permission of PERMISSIONS) {
    if (m.denies.includes(permission)) continue;
    const scopes = [r.permissions[permission], m.grants[permission]];
    const scope = scopes.includes("organization") ? "organization" : scopes.includes("branch") ? "branch" : undefined;
    if (scope && (!organizationOnly(permission) || scope === "organization")) result[permission] = scope;
  }
  return result;
}
export function canAccess(context: AccessContext, permission: Permission, scope?: BranchScope): boolean {
  const level = effectivePermissions(context)[permission];
  if (!level) return false;
  if (organizationOnly(permission)) return level === "organization" && (!scope || scope.organizationId === context.organization.id);
  return !!scope && scope.organizationId === context.organization.id &&
    (context.membership.allBranches || context.membership.branchIds.includes(scope.branchId)) &&
    context.branches.some(branch => branch.id === scope.branchId && branch.organizationId === scope.organizationId && branch.status === "active");
}
export function requireBranchAccess(context: AccessContext, scope: BranchScope, permission: Permission): void {
  // This guard is for repositories and UI; Firestore rules remain the trust boundary.
  if (!canAccess(context, permission, scope)) throw new AccessError("permission", "No tienes acceso a esta operación en la sede seleccionada.");
}
