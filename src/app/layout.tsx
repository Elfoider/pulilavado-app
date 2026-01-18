import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar"; // Importamos el sidebar
import MobileNav from "@/components/MobileNav";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Sistema Pulilavado",
  description: "Gestión de servicios y personal",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={inter.className}>
        <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row ">
          {/* 1. Sidebar Fijo */}
          <Sidebar />
          <MobileNav />
          {/* 2. Contenido Principal Dinámico */}
          {/* El margen izquierdo (ml-64) deja espacio para el sidebar */}
          <main className="flex-1 md:ml-64 p-4 md:p-8 overflow-y-auto w-full">{children}</main>
        </div>
      </body>
    </html>
  );
}
