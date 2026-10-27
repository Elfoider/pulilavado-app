"use client";
import NumberInput from "./NumberInput";
import HelpTip from "./HelpTip";
import { useEffect, useState } from "react";
import { CartItem, Product, ProductLine, money } from "@/lib/operations/model";
import { useCollection } from "@/lib/useCollection";

export default function ProductCart({
  value,
  onChange,
  previous = [],
  servicePrice,
  tipAmount = 0,
  onTotalChange,
}: {
  value: CartItem[];
  onChange: (cart: CartItem[]) => void;
  previous?: ProductLine[];
  servicePrice?: number;
  tipAmount?: number;
  onTotalChange?: (total:number)=>void;
}) {
  const { data: products, error, loading } = useCollection<Product>("products");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState("");
  const available = products.filter(
    (p) =>
      p.active &&
      `${p.name} ${p.sku} ${p.category}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const total = money(
    value.reduce(
      (sum, l) =>
        sum +
        l.quantity *
          (previous.find((p) => p.productId === l.productId)?.unitPrice ??
            products.find((p) => p.id === l.productId)?.price ??
            0),
      0,
    ),
  );
  useEffect(()=>{onTotalChange?.(total);},[total,onTotalChange]);
  return (
    <section className="rounded-xl border border-cyan-200 bg-cyan-50/60 p-4 space-y-3">
      <h3 className="font-bold text-gray-800">
        {servicePrice === undefined
          ? "Productos de la venta"
          : "Productos adicionales"}
      </h3>
      <HelpTip label="Productos y comisión">
        {servicePrice === undefined
          ? "La venta actualiza inventario y caja al mismo tiempo."
          : "Se incluyen en el mismo cobro. La comisión se aplica solo al lavado."}
      </HelpTip>
      {error && (
        <p role="alert" className="text-red-600 text-sm">
          {error}
        </p>
      )}
      <input
        aria-label="Buscar producto"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar por nombre, código o categoría"
        className="w-full border p-2 rounded-lg bg-white"
      />
      <div className="flex gap-2">
        <select
          aria-label="Producto"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="min-w-0 flex-1 border p-2 rounded-lg bg-white"
        >
          <option value="">
            {loading ? "Cargando productos..." : "Seleccionar producto"}
          </option>
          {available.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · ${p.price.toFixed(2)} · Stock: {p.stock}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={!selected}
          onClick={() => {
            const found = value.find((l) => l.productId === selected);
            onChange(
              found
                ? value.map((l) =>
                    l.productId === selected
                      ? { ...l, quantity: l.quantity + 1 }
                      : l,
                  )
                : [...value, { productId: selected, quantity: 1 }],
            );
            setSelected("");
          }}
          className="bg-cyan-700 text-white px-3 rounded-lg disabled:opacity-40"
        >
          Agregar
        </button>
      </div>
      {value.map((l) => {
        const p = products.find((p) => p.id === l.productId);
        const snapshot = previous.find((p) => p.productId === l.productId);
        return (
          <div key={l.productId} className="flex gap-2 items-center text-sm">
            <div className="flex-1">
              <b>{snapshot?.name ?? p?.name ?? "Producto"}</b>
              <p className="text-xs text-gray-500">
                ${(snapshot?.unitPrice ?? p?.price ?? 0).toFixed(2)} c/u · Stock{" "}
                {p?.stock ?? "—"}
              </p>
            </div>
            <NumberInput
              aria-label={`Cantidad de ${p?.name ?? "producto"}`}
              min="1"
              step="1"
              value={l.quantity}
              onValueChange={(quantity) =>
                onChange(
                  value.map((i) =>
                    i.productId === l.productId
                      ? { ...i, quantity }
                      : i,
                  ),
                )
              }
              className="w-16 p-2 border rounded bg-white"
            />
            <button
              type="button"
              aria-label={`Quitar ${p?.name ?? "producto"}`}
              className="text-red-700"
              onClick={() =>
                onChange(value.filter((i) => i.productId !== l.productId))
              }
            >
              Quitar
            </button>
          </div>
        );
      })}
      <p className="font-bold text-right">Productos: ${total.toFixed(2)}</p>
      {servicePrice !== undefined && (
        <div className="border-t border-cyan-200 pt-2 text-right">
          <p className="font-bold">
            Lavado + productos: ${money(servicePrice + total).toFixed(2)}
          </p>
          {tipAmount > 0 && (
            <p className="text-sm">
              Total con propina: $
              {money(servicePrice + total + tipAmount).toFixed(2)}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
