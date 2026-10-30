"use client";
import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/infrastructure/firebase/client";
import { type CashMovement, type CashSession } from "@/features/operations/domain/model";
import { cashTotals, cashSavings } from "@/features/reports/domain/cash";
import { formatMoney } from "@/shared/lib/utils";
import HelpTip from "@/shared/ui/HelpTip";
export default function CashSavings({session}:{session:CashSession}){
 const [state,setState]=useState<{id:string;rows:CashMovement[];error:boolean}>({id:"",rows:[],error:false});
 useEffect(()=>onSnapshot(query(collection(db,"cashMovements"),where("sessionId","==",session.id)),snapshot=>setState({id:session.id,rows:snapshot.docs.map(doc=>({...doc.data(),id:doc.id}) as CashMovement),error:false}),()=>setState({id:session.id,rows:[],error:true})),[session.id]);
 const totals=cashTotals(session,state.rows);
 const ready=state.id===session.id&&!state.error&&totals.reconciled;
 const values=cashSavings(state.rows,totals.net,totals.outgoing);
 return <>{[{label:"Efectivo a guardar de la jornada",amount:values.generated,help:"Resultado neto de la jornada después de gastos, retiros y vales. Guardar en sobres no lo reduce. Excluye el fondo inicial, fondos adicionales y refuerzos desde sobres.",color:"bg-emerald-50 text-emerald-900 border-emerald-100"},{label:"Guardado en sobres",amount:values.saved,help:"Total trasladado desde esta caja a sobres. Es un traslado interno, no un gasto.",color:"bg-cyan-50 text-cyan-950 border-cyan-100"},{label:"Pendiente por guardar",amount:values.pending,help:"Efectivo que aún queda en Caja sobre el fondo inicial. Incluye cualquier refuerzo de efectivo disponible.",color:"bg-slate-50 text-slate-900 border-slate-100"}].map(card=><div key={card.label} aria-label={card.label} className={`rounded-2xl border p-5 ${card.color}`}><p className="text-xs font-bold uppercase tracking-wide">{card.label}</p><p className="text-4xl font-black mt-3">{ready?formatMoney(card.amount):state.error?"No disponible":"—"}</p><div className="mt-2"><HelpTip label={`Sobre ${card.label.toLowerCase()}`}>{card.help}</HelpTip></div></div>)}</>;
}
