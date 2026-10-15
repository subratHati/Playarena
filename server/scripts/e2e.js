// End-to-end smoke test against a running server.
// Usage: API=http://localhost:5000 node scripts/e2e.js
// Needs the server running with an ADMIN_EMAILS entry of admin-e2e@playarena.dev,
// and a short NO_SHOW_SECONDS (e.g. 8) so the no-show case finishes quickly.
import { io } from 'socket.io-client';

const API = process.env.API || 'http://localhost:5000';
const tag = Date.now().toString(36).slice(-5);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (cond, msg) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) failures++;
};

async function api(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

async function signup(name, email) {
  const r = await api('/api/auth/register', { method: 'POST', body: { username: name, email, password: 'secret123' } });
  if (r.status !== 201) throw new Error(`signup ${name}: ${JSON.stringify(r.data)}`);
  return r.data;
}

function connect(token) {
  return new Promise((resolve, reject) => {
    const s = io(API, { auth: { token }, transports: ['websocket'] });
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
  });
}

// A bot that plays any legal move whenever it's its turn.
function autoplay(socket, label) {
  const seen = [];
  socket.on('match:state', (st) => {
    seen.push(st);
    if (st.status !== 'playing') return;
    const v = st.view;
    let move = null;
    if (st.gameId === 'tic-tac-toe' && v.turn === st.you) move = { cell: v.board.findIndex((c) => !c) };
    if (st.gameId === 'connect-four' && v.turn === st.you) move = { col: [3, 2, 4, 1, 5, 0, 6].find((c) => v.board[c] === null) };
    const rpsKey = `${st.roomId}:${v.rounds?.length}`;
    if (st.gameId === 'rock-paper-scissors' && !v.myPick && socket.data_rps !== rpsKey && (socket.data_rps = rpsKey)) move = { choice: ['rock', 'paper', 'scissors'][Math.floor(Math.random() * 3)] };
    if (move) setTimeout(() => socket.emit('match:move', { roomId: st.roomId, move }), 30);
  });
  socket.on('match:error', (e) => console.log(`  [${label}] match:error`, e.message));
  return seen;
}

async function friendly() {
  console.log('\n— Friendly online —');
  const a = await signup(`ann_${tag}`, `ann_${tag}@t.dev`);
  const b = await signup(`ben_${tag}`, `ben_${tag}@t.dev`);
  const sa = await connect(a.token);
  const sb = await connect(b.token);
  const seenA = autoplay(sa, 'ann');
  autoplay(sb, 'ben');

  sa.emit('queue:join', { gameId: 'tic-tac-toe' });
  await sleep(200);
  sb.emit('queue:join', { gameId: 'tic-tac-toe' });
  await sleep(2000);
  const last = seenA.at(-1);
  check(last?.status === 'over', 'random-queue match is played to the end');
  check(last?.result?.reason === 'played', `result recorded (${last?.result?.winner || 'draw'})`);

  // Rematch
  sa.emit('match:rematch', { roomId: last.roomId });
  sb.emit('match:rematch', { roomId: last.roomId });
  await sleep(2000);
  check(seenA.filter((s) => s.status === 'playing' && s.roomId === last.roomId).length > 3, 'rematch starts a new game');

  // Invite code with Stone Paper Scissors
  const code = await new Promise((res) => {
    sa.once('invite:created', (d) => res(d.code));
    sa.emit('invite:create', { gameId: 'rock-paper-scissors' });
  });
  sb.emit('invite:join', { code });
  await sleep(3000);
  const rps = seenA.filter((s) => s.gameId === 'rock-paper-scissors').at(-1);
  check(rps?.status === 'over', `invite-code SPS match finished (score ${rps?.view.score})`);
  check(seenA.filter((s) => s.gameId === 'rock-paper-scissors').every((s) => !('choice' in s.view)), 'opponent picks never leak');

  // Forfeit on leave
  sa.emit('queue:join', { gameId: 'connect-four' });
  await sleep(100);
  const sb2 = await connect(b.token);
  const seenB2 = [];
  sb2.on('match:state', (s) => seenB2.push(s));
  sb2.emit('queue:join', { gameId: 'connect-four' });
  await sleep(300);
  sb.disconnect();
  sa.removeAllListeners('match:state');
  const room = seenB2.at(-1)?.roomId;
  sa.emit('match:leave', { roomId: room });
  await sleep(500);
  check(seenB2.at(-1)?.result?.reason === 'forfeit', 'leaving mid-match forfeits to the opponent');
  sa.disconnect();
  sb2.disconnect();
  const hist = await api('/api/matches/me', { token: a.token });
  check(hist.data.matches?.length >= 3, `match history saved (${hist.data.matches?.length} matches)`);
}

async function tournament() {
  console.log('\n— Tournament —');
  const admin = await signup(`adm_${tag}`, 'admin-e2e@playarena.dev').catch(async () =>
    (await api('/api/auth/login', { method: 'POST', body: { email: 'admin-e2e@playarena.dev', password: 'secret123' } })).data
  );
  check(admin.user.role === 'admin', 'admin email gets admin role');

  const startsAt = new Date(Date.now() + 25_000).toISOString();
  const created = await api('/api/tournaments', {
    method: 'POST',
    token: admin.token,
    body: { title: `E2E Cup ${tag}`, gameId: 'tic-tac-toe', entryFee: 49, maxPlayers: 4, startsAt },
  });
  check(created.status === 201, 'admin creates tournament');
  const tid = created.data.tournament.id;

  const p = [];
  for (const n of ['p1', 'p2', 'p3', 'p4', 'p5']) p.push(await signup(`${n}_${tag}`, `${n}_${tag}@t.dev`));
  const plain = await api('/api/tournaments', { method: 'POST', token: p[0].token, body: {} });
  check(plain.status === 403, 'players cannot create tournaments');

  const creds = [];
  for (const [i, u] of p.entries()) {
    const co = await api(`/api/tournaments/${tid}/checkout`, { method: 'POST', token: u.token });
    if (i === 4) {
      check(co.status === 409, 'fifth player is told the tournament is full');
      continue;
    }
    check(co.status === 201 && co.data.amount === 49, `p${i + 1} checkout order for ₹49`);
    if (i === 0) {
      const fail = await api(`/api/payments/${co.data.orderId}/confirm`, { method: 'POST', token: u.token, body: { simulate: 'failure' } });
      check(fail.status === 402, 'simulated payment failure is reported');
      const again = await api(`/api/tournaments/${tid}/checkout`, { method: 'POST', token: u.token });
      co.data = again.data;
    }
    const ok = await api(`/api/payments/${co.data.orderId}/confirm`, { method: 'POST', token: u.token, body: { method: 'upi' } });
    check(ok.status === 201 && /^PA-TTT-/.test(ok.data.registration?.entryId), `p${i + 1} paid → ${ok.data.registration?.entryId}`);
    creds.push(ok.data.registration);
  }
  const dup = await api(`/api/tournaments/${tid}/checkout`, { method: 'POST', token: p[0].token });
  check(dup.status === 409, 'cannot register twice');

  const wrong = await api('/api/tournaments/enter', { method: 'POST', token: p[0].token, body: { entryId: creds[0].entryId, passkey: 'WRONG123' } });
  check(wrong.status === 401, 'wrong passkey rejected');
  const stolen = await api('/api/tournaments/enter', { method: 'POST', token: p[1].token, body: creds[0] });
  check(stolen.status === 403, "someone else's credentials rejected");

  // p1..p3 enter the lobby; p4 never shows up.
  const sockets = [];
  const lobby = [];
  for (let i = 0; i < 3; i++) {
    const enter = await api('/api/tournaments/enter', {
      method: 'POST',
      token: p[i].token,
      body: { entryId: creds[i].entryId.toLowerCase(), passkey: creds[i].passkey },
    });
    check(enter.status === 200, `p${i + 1} enters with Entry ID + passkey`);
    const s = await connect(p[i].token);
    autoplay(s, `p${i + 1}`);
    s.on('tournament:state', (st) => (lobby[i] = st));
    s.emit('tournament:join', { token: enter.data.token });
    sockets.push(s);
  }
  await sleep(1500);
  check(lobby[0]?.status === 'upcoming' && lobby[0]?.me.checkedIn, 'lobby shows upcoming + checked in');

  console.log('  waiting for start time…');
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline && lobby[0]?.status !== 'completed') await sleep(1000);

  const final = lobby[0];
  check(final?.status === 'completed', 'tournament runs to completion');
  check(Boolean(final?.winnerName), `champion crowned: ${final?.winnerName}`);
  console.log('  bracket:', JSON.stringify(final?.rounds?.map((r) => r.matches.map((m) => `${m.players.join(' v ')} → ${m.winner} (${m.result})`))));

  const mine = await api('/api/tournaments/me/registrations', { token: p[3].token });
  check(mine.data.registrations?.[0]?.placement === 'Did not check in', 'no-show player marked "Did not check in"');
  const lb = await api('/api/leaderboard');
  check(lb.data.players?.some((x) => x.username === final?.winnerName && x.tournamentsWon >= 1), 'leaderboard credits the champion');
  sockets.forEach((s) => s.disconnect());
}

