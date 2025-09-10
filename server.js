// Minimal Node.js server (Express + WebSocket)
const owner = e.owner;
const dir = owner === 0 ? 1 : -1;
spawnProjectile(state, owner, e.lane, e.x + dir * 20, 300 * dir, 25);
}
}
}


// move projectiles & zombies
for (const e of state.entities) {
if (e.type === 'proj') {
e.x += e.speed * dt;
}
if (e.type === 'zombie') {
e.x += e.speed * dt;
}
}


// collisions: proj hits zombie
for (const proj of state.entities.filter(a=>a.type === 'proj')) {
const targets = state.entities.filter(b => b.type === 'zombie' && b.lane === proj.lane);
for (const z of targets) {
// simple collision: distance threshold
if (Math.abs(z.x - proj.x) < 20 && z.owner !== proj.owner) {
z.hp -= proj.damage;
proj._dead = true;
break;
}
}
}


// zombies collide with plants
for (const z of state.entities.filter(a=>a.type==='zombie')) {
const plants = state.entities.filter(b=>b.type==='plant' && b.lane===z.lane);
for (const pEnt of plants) {
if (Math.abs(z.x - pEnt.x) < 20) {
pEnt.hp -= 20 * dt; // zombie deals damage while in contact
z.speed = 0; // stop while chomping
}
}
// if no plant nearby, zombie moves
if (!plants.some(pEnt => Math.abs(z.x - pEnt.x) < 20)) {
// restore movement if previously stopped
if (z.speed === 0) z.speed = z.owner === 0 ? -40 : 40; // original direction
}
}


// cleanup dead entities
state.entities = state.entities.filter(e => {
if (e._dead) return false;
if ((e.type === 'zombie' || e.type === 'plant') && e.hp <= 0) return false;
if (e.type === 'proj') {
// remove if offscreen
return e.x > -50 && e.x < state.width + 50;
}
return true;
});


// simple win check: if a zombie crosses to player's base x
for (const z of state.entities.filter(a=>a.type==='zombie')) {
if (z.owner === 0 && z.x < 50) { state.over = true; state.winner = 1; }
if (z.owner === 1 && z.x > state.width - 50) { state.over = true; state.winner = 0; }
}


// passive resource gain
if (Math.floor(state.time) % 2 === 0) {
// every 2 seconds, give resources (coarse method)
state.resources[0] = Math.min(999, state.resources[0] + 1);
state.resources[1] = Math.min(999, state.resources[1] + 1);
}


// broadcast snapshot periodically (every tick for simplicity)
broadcastMatch(match, { type: 'snapshot', state });


// if over, broadcast gameOver
if (state.over) {
broadcastMatch(match, { type: 'gameOver', winner: state.winner });
}
});
}, TICK_MS);


const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Server listening on', PORT));