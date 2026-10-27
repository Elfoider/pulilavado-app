export const CUSTOM_SERVICE_NAME = "Servicio personalizado";
type ActivityRecord = {
  status?: string;
  serviceItems?: {catalogId: string; name: string}[];
};
export function summarizeActivity(records: ActivityRecord[]) {
  const groups=new Map<string,{id:string;name:string;count:number}>();
  let vehicles=0,services=0;
  for(const record of records){
    if(record.status === "cancelled")continue;
    vehicles++;
    const lines=record.serviceItems?.length ? record.serviceItems.map(line=>({id:`catalog:${line.catalogId}`,name:line.name})) : [{id:"custom",name:CUSTOM_SERVICE_NAME}];
    for(const line of lines){
      const existing=groups.get(line.id);
      if(existing)existing.count++;else groups.set(line.id,{...line,count:1});
      services++;
    }
  }
  return {vehicles,services,rows:[...groups.values()].sort((a,b)=>b.count-a.count || a.name.localeCompare(b.name))};
}
