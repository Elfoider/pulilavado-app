import type { COLLECTIONS } from "./audit";
type SourceCollection = typeof COLLECTIONS[number];
type MappingContract = { destination: string; strategy: "adapt" | "archive" | "rebuild" | "design"; requirement: string };
/** Reviewed path shapes, never import commands or ready-to-write documents. */
export const TARGET_CONTRACT = {
  clients: { destination: "organizations/{org}/clients + vehicles", strategy: "adapt", requirement: "Separar cliente y vehículo; resolver matrícula y duplicados con revisión humana." },
  washers: { destination: "organizations/{org}/washers", strategy: "adapt", requirement: "Asignar sedes y convertir porcentaje a puntos básicos; no crear cuentas Auth desde nombres de lavadores." },
  serviceCatalog: { destination: "organizations/{org}/serviceCatalog + branches/{branch}/catalogPrices", strategy: "adapt", requirement: "Separar catálogo global y precio de sede; conservar las líneas históricas y el precio personalizado." },
  settings: { destination: "organizations/{org}/settings/general + branches/{branch}/settings/general", strategy: "adapt", requirement: "Confirmar moneda, métodos por ID, comisión y configuración de sede." },
  products: { destination: "organizations/{org}/products + branches/{branch}/stock", strategy: "adapt", requirement: "Separar producto, categoría y existencia por sede; precio en centavos y costo requiere contrato propio." },
  productCodes: { destination: "organizations/{org}/_productCodes", strategy: "rebuild", requirement: "Reconstruir unicidad por producto y organización; nunca copiar bloqueos globales." },
  services: { destination: "organizations/{org}/branches/{branch}/services + payments", strategy: "adapt", requirement: "Resolver cliente, vehículo, pista, estados, cobros y comisión histórica; productos vinculados se concilian con ventas asociadas." },
  sales: { destination: "organizations/{org}/branches/{branch}/sales + salePayments", strategy: "design", requirement: "El destino revisado usa un método por venta; diseñar pagos mixtos antes de transformar ventas existentes." },
  cashSessions: { destination: "organizations/{org}/branches/{branch}/cashSessions", strategy: "archive", requirement: "Conservar cierres originales como archivo; definir apertura de corte sin recrear cobros históricos." },
  cashMovements: { destination: "organizations/{org}/branches/{branch}/cashSessions/{session}/movements", strategy: "archive", requirement: "Conservar secuencia, método, antes/después y naturaleza; no reproducir el historial como comandos nuevos." },
  cashAdvances: { destination: "Pendiente: vales y liquidaciones por sede", strategy: "design", requirement: "Falta contrato de nómina y vales con aplicación única del descuento y estado de pago." },
  cashEnvelopes: { destination: "Pendiente: tesorería por sede", strategy: "design", requirement: "Falta contrato de sobres, saldos y semana martes-lunes; un traslado no es gasto." },
  envelopeMovements: { destination: "Pendiente: libro de tesorería por sede", strategy: "design", requirement: "Vincular traslado y contrapartida de Caja; distinguir retiros para gasto de refuerzos de efectivo." },
  inventoryMovements: { destination: "organizations/{org}/branches/{branch}/inventoryMovements", strategy: "archive", requirement: "Conservar historial y conciliación; la carga inicial de stock no vuelve a descontar ventas antiguas." },
  cashControl: { destination: "organizations/{org}/branches/{branch}/_cash/current", strategy: "rebuild", requirement: "Solo reconstruir desde una apertura nueva, conciliada y autorizada tras el corte." },
  treasuryControl: { destination: "Pendiente: control de tesorería por sede", strategy: "design", requirement: "No reutilizar controles ni claves de idempotencia del sistema original." },
} as const satisfies Record<SourceCollection, MappingContract>;
export const TARGET_GAPS = [
  "Vales, nómina liquidada y sobres necesitan contratos propios en el destino revisado.",
  "Los pagos mixtos de ventas y el cobro conjunto de servicios/productos requieren diseñar su atomicidad.",
  "Clientes y vehículos necesitan identidad estable; no se deben unir por nombre ni inventar matrículas.",
  "No deben recalcularse las comisiones históricas con el reconocimiento y redondeo de V2.",
  "Hay que confirmar el corte, moneda, métodos de pago y la correspondencia de organización/sede reales antes de importar.",
] as const;
