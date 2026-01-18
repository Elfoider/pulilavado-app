"use client"

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard, 
  PlusCircle, 
  Users, 
  BarChart3, 
  Settings, 
  CarFront, 
  Heart
} from 'lucide-react';

const menuItems = [
  { name: 'Tablero Principal', href: '/', icon: LayoutDashboard },
  { name: 'Nuevo Servicio', href: '/new', icon: PlusCircle },
  { name: 'Personal / Lavadores', href: '/washers', icon: Users },
  { name: 'Clientes', href: '/clients', icon: Heart },
  { name: 'Reportes y Finanzas', href: '/reports', icon: BarChart3 },
  { name: 'Configuración', href: '/settings', icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="hidden md:flex w-64 bg-gray-900 text-white h-screen flex-col fixed left-0 top-0 border-r border-gray-800 z-50">
      {/* Logo / Título */}
      <div className="p-6 flex items-center gap-3 border-b border-gray-800">
        <CarFront className="w-8 h-8 text-blue-500" />
        <span className="text-xl font-bold tracking-tight">Mr. Espuma</span>
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
                  ? 'bg-blue-600 text-white shadow-lg' 
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
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
        v1.0.0 - Sistema de Gestión
      </div>
    </div>
  );
}