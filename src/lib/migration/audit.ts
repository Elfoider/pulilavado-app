import { METHODS, isCashSession, isLegacyCashSession, paymentParts, type CashMovement } from "../operations/model";
import { isEnvelope } from "../operations/treasury-model";
import { cashSavings } from "../reports/cash";
export const COLLECTIONS=["clients","washers","serviceCatalog","settings","products","productCodes","services","sales","cashSessions","cashMovements","cashAdvances","cashEnvelopes","envelopeMovements","inventoryMovements","cashControl","treasuryControl"] as const;
type Row={id:string;data:Record<string,unknown>};
type Issue={severity:"error"|"warning";code:string;path:string;message:string};
export type Scope={organizationId:string;branchId:string};
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==="object"&&!Array.isArray(value);
const finite=(value:unknown):value is number=>typeof value==="number"&&Number.isFinite(value);
const positive=(value:unknown):value is number=>finite(value)&&value>0;
const validId=(value:unknown):value is string=>typeof value==="string"&&value.length>0&&value.length<=500&&!value.includes("/")&&value!=="."&&value!=="..";
const scopedId=(value:string)=>/^[a-zA-Z0-9_-]{1,80}$/.test(value);
function canonical(value:unknown):string {
 if(Array.isArray(value))return `[${value.map(canonical).join(",")}]`;
 if(object(value))return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
 return JSON.stringify(value) ?? "null";
}
export async function auditSnapshot(input:unknown,scope:Scope){
 if(!scopedId(scope.organizationId)||!scopedId(scope.branchId))throw new Error("Organización y sede deben usar letras, números, guion o guion bajo (máximo 80). ");
 if(!object(input)||input.format!=="pulilavado-snapshot-v1"||!object(input.source)||typeof input.source.projectId!=="string"||!input.source.projectId.trim()||typeof input.source.databaseId!=="string"||!input.source.databaseId.trim()||typeof input.exportedAt!=="string"||!Number.isFinite(Date.parse(input.exportedAt))||!object(input.collections))throw new Error("El archivo no cumple el formato pulilavado-snapshot-v1. Use el ejemplo documentado.");
 const issues:Issue[]=[];const add=(severity:Issue["severity"],code:string,path:string,message:string)=>issues.push({severity,code,path,message});
 const collections=new Map<string,Map<string,Row>>();let documentCount=0;
 for(const name of COLLECTIONS){
  const docs=input.collections[name];const map=new Map<string,Row>();collections.set(name,map);
  if(!Array.isArray(docs)){add("error","MISSING_COLLECTION",name,"Incluya esta colección como arreglo, incluso si está vacía.");continue;}
  for(const row of docs){
   if(++documentCount>50000)throw new Error("Máximo 50.000 documentos por diagnóstico. Divida la revisión de forma controlada.");
   if(!object(row)||!validId(row.id)||!object(row.data)){add("error","INVALID_DOCUMENT",name,"Documento inválido: se requieren id y data.");continue;}
   if(map.has(row.id)){add("error","DUPLICATE_ID",`${name}/${row.id}`,"Identificador repetido; no se puede resolver automáticamente.");continue;}
   map.set(row.id,{id:row.id,data:row.data});
  }
 }
 for(const name of Object.keys(input.collections))if(!(COLLECTIONS as readonly string[]).includes(name))add("error","UNKNOWN_COLLECTION",name,"Colección no contemplada: debe mapearse antes de importar.");
 const rows=(name:string)=>[...collections.get(name)!.values()];const exists=(name:string,id:unknown)=>typeof id==="string"&&collections.get(name)!.has(id);
 const reference=(collection:string,id:unknown,path:string,required=true)=>{if(!exists(collection,id))add(required?"error":"warning","MISSING_REFERENCE",path,`No se encontró la referencia en ${collection}; requiere revisión.`);};
 for(const name of ["products","serviceCatalog"]){for(const {id,data}of rows(name)){
  const path=`${name}/${id}`;
  if(typeof data.name!=="string"||!data.name.trim())add("error","INVALID_NAME",path,"Falta nombre.");
  if(!finite(data.price)||data.price<0)add("error","INVALID_PRICE",path,"Precio inválido.");
  if(name==="products"&&(!finite(data.stock)||data.stock<0))add("error","INVALID_STOCK",path,"Existencia negativa o inválida.");
 }}
 for(const {id,data}of rows("washers"))if(data.commissionPercentage!=null&&(!finite(data.commissionPercentage)||data.commissionPercentage<0||data.commissionPercentage>100))add("error","INVALID_COMMISSION",`washers/${id}`,"Comisión individual fuera de rango.");
 for(const {id,data}of rows("inventoryMovements")){
  reference("products",data.productId,`inventoryMovements/${id}`);
  if(!finite(data.quantity)||!finite(data.before)||!finite(data.after)||Math.abs(data.before+data.quantity-data.after)>.005)add("error","INVALID_INVENTORY_MOVEMENT",`inventoryMovements/${id}`,"La cantidad no coincide con el saldo antes y después.");
 }
 for(const name of ["services","sales"]){for(const {id,data}of rows(name)){
  const path=`${name}/${id}`;const fin=name==="services"?data.financials:data;
  if(!object(fin)||!finite(name==="services"?fin.totalPrice:fin.total)){add("error","INVALID_FINANCIALS",path,"Faltan importes financieros válidos.");continue;}
  const total=Number(name==="services"?fin.totalPrice:fin.total);
  if(total<0)add("error","NEGATIVE_TOTAL",path,"Total negativo.");
  const paid=name==="sales"?data.status==="paid":data.paymentStatus!=="pending"&&data.status!=="cancelled";
  if(paid){try{paymentParts(total,String(fin.paymentMethod),fin.payments as Parameters<typeof paymentParts>[2]);}catch{add("error","PAYMENT_MISMATCH",path,"El reparto de pagos no coincide con el total o contiene métodos inválidos.");}}
  if(data.cashSessionId)reference("cashSessions",data.cashSessionId,path);
  else if(paid)add("warning","LEGACY_NO_CASH",path,"Cobro anterior sin sesión de Caja: conservar como histórico, no crear otro ingreso.");
  if(name==="services"){
   reference("washers",data.washerId,path,false);
   if((finite(fin.washerEarnings)&&fin.washerEarnings<0)||(finite(fin.businessEarnings)&&fin.businessEarnings<0))add("error","NEGATIVE_ALLOCATION",path,"Hay importes negativos en la distribución de comisiones.");
   if(fin.commissionRate!==undefined&&(!finite(fin.commissionRate)||fin.commissionRate<0||fin.commissionRate>1))add("error","INVALID_COMMISSION",path,"Porcentaje histórico de comisión fuera de rango.");
   if(fin.tipAmount!==undefined&&(!finite(fin.tipAmount)||fin.tipAmount<0||(fin.tipAmount>0&&!(METHODS as readonly unknown[]).includes(fin.tipMethod))))add("error","INVALID_TIP",path,"Monto o método de propina inválido.");
   if(Array.isArray(data.serviceItems))for(const line of data.serviceItems){
    if(!object(line)||!validId(line.catalogId)||!finite(line.unitPrice)||line.unitPrice<0)add("error","INVALID_SERVICE_LINE",path,"Servicio seleccionado con precio o referencia inválida.");
   }

   if(finite(fin.servicePrice)&&finite(fin.productsTotal)&&Math.abs(fin.servicePrice+fin.productsTotal-total)>.005)add("error","TOTAL_MISMATCH",path,"Servicios y productos no suman el total.");
   if(finite(fin.washerEarnings)&&finite(fin.businessEarnings)&&Math.abs(fin.washerEarnings+fin.businessEarnings-total)>.005)add("error","COMMISSION_MISMATCH",path,"La distribución histórica de comisiones no concilia.");
   if(!Array.isArray(data.serviceItems)||!data.serviceItems.length)add("warning","CUSTOM_SERVICE",path,"Sin desglose de catálogo: conservar como Servicio personalizado.");
  }
 }}
 const movements=rows("cashMovements");
 for(const {id,data}of movements){
  const path=`cashMovements/${id}`;reference("cashSessions",data.sessionId,path);
  if(!(METHODS as readonly unknown[]).includes(data.method)||!finite(data.amount))add("error","INVALID_CASH_MOVEMENT",path,"Método o importe de movimiento inválido.");
  if(object(data.balancesBefore)&&object(data.balancesAfter)&&finite(data.amount)){
   if(!METHODS.every(method=>finite((data.balancesBefore as Record<string,unknown>)[method])&&finite((data.balancesAfter as Record<string,unknown>)[method])&&Math.abs(Number((data.balancesAfter as Record<string,unknown>)[method])-Number((data.balancesBefore as Record<string,unknown>)[method])-(method===data.method?Number(data.amount):0))<.005))add("error","INVALID_BALANCE_SNAPSHOT",path,"Saldos antes y después incompatibles con el movimiento.");
  }else add("warning","LEGACY_BALANCE_SNAPSHOT",path,"Sin saldos registrados: conservar el original; no inventar estados históricos.");
 }
 const cashSummaries:{id:string;generated:number;saved:number;pending:number}[]=[];const openIds:string[]=[];
 for(const {id,data}of rows("cashSessions")){
  const path=`cashSessions/${id}`;
  if(!isCashSession(data)){add(isLegacyCashSession(data)?"warning":"error","LEGACY_CASH_SCHEMA",path,"Esquema de Caja anterior o incompatible; necesita clasificación manual.");continue;}
  if(data.status==="open")openIds.push(id);
  const own=movements.filter(row=>row.data.sessionId===id);
  const totals=Object.fromEntries(METHODS.map(method=>[method,0]));let valid=true;const sequences=new Set<number>();
  for(const row of own){const entry=row.data;if(!(METHODS as readonly unknown[]).includes(entry.method)||!finite(entry.amount)){valid=false;continue;}totals[String(entry.method)]+=entry.amount;
   if(entry.sequence!==undefined){if(!Number.isSafeInteger(entry.sequence)||Number(entry.sequence)<1||sequences.has(Number(entry.sequence)))add("error","INVALID_SEQUENCE",path,"Secuencia de movimientos repetida o inválida.");sequences.add(Number(entry.sequence));}}
  if(!valid||!METHODS.every(method=>Math.abs(totals[method]-data.balances[method])<.005))add("error","CASH_NOT_RECONCILED",path,"El historial completo de movimientos no concilia con los saldos de Caja.");
  if(own.filter(row=>row.data.kind==="opening").length!==1||own.filter(row=>row.data.kind==="opening"&&row.data.method==="Efectivo"&&row.data.amount===data.openingAmount).length!==1)add("error","INVALID_OPENING",path,"Falta una apertura única que coincida con el fondo inicial.");
  if(data.movementSequence!==undefined&&(sequences.size!==own.length||sequences.size!==data.movementSequence||Math.max(0,...sequences)!==data.movementSequence))add("error","INCOMPLETE_SEQUENCE",path,"Secuencia de Caja incompleta.");
  if(valid){const ledger=own.map(row=>({...row.data,id:row.id}) as unknown as CashMovement);const outgoing=-ledger.filter(row=>row.method==="Efectivo"&&["expense","withdrawal","payroll_advance","envelope_deposit"].includes(row.kind)).reduce((sum,row)=>sum+row.amount,0);const value=cashSavings(ledger,data.balances.Efectivo-data.openingAmount,outgoing);cashSummaries.push({id,generated:value.generated,saved:value.saved,pending:value.pending});}
 }
 if(openIds.length>1)add("error","MULTIPLE_OPEN_CASH","cashSessions","Más de una caja abierta: resolver antes del corte de migración.");
 const control=collections.get("cashControl")!.get("current")?.data.sessionId;
 if(openIds.length&&control!==openIds[0])add("error","CASH_CONTROL_MISMATCH","cashControl/current","El control no apunta a la caja abierta.");
 if(openIds.length)add("warning","OPEN_CASH_CUTOVER","cashSessions","Antes del corte definitivo deben cerrarse y conciliarse las cajas abiertas.");
 for(const {id,data}of rows("cashEnvelopes")){
  if(!isEnvelope(data))add("error","ENVELOPE_NOT_RECONCILED",`cashEnvelopes/${id}`,"El saldo no coincide con inicial, depósitos y retiros del sobre.");
  const entries=rows("envelopeMovements").filter(row=>row.data.envelopeDay===id);
  if(entries.every(row=>finite(row.data.amount))&&finite(data.balance)&&Math.abs(entries.reduce((sum,row)=>sum+Number(row.data.amount),0)-data.balance)>.005)add("error","ENVELOPE_HISTORY_MISMATCH",`cashEnvelopes/${id}`,"El historial del sobre no concilia con su saldo.");
 }
 for(const {id,data}of rows("envelopeMovements")){
  const path=`envelopeMovements/${id}`;reference("cashEnvelopes",data.envelopeDay,path);
  if(!finite(data.amount)||!finite(data.balanceBefore)||!finite(data.balanceAfter)||Math.abs(data.balanceBefore+data.amount-data.balanceAfter)>.005)add("error","INVALID_ENVELOPE_MOVEMENT",path,"Monto o saldos del movimiento no concilian.");
  if(data.kind==="deposit"||data.kind==="to_cash"){
   reference("cashSessions",data.sessionId,path);
   if(movements.filter(row=>row.data.referenceId===id&&row.data.sessionId===data.sessionId&&row.data.method==="Efectivo"&&row.data.kind===(data.kind==="deposit"?"envelope_deposit":"envelope_to_cash")&&finite(row.data.amount)&&Math.abs(Number(row.data.amount)+Number(data.amount))<.005).length!==1)add("error","MISSING_TRANSFER_PAIR",path,"Falta la contrapartida del traslado en Caja.");
  }
 }
 for(const {id,data}of rows("cashAdvances")){
  const path=`cashAdvances/${id}`;reference("washers",data.washerId,path,false);reference("cashSessions",data.sessionId,path);
  if(!positive(data.amount))add("error","INVALID_ADVANCE",path,"El vale debe tener monto positivo.");
  if(movements.filter(row=>row.data.kind==="payroll_advance"&&row.data.referenceId===id&&row.data.sessionId===data.sessionId&&row.data.method==="Efectivo"&&finite(row.data.amount)&&Math.abs(Number(row.data.amount)+Number(data.amount))<.005).length!==1)add("error","ADVANCE_WITHOUT_CASH",path,"El vale no tiene una salida de efectivo equivalente.");
 }
 const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(canonical(input)));
 const fingerprint=Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,"0")).join("");
 const archiveId=`${scope.branchId}-${fingerprint.slice(0,24)}`;
 const organizationCollections=new Set(["clients","washers","serviceCatalog","settings"]);
 const mappings=COLLECTIONS.flatMap(name=>rows(name).map(row=>({sourcePath:`${name}/${row.id}`,scope:organizationCollections.has(name)?"organization":"branch",organizationId:scope.organizationId,...(!organizationCollections.has(name)?{branchId:scope.branchId}:{}),archivePath:`organizations/${scope.organizationId}/migrationArchives/${archiveId}/records/${name}~${row.id}`})));
 return {schemaVersion:1,phase:1,mode:"preview-only",writeEnabled:false,canImport:false,source:{projectId:input.source.projectId,databaseId:input.source.databaseId,exportedAt:input.exportedAt},scope,fingerprint,dataChecksPassed:!issues.some(issue=>issue.severity==="error"),summary:{documents:documentCount,errors:issues.filter(issue=>issue.severity==="error").length,warnings:issues.filter(issue=>issue.severity==="warning").length},counts:COLLECTIONS.map(name=>({collection:name,count:collections.get(name)!.size})),issues,cashSummaries,mappings};
}
