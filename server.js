const http = require('http'), fs = require('fs'), path = require('path');
const { WebSocketServer } = require('ws');
const PORT = process.env.PORT || 3000;
const COLORS = ['#ff8a80', '#ffd166', '#7bd88f', '#6ec6ff', '#c39bff', '#ff9ccf', '#4fd6c8', '#ffab5e'];

const srv = http.createServer((req, res) => {
  fs.readFile(path.join(__dirname, 'index.html'), (e, d) => {
    res.writeHead(e ? 500 : 200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(e ? 'error' : d);
  });
});
const wss = new WebSocketServer({ server: srv });
const players = new Map();
let nextId = 1;

wss.on('connection', ws => {
  const id = nextId++;
  const p = { id, name: 'Vecino' + id, color: COLORS[id % COLORS.length], x: 0, z: 0, ry: 0, say: '', sayT: 0, em: 0, emT: 0, lastChat: 0 };
  players.set(id, p);
  ws.send(JSON.stringify({ t: 'welcome', id, color: p.color }));
  ws.on('message', m => {
    let d; try { d = JSON.parse(m); } catch { return; }
    const now = Date.now();
    if (d.t === 'join') p.name = String(d.name || p.name).slice(0, 12);
    else if (d.t === 'pos' && [d.x, d.z, d.ry].every(Number.isFinite)) { p.x = d.x; p.z = d.z; p.ry = d.ry; }
    else if (d.t === 'chat' && now - p.lastChat > 800) { p.lastChat = now; p.say = String(d.text || '').slice(0, 40); p.sayT = now; }
    else if (d.t === 'emote' && [1, 2, 3, 4].includes(d.e)) { p.em = d.e; p.emT = now; }
  });
  ws.on('close', () => players.delete(id));
});

setInterval(() => {
  const now = Date.now();
  const msg = JSON.stringify({
    t: 's',
    players: [...players.values()].map(p => ({
      id: p.id, name: p.name, color: p.color, x: p.x, z: p.z, ry: p.ry,
      say: now - p.sayT < 6000 ? p.say : '', sid: p.sayT,
      em: now - p.emT < 2500 ? p.em : 0, eid: p.emT
    }))
  });
  wss.clients.forEach(c => c.readyState === 1 && c.send(msg));
}, 66);

srv.listen(PORT, () => console.log('Oficina Piso 5 en http://localhost:' + PORT));
