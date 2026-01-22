import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import {
  LayoutDashboard,
  PlusCircle,
  Users,
  BarChart3,
  Settings,
  Heart,
  History
} from "lucide-react";

export const menuItems = [
  { name: "Tablero Principal", href: "/", icon: LayoutDashboard },
  { name: 'Historial', href: '/history', icon: History },
  // { name: "Nuevo Servicio", href: "/new", icon: PlusCircle },
  { name: "Personal / Lavadores", href: "/washers", icon: Users },
  { name: "Clientes", href: "/clients", icon: Heart },
  { name: "Reportes y Finanzas", href: "/reports", icon: BarChart3 },
  { name: "Configuración", href: "/settings", icon: Settings },
];

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function capitalizarPrimeraLetra(cadena: string): string {
  if (!cadena) { // Verifica si la cadena está vacía o es nula
    return cadena;
  }
  return cadena.charAt(0).toUpperCase() + cadena.slice(1);
}


