const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
const React = require("react");

function harness(services = [], cash = { session: null, loading: false, error: "" }, advances = []) {
  let cursor = 0;
  const states = [], tables = [], documents = [], notices = [], cashRequests = [];
  const hooks = {
    ...React,
    useState(initial) {
      const index = cursor++;
      if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial;
      return [states[index], (value) => { states[index] = typeof value === "function" ? value(states[index]) : value; }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in states)) states[index] = { current: initial };
      return states[index];
    },
    useEffect() {},
    useCallback(fn) { return fn; },
  };
  let fail = false;
  const localRequire = (name) => {
    if (name === "react") return hooks;
    if (name === "@/lib/reports/fonts") return {normalFont:"",boldFont:""};
    if(name === "@/lib/operations/treasury-model")return require("../.test-build/operations/treasury-model.js");
    if(name === "@/lib/reports/loadTreasury")return {loadTreasuryReport:async()=>undefined};
    if (name === "@/lib/reports/loadCash") return {loadCashReport: async (range) => {
      cashRequests.push(range);
      const balance=cash.session?.balances.Efectivo ?? 0, opening=cash.session?.openingAmount ?? 0;
      return {session:null,movements:[],periodCash:cash.periodCash ?? {balance,opening,incoming:balance-opening,outgoing:0,net:balance-opening,reconciled:true,sessionCount:cash.session?1:0}};
    }};
    if (name === "@/lib/reports/excel") return {financialExcel() {}, saveExcel() {}};
    if (name === "@/lib/reports/pdf") {
      const pdfModule = {exports:{}};
      const code = ts.transpileModule(fs.readFileSync("src/lib/reports/pdf.ts", "utf8"), {compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
      new Function("require","module","exports",code)((n)=>n === "./fonts" ? {normalFont:"",boldFont:""} : n === "./cash" ? require("../.test-build/reports/cash.js") : n === "../operations/model" ? require("../.test-build/operations/model.js") : localRequire(n),pdfModule,pdfModule.exports);
      return pdfModule.exports;
    }
    if (name === "@/lib/useCurrentCash") return { useCurrentCash: () => cash };
    if (name === "@/lib/firebase") return { db: {} };
    if (name === "firebase/firestore") return {
      collection: (_, path) => path, query: (path) => path, where() {},
      Timestamp: { fromDate: (date) => date },
      async getDocs(path) {
        if (fail) throw new Error("Test read error");
        return { forEach: (fn) => (path === "services" ? services : path === "cashAdvances" ? advances : []).forEach((s) => fn({ id: s.id, data: () => s })) };
      },
    };
    if (name === "jspdf") return class PDF {
      constructor() { this.texts = []; documents.push(this); }
      addFileToVFS() {} addFont() {} setFontSize() {} setFont() {} setTextColor() {} setDrawColor() {} setFillColor() {} rect() {} roundedRect() {} triangle() {} circle() {} line() {} lines() {}
      text(value) { this.texts.push(value); }
      addPage() {} getNumberOfPages() { return 2; } setPage() {}
      save(filename) { this.filename = filename; }
    };
    if (name === "jspdf-autotable") return (doc, options) => {
      tables.push(options); doc.lastAutoTable = { finalY: 80 };
    };
    if (name === "notistack") return { enqueueSnackbar: (...args) => notices.push(args) };
    if (name === "@/lib/utils") return { formatMoney: (value) => `$${value.toFixed(2)}` };
    return require(name);
  };
  const code = ts.transpileModule(fs.readFileSync("src/components/ReportsPanel.tsx", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const compiled = { exports: {} };
  new Function("require", "module", "exports", code)(localRequire, compiled, compiled.exports);
  function render() { cursor = 0; return compiled.exports.default(); }
  function nodes(tree) {
    if (!tree || typeof tree !== "object") return [];
    if (Array.isArray(tree)) return tree.flatMap(nodes);
    return [tree, ...nodes(tree.props?.children)];
  }
  function textOf(node) {
    if (node == null) return "";
    if (typeof node !== "object") return String(node);
    if (Array.isArray(node)) return node.map(textOf).join("");
    return textOf(node.props?.children);
  }
  const button = (label) => nodes(render()).find((n) => n.type === "button" && textOf(n).includes(label));
  const checks = () => nodes(render()).filter((n) => n.type === "input" && n.props.type === "checkbox");
  const refresh = async () => {
    const node = nodes(render()).find((n) => n.type === "button" && n.props.disabled !== undefined && n.props.className.includes("ml-2"));
    await node.props.onClick();
  };
  return { render, nodes, textOf, button, checks, refresh, tables, documents, notices, cashRequests, setFailure: () => { fail = true; } };
}
const service = (id, name, commission, extra = {}) => ({
  washerId: id, washerName: name, paymentStatus: "paid",
  financials: { totalPrice: 20, washerEarnings: commission, businessEarnings: 20 - commission }, ...extra,
});

test("payroll PDF filters by washer identity, recomputes total and retains choice on refresh", async () => {
  const h = harness([service("a", "Ana", 5), service("a", "Ana", 2), service("b", "Ana", 10), service("c", "Luis", 4, {paymentStatus: "pending"}), service("d", "Pedro", 8, {status: "cancelled"})]);
  await h.refresh();
  assert.equal(h.checks().length, 2);
  assert.ok(h.checks().every((n) => n.props.checked));
  h.checks().find((n) => n.props["aria-label"].includes("(b)")).props.onChange({target: {checked: false}});
  assert.match(h.textOf(h.render()), /Seleccionados: 1 de 2 · Total a pagar: \$7\.00/);
  await h.refresh();
  assert.equal(h.checks().find((n) => n.props["aria-label"].includes("(b)")).props.checked, false);
  h.button("Reporte de Pago de Nómina").props.onClick();
  assert.deepEqual(h.tables[0].body, [["Ana", 2, "$7.00", "$0.00", "$7.00", "$0.00", ""]]);
  assert.ok(h.documents[0].texts.includes("TOTAL NÓMINA A DISPERSAR: $7.00"));
  assert.match(h.textOf(h.render()), /\$17\.00/); // Full-period payroll KPI is unchanged.
});

test("select none disables and guards export; select all restores full payroll", async () => {
  const h = harness([service("a", "Ana", 5), service("b", "Luis", 10)]);
  await h.refresh();
  h.button("Quitar selección").props.onClick();
  assert.equal(h.button("Reporte de Pago de Nómina").props.disabled, true);
  h.button("Reporte de Pago de Nómina").props.onClick();
  assert.equal(h.documents.length, 0);
  h.button("Seleccionar todos").props.onClick();
  h.button("Reporte de Pago de Nómina").props.onClick();
  assert.equal(h.tables[0].body.length, 2);
  assert.ok(h.documents[0].texts.includes("TOTAL NÓMINA A DISPERSAR: $15.00"));
});

test("empty, failed or changed-period reports cannot export stale payroll", async () => {
  const empty = harness();
  await empty.refresh();
  assert.equal(empty.button("Reporte de Pago de Nómina").props.disabled, true);
  assert.match(empty.textOf(empty.render()), /No hay lavadores/);
  const h = harness([service("a", "Ana", 5)]);
  await h.refresh();
  h.nodes(h.render()).find((n) => n.type === "input" && n.props.type === "date").props.onChange({target: {value: "2026-01-01"}});
  assert.equal(h.button("Reporte de Pago de Nómina").props.disabled, true);
  h.button("Reporte de Pago de Nómina").props.onClick();
  assert.equal(h.documents.length, 0);
  h.setFailure();
  const originalError = console.error;
  console.error = () => {};
  try { await h.refresh(); } finally { console.error = originalError; }
  assert.equal(h.button("Reporte de Pago de Nómina").props.disabled, true);
  assert.match(h.textOf(h.render()), /No se pudo cargar el reporte/);
});


test("financial report refreshes period cash and remains exportable without a current open cash", async () => {
  const cash = { session: { balances: { Efectivo: 12 }, openingAmount: 0 }, loading: false, error: "" };
  const h = harness([service("a", "Ana", 5, {paymentMethod: "Efectivo"})], cash);
  await h.refresh();
  const cashCard = () => h.nodes(h.render()).find(n => n.type === "h3" && n.props.className === "text-4xl font-black tracking-tight");
  assert.equal(h.textOf(cashCard()), "$12.00");
  cash.session.balances.Efectivo = 7;
  await h.refresh();
  assert.equal(h.textOf(cashCard()), "$7.00");
  await h.button("Control Financiero Interno").props.onClick();
  assert.ok(h.documents[0].texts.includes("SALDOS FINALES DEL PERÍODO"));
  assert.ok(h.documents[0].texts.includes("$7.00"));
  assert.ok(h.tables.some(table => table.body.some(row => row.includes("$20.00"))));
  cash.session = null;
  await h.refresh();
  assert.equal(h.textOf(cashCard()), "$0.00");
  cash.error = "No se pudo consultar el saldo de Caja.";
  assert.equal(h.textOf(cashCard()), "$0.00");
  assert.equal(h.button("Control Financiero Interno").props.disabled, false);
  await h.button("Control Financiero Interno").props.onClick();
  assert.equal(h.documents.length, 2);
});


test("net cash excludes opening fund and paid tips while period cash sales remain unchanged", async () => {
  const cash = { session: { balances: { Efectivo: 72 }, openingAmount: 65 }, loading: false, error: "" };
  const h = harness([service("a", "Ana", 3, { paymentMethod: "Efectivo", financials: { totalPrice: 12, washerEarnings: 3, businessEarnings: 9 } })], cash);
  await h.refresh();
  const card = () => h.nodes(h.render()).find(n => n.props?.["aria-label"] === "Efectivo a guardar de la jornada");
  assert.match(h.textOf(card()), /\$7\.00/);
  // The original payment-method card continues reporting gross period income.
  const gross = h.nodes(h.render()).find(n => typeof n.type === "function" && n.props.title === "Efectivo");
  assert.equal(gross.props.amount, 12);
  await h.button("Control Financiero Interno").props.onClick();
  assert.ok(h.documents[0].texts.includes("$72.00"));
  assert.ok(h.documents[0].texts.includes("Efectivo a guardar de la jornada"));
  assert.ok(h.documents[0].texts.includes("$7.00"));
  cash.session.balances.Efectivo = 60;
  await h.refresh();
  assert.match(h.textOf(card()), /\$-5\.00/); // Outflows may use part of the opening fund.
  assert.equal(gross.props.amount, 12);
  cash.session = null;
  await h.refresh();
  assert.match(h.textOf(card()), /\$0\.00/);
});


test("payroll deducts identified washer advances and includes advances-only washers without negative pay",async()=>{
 const h=harness([service("a","Ana",50),service("b","Ana",30)],undefined,[{id:"v1",washerId:"a",washerName:"Ana",amount:20,day:"2026-10-27"},{id:"v2",washerId:"c",washerName:"Luis",amount:10,day:"2026-10-27"}]);
 await h.refresh();assert.equal(h.checks().length,3);h.button("Reporte de Pago de Nómina").props.onClick();
 const body=h.tables[0].body;
 assert.deepEqual(body.find(r=>r[2]==="$50.00"),["Ana",1,"$50.00","$20.00","$30.00","$0.00",""]);
 assert.deepEqual(body.find(r=>r[0]==="Luis"),["Luis",0,"$0.00","$10.00","$0.00","$10.00",""]);
 assert.ok(h.documents[0].texts.includes("TOTAL NÓMINA A DISPERSAR: $60.00"));
});


test("payroll shows individual advance movements under the correct washer and filters their PDF details", async () => {
  const h = harness([service("a", "Ana", 50), service("b", "Ana", 30)], undefined, [
    {id:"v1", washerId:"a", washerName:"Ana", amount:8, day:"2026-10-28", description:"Adelanto transporte"},
    {id:"v2", washerId:"a", washerName:"Ana", amount:12, day:"2026-10-27", description:"Adelanto personal"},
    {id:"v3", washerId:"b", washerName:"Ana", amount:5, day:"2026-10-27", description:"Otro lavador"},
  ]);
  await h.refresh();
  const detailRows = h.nodes(h.render()).filter(n => n.type === "tr" && n.props["aria-label"] === "Vale de Ana");
  assert.equal(detailRows.length, 3);
  assert.match(h.textOf(detailRows[0]), /2026-10-27.*Adelanto personal.*12\.00/);
  assert.match(h.textOf(detailRows[1]), /2026-10-28.*Adelanto transporte.*8\.00/);
  h.checks().find(n => n.props["aria-label"].includes("(b)")).props.onChange({target:{checked:false}});
  h.button("Reporte de Pago de Nómina").props.onClick();
  const body = h.tables[0].body;
  assert.equal(body.length, 3);
  assert.equal(body[0][4], "$30.00");
  assert.match(body[1][0].content, /2026-10-27\nAdelanto personal/);
  assert.match(body[2][0].content, /2026-10-28\nAdelanto transporte/);
  assert.ok(!JSON.stringify(body).includes("Otro lavador"));
});


test("historical exports pass identical selected dates to PDF and Excel without consulting current cash state", async()=>{
 const h=harness([], {session:{balances:{Efectivo:9999},openingAmount:0},loading:true,error:"Current cash unavailable",periodCash:{balance:27,opening:20,net:7,incoming:12,outgoing:5,reconciled:true,sessionCount:1,statusLabel:"Cajas cerradas en el período"}});
 await h.refresh();
 const dates=()=>h.nodes(h.render()).filter(n=>n.type==="input" && n.props.type==="date");
 dates()[0].props.onChange({target:{value:"2026-10-20"}});
 dates()[1].props.onChange({target:{value:"2026-10-21"}});
 await h.refresh();
 await h.button("Control Financiero Interno").props.onClick();
 assert.deepEqual(h.cashRequests.at(-1),{start:"2026-10-20",end:"2026-10-21"});
 assert.ok(h.documents[0].texts.includes("$7.00"));
 assert.ok(!JSON.stringify(h.documents[0].texts).includes("9999"));
 assert.ok(!h.textOf(h.render()).includes("9999"));
});
