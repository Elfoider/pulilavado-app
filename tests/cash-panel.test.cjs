const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const model = require("../.test-build/model.js");

function renderCash(data, movements = []) {
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
    if (name === "react") return { ...React, useState: (initial) => React.useState(Array.isArray(initial) && initial.length === 0 ? movements : initial) };
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
      tipsByMethod: { Efectivo: 0, Yappy: 0, Tarjeta: 0, Transferencia: 0 },
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


test("cash screen excludes cash and digital tips while preserving the old closure calculation", () => {
  const cash={id:"c",status:"open",openingAmount:10,receipts:20,tips:7,expenses:0,balances:{Efectivo:33,Yappy:4,Tarjeta:0,Transferencia:0},tipsByMethod:{Efectivo:3,Yappy:4,Tarjeta:0,Transferencia:0}};
  const html=renderCash([cash]);assert.match(html,/\$30\.00/);assert.doesNotMatch(html,/\$33\.00/);assert.match(html,/sin propinas/);
  const old=renderCash([{...cash,status:"closed",countedAmount:33,difference:0}]);assert.match(old,/\$33\.00/);assert.match(old,/cálculo original/);
});


test("movement table renders before/after balances, exact reference and unknown historical values", () => {
  const session={id:"c",status:"open",openingAmount:10,receipts:20,tips:3,expenses:0,balances:{Efectivo:33,Yappy:0,Tarjeta:0,Transferencia:0},tipsByMethod:{Efectivo:3,Yappy:0,Tarjeta:0,Transferencia:0}};
  const html=renderCash([session],[{id:"m",sessionId:"c",kind:"service_payment",method:"Efectivo",amount:20,balanceBefore:10,balanceAfter:30,cashBefore:10,cashAfter:30,referenceId:"service-123",description:"Cobro servicio",sequence:2},{id:"old",sessionId:"c",kind:"income",method:"Efectivo",amount:1,referenceId:"old-ref",description:"Anterior"}]);
  assert.match(html,/Saldo del método antes/);assert.match(html,/Efectivo de caja después/);assert.match(html,/Referencia: service-123/);assert.match(html,/Movimiento #2/);assert.match(html,/No registrado/);
});
