"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  PlusCircle,
  Users,
  BarChart3,
  Settings,
  Heart,
  Droplets,
  History
} from "lucide-react";

const menuItems = [
  { name: "Tablero Principal", href: "/", icon: LayoutDashboard },
  { name: 'Historial', href: '/history', icon: History },
  { name: "Nuevo Servicio", href: "/new", icon: PlusCircle },
  { name: "Personal / Lavadores", href: "/washers", icon: Users },
  { name: "Clientes", href: "/clients", icon: Heart },
  { name: "Reportes y Finanzas", href: "/reports", icon: BarChart3 },
  { name: "Configuración", href: "/settings", icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="hidden md:flex w-64 bg-espuma-dark text-white h-screen flex-col fixed left-0 top-0 border-r border-gray-800 z-50">
      {/* Logo / Título */}
      <div className="p-6 flex items-center gap-3 border-b border-gray-700/50">
        {/* Fondo rojo para el ícono */}
        <div className="bg-espuma-red p-2 rounded-lg shadow-lg">
          <Droplets className="w-6 h-6 text-white" />
        </div>
        <div>
          {/* Texto estilizado */}
          <h1 className="text-xl font-black italic tracking-wider text-white">
            MR.<span className="text-espuma-red">ESPUMA</span>
          </h1>
          <p className="text-[10px] text-espuma-blue uppercase tracking-widest font-bold">
            Sistema de Lavado
          </p>
        </div>
      </div>

      {/* Menú de Navegación */}
      <nav className="flex-1 p-4 space-y-2">
        {menuItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                isActive
                  ? "bg-espuma-red text-white shadow-lg"
                  : "text-gray-400 hover:bg-gray-800 hover:text-white"
              }`}
            >
              <item.icon className="w-5 h-5" />
              <span className="font-medium">{item.name}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer del Sidebar */}
      <div className="p-4 border-t border-gray-800 text-xs text-gray-500 text-center">
        v1.1.0 - Sistema de Gestión
      </div>
    </div>
  );
}
