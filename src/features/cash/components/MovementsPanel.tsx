"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { businessDay, weekOf } from "@/features/operations/domain/treasury-model";
import { METHODS } from "@/features/operations/domain/model";
import { loadCashReport } from "@/features/reports/infrastructure/loadCash";
import { type DetailedMovement, type PeriodCash, movementKinds } from "@/features/reports/domain/cash";
import { formatMoney } from "@/shared/lib/utils";

const PAGE_SIZE = 50;
export default function MovementsPanel() {
  const today = businessDay();
  const [start, setStart] = useState(weekOf(today));
  const [end, setEnd] = useState(today);
  const [range, setRange] = useState({ start: weekOf(today), end: today });
  const [revision, setRevision] = useState(0);
  const [page, setPage] = useState(0);
  const [state, setState] = useState<{key: string; loading: boolean; error: string; rows: DetailedMovement[]; cash?: PeriodCash}>({key:"",loading:true,error:"",rows:[]});
  const key = `${range.start}|${range.end}|${revision}`;
  useEffect(() => {
    let active = true;
    loadCashReport(range).then(result => {
      if (active) setState({key,loading:false,error:"",rows:result.movements,cash:result.periodCash});
    }).catch(error => {
      if (active) setState({key,loading:false,error:error instanceof Error ? error.message : "No se pudieron cargar los movimientos.",rows:[]});
    });
    return () => { active = false; };
  }, [range, key]);
  const loading = state.key !== key || state.loading;
  const ready = !loading && !state.error;
  const pages = Math.max(1, Math.ceil(state.rows.length / PAGE_SIZE));
  function preset(week: boolean) {
    const first = week ? weekOf(today) : today;
    setStart(first); setEnd(today); setRange({start:first,end:today}); setPage(0); setRevision(value=>value+1);
  }
  return <div className="space-y-6 pb-10">
    <div className="flex justify-between gap-3 flex-wrap items-start">
      <div><h2 className="text-2xl font-black text-gray-800">Movimientos de caja</h2><p className="text-sm text-gray-500 mt-1">Consulta las cajas abiertas y cerradas del período seleccionado.</p></div>
      <Link href="/reports" className="text-cyan-800 underline">Reportes y exportación Excel</Link>
    </div>
    <form className="bg-white border rounded-xl p-5 flex flex-wrap gap-3 items-end" onSubmit={event=>{
      event.preventDefault(); setRange({start,end}); setPage(0); setRevision(value=>value+1);
    }}>
      <label className="text-sm">Desde<input aria-label="Fecha inicial de movimientos" required type="date" value={start} onChange={event=>setStart(event.target.value)} className="block border rounded-lg p-2 mt-1"/></label>
      <label className="text-sm">Hasta<input aria-label="Fecha final de movimientos" required type="date" min={start} value={end} onChange={event=>setEnd(event.target.value)} className="block border rounded-lg p-2 mt-1"/></label>
      <button type="submit" className="bg-cyan-800 text-white px-4 py-2 rounded-lg">Consultar movimientos</button>
      <button type="button" onClick={()=>preset(false)} className="border px-4 py-2 rounded-lg">Hoy</button>
      <button type="button" onClick={()=>preset(true)} className="border px-4 py-2 rounded-lg">Esta semana</button>
    </form>
    <p className="text-sm text-gray-500">Del {range.start} al {range.end} · Horario de Caracas · Semana de martes a lunes</p>
    {loading && <p role="status">Cargando movimientos…</p>}
    {!loading && state.error && <p role="alert" className="text-red-700 bg-red-50 rounded-lg p-4">{state.error}</p>}
    {ready && <>
      <div className="grid sm:grid-cols-3 gap-3">
        <div className="border rounded-xl p-4 bg-white"><p className="text-sm text-gray-500">Movimientos registrados</p><strong className="text-2xl">{state.rows.length}</strong></div>
        <div className="border rounded-xl p-4 bg-white"><p className="text-sm text-gray-500">Entradas netas en efectivo, sin aperturas</p><strong className="text-2xl">{formatMoney(state.cash?.incoming ?? 0)}</strong></div>
        <div className="border rounded-xl p-4 bg-white"><p className="text-sm text-gray-500">Salidas de efectivo</p><strong className="text-2xl">{formatMoney(state.cash?.outgoing ?? 0)}</strong></div>
      </div>
      {state.rows.length === 0 ? <p className="bg-white border rounded-xl p-5">No hay movimientos en este rango de fechas.</p> : <>
        <div className="overflow-x-auto bg-white border rounded-xl">
          <table className="w-full text-sm"><thead className="bg-slate-100 text-left"><tr>{["Fecha y hora", "Movimiento / motivo", "Método", "Monto", "Saldo antes", "Saldo después", "Detalle"].map(title=><th key={title} className="p-3 whitespace-nowrap">{title}</th>)}</tr></thead>
            <tbody>{state.rows.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE).map(row=><tr key={row.id} className="border-t align-top">
              <td className="p-3 whitespace-nowrap">{row.createdAt ? new Date(row.createdAt.seconds*1000).toLocaleString("es-VE",{timeZone:"America/Caracas"}) : "Sin fecha"}</td>
              <td className="p-3 min-w-56"><p className="font-semibold">{movementKinds[row.kind] ?? row.kind}</p><p className="text-gray-600 whitespace-pre-wrap">{row.description}</p>{row.washerName && <p className="text-cyan-800">Lavador: {row.washerName}</p>}</td>
              <td className="p-3">{row.method}</td><td className={`p-3 whitespace-nowrap font-semibold ${row.amount<0?"text-red-700":"text-emerald-700"}`}>{formatMoney(row.amount)}</td>
              <td className="p-3 whitespace-nowrap">{row.balancesBefore ? formatMoney(row.balancesBefore[row.method]) : "No disponible"}</td>
              <td className="p-3 whitespace-nowrap">{row.balancesAfter ? formatMoney(row.balancesAfter[row.method]) : "No disponible"}</td>
              <td className="p-3"><details><summary className="cursor-pointer text-cyan-800 whitespace-nowrap">Ver detalle</summary><div className="space-y-2 mt-2 min-w-64"><p className="break-all">Caja: {row.sessionId}</p><p className="break-all">Referencia: {row.referenceId}</p><p className="break-all">Movimiento: {row.id}</p><p>Saldos: {row.balanceSource}</p>{METHODS.map(method=><p key={method}>{method}: {row.balancesBefore ? formatMoney(row.balancesBefore[method]) : "No disponible"} → {row.balancesAfter ? formatMoney(row.balancesAfter[method]) : "No disponible"}</p>)}</div></details></td>
            </tr>)}</tbody>
          </table>
        </div>
        <div className="flex gap-3 items-center flex-wrap"><button disabled={page===0} onClick={()=>setPage(value=>value-1)} className="border rounded-lg px-3 py-2 disabled:opacity-40">Anterior</button><span>Página {page+1} de {pages} · {state.rows.length} movimientos</span><button disabled={page+1>=pages} onClick={()=>setPage(value=>value+1)} className="border rounded-lg px-3 py-2 disabled:opacity-40">Siguiente</button></div>
      </>}
    </>}
  </div>;
}
