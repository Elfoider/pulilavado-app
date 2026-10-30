import Link from "next/link";
import { ArrowUpRight, BarChart3, History, Mail, Package, Settings, ShoppingCart, Users } from "lucide-react";
import { type ReactNode } from "react";
function CashRegister(){return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true"><path d="M3 14h18v7H3zM5 14l2-7h10l2 7M9 7V3h8v4M9 17h6M7 10h1m3 0h1m3 0h1"/><path d="M18 3h2v4h-2"/></svg>}
const icons={"/cash":CashRegister,"/reports":BarChart3,"/movements":History,"/envelopes":Mail,"/sales":ShoppingCart,"/catalog":Settings,"/inventory":Package,"/washers":Users};
export default function SectionLink({href,children}:{href:keyof typeof icons;children:ReactNode}){const Icon=icons[href];return <Link href={href} className="inline-flex items-center gap-2 rounded-xl border border-cyan-100 bg-white px-3 py-2 text-sm font-semibold text-cyan-900 shadow-sm transition hover:border-cyan-300 hover:bg-cyan-50 focus-visible:outline-2 focus-visible:outline-cyan-600"><Icon className="h-4 w-4"/><span>{children}</span><ArrowUpRight className="h-3.5 w-3.5 opacity-50"/></Link>}
