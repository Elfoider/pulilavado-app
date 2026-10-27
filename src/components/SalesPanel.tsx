"use client";
import HelpTip from "./HelpTip";
import SectionLink from "./SectionLink";
import { useState } from "react";
import { enqueueSnackbar } from "notistack";
import PaymentEditor from "./PaymentEditor";
import ProductCart from "./ProductCart";
import { useCollection } from "@/lib/useCollection";
import {
  CartItem,
  PaymentPart,
  ProductLine,
  Data,
  isCashSession,
} from "@/lib/operations/model";
import { newId, operations } from "@/lib/operations";
interface Sale {
  id: string;
  total: number;
  paymentMethod: string;
  payments?: PaymentPart[];
  status: string;
  cashSessionId: string;
  lines: ProductLine[];
  createdAt?: { seconds: number };
}
export default function SalesPanel() {
  const [cart, setCart] = useState<CartItem[]>([]),
    [method, setMethod] = useState("Efectivo"),
    [busy, setBusy] = useState(false),
    [requestId, setRequestId] = useState(newId);
  const [payments,setPayments]=useState<PaymentPart[]>([]);
  const [total,setTotal]=useState(0);
  const { data: sales, error } = useCollection<Sale>("sales", "createdAt");
  const { data: sessions } = useCollection<Data & { id: string }>(
    "cashSessions",
    "openedAt",
    30,
  );
  const open = sessions.filter(isCashSession).find((s) => s.status === "open");
  async function cancel(s: Sale) {
    const reason = prompt(
      "Motivo de anulación. Se devolverán los productos al stock y se revertirá el cobro.",
    );
    if (!reason) return;
    setBusy(true);
    try {
      await operations.cancelSale(s.id, reason);
      enqueueSnackbar("Venta anulada.", { variant: "success" });
    } catch (e) {
      enqueueSnackbar(e instanceof Error ? e.message : "No se pudo anular.", {
        variant: "error",
      });
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-black">Venta de productos</h1>
      <HelpTip label="Venta de productos">
        Venta individual sin registrar un vehículo. Los productos también están
        disponibles en Nuevo servicio.
      </HelpTip>
      {!open && (
        <p className="bg-amber-50 border border-amber-200 p-4 rounded-xl">
          Abra la caja para realizar una venta.{" "}
          <SectionLink href="/cash">Abrir Caja</SectionLink>
        </p>
      )}
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          try {
            await operations.sell(cart, method === "Mixto" ? payments : method, requestId);
            setRequestId(newId());
            setCart([]);
            setPayments([]);setMethod("Efectivo");
            enqueueSnackbar("Venta registrada. Stock y caja actualizados.", {
              variant: "success",
            });
          } catch (e) {
            enqueueSnackbar(
              e instanceof Error ? e.message : "No se pudo vender.",
              { variant: "error" },
            );
          } finally {
            setBusy(false);
          }
        }}
        className="bg-white border rounded-2xl p-5 max-w-2xl space-y-4"
      >
        <ProductCart
          onTotalChange={setTotal}
          value={cart}
          onChange={(v) => {
            setCart(v);
            setRequestId(newId());
          }}
        />
        <PaymentEditor method={method} payments={payments} total={total} onChange={(method,parts)=>{setMethod(method);setPayments(parts);setRequestId(newId());}}/>
        <button
          disabled={busy || !open || !cart.length}
          className="w-full bg-cyan-700 text-white p-3 rounded-xl font-bold disabled:opacity-50"
        >
          {busy ? "Guardando..." : "Cobrar venta"}
        </button>
      </form>
      <section className="bg-white border rounded-2xl p-5">
        <h2 className="text-xl font-bold mb-2">Últimas ventas</h2>
        <p className="text-sm text-gray-500 mb-4">
          150 ventas más recientes. Las anulaciones conservan el registro
          original.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr>
                {[
                  "Fecha",
                  "Productos",
                  "Total",
                  "Método",
                  "Estado",
                  "Acción",
                ].map((h) => (
                  <th key={h} className="p-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sales.map((s) => (
                <tr key={s.id} className="border-t">
                  <td className="p-3">
                    {s.createdAt
                      ? new Date(s.createdAt.seconds * 1000).toLocaleString()
                      : "..."}
                  </td>
                  <td className="p-3">
                    {s.lines.map((l) => `${l.quantity} × ${l.name}`).join(", ")}
                  </td>
                  <td className="p-3 font-bold">${s.total.toFixed(2)}</td>
                  <td className="p-3">{s.payments?.map(part=>`${part.method}: $${part.amount.toFixed(2)}`).join(" · ") ?? s.paymentMethod}</td>
                  <td className="p-3">
                    {s.status === "cancelled" ? "Anulada" : "Pagada"}
                  </td>
                  <td className="p-3">
                    {s.status !== "cancelled" && (
                      <button
                        disabled={busy || s.cashSessionId !== open?.id}
                        className="text-red-700 disabled:text-gray-400"
                        onClick={() => void cancel(s)}
                      >
                        {s.cashSessionId === open?.id
                          ? "Anular"
                          : "Caja cerrada"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!sales.length && (
          <p className="text-gray-500 p-4">Sin ventas registradas.</p>
        )}
      </section>
    </div>
  );
}
