const { chromium } = require('@playwright/test');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { seedContracts, PASSWORD } = require('../helpers/contracts-fixture.cjs');
let browser, server, logs='';
const output='/tmp/pulilavado-access-phase2-ui';fs.mkdirSync(output,{recursive:true});
async function main() {
 await seedContracts();
 server=spawn('npm',['run','dev','--','--port','3103','--hostname','127.0.0.1'],{env:{...process.env,NEXT_PUBLIC_V2_CONTRACTS_SANDBOX:'true',NEXT_PUBLIC_MIGRATION_SANDBOX:'false',NEXT_PUBLIC_USE_FIREBASE_EMULATOR:'false'},stdio:['ignore','pipe','pipe'],detached:true});
 server.stdout.on('data',d=>logs+=d);server.stderr.on('data',d=>logs+=d);
 for(let i=0;i<120;i++){try{if((await fetch('http://127.0.0.1:3103/migration/access')).ok)break}catch{}await new Promise(r=>setTimeout(r,250))}
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||'/root/.cache/ms-playwright/chromium_headless_shell-1194/chrome-linux/headless_shell',args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1365,height:1000}});page.setDefaultTimeout(30000);const errors=[],external=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',request=>{const host=new URL(request.url()).hostname;if(host.endsWith('googleapis.com')||host.endsWith('firebaseio.com'))external.push(request.url())});
 await page.goto('http://127.0.0.1:3103/migration/access');
 const login=async name=>{await page.getByLabel('Correo de prueba',{exact:true}).fill(`${name}@pulilavado.test`);await page.getByLabel('Contraseña de prueba',{exact:true}).fill(PASSWORD);await page.getByRole('button',{name:'Entrar',exact:true}).click()};
 const logout=async()=>{await page.getByRole('button',{name:'Cerrar sesión',exact:true}).click();await page.getByRole('button',{name:'Entrar',exact:true}).waitFor();assert.equal(await page.getByLabel('Resumen de sede de prueba',{exact:true}).count(),0)};
 await login('admin');await page.getByText('5 vehículos ficticios',{exact:true}).waitFor();assert.equal(await page.getByLabel('Sede autorizada').locator('option').count(),2);
 await page.getByLabel('Sede autorizada').selectOption('norte');await page.getByText('8 vehículos ficticios',{exact:true}).waitFor();await page.screenshot({path:output+'/admin-norte.png',fullPage:true});await logout();
 await login('recepcion');await page.getByText('5 vehículos ficticios',{exact:true}).waitFor();assert.equal(await page.getByLabel('Sede autorizada').locator('option').count(),1);assert.equal(await page.getByLabel('Sede autorizada').inputValue(),'centro');
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:output+'/recepcion-mobile.png',fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));await logout();
 for(const name of ['sin-perfil','suspendido','denegado']) {await login(name);await page.getByRole('alert').waitFor();assert.equal(await page.getByLabel('Resumen de sede de prueba',{exact:true}).count(),0);await logout()}
 await login('otra-empresa');await page.getByText('5 vehículos ficticios',{exact:true}).waitFor();await page.getByText('Organización: otra-empresa · Sede: centro',{exact:true}).waitFor();await logout();
 await page.getByLabel('Correo de prueba').fill('admin@pulilavado.test');await page.getByLabel('Contraseña de prueba').fill('Incorrecta!');await page.getByRole('button',{name:'Entrar',exact:true}).click();await page.getByRole('alert').waitFor();assert.equal(await page.getByLabel('Resumen de sede de prueba',{exact:true}).count(),0);
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 console.log('PASS: real local sign-in/out, admin branch switching, reception scope, unregistered/suspended/denied users, other organization, invalid credentials, no stale summary, mobile and no cloud calls.');
}
main().catch(error=>{console.error(error);console.error(logs.slice(-7000));process.exitCode=1}).finally(async()=>{await browser?.close();if(server)try{process.kill(-server.pid,'SIGTERM')}catch{}});
