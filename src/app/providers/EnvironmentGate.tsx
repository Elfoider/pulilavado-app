"use client";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { type ReactNode } from "react";
import { migrationEnvironment } from "@/infrastructure/firebase/client";
export default function EnvironmentGate({children}:{children:ReactNode}){
 const path=usePathname();
 return <><div className="mb-5 rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-950"><strong>Migración V2 · Desarrollo</strong><span className="ml-2">Diagnóstico y pruebas locales</span><Link href="/migration" className="ml-3 font-semibold underline">Centro de migración</Link></div>
 {path==="/migration" || migrationEnvironment.ready ? children : <section className="max-w-2xl rounded-2xl border bg-white p-6 space-y-4"><h1 className="text-2xl font-bold">Preparación de Pulilavado V2</h1><p>Las pantallas operativas de esta rama solo se habilitan en el emulador local. La caja y los datos de producción no están conectados.</p><p className="text-sm text-slate-600">{migrationEnvironment.reason}</p><Link href="/migration" className="inline-block rounded-xl bg-cyan-800 px-4 py-3 font-semibold text-white">Abrir diagnóstico de migración</Link><p className="text-sm text-slate-500">Consulte docs/migration/README.md para configurar el entorno de pruebas.</p></section>}</>;
}
