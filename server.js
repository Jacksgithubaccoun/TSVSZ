// Minimal Node.js server (Express + WebSocket)
const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static('public'));

const TICK\_RATE = 30; // ticks per second
const TICK\_MS = Math.round(1000 / TICK\_RATE);

let waiting = null; // waiting socket to pair
let matchIdCounter = 1;
const matches = new Map();

function createEmptyMatch(wsA, wsB) {
const id = matchIdCounter++;
const match = {
id,
players: \[wsA, wsB],
state: createInitialState(),
inputs: \[\[], \[]],
};
wsA.match = match; wsA.playerIndex = 0;
wsB.match = match; wsB.playerIndex = 1;
matches.set(id, match);
return match;
}

function createInitialState() {
const lanes = 5;
const width = 900;
return {
width,
lanes,
entities: \[], // plants, zombies, projectiles
time: 0,
resources: \[50, 50],
over: false,
winner: null,
};
}

function broadcastMatch(match, msg) {
const raw = JSON.stringify(msg);
match.players.forEach(ws => { if (ws.readyState === WebSocket.OPEN) ws.send(raw); });
}

wss.on('connection', (ws) => {
console.log('client connected');
ws.on('message', (raw) => {
let msg; try { msg = JSON.parse(raw); } catch (e) { return; }
if (msg.type === 'join') {
if (waiting === null) { waiting = ws; ws.send(JSON.stringify({ type: 'status', text: 'waiting' })); }
else {
const other = waiting; waiting = null;
const match = createEmptyMatch(other, ws);
other.send(JSON.stringify({ type: 'matchStart', playerIndex: 0 }));
ws.send(JSON.stringify({ type: 'matchStart', playerIndex: 1 }));
broadcastMatch(match, { type: 'snapshot', state: match.state });
}
}
else if (msg.type === 'action') {
const match = ws.match;
if (!match) return;
match.inputs\[ws.playerIndex].push(msg.action);
}
});

ws.on('close', () => {
console.log('client disconnected');
const match = ws.match;
if (match && !match.state.over) {
match.state.over = true;
match.state.winner = 1 - ws.playerIndex;
broadcastMatch(match, { type: 'gameOver', winner: match.state.winner });
}
if (waiting === ws) waiting = null;
});
});

// Entity factories
let entityId = 1;
function spawnPlant(state, owner, lane, x) {
const ent = {
id: entityId++, type: 'plant', owner, lane, x, y: lane, hp: 100, cooldown: 0,
};
state.entities.push(ent);
}
function spawnZombie(state, owner, lane, x, speed=30) {
const ent = {
id: entityId++, type: 'zombie', owner, lane, x, y: lane, hp: 120, speed,
};
state.entities.push(ent);
}
function spawnProjectile(state, owner, lane, x, speed=300, damage=25) {
const ent = {
id: entityId++, type: 'proj', owner, lane, x, y: lane, speed, damage,
};
state.entities.push(ent);
}

// Game loop
setInterval(() => {
matches.forEach(match => {
if (match.state.over) return;
const state = match.state;

```
// Apply queued inputs
for (let p = 0; p < 2; p++) {
  const inputs = match.inputs[p].splice(0);
  for (const action of inputs) {
    if (action.cmd === 'placePlant') {
      const cost = 25;
      if (state.resources[p] >= cost) {
        state.resources[p] -= cost;
        const x = p === 0 ? 150 : (state.width - 150);
        spawnPlant(state, p, action.lane, x);
      }
    }
    if (action.cmd === 'sendZombie') {
      const cost = 30;
      if (state.resources[p] >= cost) {
        state.resources[p] -= cost;
        const x = p === 0 ? state.width - 100 : 100;
        spawnZombie(state, p, action.lane, x, p === 0 ? -40 : 40);
      }
    }
  }
}

const dt = TICK_MS / 1000;
state.time += dt;

// Plants auto-fire
for (const e of state.entities) {
  if (e.type === 'plant') {
    e.cooldown -= dt;
    if (e.cooldown <= 0) {
      e.cooldown = 1.0;
      const owner = e.owner;
      const dir = owner === 0 ? 1 : -1;
      spawnProjectile(state, owner, e.lane, e.x + dir * 20, 300 * dir, 25);
    }
  }
}

// Move projectiles & zombies
for (const e of state.entities) {
  if (e.type === 'proj') e.x += e.speed * dt;
  if (e.type === 'zombie') e.x += e.speed * dt;
}

// Collisions: proj hits zombie
for (const proj of state.entities.filter(a=>a.type==='proj')) {
  const targets = state.entities.filter(b=>b.type==='zombie' && b.lane===proj.lane);
  for (const z of targets) {
    if (Math.abs(z.x - proj.x) < 20 && z.owner !== proj.owner) {
      z.hp -= proj.damage;
      proj._dead = true;
      break;
    }
  }
}

// Zombies collide with plants
for (const z of state.entities.filter(a=>a.type==='zombie')) {
  const plants = state.entities.filter(b=>b.type==='plant' && b.lane===z.lane);
  for (const pEnt of plants) {
    if (Math.abs(z.x - pEnt.x) < 20) {
      pEnt.hp -= 20 * dt;
      z.speed = 0;
    }
  }
  if (!plants.some(pEnt => Math.abs(z.x - pEnt.x) < 20)) {
    if (z.speed === 0) z.speed = z.owner === 0 ? -40 : 40;
  }
}

// Cleanup dead entities
state.entities = state.entities.filter(e => {
  if (e._dead) return false;
  if ((e.type === 'zombie' || e.type === 'plant') && e.hp <= 0) return false;
  if (e.type === 'proj') return e.x > -50 && e.x < state.width + 50;
  return true;
});

// Win check
for (const z of state.entities.filter(a=>a.type==='zombie')) {
  if (z.owner === 0 && z.x < 50) { state.over = true; state.winner = 1; }
  if (z.owner === 1 && z.x > state.width - 50) { state.over = true; state.winner = 0; }
}

// Passive resource gain
if (Math.floor(state.time) % 2 === 0) {
  state.resources[0] = Math.min(999, state.resources[0] + 1);
  state.resources[1] = Math.min(999, state.resources[1] + 1);
}

// Broadcast snapshot
broadcastMatch(match, { type: 'snapshot', state });

if (state.over) {
  broadcastMatch(match, { type: 'gameOver', winner: state.winner });
}
```

});
}, TICK\_MS);

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => console.log("Server listening on", PORT));