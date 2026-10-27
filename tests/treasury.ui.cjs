const { chromium } = require("@playwright/test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const { initializeApp, deleteApp } = require("firebase/app");
const {
  getFirestore,
  connectFirestoreEmulator,
  doc,
  setDoc,
  getDoc,
  runTransaction,
  serverTimestamp,
  collection,
} = require("firebase/firestore");
const XLSX = require("xlsx");
const { createOperations } = require("../.test-build/operations/core.js");
const {
  businessDay,
  addDays,
} = require("../.test-build/operations/treasury-model.js");
if (!process.env.FIRESTORE_EMULATOR_HOST)
  throw Error("Use Firestore emulator only.");
const app = initializeApp({
  projectId: "demo-pulilavado",
  apiKey: "demo",
  appId: "demo",
});
const db = getFirestore(app);
connectFirestoreEmulator(db, "127.0.0.1", 8080);
const operations = createOperations(
  (work) =>
    runTransaction(db, (tx) =>
      work({
        get: async (path) => {
          const d = await tx.get(doc(db, path));
          return d.exists() ? d.data() : undefined;
        },
        set: (path, value, merge = false) =>
          tx.set(doc(db, path), value, { merge }),
      }),
    ),
  serverTimestamp,
  () => doc(collection(db, "_ids")).id,
);
let server,
  browser,
  logs = "";
const output = "/tmp/pulilavado-treasury-ui";
fs.mkdirSync(output, { recursive: true });
async function waitValue(path, key, expected) {
  for (let i = 0; i < 80; i++) {
    const value = (await getDoc(doc(db, path))).data();
    if (value?.[key] === expected) return value;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw Error(`Missing ${path}.${key}=${expected}`);
}
async function main() {
  const clear = await fetch(
    "http://127.0.0.1:8080/emulator/v1/projects/demo-pulilavado/databases/(default)/documents",
    { method: "DELETE" },
  );
  if (!clear.ok) throw Error("Could not reset local demo database.");
  await setDoc(doc(db, "washers/a"), {
    name: "Ana",
    active: true,
    commissionPercentage: 50,
  });
  await setDoc(doc(db, "settings/global"), { defaultCommissionPercentage: 50 });
  await operations.openCash(65, "c");
  await operations.saveService(
    {
      clientName: "Cliente demo",
      clientPhone: "",
      vehicle: { model: "Auto", color: "Blanco", bay: "1" },
      washerId: "a",
      servicePrice: 100,
      paymentStatus: "paid",
      paymentMethod: "Efectivo",
      tipAmount: 0,
      tipMethod: "Efectivo",
      cart: [],
    },
    "service",
    true,
  );
  server = spawn(
    "npm",
    ["run", "dev", "--", "--port", "3100", "--hostname", "127.0.0.1"],
    {
      env: {
        ...process.env,
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-pulilavado",
        NEXT_PUBLIC_USE_FIREBASE_EMULATOR: "true",
        NEXT_TURBOPACK_EXPERIMENTAL_USE_SYSTEM_TLS_CERTS: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    },
  );
  server.stdout.on("data", (d) => (logs += d));
  server.stderr.on("data", (d) => (logs += d));
  for (let i = 0; i < 90; i++) {
    try {
      const r = await fetch("http://127.0.0.1:3100/cash");
      if (r.ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
      "/root/.cache/ms-playwright/chromium_headless_shell-1194/chrome-linux/headless_shell",
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
    acceptDownloads: true,
  });
  page.setDefaultTimeout(30000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:3100/cash");
  await page.getByLabel("Tipo de movimiento de caja").selectOption("advance");
  await page.getByLabel("Lavador del vale").selectOption("a");
  await page.getByLabel("Monto del movimiento").fill("20");
  await page.getByLabel("Motivo del movimiento").fill("Adelanto de paga");
  await page
    .getByRole("button", { name: "Guardar movimiento", exact: true })
    .click();
  for (let i = 0; i < 80; i++) {
    const data = (await getDoc(doc(db, "cashSessions/c"))).data();
    if (data.balances.Efectivo === 145) break;
    await page.waitForTimeout(150);
  }
  assert.equal(
    (await getDoc(doc(db, "cashSessions/c"))).data().balances.Efectivo,
    145,
  );
  await page.goto("http://127.0.0.1:3100/reports");
  await page
    .getByRole("button", { name: "Reporte de Pago de Nómina (PDF)" })
    .waitFor();
  await page.waitForFunction(() =>
    [...document.querySelectorAll("button")].some(
      (b) => b.textContent.includes("Reporte de Pago de Nómina") && !b.disabled,
    ),
  );
  const row = page
    .locator("tr")
    .filter({ has: page.getByRole("checkbox", { name: /Incluir a Ana/ }) });
  assert.match(await row.innerText(), /\$50\.00/);
  assert.match(await row.innerText(), /\$20\.00/);
  assert.match(await row.innerText(), /\$30\.00/);
  const pdfEvent = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Control Financiero Interno (PDF)" })
    .click();
  await (await pdfEvent).saveAs(output + "/weekly.pdf");
  const excelEvent = page.waitForEvent("download");
  await page
    .getByRole("button", { name: /Reporte financiero \(Excel\)/ })
    .click();
  await (await excelEvent).saveAs(output + "/weekly.xlsx");
  const book = XLSX.readFile(output + "/weekly.xlsx");
  assert.equal(book.Sheets.Resumen.F34.v, 20);
  assert.equal(book.Sheets.Resumen.F37.v, 30);
  assert.ok(book.SheetNames.includes("Control semanal"));
  await page.goto("http://127.0.0.1:3100/envelopes");
  await page.getByLabel("Monto a guardar en el sobre").fill("80");
  await page.getByLabel("Motivo de guardado").fill("Cierre de efectivo");
  await page
    .getByRole("button", { name: "Guardar en sobre de hoy", exact: true })
    .click();
  const today = businessDay();
  await waitValue("cashEnvelopes/" + today, "balance", 80);
  assert.equal(
    (await getDoc(doc(db, "cashSessions/c"))).data().balances.Efectivo,
    65,
  );
  await page
    .getByRole("button", { name: "Usar dinero de este sobre", exact: true })
    .click();
  await page.getByLabel("Monto a retirar del sobre").fill("20");
  await page
    .getByLabel("Motivo del retiro de sobre")
    .fill("Refuerzo para compra");
  await page
    .getByRole("button", { name: "Registrar retiro", exact: true })
    .click();
  await waitValue("cashEnvelopes/" + today, "balance", 60);
  assert.equal(
    (await getDoc(doc(db, "cashSessions/c"))).data().balances.Efectivo,
    85,
  );
  await page.goto("http://127.0.0.1:3100/cash");
  await page.getByLabel("Tipo de movimiento de caja").selectOption("expense");
  await page.getByLabel("Monto del movimiento").fill("20");
  await page.getByLabel("Motivo del movimiento").fill("Compra de emergencia");
  await page
    .getByRole("button", { name: "Guardar movimiento", exact: true })
    .click();
  for (let i = 0; i < 80; i++) {
    if (
      (await getDoc(doc(db, "cashSessions/c"))).data().balances.Efectivo === 65
    )
      break;
    await page.waitForTimeout(150);
  }
  await page.goto("http://127.0.0.1:3100/envelopes");
  await page
    .getByText("Registrar un sobre que ya tenía dinero", { exact: true })
    .click();
  const older = addDays(today, -7);
  await page.locator("details input[type=date]").fill(older);
  await page.getByLabel("Saldo inicial del sobre").fill("30");
  await page
    .getByLabel("Motivo del sobre inicial")
    .fill("Sobre anterior verificado");
  await page.getByLabel(/Confirmo que este dinero/).check();
  await page
    .getByRole("button", { name: "Registrar sobre existente", exact: true })
    .click();
  await waitValue("cashEnvelopes/" + older, "balance", 30);
  await page.getByLabel("Fecha de la semana de sobres").fill(older);
  await page
    .getByRole("button", { name: "Usar dinero de este sobre", exact: true })
    .click();
  await page.getByLabel("Destino del retiro de sobre").selectOption("expense");
  await page.getByLabel("Monto a retirar del sobre").fill("5");
  await page
    .getByLabel("Motivo del retiro de sobre")
    .fill("Gasto directo desde semana anterior");
  await page
    .getByRole("button", { name: "Registrar retiro", exact: true })
    .click();
  await waitValue("cashEnvelopes/" + older, "balance", 25);
  assert.equal(
    (await getDoc(doc(db, "cashSessions/c"))).data().balances.Efectivo,
    65,
  );
  await page.getByLabel("Fecha de la semana de sobres").fill(today);
  await page
    .getByText("Gasto directo desde semana anterior", { exact: true })
    .waitFor();
  await page.screenshot({
    path: output + "/envelopes-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: output + "/envelopes-mobile.png",
    fullPage: true,
  });
  await page.goto("http://127.0.0.1:3100/reports");
  await page.getByText("Control semanal:", { exact: false }).waitFor();
  assert.ok(
    (
      await page
        .locator("section")
        .filter({ hasText: "Control semanal:" })
        .innerText()
    ).includes("$55.00"),
  );
  const finalPdf = page.waitForEvent("download");
  await page.getByRole("button", {name: "Control Financiero Interno (PDF)"}).click();
  await (await finalPdf).saveAs(output + "/weekly-with-envelopes.pdf");
  const payrollPdf = page.waitForEvent("download");
  await page.getByRole("button", {name: "Reporte de Pago de Nómina (PDF)"}).click();
  await (await payrollPdf).saveAs(output + "/payroll.pdf");
  assert.deepEqual(errors, []);
  console.log(
    "PASS: UI Vale20, payroll50-20=30, PDF/Excel, deposit80, refill20, direct expense from old envelope5, weekly net55, desktop/mobile.",
  );
}
main()
  .catch((e) => {
    console.error(e);
    console.error(logs.slice(-3000));
    process.exitCode = 1;
  })
  .finally(async () => {
    if (browser) await browser.close();
    if (server) {
      try {
        process.kill(-server.pid, "SIGTERM");
      } catch {}
    }
    await deleteApp(app);
  });
