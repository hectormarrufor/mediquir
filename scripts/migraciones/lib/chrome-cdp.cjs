// Cliente mínimo del protocolo de Chrome (CDP) sin dependencias: lanza Chrome y ejecuta JS en una pestaña.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function lanzar(puerto = 9333, visible = false) {
  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-lista6-'));
  const args = [`--remote-debugging-port=${puerto}`, `--user-data-dir=${perfil}`, '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--window-size=1280,900', '--lang=es-ES', '--disable-blink-features=AutomationControlled'];
  if (!visible) args.push('--headless=new');
  const proc = spawn(CHROME, [...args, 'about:blank'], { stdio: 'ignore', detached: false });
  for (let i = 0; i < 40; i++) { try { const r = await fetch(`http://127.0.0.1:${puerto}/json/version`); if (r.ok) break; } catch { } await espera(500); }
  const lista = await (await fetch(`http://127.0.0.1:${puerto}/json`)).json();
  const pest = lista.find((t) => t.type === 'page');
  const ws = new WebSocket(pest.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pend = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Page.enable'); await send('Runtime.enable');
  return {
    proc, perfil, send,
    async ir(url) { await send('Page.navigate', { url }); await espera(1200); },
    async evaluar(expr) { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); return r.result?.result?.value; },
    async cerrar() { try { ws.close(); } catch { } try { proc.kill(); } catch { } },
  };
}
module.exports = { lanzar, espera };
