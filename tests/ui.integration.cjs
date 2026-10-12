const { chromium } = require("@playwright/test");
const { spawn } = require("node:child_process");
const assert = require("node:assert/strict");
const { mkdir } = require("node:fs/promises");
const { appendFileSync } = require("node:fs");
const http = require("node:http");
function request(url, method = "GET") {
  return new Promise((resolve, reject) => {
    const r = http.request(url, { method }, (res) => {
      res.resume();
      res.on("end", () =>
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 300 }),
      );
    });
    r.on("error", reject);
    r.setTimeout(5000, () => r.destroy(new Error("Request timeout")));
    r.end();
  });
}
const { initializeApp, deleteApp } = require("firebase/app");
const {
  getFirestore,
  connectFirestoreEmulator,
  doc,
  setDoc,
  getDoc,
  deleteDoc,
  collection,
  getDocs,
} = require("firebase/firestore");
if (!process.env.FIRESTORE_EMULATOR_HOST)
  throw new Error("UI test requires the local demo emulator.");
const app = initializeApp({
  projectId: "demo-pulilavado",
  apiKey: "demo-key",
  appId: "demo",
});
const db = getFirestore(app);
connectFirestoreEmulator(db, "127.0.0.1", 8080);
const read = async (path) => (await getDoc(doc(db, path))).data();
const server = spawn(
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
let logs = "";
server.stdout.on("data", (d) => {
  logs += d;
  appendFileSync("/tmp/pulilavado-ui-server.log", d);
});
server.stderr.on("data", (d) => {
  logs += d;
  appendFileSync("/tmp/pulilavado-ui-server.log", d);
});
let browser;
async function waitServer() {
  for (let i = 0; i < 20; i++) {
    try {
      if ((await request("http://127.0.0.1:3100/cash")).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("App server did not start: " + logs.slice(-3000));
}
async function main() {
  await request(
    "http://127.0.0.1:8080/emulator/v1/projects/demo-pulilavado/databases/(default)/documents",
    "DELETE",
  );
  await setDoc(doc(db, "washers/w1"), {
    name: "Ana",
    active: true,
    commissionPercentage: 25,
  });
  await setDoc(doc(db, "settings/global"), { defaultCommissionPercentage: 40 });
  await setDoc(doc(db, "products/p1"), {
    name: "Agua",
    sku: "A",
    category: "Bebidas",
    unit: "unidad",
    price: 2,
    cost: 1,
    stock: 10,
    minimum: 3,
    active: true,
  });
  await setDoc(doc(db, "cashSessions/legacy-closed"), {
    status: "closed",
    openedAt: { seconds: 1000 },
  });
  await waitServer();
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept("Prueba de anulación"));
  const out = process.env.UI_SCREENSHOT_DIR || "/tmp/pulilavado-ui";
  await mkdir(out, { recursive: true });
  await page.goto("http://127.0.0.1:3100/cash");
  await page.getByRole("button", { name: "Abrir jornada" }).waitFor();
  await page
    .getByRole("heading", {
      name: "Hay registros de caja con un formato anterior o incompleto",
    })
    .waitFor();
  assert.deepEqual(await read("cashSessions/legacy-closed"), {
    status: "closed",
    openedAt: { seconds: 1000 },
  });
  await deleteDoc(doc(db, "cashSessions/legacy-closed"));
  await page.getByLabel("Fondo inicial en efectivo ($)").fill("10");
  await page.getByRole("button", { name: "Abrir jornada" }).click();
  await page
    .getByRole("heading", { name: "Caja abierta", exact: true })
    .waitFor();
  await page.screenshot({ path: out + "/cash-desktop.png", fullPage: true });
  await page.goto("http://127.0.0.1:3100/");
  await page
    .getByRole("button", { name: "NUEVO SERVICIO", exact: true })
    .click();
  const form = page.locator("form");
  await form.locator("select").nth(0).selectOption("w1");
  await form.locator("select").nth(1).selectOption("1");
  await form.getByPlaceholder("Modelo", { exact: true }).fill("Toyota");
  await form.getByPlaceholder("Color", { exact: true }).fill("Blanco");
  await form
    .getByRole("button", { name: "Pago Pendiente", exact: true })
    .click();
  await form.getByLabel("Producto", { exact: true }).selectOption("p1");
  await form.getByRole("button", { name: "Agregar", exact: true }).click();
  await form.getByLabel("Cantidad de Agua").fill("2");
  await form.getByPlaceholder("0.00").fill("2000");
  await page.screenshot({
    path: out + "/service-products-desktop.png",
    fullPage: true,
  });
  await form.getByRole("button", { name: "Guardar Pendiente" }).click();
  await page
    .getByRole("heading", { name: "NUEVO SERVICIO", exact: true })
    .waitFor({ state: "hidden" });
  assert.equal((await read("products/p1")).stock, 8);
  await page.getByRole("button", { name: "Ver", exact: true }).click();
  await page.getByRole("heading", { name: "Detalles", exact: true }).waitFor();
  const modal = page.locator("div.fixed").filter({
    has: page.getByRole("heading", { name: "Detalles", exact: true }),
  });
  await modal.getByRole("button").nth(0).click();
  await page.getByRole("heading", { name: "Editando Servicio" }).waitFor();
  const edit = page
    .locator("div.fixed")
    .filter({ has: page.getByRole("heading", { name: "Editando Servicio" }) });
  await edit.getByRole("button", { name: "Pagado", exact: true }).click();
  await edit.locator("select").nth(1).selectOption("Efectivo");
  await edit.getByRole("button", { name: "Guardar", exact: true }).click();
  await page
    .getByRole("heading", { name: "Editando Servicio" })
    .waitFor({ state: "hidden" });
  const services = await getDocs(collection(db, "services"));
  const service = services.docs[0].data();
  assert.equal(service.financials.totalPrice, 24);
  assert.equal(service.financials.washerEarnings, 5);
  assert.equal((await read("products/p1")).stock, 8);
  await page.goto("http://127.0.0.1:3100/sales");
  await page.getByLabel("Producto", { exact: true }).selectOption("p1");
  await page.getByRole("button", { name: "Agregar", exact: true }).click();
  await page.getByRole("button", { name: "Cobrar venta" }).click();
  await page
    .getByText("Venta registrada. Stock y caja actualizados.")
    .waitFor();
  assert.equal((await read("products/p1")).stock, 7);
  await page.screenshot({ path: out + "/sales-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "Anular", exact: true }).click();
  await page.getByText("Venta anulada.").waitFor();
  assert.equal((await read("products/p1")).stock, 8);
  await page.goto("http://127.0.0.1:3100/inventory");
  await page.getByRole("cell", { name: "Agua A · unidad" }).waitFor();
  await page.getByLabel("Producto para movimiento").selectOption("p1");
  await page.getByLabel("Cantidad de movimiento").fill("5");
  await page.getByLabel("Motivo o proveedor").fill("Proveedor demo");
  await page
    .getByRole("button", { name: "Registrar movimiento", exact: true })
    .click();
  await page.getByText("Operación guardada.").waitFor();
  assert.equal((await read("products/p1")).stock, 13);
  await page.screenshot({
    path: out + "/inventory-desktop.png",
    fullPage: true,
  });
  await page.goto("http://127.0.0.1:3100/washers");
  await page.getByRole("button", { name: "Agregar", exact: true }).waitFor();
  await page.getByText("Comisión: 25%", { exact: true }).waitFor();
  await page.screenshot({ path: out + "/washers-desktop.png", fullPage: true });
  await page.goto("http://127.0.0.1:3100/cash");
  await page
    .getByRole("heading", { name: "Caja abierta", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Ver movimientos", exact: true })
    .click();
  await page
    .getByRole("cell", { name: "Cobro servicio", exact: true })
    .waitFor();
  await page.getByLabel("Efectivo físico contado ($)").fill("34");
  await page.getByRole("button", { name: "Cerrar caja", exact: true }).click();
  await page
    .getByRole("heading", { name: "Cierre de caja", exact: true })
    .waitFor();
  await page.screenshot({
    path: out + "/cash-closed-desktop.png",
    fullPage: true,
  });
  const sessions = await getDocs(collection(db, "cashSessions"));
  assert.equal(sessions.docs[0].data().difference, 0);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ["cash", "inventory", "sales"]) {
    await page.goto("http://127.0.0.1:3100/" + route);
    await page
      .getByRole("heading", {
        name:
          route === "cash"
            ? "Caja"
            : route === "inventory"
              ? "Inventario"
              : "Venta de productos",
        exact: true,
      })
      .waitFor();
    await page.screenshot({
      path: out + "/" + route + "-mobile.png",
      fullPage: true,
    });
    const width = await page.evaluate(() => ({
      body: document.body.scrollWidth,
      view: window.innerWidth,
    }));
    assert.ok(
      width.body <= width.view + 1,
      `Horizontal overflow on ${route}: ${JSON.stringify(width)}`,
    );
  }
  await setDoc(doc(db, "cashSessions/legacy-open"), {
    status: "open",
    openedAt: { seconds: 1000 },
    openingAmount: 10,
  });
  await page.goto("http://127.0.0.1:3100/cash");
  await page
    .getByRole("heading", {
      name: "Hay registros de caja con un formato anterior o incompleto",
    })
    .waitFor();
  assert.equal(
    await page.getByRole("button", { name: "Abrir jornada" }).count(),
    0,
  );
  assert.deepEqual(await read("cashSessions/legacy-open"), {
    status: "open",
    openedAt: { seconds: 1000 },
    openingAmount: 10,
  });
  await page.screenshot({
    path: out + "/cash-legacy-warning.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: desktop and mobile UI, pending service with products, collection, quick sale, reversal, inventory receipt and cash close.",
  );
}
main()
  .catch((e) => {
    console.error(e);
    console.error(logs.slice(-1500));
    process.exitCode = 1;
  })
  .finally(async () => {
    if (browser) await browser.close();
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {}
    await deleteApp(app);
  });
