// 개발용 로컬 서버: 엔진(WebAssembly 스레드)에 필요한 교차 출처 격리 헤더를 붙여서 폴더를 제공한다.
// 사용: node server.js  →  http://localhost:8080
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = __dirname, PORT = process.env.PORT || 8080;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.wasm': 'application/wasm', '.nnue': 'application/octet-stream', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  if (p === '/slow') { const ms = +(new URL(req.url, 'http://x').searchParams.get('ms') || 5000); return setTimeout(() => { res.writeHead(200, { 'Content-Type': 'image/gif' }); res.end(Buffer.from('R0lGODlhAQABAAAAACw=', 'base64')); }, ms); } // 테스트용: load 이벤트를 늦춘다
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp', 'Cache-Control': 'no-cache' });
  fs.createReadStream(f).pipe(res);
}).listen(PORT, () => console.log('장기앱 서버: http://localhost:' + PORT));
