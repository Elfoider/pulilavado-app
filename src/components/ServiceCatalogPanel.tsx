"use client";
import HelpTip from "./HelpTip";
import { useState } from "react";
import { useCollection } from "@/lib/useCollection";
import { type CatalogService } from "@/lib/operations/model";
import { newId, operations } from "@/lib/operations";
import { formatMoney } from "@/lib/utils";
import { enqueueSnackbar } from "notistack";
export default function ServiceCatalogPanel(){
 const {data,error,loading}=useCollection<CatalogService>("serviceCatalog");
 const [id,setId]=useState(newId),[editing,setEditing]=useState(false),[name,setName]=useState(""),[price,setPrice]=useState(""),[active,setActive]=useState(true),[busy,setBusy]=useState(false);
 function reset(){setId(newId());setEditing(false);setName("");setPrice("");setActive(true);}
 return <div className="space-y-6"><h1 className="text-2xl font-black">Catálogo de servicios</h1><HelpTip label="Cómo funciona el catálogo">Define los precios base. Cada vehículo conserva los servicios y precios con los que fue registrado.</HelpTip>
 {error&&<p role="alert" className="text-red-700">{error}</p>}
 <form className="bg-white border rounded-xl p-5 space-y-3 max-w-xl" onSubmit={async event=>{event.preventDefault();if(busy)return;setBusy(true);try{await operations.saveCatalogService(id,{name,price:Number(price),active});reset();enqueueSnackbar("Servicio del catálogo guardado.",{variant:"success"});}catch(error){enqueueSnackbar(error instanceof Error?error.message:"No se pudo guardar.",{variant:"error"});}finally{setBusy(false);}}}>
 <h2 className="font-bold">{editing?"Editar servicio":"Nuevo servicio"}</h2><label className="block text-sm">Nombre<input required maxLength={120} value={name} onChange={e=>setName(e.target.value)} className="block w-full border rounded-lg p-2"/></label><label className="block text-sm">Precio base ($)<input required type="number" min="0" step="0.01" value={price} onChange={e=>setPrice(e.target.value)} className="block w-full border rounded-lg p-2"/></label><label className="flex gap-2"><input type="checkbox" checked={active} onChange={e=>setActive(e.target.checked)}/>Disponible para nuevos vehículos</label><div className="flex gap-3"><button disabled={busy} className="bg-cyan-800 text-white px-4 py-2 rounded-lg disabled:opacity-40">Guardar servicio</button>{editing&&<button disabled={busy} type="button" onClick={reset} className="border px-4 py-2 rounded-lg">Cancelar edición</button>}</div></form>
 {loading?<p>Cargando catálogo…</p>:<div className="bg-white border rounded-xl overflow-x-auto"><table className="w-full text-sm text-left"><thead><tr>{["Servicio","Precio base","Estado","Acción"].map(label=><th key={label} className="p-3">{label}</th>)}</tr></thead><tbody>{[...data].sort((a,b)=>a.name.localeCompare(b.name)).map(item=><tr key={item.id} className="border-t"><td className="p-3">{item.name}</td><td className="p-3">{formatMoney(item.price)}</td><td className="p-3">{item.active?"Activo":"Inactivo"}</td><td className="p-3"><button disabled={busy} onClick={()=>{setId(item.id);setEditing(true);setName(item.name);setPrice(String(item.price));setActive(item.active);}} className="text-cyan-800 underline">Editar</button></td></tr>)}</tbody></table>{!data.length&&<p className="p-4 text-gray-500">Agrega el primer servicio del catálogo.</p>}</div>}
 </div>;
}
