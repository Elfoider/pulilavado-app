import fs from 'node:fs';
import path from 'node:path';
import audit from '../../.migration-build/features/migration/domain/audit.js';
const {auditSnapshot}=audit;
async function main(){
 const [file,...args]=process.argv.slice(2);const allowed=new Set(['--organization','--branch','--out']);const opts={};
 if(!file||args.length%2)throw Error('Uso: npm run migration:check -- copia.json --organization ID --branch ID [--out diagnostico.json]');
 for(let i=0;i<args.length;i+=2){if(!allowed.has(args[i])||!args[i+1]||opts[args[i]])throw Error('Argumentos inválidos o repetidos.');opts[args[i]]=args[i+1];}
 if(!opts['--organization']||!opts['--branch'])throw Error('Indique organización y sede explícitas.');
 if(fs.statSync(file).size>50*1024*1024)throw Error('Máximo 50 MB por archivo.');
 const report=await auditSnapshot(JSON.parse(fs.readFileSync(file,'utf8')),{organizationId:opts['--organization'],branchId:opts['--branch']});
 const output=JSON.stringify(report,null,2)+'\n';
 if(opts['--out']){if(fs.realpathSync(file)===path.resolve(opts['--out']))throw Error('El diagnóstico no puede reemplazar la copia original.');fs.writeFileSync(opts['--out'],output,{flag:'wx'});console.log(`Diagnóstico creado. Errores: ${report.summary.errors}. Revisiones: ${report.summary.warnings}. Sin escrituras en Firebase.`);}else process.stdout.write(output);
 if(!report.dataChecksPassed)process.exitCode=2;
}
main().catch(()=>{console.error('No se pudo completar el diagnóstico. Revise formato, ruta, argumentos y permisos locales. No se modificaron datos de Firebase.');process.exitCode=2;});
