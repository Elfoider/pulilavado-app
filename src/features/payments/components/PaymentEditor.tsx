"use client";
import HelpTip from "@/shared/ui/HelpTip";
import { METHODS, type PaymentPart, money } from "@/features/operations/domain/model";
import { formatMoney } from "@/shared/lib/utils";
export default function PaymentEditor({method,payments,onChange,total}:{method:string;payments:PaymentPart[];onChange:(method:string,payments:PaymentPart[])=>void;total:number}) {
  const assigned=money(payments.reduce((sum,p)=>sum+p.amount,0));
  return <section className="space-y-3"><label className="block text-sm font-semibold">Forma de pago<select aria-label="Forma de pago" value={method} onChange={e=>onChange(e.target.value,[])} className="block w-full border rounded-lg p-2 bg-white"><option value="">Seleccionar…</option>{METHODS.map(pm=><option key={pm}>{pm}</option>)}<option value="Mixto">Varios métodos de pago</option></select></label>
    {method === "Mixto" && <><div className="grid grid-cols-2 gap-3">{METHODS.map(pm=><label key={pm} className="text-sm">{pm}<input aria-label={`Monto en ${pm}`} type="number" min="0" step="0.01" value={payments.find(p=>p.method===pm)?.amount ?? ""} onChange={e=>onChange("Mixto",[...payments.filter(p=>p.method!==pm),...(Number(e.target.value)>0?[{method:pm,amount:Number(e.target.value)}]:[])])} className="block w-full border rounded-lg p-2 bg-white" placeholder="0.00"/></label>)}</div><p className={`text-sm ${assigned===money(total)?"text-emerald-700":"text-amber-800"}`}>Total a repartir: {formatMoney(total)} · Asignado: {formatMoney(assigned)} · Diferencia: {formatMoney(money(total-assigned))}</p><HelpTip label="Propinas">La propina se registra aparte con su propio método.</HelpTip></>}
  </section>;
}
