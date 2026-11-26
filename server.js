const http = require('http'), fs = require('fs'), path = require('path');
const { WebSocketServer } = require('ws');
const PORT = process.env.PORT || 3000;
const COLORS = ['#ff8a80', '#ffd166', '#7bd88f', '#6ec6ff', '#c39bff', '#ff9ccf', '#4fd6c8', '#ffab5e'];
const CALL = 30; // segundos para llegar a la sala
// Salas (metros). Deben coincidir con el plano del cliente.
const ROOMS = { 1: { x: [-19.6, -9.8], z: [-27.8, -22.2] }, 2: { x: [-27.4, -20.0], z: [11.6, 18.1] }, 3: { x: [24.6, 27.5], z: [10.8, 16.2] } };

const srv = http.createServer((req, res) => {
  fs.readFile(path.join(__dirname, 'index.html'), (e, d) => {
    res.writeHead(e ? 500 : 200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(e ? 'error' : d);
  });
});
const wss = new WebSocketServer({ server: srv });
const players = new Map();
let nextId = 1, lastEnd = 0;
let mt = { ph: 'idle', room: 1, t0: Date.now(), arr: [], ids: [], late: [] };
const nextDelay = () => Date.now() + 60000 + Math.random() * 50000;
let nextCall = nextDelay();
const startCall = () => { mt = { ph: 'call', room: 1 + Math.floor(Math.random() * 3), t0: Date.now(), arr: [], ids: [], late: [] }; };

wss.on('connection', ws => {
  const id = nextId++;
  const p = { id, name: 'Vecino' + id, color: COLORS[id % COLORS.length], x: 0, z: 0, ry: 0, say: '', sayT: 0, em: 0, emT: 0, lastChat: 0, score: 0 };
  players.set(id, p);
  ws.send(JSON.stringify({ t: 'welcome', id, color: p.color }));
  ws.on('message', m => {
    let d; try { d = JSON.parse(m); } catch { return; }
    const now = Date.now();
    if (d.t === 'join') p.name = String(d.name || p.name).slice(0, 12);
    else if (d.t === 'pos' && [d.x, d.z, d.ry].every(Number.isFinite)) { p.x = d.x; p.z = d.z; p.ry = d.ry; }
    else if (d.t === 'chat' && now - p.lastChat > 800) { p.lastChat = now; p.say = String(d.text || '').slice(0, 40); p.sayT = now; }
    else if (d.t === 'emote' && [1, 2, 3, 4].includes(d.e)) { p.em = d.e; p.emT = now; }
    else if (d.t === 'bell' && mt.ph === 'idle' && now - lastEnd > 15000) startCall();
  });
  ws.on('close', () => players.delete(id));
});

function tickMeeting(now) {
  const n = players.size;
  if (mt.ph === 'idle') { if (n > 0 && now >= nextCall) startCall(); }
  else if (mt.ph === 'call') {
    const r = ROOMS[mt.room], el = (now - mt.t0) / 1000;
    players.forEach(p => {
      if (!mt.ids.includes(p.id) && p.x >= r.x[0] && p.x <= r.x[1] && p.z >= r.z[0] && p.z <= r.z[1]) {
        const pts = Math.max(3, 10 - 2 * mt.ids.length);
        p.score += pts; mt.ids.push(p.id); mt.arr.push({ name: p.name, t: +el.toFixed(1), pts });
      }
    });
    if (el > CALL || n === 0 || [...players.values()].every(p => mt.ids.includes(p.id))) {
      mt.late = [...players.values()].filter(p => !mt.ids.includes(p.id)).map(p => p.name);
      mt.ph = 'result'; mt.t0 = now;
    }
  } else if (mt.ph === 'result' && now - mt.t0 > 9000) { mt.ph = 'idle'; nextCall = nextDelay(); lastEnd = now; }
}

setInterval(() => {
  const now = Date.now(); tickMeeting(now);
  const res = mt.ph === 'result';
  const msg = JSON.stringify({
    t: 's',
    m: { ph: mt.ph, room: mt.room, el: (now - mt.t0) / 1000, dur: CALL, got: mt.ids.length, tot: players.size, ids: mt.ids, arr: res ? mt.arr : [], late: res ? mt.late : [] },
    players: [...players.values()].map(p => ({
      id: p.id, name: p.name, color: p.color, x: p.x, z: p.z, ry: p.ry, score: p.score,
      say: now - p.sayT < 6000 ? p.say : '', sid: p.sayT,
      em: now - p.emT < 2500 ? p.em : 0, eid: p.emT
    }))
  });
  wss.clients.forEach(c => c.readyState === 1 && c.send(msg));
}, 66);

srv.listen(PORT, () => console.log('Oficina Piso 5 en http://localhost:' + PORT));
