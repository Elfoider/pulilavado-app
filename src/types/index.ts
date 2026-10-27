// src/types/index.ts

export type PaymentMethod = "Efectivo" | "Yappy" | "Tarjeta" | "Transferencia";

export interface ServiceFormData {
  washerName: string;
  washerId: string;
  clientName: string;
  clientPhone: string;
  vehicleModel: string;
  vehicleColor: string;
  bayNumber: string;
  price: string; // Manejamos inputs como string inicialmente
  paymentMethod: PaymentMethod;
  hasTip: boolean;
  tipAmount: string;
  tipMethod: PaymentMethod;
  saveFrequent: boolean;
  observations: string;
}

export interface Washer {
  id: string; // ID de Firebase
  name: string;
  phone: string;
  startDate?: { seconds: number }; // Timestamp
  active: boolean;
  commissionPercentage?: number | null;
  photoUrl?: string; // Opcional
}

// Así es como se guardará en Firestore
export interface ServiceDocument {
  paymentStatus: string;
  id: string;
  paymentMethod: string;
  washerId: string;
  washerName: string;
  clientName: string;
  clientPhone: string;
  vehicle: {
    model: string;
    color: string;
    bay: string;
  };
  status?: string;
  cashSessionId?: string | null;
  serviceLabel?: string;
  serviceItems?: import("@/lib/operations/model").ServiceLine[];
  products?: import("@/lib/operations/model").ProductLine[];
  financials: {
    servicePrice?: number;
    productsTotal?: number;
    totalPrice: number;
    paymentMethod: PaymentMethod | "Mixto";
    payments?: import("@/lib/operations/model").PaymentPart[];
    commissionRate: number;
    washerEarnings: number;
    businessEarnings: number;
    tipAmount: number;
    tipMethod: PaymentMethod | null;
  };
  observations: string;
  createdAt?: { seconds: number }; // FieldValue de Firebase
}
