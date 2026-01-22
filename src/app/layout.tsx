import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar"; // Importamos el sidebar
import MobileNav from "@/components/MobileNav";
import NotiStackWrapper from "@/components/NotiStackWrapper";

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
        {/* --- INICIO: LOGO DE FONDO (MARCA DE AGUA) --- */}
        <NotiStackWrapper>
          <div className="fixed inset-0 z-[-1] flex items-start justify-center pointer-events-none overflow-hidden bg-gray-50">
            {/* El bg-gray-50 es para que el fondo no sea blanco puro chillón */}

            <img
              src="/mrespumafondo.png"
              alt="Fondo Mr. Espuma"
              className="w-[500px] md:w-[700px] opacity-10"
            />
            {/* NOTAS: 
             - opacity-10: Hace que se vea muy suave (10% visible).
             - grayscale: Lo pone en blanco y negro para no distraer (opcional, quítalo si lo quieres a color).
             - w-[...]: Define el tamaño del logo.
          */}
          </div>
          {/* --- FIN: LOGO DE FONDO --- */}

          <div className="min-h-screen bg-transparent flex flex-col md:flex-row ">
            {/* 1. Sidebar Fijo */}
            <Sidebar />
            <MobileNav />
            {/* 2. Contenido Principal Dinámico */}
            {/* El margen izquierdo (ml-64) deja espacio para el sidebar */}
            <main className="flex-1 md:ml-64 p-4 md:p-8 overflow-y-auto w-full">
              {children}
            </main>
          </div>
        </NotiStackWrapper>
      </body>
    </html>
  );
}
