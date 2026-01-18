"use client"

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard, PlusCircle, Users, BarChart3, Settings, CarFront, Menu, X 
} from 'lucide-react';

const menuItems = [
  { name: 'Tablero', href: '/', icon: LayoutDashboard },
  { name: 'Nuevo Servicio', href: '/new', icon: PlusCircle },
  { name: 'Personal', href: '/washers', icon: Users },
  { name: 'Reportes', href: '/reports', icon: BarChart3 },
  { name: 'Config', href: '/settings', icon: Settings },
];

export default function MobileNav() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  return (
    <div className="md:hidden bg-gray-900 text-white p-4 flex justify-between items-center sticky top-0 z-50 shadow-md">
      {/* Logo y Botón */}
      <div className="flex items-center gap-2 font-bold text-lg">
        <CarFront className="text-blue-500" />
        <span>PuliLavado</span>
      </div>
      
      <button onClick={() => setIsOpen(!isOpen)} className="p-1">
        {isOpen ? <X /> : <Menu />}
      </button>

      {/* Menú Desplegable (Overlay) */}
      {isOpen && (
        <div className="absolute top-16 left-0 w-full bg-gray-900 border-b border-gray-800 shadow-xl animate-in slide-in-from-top-5">
          <nav className="flex flex-col p-4 space-y-2">
            {menuItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsOpen(false)} // Cierra el menú al hacer clic
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    isActive ? 'bg-blue-600' : 'hover:bg-gray-800'
                  }`}
                >
                  <item.icon className="w-5 h-5" />
                  <span className="font-medium">{item.name}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </div>
  );
}