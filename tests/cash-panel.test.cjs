const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const model = require("../.test-build/model.js");

function renderCash(data) {
  const code = ts.transpileModule(
    fs.readFileSync("src/components/CashPanel.tsx", "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    },
  ).outputText;
  const compiledModule = { exports: {} };
  const localRequire = (name) => {
    if (name === "@/lib/useCollection")
      return { useCollection: () => ({ data, error: "", loading: false }) };
    if (name === "@/lib/operations/model") return model;
    if (name === "@/lib/operations")
      return { newId: () => "test-id", operations: {} };
    if (name === "@/lib/firebase") return { db: {} };
    if (name === "notistack") return { enqueueSnackbar() {} };
    if (name === "next/link")
      return function Link({ href, children, className }) {
        return React.createElement("a", { href, className }, children);
      };
    return require(name);
  };
  new Function("require", "module", "exports", code)(
    localRequire,
    compiledModule,
    compiledModule.exports,
  );
  return renderToStaticMarkup(React.createElement(compiledModule.exports.default));
}

test("Caja renders an incomplete open record without undefined Efectivo error or invented balances", () => {
  const html = renderCash([
    {
      id: "legacy-open",
      status: "open",
      openedAt: { seconds: 1000 },
      openingAmount: 10,
    },
  ]);
  assert.match(
    html,
    /Hay registros de caja con un formato anterior o incompleto/,
  );
  assert.match(html, /legacy-open/);
  assert.doesNotMatch(html, /Abrir jornada|Cerrar caja|Guardar movimiento/);
  assert.doesNotMatch(html, /\$0\.00/);
});

test("incompatible closed history warns while a compatible session still renders real balances", () => {
  const html = renderCash([
    { id: "legacy-closed", status: "closed", openedAt: { seconds: 1000 } },
    {
      id: "current",
      status: "open",
      openingAmount: 10,
      receipts: 24,
      tips: 0,
      expenses: 0,
      balances: { Efectivo: 34, Yappy: 0, Tarjeta: 0, Transferencia: 0 },
    },
  ]);
  assert.match(html, /legacy-closed/);
  assert.match(html, /\$34\.00/);
  assert.match(html, /Cerrar caja/);
  assert.match(html, /Guardar movimiento/);
});

test("verified historical schema offers explicit closure and never fabricates balances", () => {
  const html = renderCash([{id: "old", initialAmount: 0, isOpen: true, observations: "", openedAt: {seconds: 50}, responsible: "Jhon"}]);
  assert.match(html, /Cerrar caja anterior/);
  assert.match(html, /Efectivo contado/);
  assert.match(html, /Jhon/);
  assert.doesNotMatch(html, /Estado de caja desconocido|Abrir jornada|Guardar movimiento/);
});
test("closed historical schema allows new opening without displaying the yellow panel", () => {
  const html = renderCash([{id: "old", initialAmount: 0, isOpen: false, observations: "", openedAt: {seconds: 50}, responsible: "Jhon"}]);
  assert.match(html, /Abrir jornada/);
  assert.doesNotMatch(html, /Caja anterior|Sin arqueo registrado|bg-amber-50/);
  assert.doesNotMatch(html, /Cerrar caja anterior|Estado de caja desconocido/);
});
