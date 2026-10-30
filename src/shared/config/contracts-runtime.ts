/** Separate, fixed local project for testing V2 contracts, never a cloud fallback. */
export const CONTRACTS_PROJECT = "demo-pulilavado-contracts";
export function contractsRuntime(enabled?: string) {
  return { enabled: enabled === "true", projectId: CONTRACTS_PROJECT, firestoreHost: "127.0.0.1", firestorePort: 8080, authUrl: "http://127.0.0.1:9099", databaseId: "(default)" } as const;
}
