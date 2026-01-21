"use client"

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { doc, getDoc, collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { 
  ArrowLeft, Calendar, DollarSign, Car, 
  Trophy, TrendingUp, Banknote 
} from 'lucide-react';

interface DailyService {
  id: string;
  vehicle: string;
  totalPrice: number;
  washerEarnings: number;
  tipAmount: number;
  paymentMethod: string;
}

export default function WasherProfilePage() {
  const { id } = useParams(); // Obtener ID del lavador de la URL
  const router = useRouter();
  
  const [washer, setWasher] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  // --- ESTADOS PARA MÉTRICAS DIARIAS ---
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [dailyStats, setDailyStats] = useState({
    count: 0,
    earnings: 0, // Solo comisión
    tips: 0,     // Solo propinas
  });
  const [dailyServices, setDailyServices] = useState<DailyService[]>([]);

  // 1. Cargar Datos Básicos del Lavador
  useEffect(() => {
    const fetchWasher = async () => {
      if (!id) return;
      const docSnap = await getDoc(doc(db, "washers", id as string));
      if (docSnap.exists()) {
        setWasher(docSnap.data());
      }
    };
    fetchWasher();
  }, [id]);

  // 2. Cargar Métricas DEL DÍA SELECCIONADO
  useEffect(() => {
    const fetchDailyMetrics = async () => {
      if (!id) return;
      setLoading(true);
        console.log("Cargando métricas para lavador:", id, "en fecha:", selectedDate);
      try {
        // Configurar rango de fechas (00:00:00 a 23:59:59)
        const [year, month, day] = selectedDate.split('-').map(Number);
        const startOfDay = new Date(year, month - 1, day, 0, 0, 0);
        const endOfDay = new Date(year, month - 1, day, 23, 59, 59);

        // Query: Servicios de ESTE lavador en ESTE día
        const q = query(
          collection(db, "services"),
          where("washerId", "==", id),
          where("createdAt", ">=", Timestamp.fromDate(startOfDay)),
          where("createdAt", "<=", Timestamp.fromDate(endOfDay))
        );

        const querySnapshot = await getDocs(q);

        let tempCount = 0;
        let tempEarnings = 0;
        let tempTips = 0;
        const servicesList: DailyService[] = [];

        querySnapshot.forEach((doc) => {
          const data = doc.data();
          // Solo contar servicios no cancelados
          if (data.status !== 'cancelled') {
            tempCount++;
            const fin = data.financials || {};
            
            tempEarnings += (fin.washerEarnings || 0);
            tempTips += (fin.tipAmount || 0);

            servicesList.push({
              id: doc.id,
              vehicle: `${data.vehicle.model} (${data.vehicle.color})`,
              totalPrice: fin.totalPrice,
              washerEarnings: fin.washerEarnings,
              tipAmount: fin.tipAmount,
              paymentMethod: fin.paymentMethod
            });
          }
        });

        setDailyStats({ count: tempCount, earnings: tempEarnings, tips: tempTips });
        setDailyServices(servicesList);

      } catch (error) {
        console.error("Error cargando métricas diarias:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchDailyMetrics();
  }, [id, selectedDate]); // Se ejecuta cada vez que cambia el ID o la FECHA

  if (!washer) return <div className="p-10 text-center">Cargando perfil...</div>;

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-8 animate-in fade-in duration-500">
      
      {/* HEADER: Botón regresar y Datos Personales */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
            <button onClick={() => router.back()} className="p-2 bg-white rounded-full hover:bg-gray-100 border border-gray-200 transition">
                <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <div>
                <h1 className="text-3xl font-black text-gray-900">{washer.name}</h1>
                <p className="text-gray-500 text-sm font-medium flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-yellow-500"/>
                    Perfil de Rendimiento
                </p>
            </div>
        </div>
      </div>

      <div className="border-t border-gray-100"></div>

      {/* --- SECCIÓN: RENDIMIENTO DIARIO --- */}
      <div className="bg-gray-50 p-6 rounded-3xl border border-gray-200">
        
        {/* CONTROL DE CALENDARIO */}
        <div className="flex flex-col sm:flex-row justify-between items-end sm:items-center gap-4 mb-6">
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-espuma-blue"/>
                Métricas Diarias
            </h2>
            
            <div className="bg-white p-1.5 rounded-xl border border-gray-200 shadow-sm flex items-center gap-2">
                <div className="bg-espuma-blue/10 p-2 rounded-lg">
                    <Calendar className="w-5 h-5 text-espuma-blue"/>
                </div>
                <div className="flex flex-col px-2">
                    <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Seleccionar Día</span>
                    <input 
                        type="date" 
                        value={selectedDate} 
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="text-sm font-bold text-gray-800 outline-none bg-transparent cursor-pointer"
                    />
                </div>
            </div>
        </div>

        {/* TARJETAS DE MÉTRICAS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            
            {/* 1. AUTOS LAVADOS */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between">
                <div>
                    <p className="text-xs font-bold text-gray-400 uppercase">Vehículos</p>
                    <p className="text-3xl font-black text-gray-800 mt-1">{dailyStats.count}</p>
                </div>
                <div className="p-3 bg-blue-50 rounded-xl">
                    <Car className="w-6 h-6 text-espuma-blue"/>
                </div>
            </div>

            {/* 2. GANANCIA (COMISIÓN) */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between">
                <div>
                    <p className="text-xs font-bold text-gray-400 uppercase">Comisión (Sueldo)</p>
                    <p className="text-3xl font-black text-gray-800 mt-1">${dailyStats.earnings.toFixed(2)}</p>
                </div>
                <div className="p-3 bg-green-50 rounded-xl">
                    <DollarSign className="w-6 h-6 text-green-600"/>
                </div>
            </div>

            {/* 3. PROPINAS */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-yellow-100 flex items-center justify-between relative overflow-hidden">
                <div className="relative z-10">
                    <p className="text-xs font-bold text-yellow-600 uppercase">Propinas</p>
                    <p className="text-3xl font-black text-yellow-700 mt-1">${dailyStats.tips.toFixed(2)}</p>
                </div>
                <div className="p-3 bg-yellow-100 rounded-xl relative z-10">
                    <Banknote className="w-6 h-6 text-yellow-600"/>
                </div>
                {/* Decoración de fondo */}
                <div className="absolute right-0 top-0 h-full w-16 bg-gradient-to-l from-yellow-50 to-transparent"></div>
            </div>

        </div>

        {/* LISTA DE SERVICIOS DEL DÍA */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="p-4 bg-gray-100 border-b border-gray-200 flex justify-between items-center">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Historial del Día</h3>
                <span className="text-xs font-medium text-gray-400">{dailyServices.length} servicios completados</span>
            </div>
            
            {loading ? (
                <div className="p-8 text-center text-gray-400 text-sm">Cargando datos del día...</div>
            ) : dailyServices.length === 0 ? (
                <div className="p-8 text-center text-gray-400 text-sm flex flex-col items-center">
                    <Car className="w-10 h-10 mb-2 opacity-20"/>
                    No hay lavados registrados en esta fecha.
                </div>
            ) : (
                <div className="divide-y divide-gray-100">
                    {dailyServices.map((service) => (
                        <div key={service.id} className="p-4 flex justify-between items-center hover:bg-gray-50 transition">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center font-bold text-espuma-blue text-xs">
                                    <Car className="w-5 h-5"/>
                                </div>
                                <div>
                                    <p className="font-bold text-gray-800 text-sm">{service.vehicle}</p>
                                    <p className="text-xs text-gray-400 capitalize">{service.paymentMethod}</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="font-bold text-green-600 text-sm">+${service.washerEarnings.toFixed(2)}</p>
                                {service.tipAmount > 0 && (
                                    <p className="text-xs text-yellow-600 font-medium flex items-center justify-end gap-1">
                                        <Banknote className="w-3 h-3"/> ${service.tipAmount.toFixed(2)}
                                    </p>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
        
        <div className="mt-4 flex justify-end">
            <div className="text-right">
                <p className="text-xs text-gray-400 uppercase font-bold">Total a Pagar por este día</p>
                <p className="text-2xl font-black text-gray-900 border-b-4 border-espuma-blue inline-block">
                    ${(dailyStats.earnings + dailyStats.tips).toFixed(2)}
                </p>
            </div>
        </div>

      </div>
    </div>
  );
}