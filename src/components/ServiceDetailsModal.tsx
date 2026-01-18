"use client"

import { useState } from 'react';
import { X, Car, User, DollarSign, FileText, Trash2, Save, Edit, CreditCard } from 'lucide-react'; // <--- Nuevo icono CreditCard
import { ServiceDocument } from '@/types';
import { deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface ServiceWithId extends ServiceDocument {
  id: string;
}

interface Props {
  service: ServiceWithId | null;
  onClose: () => void;
}

export default function ServiceDetailsModal({ service, onClose }: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Inicializamos el estado con los datos del servicio
  const [formData, setFormData] = useState({
    model: service?.vehicle.model || '',
    color: service?.vehicle.color || '',
    totalPrice: service?.financials.totalPrice || 0,
    tipAmount: service?.financials.tipAmount || 0,
    observations: service?.observations || '',
    // Si el servicio antiguo no tenía este campo, asumimos 'Efectivo'
    paymentMethod: service?.paymentMethod || 'Efectivo' 
  });

  if (!service) return null;

  const dateStr = service.createdAt?.seconds 
    ? new Date(service.createdAt.seconds * 1000).toLocaleString('es-PA', { 
        dateStyle: 'full', timeStyle: 'short' 
      }) 
    : 'Fecha no disponible';

  const handleDelete = async () => {
    if (confirm("⚠️ ¿Estás seguro de eliminar este servicio? Esto afectará los reportes financieros.")) {
      try {
        setLoading(true);
        await deleteDoc(doc(db, "services", service.id));
        onClose(); 
      } catch (error) {
        console.error(error);
        alert("Error al eliminar");
      }
    }
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      
      const oldRate = service.financials.commissionRate || 0.40;
      const newWasherEarnings = formData.totalPrice * oldRate;
      const newBusinessEarnings = formData.totalPrice - newWasherEarnings;

      // ACTUALIZAMOS FIREBASE
      await updateDoc(doc(db, "services", service.id), {
        "vehicle.model": formData.model,
        "vehicle.color": formData.color,
        "observations": formData.observations,
        "paymentMethod": formData.paymentMethod, // <--- Guardamos el método
        "financials.totalPrice": formData.totalPrice,
        "financials.tipAmount": formData.tipAmount,
        "financials.washerEarnings": newWasherEarnings,
        "financials.businessEarnings": newBusinessEarnings
      });

      setIsEditing(false);
      alert("Servicio actualizado correctamente");
      onClose(); 
    } catch (error) {
      console.error(error);
      alert("Error al actualizar");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Encabezado */}
        <div className={`p-6 flex justify-between items-start ${isEditing ? 'bg-blue-600' : 'bg-gray-900'} text-white transition-colors`}>
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Car className="text-blue-200" />
              {isEditing ? 'Editando Servicio' : 'Detalle de Servicio'}
            </h2>
            <p className="text-white/70 text-sm mt-1 uppercase tracking-wider">ID: {service.id.slice(0, 8)}...</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-full transition">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Contenido */}
        <div className="p-6 overflow-y-auto space-y-6">
          
          {/* Fila 1: Vehículo y Cliente */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
              <p className="text-blue-600 text-xs font-bold uppercase mb-1">Vehículo</p>
              {isEditing ? (
                 <div className="space-y-2">
                    <input 
                        className="w-full p-1 border rounded text-sm font-bold" 
                        value={formData.model} 
                        onChange={e => setFormData({...formData, model: e.target.value})}
                        placeholder="Modelo"
                    />
                    <input 
                        className="w-full p-1 border rounded text-xs" 
                        value={formData.color} 
                        onChange={e => setFormData({...formData, color: e.target.value})}
                        placeholder="Color"
                    />
                 </div>
              ) : (
                 <>
                    <p className="text-xl font-bold text-gray-900">{service.vehicle.model}</p>
                    <p className="text-gray-600 text-sm">Color: {service.vehicle.color}</p>
                 </>
              )}
            </div>

            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
              <p className="text-gray-500 text-xs font-bold uppercase mb-1">Cliente</p>
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-gray-400" />
                <p className="font-bold text-gray-900">{service.clientName || 'Cliente General'}</p>
              </div>
              <p className="text-xs text-gray-400 mt-1 pl-6">Atendido por: {service.washerName}</p>
            </div>
          </div>

          {/* Fila 2: FINANZAS Y PAGO (Aquí agregamos el método) */}
          <div className="border rounded-xl overflow-hidden">
            <div className="bg-gray-50 px-4 py-2 border-b font-semibold text-gray-700 flex items-center gap-2">
              <DollarSign className="w-4 h-4" /> Desglose Financiero
            </div>
            
            <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
              
              {/* Columna Precio */}
              <div>
                <p className="text-xs text-gray-500 uppercase mb-1">Precio Total</p>
                {isEditing ? (
                    <div className="relative">
                        <span className="absolute left-2 top-2 text-gray-500">$</span>
                        <input 
                            type="number"
                            className="w-full pl-6 p-2 border rounded font-bold"
                            value={formData.totalPrice}
                            onChange={e => setFormData({...formData, totalPrice: parseFloat(e.target.value) || 0})}
                        />
                    </div>
                ) : (
                    <p className="text-lg font-bold text-gray-900">${service.financials.totalPrice.toFixed(2)}</p>
                )}
              </div>

              {/* Columna Propina */}
              <div>
                <p className="text-xs text-gray-500 uppercase mb-1">Propina</p>
                {isEditing ? (
                    <div className="relative">
                        <span className="absolute left-2 top-2 text-gray-500">$</span>
                        <input 
                            type="number"
                            className="w-full pl-6 p-2 border rounded font-bold bg-yellow-50 border-yellow-200"
                            value={formData.tipAmount}
                            onChange={e => setFormData({...formData, tipAmount: parseFloat(e.target.value) || 0})}
                        />
                    </div>
                ) : (
                    <p className="text-lg font-bold text-yellow-600">${service.financials.tipAmount.toFixed(2)}</p>
                )}
              </div>

              {/* Columna MÉTODO DE PAGO (NUEVA) */}
              <div>
                <p className="text-xs text-gray-500 uppercase mb-1 flex items-center gap-1">
                    <CreditCard className="w-3 h-3" /> Método Pago
                </p>
                {isEditing ? (
                    <select 
                        className="w-full p-2 border rounded font-medium text-sm bg-white"
                        value={formData.paymentMethod}
                        onChange={e => setFormData({...formData, paymentMethod: e.target.value})}
                    >
                        <option value="Efectivo">Efectivo</option>
                        <option value="Yappy">Yappy</option>
                        <option value="Tarjeta">Tarjeta</option>
                        <option value="Transferencia">Transferencia</option>
                    </select>
                ) : (
                    <span className={`px-3 py-1 rounded-full text-sm font-bold border ${
                        formData.paymentMethod === 'Efectivo' ? 'bg-green-100 text-green-700 border-green-200' :
                        formData.paymentMethod === 'Yappy' ? 'bg-blue-100 text-blue-700 border-blue-200' :
                        'bg-gray-100 text-gray-700 border-gray-200'
                    }`}>
                        {formData.paymentMethod}
                    </span>
                )}
              </div>

            </div>

            {isEditing && (
                <p className="px-4 pb-2 text-xs text-red-500 italic bg-gray-50">
                    * El cambio de precio recalculará la comisión del lavador.
                </p>
            )}
          </div>
          
           {/* Fila 3: Observaciones */}
           <div className="bg-orange-50 p-4 rounded-xl border border-orange-100">
              <p className="text-orange-800 text-xs font-bold uppercase mb-1 flex items-center gap-1">
                  <FileText className="w-3 h-3" /> Observaciones
              </p>
              {isEditing ? (
                  <textarea 
                    className="w-full p-2 border rounded text-sm"
                    rows={2}
                    value={formData.observations}
                    onChange={e => setFormData({...formData, observations: e.target.value})}
                  />
              ) : (
                  <p className="text-gray-800 text-sm italic">"{service.observations || 'Sin observaciones'}"</p>
              )}
           </div>

        </div>

        {/* Pie de página */}
        <div className="p-4 border-t bg-gray-50 flex justify-between items-center">
            {isEditing ? (
                <>
                    <button onClick={() => handleDelete()} className="text-red-600 hover:text-red-800 flex items-center gap-1 text-sm font-bold">
                        <Trash2 className="w-4 h-4" /> Eliminar
                    </button>
                    <div className="flex gap-2">
                        <button onClick={() => setIsEditing(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg">Cancelar</button>
                        <button onClick={handleSave} disabled={loading} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold flex items-center gap-2">
                            <Save className="w-4 h-4" /> Guardar
                        </button>
                    </div>
                </>
            ) : (
                <>
                    <div className="text-xs text-gray-400 flex flex-col">
                        <span>Registrado:</span>
                        <span>{dateStr}</span>
                    </div>
                    <div className="flex gap-2">
                        <button 
                            onClick={() => setIsEditing(true)}
                            className="px-4 py-2 border bg-white hover:bg-gray-50 text-gray-700 rounded-lg font-medium flex items-center gap-2"
                        >
                            <Edit className="w-4 h-4" /> Editar
                        </button>
                        <button onClick={onClose} className="px-6 py-2 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800">
                            Cerrar
                        </button>
                    </div>
                </>
            )}
        </div>
      </div>
    </div>
  );
}