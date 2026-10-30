import { AccessError, branchPath, type AccessContext, type BranchScope } from "../domain/model";
import { requireBranchAccess } from "../domain/policy";
export type Baseline = { organizationId: string; branchId: string; label: string; vehicles: number };
export interface BranchReadRepository { getBaseline(scope: BranchScope): Promise<unknown> }
export async function readAuthorizedBaseline(context: AccessContext, scope: BranchScope, repository: BranchReadRepository): Promise<Baseline> {
  branchPath(scope);
  requireBranchAccess(context, scope, "dashboard.view");
  const raw = await repository.getBaseline(scope);
  if (!raw || typeof raw !== "object") throw new AccessError("data", "No hay resumen de prueba para esta sede.");
  const data = raw as Record<string, unknown>;
  if (data.organizationId !== scope.organizationId || data.branchId !== scope.branchId || typeof data.label !== "string" || !Number.isSafeInteger(data.vehicles) || Number(data.vehicles) < 0) throw new AccessError("data", "El resumen no corresponde a la sede autorizada.");
  return { organizationId: scope.organizationId, branchId: scope.branchId, label: data.label, vehicles: Number(data.vehicles) };
}
