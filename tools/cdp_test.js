// 사용: node cdp_test.js <url> <대기초> [js식]  — 헤드리스 Edge 를 CDP 로 열어 실시간으로 기다린 뒤 식을 평가한다
const { spawn } = require('child_process'); const fs = require('fs'); const os = require('os'); const path = require('path');
const url = process.argv[2], wait = +(process.argv[3] || 30), expr = process.argv[4] || "document.getElementById('note').textContent + ' || ' + document.getElementById('eng-status').textContent + ' || isolated=' + self.crossOriginIsolated";
const edge = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(p => fs.existsSync(p)); if (!edge) { console.error('no browser'); process.exit(1); }
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'edgecdp-')); const port = 9300 + Math.floor(Math.random() * 500);
const proc = spawn(edge, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=' + port, '--user-data-dir=' + prof, '--window-size=430,1000', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  let targets; for (let i = 0; i < 50; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.length) break; } catch (e) {} await sleep(200); }
  const page = targets.find(t => t.type === 'page'); const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r); let id = 0; const pending = {};
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending[m.id]) { pending[m.id](m.result); delete pending[m.id]; } };
  const send = (method, params) => new Promise(r => { ws.send(JSON.stringify({ id: ++id, method, params })); pending[id] = r; });
  await send('Page.enable'); await send('Page.navigate', { url });
  await sleep(wait * 1000);
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  console.log('URL:', (await send('Runtime.evaluate', { expression: 'location.href', returnByValue: true })).result.value);
  console.log('RESULT:', r.result && r.result.value);
  ws.close(); proc.kill(); setTimeout(() => { try { fs.rmSync(prof, { recursive: true, force: true }); } catch (e) {} process.exit(0); }, 500);
})().catch(e => { console.error('ERR', e); proc.kill(); process.exit(1); });
