import ServicesTable from "@/components/ServicesTable";
import Link from "next/link";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-800">Tablero Principal</h1>
        <Link 
          href="/new" 
          className="bg-espuma-blue hover-bg-espuma-blue text-white px-4 py-2 rounded-lg transition"
        >
          + Nuevo Servicio
        </Link>
      </div>

      {/* Componente Tabla que hicimos antes */}
      <ServicesTable />
    </div>
  );
}