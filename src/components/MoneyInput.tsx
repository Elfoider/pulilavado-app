"use client"

import { DollarSign } from 'lucide-react';

interface MoneyInputProps {
  label: string;
  value: number; // El valor real (ej: 20.00)
  onChange: (val: number) => void;
  disabled?: boolean;
}

export default function MoneyInput({ label, value, onChange, disabled }: MoneyInputProps) {
  
  // Función que maneja el cambio "estilo Banco"
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // 1. Obtener solo los números de lo que el usuario escribió (eliminar letras, puntos, simbolos)
    const rawValue = e.target.value.replace(/\D/g, '');
    
    // 2. Convertir a entero (Ej: si escribe "2000", es 2000 centavos)
    const integerValue = parseInt(rawValue || '0', 10);
    
    // 3. Dividir entre 100 para obtener decimales (Ej: 2000 -> 20.00)
    onChange(integerValue / 100);
  };

  // Función para mostrar el valor bonito (Ej: "20.00")
  const displayValue = () => {
    if (value === 0) return ''; // Opcional: dejar vacío si es 0, o retornar '0.00'
    return value.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  return (
    <div>
      <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
        {label}
      </label>
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <DollarSign className="h-5 w-5 text-gray-400" />
        </div>
        <input
          type="text"
          inputMode="numeric" // Activa teclado numérico en celulares
          value={displayValue()} // Mostramos "20.00"
          placeholder="0.00"
          onChange={handleChange}
          disabled={disabled}
          className="pl-10 block w-full rounded-xl border-gray-300 bg-gray-50 border focus:bg-white focus:ring-2 focus:ring-espuma-blue focus:border-transparent font-black text-gray-800 text-lg shadow-sm transition-all"
        />
      </div>
    </div>
  );
}