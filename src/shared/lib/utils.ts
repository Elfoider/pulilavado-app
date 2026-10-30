import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function capitalizarPrimeraLetra(cadena: string): string {
  if (!cadena) { // Verifica si la cadena está vacía o es nula
    return cadena;
  }
  return cadena.charAt(0).toUpperCase() + cadena.slice(1);
}

export const formatMoney = (amount: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};
