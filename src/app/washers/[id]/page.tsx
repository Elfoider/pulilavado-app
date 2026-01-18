// src/app/washers/[id]/page.tsx
"use client"

import { use, useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { doc, getDoc, collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { User, DollarSign, Car, Calendar, Phone, ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';

// Definimos los tipos aquí para asegurar que todo cuadre
interface WasherData {
  id: string;
  name: string;
  phone?: string;
  active: boolean;
}

interface ServiceData {
  id: string;
  createdAt: any;
  vehicle: { model: string; color: string; };
  financials: {
    totalPrice: number;
    washerEarnings: number; // La comisión del lavador
    tipAmount: number;
  };
}

// IMPORTANTE: Definir el tipo de las props como Promesa para Next.js 15
export default function WasherProfilePage({ params }: { params: Promise<{ id: string }> }) {
  // 1. SOLUCIÓN DEL ERROR: Desempaquetamos la promesa con 'use'
  const { id } = use(params);
  
  const router = useRouter();
  const [washer, setWasher] = useState<WasherData | null>(null);
  const [history, setHistory] = useState<ServiceData[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Métricas
  const [stats, setStats] = useState({
    totalEarned: 0, // Solo comisiones
    totalTips: 0,
    totalCars: 0
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        // A. Cargar datos del Lavador
        const washerRef = doc(db, "washers", id);
        const washerSnap = await getDoc(washerRef);
        
        if (washerSnap.exists()) {
          setWasher({ id: washerSnap.id, ...washerSnap.data() } as WasherData);
        } else {
          alert("Lavador no encontrado");
          router.push("/washers");
          return;
        }

        // B. Cargar Historial de Servicios de ESTE lavador
        const q = query(
          collection(db, "services"),
          where("washerId", "==", id),
          orderBy("createdAt", "desc")
        );
        
        const querySnapshot = await getDocs(q);
        const services = querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        } as ServiceData));
        
        setHistory(services);

        // C. Calcular Métricas Totales
        const newStats = services.reduce((acc, curr) => ({
            totalEarned: acc.totalEarned + (curr.financials.washerEarnings || 0),
            totalTips: acc.totalTips + (curr.financials.tipAmount || 0),
            totalCars: acc.totalCars + 1
        }), { totalEarned: 0, totalTips: 0, totalCars: 0 });

        setStats(newStats);

      } catch (error) {
        console.error("Error cargando perfil:", error);
      } finally {
        setLoading(false);
      }
    };

    if (id) fetchData();
  }, [id, router]);

  if (loading) return <div className="p-8 text-center">Cargando perfil...</div>;
  if (!washer) return <div className="p-8 text-center">No se encontró información.</div>;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      
      {/* 1. Encabezado con Botón Volver */}
      <div className="flex items-center gap-4">
        <button 
            onClick={() => router.back()} 
            className="p-2 hover:bg-gray-200 rounded-full transition"
        >
            <ArrowLeft className="w-6 h-6 text-gray-600" />
        </button>
        <div>
            <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-2">
                <User className="w-8 h-8 text-blue-600" />
                {washer.name}
            </h1>
            <p className="text-gray-500 flex items-center gap-2 text-sm mt-1">
                <Phone className="w-4 h-4" />
                {washer.phone || 'Sin teléfono'}
                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${washer.active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {washer.active ? 'ACTIVO' : 'INACTIVO'}
                </span>
            </p>
        </div>
      </div>

      {/* 2. Tarjetas de Métricas Personales */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-l-4 border-l-green-500">
            <p className="text-gray-500 text-xs font-bold uppercase mb-1">Ganancias Acumuladas</p>
            <h3 className="text-3xl font-bold text-green-700 flex items-center">
                <DollarSign className="w-6 h-6" />
                {stats.totalEarned.toFixed(2)}
            </h3>
            <p className="text-xs text-gray-400 mt-1">Solo comisiones</p>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-l-4 border-l-yellow-500">
            <p className="text-gray-500 text-xs font-bold uppercase mb-1">Propinas Recibidas</p>
            <h3 className="text-3xl font-bold text-yellow-700 flex items-center">
                <DollarSign className="w-6 h-6" />
                {stats.totalTips.toFixed(2)}
            </h3>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-l-4 border-l-blue-500">
            <p className="text-gray-500 text-xs font-bold uppercase mb-1">Autos Lavados</p>
            <h3 className="text-3xl font-bold text-blue-700 flex items-center gap-2">
                <Car className="w-6 h-6" />
                {stats.totalCars}
            </h3>
        </div>
      </div>

      {/* 3. Tabla de Historial Personal */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="p-4 bg-gray-50 border-b font-bold text-gray-700 flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Historial de Servicios Realizados
        </div>
        <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
                <thead className="text-xs text-gray-500 uppercase bg-gray-100 border-b">
                    <tr>
                        <th className="px-6 py-3">Fecha</th>
                        <th className="px-6 py-3">Vehículo</th>
                        <th className="px-6 py-3 text-right">Comisión</th>
                        <th className="px-6 py-3 text-right">Propina</th>
                        <th className="px-6 py-3 text-right">Total Recibido</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    {history.map((svc) => (
                        <tr key={svc.id} className="hover:bg-gray-50 transition">
                            <td className="px-6 py-4 font-medium text-gray-900">
                                {svc.createdAt?.seconds 
                                    ? new Date(svc.createdAt.seconds * 1000).toLocaleDateString() 
                                    : '-'}
                            </td>
                            <td className="px-6 py-4">
                                <div className="font-bold">{svc.vehicle.model}</div>
                                <div className="text-xs text-gray-500">{svc.vehicle.color}</div>
                            </td>
                            <td className="px-6 py-4 text-right text-green-600 font-medium">
                                ${svc.financials.washerEarnings.toFixed(2)}
                            </td>
                            <td className="px-6 py-4 text-right text-yellow-600 font-medium">
                                {svc.financials.tipAmount > 0 ? `$${svc.financials.tipAmount.toFixed(2)}` : '-'}
                            </td>
                            <td className="px-6 py-4 text-right font-bold text-gray-800">
                                ${(svc.financials.washerEarnings + (svc.financials.tipAmount || 0)).toFixed(2)}
                            </td>
                        </tr>
                    ))}
                    
                    {history.length === 0 && (
                        <tr>
                            <td colSpan={5} className="px-6 py-8 text-center text-gray-400">
                                Este lavador aún no ha realizado servicios.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
      </div>
    </div>
  );
}