"use client"

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { Search, UserPlus, Star, Phone, Calendar, Trash2, Pencil, X } from 'lucide-react'; // <--- Nuevos Iconos

interface Client {
  id: string;
  name: string;
  phone: string;
  frequent: boolean;
  notes?: string;
  lastVisit?: any;
}

export default function ClientsManager() {
  const [clients, setClients] = useState<Client[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  
  // Estado para el formulario (Create/Edit)
  const [formData, setFormData] = useState({ id: '', name: '', phone: '', notes: '' });
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "clients"), orderBy("name"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Client));
      setClients(data);
    });
    return () => unsubscribe();
  }, []);

  const filteredClients = clients.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    c.phone.includes(searchTerm)
  );

  // Preparar formulario para Editar
  const handleEditClick = (client: Client) => {
    setFormData({ 
      id: client.id, 
      name: client.name, 
      phone: client.phone, 
      notes: client.notes || '' 
    });
    setIsEditing(true);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Guardar (Crear o Actualizar)
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if(!formData.name) return;

    try {
      if (isEditing && formData.id) {
        // ACTUALIZAR
        await updateDoc(doc(db, "clients", formData.id), {
          name: formData.name,
          phone: formData.phone,
          notes: formData.notes
        });
        alert("Cliente actualizado");
      } else {
        // CREAR
        await addDoc(collection(db, "clients"), {
          name: formData.name,
          phone: formData.phone,
          notes: formData.notes,
          frequent: false,
          createdAt: serverTimestamp()
        });
        alert("Cliente creado");
      }
      resetForm();
    } catch (error) {
      console.error(error);
      alert("Error al guardar");
    }
  };

  // Eliminar
  const handleDelete = async (id: string) => {
    if (confirm("¿Estás seguro de eliminar este cliente? Esta acción no se puede deshacer.")) {
      await deleteDoc(doc(db, "clients", id));
    }
  };

  const resetForm = () => {
    setFormData({ id: '', name: '', phone: '', notes: '' });
    setIsEditing(false);
    setShowForm(false);
  };

  // Toggle Frecuente
  const toggleFrequent = async (client: Client) => {
    await updateDoc(doc(db, "clients", client.id), { frequent: !client.frequent });
  };

  return (
    <div className="space-y-6">
      
      {/* Barra superior */}
      <div className="flex flex-col md:flex-row gap-4 justify-between items-center bg-white p-4 rounded-xl shadow-sm border">
        <div className="relative w-full md:w-96">
            <Search className="absolute left-3 top-3 text-gray-400 w-5 h-5" />
            <input 
                type="text" 
                placeholder="Buscar cliente..." 
                className="pl-10 p-2 border rounded-lg w-full"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
            />
        </div>
        <button 
            onClick={() => { resetForm(); setShowForm(!showForm); }}
            className={`px-4 py-2 rounded-lg font-bold flex items-center gap-2 w-full md:w-auto justify-center transition ${showForm ? 'bg-gray-200 text-gray-700' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
        >
            {showForm ? <X className="w-5 h-5" /> : <UserPlus className="w-5 h-5" />}
            {showForm ? 'Cancelar' : 'Nuevo Cliente'}
        </button>
      </div>

      {/* Formulario */}
      {showForm && (
        <div className="bg-blue-50 p-6 rounded-xl border border-blue-100 animate-in slide-in-from-top-4">
            <h3 className="font-bold mb-4 text-blue-800">
              {isEditing ? 'Editar Cliente' : 'Registrar Nuevo Cliente'}
            </h3>
            <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                <div>
                    <label className="text-sm font-semibold text-gray-600">Nombre</label>
                    <input className="w-full border p-2 rounded mt-1" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                </div>
                <div>
                    <label className="text-sm font-semibold text-gray-600">Teléfono</label>
                    <input className="w-full border p-2 rounded mt-1" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
                </div>
                <div>
                    <label className="text-sm font-semibold text-gray-600">Nota</label>
                    <input className="w-full border p-2 rounded mt-1" value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} />
                </div>
                <button className="bg-green-600 text-white p-2 rounded font-bold hover:bg-green-700 w-full">
                  {isEditing ? 'Actualizar Datos' : 'Guardar Cliente'}
                </button>
            </form>
        </div>
      )}

      {/* Grid de Clientes */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredClients.map(client => (
            <div key={client.id} className={`p-4 rounded-xl border relative group transition-all ${client.frequent ? 'bg-yellow-50 border-yellow-200' : 'bg-white hover:shadow-md'}`}>
                
                {/* Botones de Acción (Absolute) */}
                <div className="absolute top-4 right-4 flex gap-2">
                   <button onClick={() => handleEditClick(client)} className="text-gray-400 hover:text-blue-600" title="Editar">
                      <Pencil className="w-4 h-4" />
                   </button>
                   <button onClick={() => handleDelete(client.id)} className="text-gray-400 hover:text-red-600" title="Eliminar">
                      <Trash2 className="w-4 h-4" />
                   </button>
                   <button onClick={() => toggleFrequent(client)} className={`hover:scale-110 transition ${client.frequent ? 'text-yellow-400' : 'text-gray-300'}`} title="Frecuente">
                      <Star className={`w-4 h-4 ${client.frequent ? 'fill-yellow-400' : ''}`} />
                   </button>
                </div>

                <div className="flex items-start gap-3 mt-2">
                    <div className="bg-gray-200 w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg text-gray-600">
                        {client.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <h4 className="font-bold text-gray-800">{client.name}</h4>
                        <div className="flex items-center gap-1 text-sm text-gray-500">
                            <Phone className="w-3 h-3" /> {client.phone || 'N/A'}
                        </div>
                    </div>
                </div>
                {client.notes && <p className="mt-3 text-xs text-gray-500 italic">"{client.notes}"</p>}
            </div>
        ))}
      </div>
    </div>
  );
}