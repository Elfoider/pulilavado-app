/** Phase 1 only permits local emulators. Never inherit production configuration. */
export function migrationRuntime(input:{enabled?:string;legacyEmulatorFlag?:string;projectId?:string}) {
  const enabled=input.enabled === "true" || input.legacyEmulatorFlag === "true";
  const projectId=input.projectId || "demo-pulilavado-v2";
  const safe=/^demo-[a-z0-9-]+$/.test(projectId);
  return {ready:enabled&&safe,projectId:safe?projectId:"demo-pulilavado-v2",emulatorHost:"127.0.0.1",emulatorPort:8080,
    reason:!safe?"Esta fase solo permite proyectos demo- en el emulador local.":!enabled?"Active el entorno local de migración para usar las pantallas operativas.":"Entorno local aislado"};
}
