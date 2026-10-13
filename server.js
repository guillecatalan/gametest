const http = require('http'), fs = require('fs'), path = require('path');
const { WebSocketServer } = require('ws');
const PORT = process.env.PORT || 3000;
const MIN = 1; // jugadores mínimos para iniciar (sube a 2 para producción)
const COLORS = ['#ff5a5f', '#ffb400', '#3ddc84', '#35a7ff', '#b66dff', '#ff7ac8', '#00d1c1', '#ff8a3d'];

const srv = http.createServer((req, res) => {
  fs.readFile(path.join(__dirname, 'index.html'), (e, d) => {
    res.writeHead(e ? 500 : 200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(e ? 'error' : d);
  });
});
const wss = new WebSocketServer({ server: srv });
const players = new Map();
let nextId = 1, phase = 'lobby', t0 = Date.now(), results = [];
const setPhase = p => { phase = p; t0 = Date.now(); };

wss.on('connection', ws => {
  const id = nextId++;
  const p = { id, name: 'Jugador' + id, color: COLORS[id % COLORS.length], x: 0, y: 1, z: 4, ry: 0, fin: null };
  players.set(id, p);
  ws.send(JSON.stringify({ t: 'welcome', id, color: p.color }));
  ws.on('message', m => {
    let d; try { d = JSON.parse(m); } catch { return; }
    if (d.t === 'join') p.name = String(d.name || p.name).slice(0, 12);
    else if (d.t === 'pos' && [d.x, d.y, d.z, d.ry].every(Number.isFinite)) { p.x = d.x; p.y = d.y; p.z = d.z; p.ry = d.ry; }
    else if (d.t === 'finish' && phase === 'go' && p.fin == null && p.z < -80) {
      p.fin = (Date.now() - t0) / 1000;
      results.push({ name: p.name, time: +p.fin.toFixed(2) });
    }
  });
  ws.on('close', () => players.delete(id));
});

setInterval(() => {
  const n = players.size, el = (Date.now() - t0) / 1000;
  if (phase === 'lobby' && n >= MIN && el > 3) { results = []; players.forEach(p => p.fin = null); setPhase('countdown'); }
  else if (phase === 'countdown' && el > 5) setPhase('go');
  else if (phase === 'go' && (el > 75 || (n && [...players.values()].every(p => p.fin != null)))) setPhase('results');
  else if (phase === 'results' && el > 8) setPhase('lobby');
  const msg = JSON.stringify({
    t: 's', now: Date.now(), phase, el, results,
    players: [...players.values()].map(({ id, name, color, x, y, z, ry }) => ({ id, name, color, x, y, z, ry }))
  });
  wss.clients.forEach(c => c.readyState === 1 && c.send(msg));
}, 66);

srv.listen(PORT, () => console.log('Carrera Loca en http://localhost:' + PORT));
