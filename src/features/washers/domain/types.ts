export interface Washer {
  id: string; // ID de Firebase
  name: string;
  phone: string;
  startDate?: { seconds: number }; // Timestamp
  active: boolean;
  commissionPercentage?: number | null;
  photoUrl?: string; // Opcional
}
