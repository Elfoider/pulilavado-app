// src/app/clients/page.tsx
import ClientsManager from "@/components/ClientsManager";

export default function ClientsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6 text-gray-800">Cartera de Clientes</h1>
      <ClientsManager />
    </div>
  );
}