async function walkover() {
  console.log('\n— Tournament no-show walkover —');
  const admin = (await api('/api/auth/login', { method: 'POST', body: { email: 'admin-e2e@playarena.dev', password: 'secret123' } })).data;
  const t = await api('/api/tournaments', {
    method: 'POST',
    token: admin.token,
    body: { title: `Walkover ${tag}`, gameId: 'connect-four', entryFee: 0, maxPlayers: 2, startsAt: new Date(Date.now() + 8000).toISOString() },
  });
  const tid = t.data.tournament.id;
  const users = [await signup(`w1_${tag}`, `w1_${tag}@t.dev`), await signup(`w2_${tag}`, `w2_${tag}@t.dev`)];
  const states = [];
  const socks = [];
  for (const [i, u] of users.entries()) {
    const co = await api(`/api/tournaments/${tid}/checkout`, { method: 'POST', token: u.token });
    check(co.status === 201 && co.data.registration?.entryId, `free entry issues credentials without payment (w${i + 1})`);
    const enter = await api('/api/tournaments/enter', { method: 'POST', token: u.token, body: co.data.registration });
    const s = await connect(u.token);
    s.on('tournament:state', (st) => (states[i] = st));
    s.emit('tournament:join', { token: enter.data.token });
    socks.push(s);
  }
  await sleep(1000);
  socks[1].disconnect(); // checked in, then vanishes before the start
  console.log('  waiting for start + no-show timeout…');
  const deadline = Date.now() + 40_000;
  while (Date.now() < deadline && states[0]?.status !== 'completed') await sleep(1000);
  const final = states[0]?.rounds?.[0]?.matches?.[0];
  check(states[0]?.winnerName === `w1_${tag}` && final?.result === 'walkover', `present player wins by walkover (${final?.result})`);
  socks[0].disconnect();
}

await friendly();
await tournament();
await walkover();
console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
