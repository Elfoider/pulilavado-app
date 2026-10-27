"use client";
import NumberInput from "./NumberInput";
import HelpTip from "./HelpTip";
import { useState } from "react";
import { useCollection } from "@/lib/useCollection";
import { type CatalogService, type ServiceLine } from "@/lib/operations/model";
import { formatMoney } from "@/lib/utils";
export default function ServiceCatalogPicker({value,onChange}:{value:ServiceLine[];onChange:(lines:ServiceLine[])=>void}) {
  const {data,error,loading}=useCollection<CatalogService>("serviceCatalog");
  const [selected,setSelected]=useState("");
  return <section className="border rounded-xl p-4 bg-cyan-50 space-y-3"><h3 className="font-bold">Servicios del vehículo</h3>
    {error && <p role="alert" className="text-red-700 text-sm">{error}</p>}
    <div className="flex gap-2"><select aria-label="Servicio del catálogo" value={selected} onChange={e=>setSelected(e.target.value)} className="border rounded-lg p-2 bg-white min-w-0 flex-1"><option value="">{loading?"Cargando catálogo…":"Seleccionar servicio"}</option>{data.filter(item=>item.active && !value.some(line=>line.catalogId===item.id)).sort((a,b)=>a.name.localeCompare(b.name)).map(item=><option key={item.id} value={item.id}>{item.name} · {formatMoney(item.price)}</option>)}</select><button type="button" disabled={!selected} onClick={()=>{const item=data.find(item=>item.id===selected);if(item){onChange([...value,{catalogId:item.id,name:item.name,basePrice:item.price,unitPrice:item.price}]);setSelected("");}}} className="px-3 bg-cyan-800 text-white rounded-lg disabled:opacity-40">Agregar</button></div>
    {value.map(line=><div key={line.catalogId} className="border-t pt-3 space-y-2"><p className="font-semibold text-sm">{line.name} <span className="text-xs font-normal text-gray-500">Base: {formatMoney(line.basePrice)}</span></p><div className="flex gap-2 items-end"><label className="text-xs flex-1">Precio para este vehículo<NumberInput aria-label={`Precio de ${line.name}`} min="0" step="0.01" required value={line.unitPrice} onValueChange={price=>onChange(value.map(item=>item.catalogId===line.catalogId?{...item,unitPrice:price}:item))} className="block w-full border rounded-lg p-2 bg-white"/></label><button type="button" aria-label={`Quitar ${line.name}`} onClick={()=>onChange(value.filter(item=>item.catalogId!==line.catalogId))} className="text-red-700 p-2">Quitar</button></div></div>)}
    <HelpTip label="Precios por vehículo">Puedes ajustar cada precio para este vehículo sin cambiar el catálogo. También puedes registrar un lavado con precio manual.</HelpTip>
  </section>;
}
