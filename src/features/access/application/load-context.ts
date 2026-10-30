import { AccessError, identifier, type AccessContext, type Branch, type Membership, type Organization, type Profile, type Role, type Status } from "../domain/model";
import { PERMISSIONS, type PermissionMap, type Permission } from "../domain/permissions";
export type ContextReader = {
  get(path: string): Promise<unknown>;
  activeBranches(organizationId: string): Promise<{ id: string; data: unknown }[]>;
};
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AccessError("data", "El contexto de acceso está incompleto.");
  return value as Record<string, unknown>;
};
const active = (value: unknown, code: "profile" | "organization" | "membership" | "role"): Status => {
  if (value !== "active") throw new AccessError(code, "Tu cuenta, empresa, membresía o rol no tiene acceso activo.");
  return value;
};
function permissions(value: unknown): PermissionMap {
  const data = object(value), result: PermissionMap = {};
  for (const permission of PERMISSIONS) {
    const scope = data[permission];
    if (scope !== undefined && scope !== "branch" && scope !== "organization") throw new AccessError("data", "Alcance de permiso inválido.");
    if (scope) result[permission] = scope;
  }
  return result;
}
const text = (value: unknown) => typeof value === "string" ? value : "";
/** No organization is accepted from a query parameter or a browser-stored selection. */
export async function loadAccessContext(uid: string, reader: ContextReader): Promise<AccessContext> {
  identifier(uid);
  const rawProfile = await reader.get(`profiles/${uid}`);
  if (!rawProfile) throw new AccessError("profile", "No existe un perfil autorizado para esta cuenta.");
  const p = object(rawProfile);
  if (p.uid !== uid) throw new AccessError("profile", "No existe un perfil autorizado para esta cuenta.");
  const org = identifier(p.organizationId);
  const profile: Profile = { uid, organizationId: org, status: active(p.status, "profile"), displayName: text(p.displayName), email: text(p.email) };
  const root = `organizations/${org}`;
  const [rawOrg, rawMember] = await Promise.all([reader.get(root), reader.get(`${root}/memberships/${uid}`)]);
  const o = object(rawOrg), m = object(rawMember);
  const organization: Organization = { id: org, name: text(o.name), currency: text(o.currency), status: active(o.status, "organization") };
  if (m.uid !== uid || m.organizationId !== org || typeof m.allBranches !== "boolean" || !Array.isArray(m.branchIds) || !Array.isArray(m.denies)) throw new AccessError("membership", "La membresía no corresponde a esta cuenta.");
  const roleId = identifier(m.roleId);
  const membership: Membership = { uid, organizationId: org, roleId, status: active(m.status, "membership"), allBranches: m.allBranches, branchIds: [...new Set(m.branchIds.map(identifier))], grants: permissions(m.grants), denies: m.denies.filter((p): p is Permission => (PERMISSIONS as readonly unknown[]).includes(p)) };
  const r = object(await reader.get(`${root}/roles/${roleId}`));
  if (r.organizationId !== org) throw new AccessError("role", "El rol no pertenece a tu empresa.");
  const role: Role = { id: roleId, organizationId: org, name: text(r.name), status: active(r.status, "role"), permissions: permissions(r.permissions) };
  const rows = membership.allBranches ? await reader.activeBranches(org) : await Promise.all(membership.branchIds.map(async id => ({ id, data: await reader.get(`${root}/branches/${id}`) })));
  const branches: Branch[] = rows.flatMap(({ id, data }) => {
    const b = object(data); identifier(id);
    if (b.organizationId !== org) throw new AccessError("branch", "Una sede no pertenece a tu empresa.");
    if (b.status !== "active") return [];
    return [{ id, organizationId: org, status: "active", name: text(b.name) }];
  });
  if (!branches.length) throw new AccessError("branch", "No tienes sedes activas asignadas.");
  return { profile, organization, membership, role, branches };
}
