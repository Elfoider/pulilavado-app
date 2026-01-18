// src/app/washers/[id]/page.tsx
"use client"

import { use, useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { doc, getDoc, collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { User, DollarSign, Car, Calendar, Phone, ArrowLeft, AlertCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';

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
    washerEarnings: number;
    tipAmount: number;
  };
}

export default function WasherProfilePage({ params }: { params: Promise<{ id: string }> }) {
  // 1. Desempaquetar params con use()
  const { id } = use(params);
  
  const router = useRouter();
  const [washer, setWasher] = useState<WasherData | null>(null);
  const [history, setHistory] = useState<ServiceData[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Métricas
  const [stats, setStats] = useState({
    totalEarned: 0, 
    totalTips: 0,
    totalCars: 0
  });

  useEffect(() => {
    const fetchData = async () => {
      if (!id) return;
      
      console.log("--- INICIANDO CARGA DE PERFIL ---");
      console.log("ID Buscado:", id);

      try {
        setLoading(true);

        // A. Cargar datos del Lavador
        const washerRef = doc(db, "washers", id);
        const washerSnap = await getDoc(washerRef);
        
        if (washerSnap.exists()) {
          const wData = { id: washerSnap.id, ...washerSnap.data() } as WasherData;
          console.log("Lavador encontrado:", wData.name);
          setWasher(wData);
        } else {
          console.error("Lavador NO existe en la base de datos");
          alert("Lavador no encontrado (ID inválido)");
          router.push("/washers");
          return;
        }

        // B. Cargar Historial
        // IMPORTANTE: Esto busca servicios donde el campo 'washerId' sea igual al ID actual
        const q = query(
          collection(db, "services"),
          where("washerId", "==", id), 
          orderBy("createdAt", "desc")
        );
        
        const querySnapshot = await getDocs(q);
        console.log(`Se encontraron ${querySnapshot.size} servicios para este ID.`);

        const services = querySnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                createdAt: data.createdAt,
                vehicle: data.vehicle || { model: 'Desc.', color: '-' },
                financials: {
                    totalPrice: data.financials?.totalPrice || 0,
                    washerEarnings: data.financials?.washerEarnings || 0,
                    tipAmount: data.financials?.tipAmount || 0,
                }
            } as ServiceData;
        });
        
        setHistory(services);

        // C. Calcular Métricas
        const newStats = services.reduce((acc, curr) => ({
            totalEarned: acc.totalEarned + curr.financials.washerEarnings,
            totalTips: acc.totalTips + curr.financials.tipAmount,
            totalCars: acc.totalCars + 1
        }), { totalEarned: 0, totalTips: 0, totalCars: 0 });

        setStats(newStats);

      } catch (error) {
        console.error("Error cargando perfil:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id, router]);

  if (loading) return <div className="p-10 text-center font-bold text-gray-500 animate-pulse">Cargando datos del lavador...</div>;
  if (!washer) return null;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      
      {/* 1. Encabezado */}
      <div className="flex items-center gap-4 bg-white p-4 rounded-xl shadow-sm border">
        <button 
            onClick={() => router.back()} 
            className="p-2 hover:bg-gray-100 rounded-full transition"
        >
            <ArrowLeft className="w-6 h-6 text-gray-600" />
        </button>
        <div>
            <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                <User className="w-6 h-6 text-blue-600" />
                {washer.name}
            </h1>
            <p className="text-gray-500 text-sm">{washer.phone || 'Sin teléfono'}</p>
        </div>
        <div className="ml-auto">
            <span className={`px-3 py-1 rounded-full text-xs font-bold ${washer.active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {washer.active ? 'ACTIVO' : 'INACTIVO'}
            </span>
        </div>
      </div>

      {/* 2. Tarjetas de Resumen Histórico */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-xl shadow-sm border border-l-4 border-l-green-500">
            <p className="text-gray-400 text-xs font-bold uppercase mb-1">Total Ganado (Histórico)</p>
            <h3 className="text-3xl font-bold text-green-700 flex items-center">
                <DollarSign className="w-6 h-6" />
                {stats.totalEarned.toFixed(2)}
            </h3>
            <p className="text-xs text-gray-400 mt-1">Suma de todas sus comisiones</p>
        </div>

        <div className="bg-white p-5 rounded-xl shadow-sm border border-l-4 border-l-yellow-400">
            <p className="text-gray-400 text-xs font-bold uppercase mb-1">Total Propinas</p>
            <h3 className="text-3xl font-bold text-yellow-600 flex items-center">
                <DollarSign className="w-6 h-6" />
                {stats.totalTips.toFixed(2)}
            </h3>
        </div>

        <div className="bg-white p-5 rounded-xl shadow-sm border border-l-4 border-l-blue-500">
            <p className="text-gray-400 text-xs font-bold uppercase mb-1">Autos Lavados</p>
            <h3 className="text-3xl font-bold text-blue-700 flex items-center gap-2">
                <Car className="w-6 h-6" />
                {stats.totalCars}
            </h3>
        </div>
      </div>

      {/* 3. Tabla de Historial */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="p-4 bg-gray-50 border-b font-bold text-gray-700 flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Historial Completo de Servicios
        </div>
        
        {history.length === 0 ? (
            <div className="p-8 text-center flex flex-col items-center gap-3">
                <AlertCircle className="w-10 h-10 text-gray-300" />
                <p className="text-gray-500 font-medium">Este lavador no tiene servicios registrados con su ID actual.</p>
                <p className="text-xs text-gray-400 max-w-md">
                    Nota: Si eliminaste y volviste a crear al lavador, los servicios anteriores se perdieron porque están asociados al ID viejo. Solo aparecerán los nuevos.
                </p>
            </div>
        ) : (
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="text-xs text-gray-500 uppercase bg-gray-100 border-b">
                        <tr>
                            <th className="px-6 py-3">Fecha</th>
                            <th className="px-6 py-3">Vehículo</th>
                            <th className="px-6 py-3 text-right">Comisión</th>
                            <th className="px-6 py-3 text-right">Propina</th>
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
                                <td className="px-6 py-4 text-right text-green-600 font-bold">
                                    ${svc.financials.washerEarnings.toFixed(2)}
                                </td>
                                <td className="px-6 py-4 text-right text-yellow-600">
                                    {svc.financials.tipAmount > 0 ? `$${svc.financials.tipAmount.toFixed(2)}` : '-'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        )}
      </div>
    </div>
  );
}