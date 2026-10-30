import {
  LayoutDashboard,
  Users,
  BarChart3,
  Settings,
  Heart,
  History, Package, ShoppingCart, Wallet, Mail
} from "lucide-react";

export const menuItems = [
  { name: "Migración V2", href: "/migration", icon: Settings },
  { name: "Tablero Principal", href: "/", icon: LayoutDashboard },
  { name: 'Historial', href: '/history', icon: History },
  // { name: "Nuevo Servicio", href: "/new", icon: PlusCircle },
  { name: "Personal / Lavadores", href: "/washers", icon: Users },
  { name: "Clientes", href: "/clients", icon: Heart },
  { name: "Reportes y Finanzas", href: "/reports", icon: BarChart3 },
  { name: "Caja", href: "/cash", icon: Wallet },
  { name: "Movimientos", href: "/movements", icon: History },
  { name: "Sobres con dinero", href: "/envelopes", icon: Mail },
  { name: "Catálogo de servicios", href: "/catalog", icon: Settings },
  { name: "Inventario", href: "/inventory", icon: Package },
  { name: "Venta de productos", href: "/sales", icon: ShoppingCart },
  { name: "Configuración", href: "/settings", icon: Settings },
];

