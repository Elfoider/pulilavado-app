"use client";
import { useState } from "react";
import { useCollection } from "@/lib/useCollection";
import { Product } from "@/lib/operations/model";
import { newId, operations } from "@/lib/operations";
import { enqueueSnackbar } from "notistack";

const initial = {
  name: "",
  sku: "",
  category: "General",
  unit: "unidad",
  cost: 0,
  price: 0,
  minimum: 0,
  active: true,
};
interface Movement {
  id: string;
  productId: string;
  productName: string;
  kind: string;
  quantity: number;
  before: number;
  after: number;
  reason?: string;
  referenceId: string;
  createdAt?: { seconds: number };
}
export default function InventoryPanel() {
  const { data: products, error, loading } = useCollection<Product>("products");
  const { data: movements, error: movementsError } = useCollection<Movement>(
    "inventoryMovements",
    "createdAt",
  );
  const [draftId, setDraftId] = useState(newId);
  const [form, setForm] = useState(initial),
    [editingId, setEditingId] = useState("");
  const [search, setSearch] = useState(""),
    [low, setLow] = useState(false),
    [busy, setBusy] = useState(false);
  const [stock, setStock] = useState({
    productId: "",
    quantity: "",
    kind: "receive" as "receive" | "adjust",
    reason: "",
  });
  const [requestId, setRequestId] = useState(newId);
  const [historyProduct, setHistoryProduct] = useState("");
  async function run(work: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    try {
      await work();
      enqueueSnackbar("Operación guardada.", { variant: "success" });
    } catch (e) {
      enqueueSnackbar(e instanceof Error ? e.message : "No se pudo guardar.", {
        variant: "error",
      });
    } finally {
      setBusy(false);
    }
  }
  const visible = products
    .filter(
      (p) =>
        `${p.name} ${p.sku} ${p.category}`
          .toLowerCase()
          .includes(search.toLowerCase()) &&
        (!low || (p.active && p.stock <= p.minimum)),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black">Inventario</h1>
        <p className="text-gray-600">
          Productos, entradas, ajustes y existencias.
        </p>
      </div>
      {(error || movementsError) && (
        <p role="alert" className="text-red-700">
          {error || movementsError}
        </p>
      )}
      <form
        className="bg-white rounded-2xl border p-5 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            await operations.saveProduct(form, editingId || draftId);
            setForm(initial);
            setEditingId("");
            setDraftId(newId());
          });
        }}
      >
        <h2 className="text-xl font-bold">
          {editingId ? "Editar producto" : "Nuevo producto"}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {(["name", "sku", "category", "unit"] as const).map((k, i) => (
            <label key={k} className="text-sm">
              {["Nombre", "Código / SKU", "Categoría", "Unidad"][i]}
              <input
                required
                value={form[k]}
                onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                className="block w-full border p-2 rounded-lg"
              />
            </label>
          ))}
          {(["cost", "price", "minimum"] as const).map((k, i) => (
            <label key={k} className="text-sm">
              {["Costo ($)", "Precio de venta ($)", "Stock mínimo"][i]}
              <input
                required
                type="number"
                min="0"
                step={k === "minimum" ? "1" : "0.01"}
                value={form[k]}
                onChange={(e) =>
                  setForm({ ...form, [k]: Number(e.target.value) })
                }
                className="block w-full border p-2 rounded-lg"
              />
            </label>
          ))}
          <label className="flex gap-2 items-center">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
            />
            Activo
          </label>
        </div>
        <p className="text-sm text-gray-500">
          El stock inicial se registra como una entrada para conservar su
          historial.
        </p>
        <div className="flex gap-3">
          <button
            disabled={busy}
            className="bg-cyan-700 text-white px-5 py-2 rounded-lg disabled:opacity-50"
          >
            Guardar producto
          </button>
          {editingId && (
            <button
              type="button"
              onClick={() => {
                setEditingId("");
                setForm(initial);
              }}
              className="text-gray-600"
            >
              Cancelar edición
            </button>
          )}
        </div>
      </form>
      <form
        className="bg-white rounded-2xl border p-5 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            await operations.changeStock(
              stock.productId,
              Number(stock.quantity),
              stock.kind,
              stock.reason,
              requestId,
            );
            setRequestId(newId());
            setStock({ ...stock, quantity: "", reason: "" });
          });
        }}
      >
        <h2 className="text-xl font-bold">Entrada o ajuste de stock</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <select
            aria-label="Producto para movimiento"
            required
            value={stock.productId}
            onChange={(e) => {
              setRequestId(newId());
              setStock({ ...stock, productId: e.target.value });
            }}
            className="border rounded-lg p-2"
          >
            <option value="">Seleccionar producto</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.stock})
              </option>
            ))}
          </select>
          <select
            aria-label="Tipo de movimiento"
            value={stock.kind}
            onChange={(e) => {
              setRequestId(newId());
              setStock({
                ...stock,
                kind: e.target.value as "receive" | "adjust",
              });
            }}
            className="border rounded-lg p-2"
          >
            <option value="receive">Entrada / abastecimiento</option>
            <option value="adjust">Ajuste / merma (+ o −)</option>
          </select>
          <input
            aria-label="Cantidad de movimiento"
            required
            type="number"
            step="1"
            min={stock.kind === "receive" ? 1 : undefined}
            placeholder="Cantidad"
            value={stock.quantity}
            onChange={(e) => {
              setRequestId(newId());
              setStock({ ...stock, quantity: e.target.value });
            }}
            className="border rounded-lg p-2"
          />
          <input
            aria-label="Motivo o proveedor"
            required
            placeholder="Motivo o proveedor"
            value={stock.reason}
            onChange={(e) => {
              setRequestId(newId());
              setStock({ ...stock, reason: e.target.value });
            }}
            className="border rounded-lg p-2"
          />
        </div>
        <button
          disabled={busy || !stock.productId}
          className="bg-gray-800 text-white px-5 py-2 rounded-lg disabled:opacity-50"
        >
          Registrar movimiento
        </button>
      </form>
      <section className="bg-white rounded-2xl border overflow-hidden">
        <div className="p-4 flex flex-wrap gap-4">
          <input
            aria-label="Buscar inventario"
            placeholder="Buscar producto, código o categoría"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border rounded-lg p-2 flex-1"
          />
          <label className="flex gap-2 items-center">
            <input
              type="checkbox"
              checked={low}
              onChange={(e) => setLow(e.target.checked)}
            />
            Solo stock bajo
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50">
              <tr>
                {[
                  "Producto",
                  "Categoría",
                  "Costo",
                  "Precio",
                  "Stock / mínimo",
                  "Estado",
                  "Acciones",
                ].map((x) => (
                  <th key={x} className="p-3">
                    {x}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="p-3">
                    <b>{p.name}</b>
                    <p className="text-xs text-gray-500">
                      {p.sku} · {p.unit}
                    </p>
                  </td>
                  <td className="p-3">{p.category}</td>
                  <td className="p-3">${p.cost.toFixed(2)}</td>
                  <td className="p-3">${p.price.toFixed(2)}</td>
                  <td className="p-3">
                    {p.stock} / {p.minimum}
                    {p.active && p.stock <= p.minimum && (
                      <p className="text-amber-700 font-bold">Stock bajo</p>
                    )}
                  </td>
                  <td className="p-3">{p.active ? "Activo" : "Inactivo"}</td>
                  <td className="p-3 space-x-3">
                    <button
                      className="text-cyan-700"
                      onClick={() => {
                        setEditingId(p.id);
                        setForm({
                          name: p.name,
                          sku: p.sku,
                          category: p.category,
                          unit: p.unit,
                          cost: p.cost,
                          price: p.price,
                          minimum: p.minimum,
                          active: p.active,
                        });
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                    >
                      Editar
                    </button>
                    <button
                      className="text-gray-700"
                      onClick={() => setHistoryProduct(p.id)}
                    >
                      Historial
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!visible.length && (
          <p className="p-6 text-gray-500">
            {loading ? "Cargando..." : "No hay productos para mostrar."}
          </p>
        )}
      </section>
      <section className="bg-white rounded-2xl border p-5">
        <h2 className="text-xl font-bold mb-3">
          Últimos movimientos de inventario
        </h2>
        <p className="text-sm text-gray-500 mb-3">
          Se muestran los 150 movimientos más recientes.
        </p>
        {historyProduct && (
          <button
            onClick={() => setHistoryProduct("")}
            className="text-cyan-700 mb-3"
          >
            Ver todos los productos
          </button>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr>
                {[
                  "Fecha",
                  "Producto",
                  "Movimiento",
                  "Cantidad",
                  "Antes → Después",
                  "Motivo / referencia",
                ].map((x) => (
                  <th className="p-2" key={x}>
                    {x}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {movements
                .filter(
                  (m) => !historyProduct || m.productId === historyProduct,
                )
                .map((m) => (
                  <tr key={m.id} className="border-t">
                    <td className="p-2">
                      {m.createdAt
                        ? new Date(m.createdAt.seconds * 1000).toLocaleString()
                        : "..."}
                    </td>
                    <td className="p-2">{m.productName}</td>
                    <td className="p-2">
                      {(
                        {
                          receive: "Entrada",
                          adjust: "Ajuste",
                          sale: "Venta",
                          sale_return: "Devolución",
                          service_products: "Servicio",
                          service_return: "Anulación servicio",
                        } as Record<string, string>
                      )[m.kind] ?? m.kind}
                    </td>
                    <td className="p-2">
                      {m.quantity > 0 ? "+" : ""}
                      {m.quantity}
                    </td>
                    <td className="p-2">
                      {m.before} → {m.after}
                    </td>
                    <td className="p-2 break-all">
                      {m.reason || m.referenceId}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
