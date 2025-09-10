// Minimal Node.js server (Express + WebSocket)
const express = require('express');
const http = require('http');
const WebSocket = require('ws');


const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });


app.use(express.static('public'));


const TICK_RATE = 30; // ticks per second
const TICK_MS = Math.round(1000 / TICK_RATE);


let waiting = null; // waiting socket to pair
let matchIdCounter = 1;
const matches = new Map();


function createEmptyMatch(wsA, wsB) {
const id = matchIdCounter++;
const match = {
id,
players: [wsA, wsB],
state: createInitialState(),
inputs: [[], []],
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
entities: [], // plants, zombies, projectiles
time: 0,
resources: [50, 50],
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
// send initial state
broadcastMatch(match, { type: 'snapshot', state: match.state });
}
}
else if (msg.type === 'action') {
server.listen(PORT, () => console.log('Server listening on', PORT));