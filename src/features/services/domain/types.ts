import type { Method as PaymentMethod } from "../../operations/domain/model";

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
  serviceItems?: import("../../operations/domain/model").ServiceLine[];
  products?: import("../../operations/domain/model").ProductLine[];
  financials: {
    servicePrice?: number;
    productsTotal?: number;
    totalPrice: number;
    paymentMethod: PaymentMethod | "Mixto";
    payments?: import("../../operations/domain/model").PaymentPart[];
    commissionRate: number;
    washerEarnings: number;
    businessEarnings: number;
    tipAmount: number;
    tipMethod: PaymentMethod | null;
  };
  observations: string;
  createdAt?: { seconds: number }; // FieldValue de Firebase
}
