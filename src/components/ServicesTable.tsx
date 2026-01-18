"use client"

import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot, limit } from 'firebase/firestore';
import { ServiceDocument } from '@/types'; // Importamos la interfaz que creamos antes

// Extendemos el tipo para incluir el ID que genera Firebase
interface ServiceWithId extends ServiceDocument {
  id: string;
}

export default function ServicesTable() {
  const [services, setServices] = useState<ServiceWithId[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Consulta: Servicios ordenados por fecha (más reciente primero)
    // Limitamos a 50 para no sobrecargar la vista inicial
    const q = query(
      collection(db, "services"),
      orderBy("createdAt", "desc"),
      limit(50)
    );

    // Suscripción en tiempo real
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const servicesArray: ServiceWithId[] = [];
      
      querySnapshot.forEach((doc) => {
        // Forzamos el tipo aquí
        servicesArray.push({ id: doc.id, ...doc.data() } as ServiceWithId);
      });

      setServices(servicesArray);
      setLoading(false);
    });

    // Limpieza al desmontar el componente
    return () => unsubscribe();
  }, []);

  if (loading) return <div className="p-4 text-center">Cargando servicios...</div>;

  return (
    <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
      <div className="p-4 border-b flex justify-between items-center">
        <h3 className="font-bold text-lg">Historial de Servicios Recientes</h3>
        <span className="text-sm text-gray-500">{services.length} registros</span>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-50 text-gray-700 font-semibold uppercase text-xs">
            <tr>
              <th className="px-4 py-3">Fecha/Hora</th>
              <th className="px-4 py-3">Pista</th>
              <th className="px-4 py-3">Vehículo</th>
              <th className="px-4 py-3">Lavador</th>
              <th className="px-4 py-3">Total ($)</th>
              <th className="px-4 py-3 text-center">Detalles</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {services.map((service) => (
              <tr key={service.id} className="hover:bg-gray-50 transition">
                <td className="px-4 py-3 text-gray-600">
                  {/* Manejo seguro de la fecha de Firebase timestamp */}
                  {service.createdAt?.seconds 
                    ? new Date(service.createdAt.seconds * 1000).toLocaleString('es-PA', { 
                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
                      }) 
                    : 'Pendiente...'}
                </td>
                <td className="px-4 py-3 font-medium">
                  <span className="bg-blue-100 text-blue-800 py-1 px-2 rounded-full text-xs">
                    #{service.vehicle.bay}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900">{service.vehicle.model}</div>
                  <div className="text-xs text-gray-500">{service.vehicle.color}</div>
                </td>
                <td className="px-4 py-3">{service.washerName}</td>
                <td className="px-4 py-3 font-bold text-gray-900">
                  ${service.financials.totalPrice.toFixed(2)}
                  <div className="text-xs font-normal text-gray-500 uppercase">
                    {service.financials.paymentMethod}
                  </div>
                </td>
                <td className="px-4 py-3 text-center">
                  <button 
                    onClick={() => alert(`Detalles del servicio ID: ${service.id}\nObservaciones: ${service.observations}`)}
                    className="text-blue-600 hover:underline hover:text-blue-800 font-medium"
                  >
                    Ver más
                  </button>
                </td>
              </tr>
            ))}

            {services.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  No hay servicios registrados hoy.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}