// End-to-end smoke test against a running server.
// Usage: API=http://localhost:5000 node scripts/e2e.js
// Needs the server running with an ADMIN_EMAILS entry of admin-e2e@playarena.dev,
// and a short NO_SHOW_SECONDS (e.g. 8) so the no-show case finishes quickly.
// Fast SPS timers keep the timed games short: SPS_FIRST_PICK_MS=1500 SPS_PICK_MS=700 SPS_REVEAL_MS=200.
import { io } from 'socket.io-client';

const API = process.env.API || 'http://localhost:5000';
const tag = Date.now().toString(36).slice(-5);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (cond, msg) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) failures++;
};

// 1×1 PNG used as a tournament cover.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

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
function autoplay(socket, label, opts = {}) {
  const seen = [];
  socket.on('match:state', (st) => {
    seen.push(st);
    if (st.status !== 'playing') return;
    const v = st.view;
    let move = null;
    if (st.gameId === 'tic-tac-toe' && v.turn === st.you) move = { cell: v.board.findIndex((c) => !c) };
    if (st.gameId === 'connect-four' && v.turn === st.you) move = { col: [3, 2, 4, 1, 5, 0, 6].find((c) => v.board[c] === null) };
    if (st.gameId === 'rock-paper-scissors') {
      // Ready once per game, then pick once per round. A bot built with { idle: true } never picks.
      const key = `${st.roomId}:${st.gameNo ?? ''}:${v.phase}:${v.round}`;
      if (socket.rpsKey !== key) {
        if (v.phase === 'ready' && !v.ready[st.you]) move = { ready: true };
        if (v.phase === 'picking' && !v.myPick && !opts.idle) move = { choice: ['rock', 'paper', 'scissors'][Math.floor(Math.random() * 3)] };
        if (move) socket.rpsKey = key;
      }
    }
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
  const spsDeadline = Date.now() + 60_000;
  while (Date.now() < spsDeadline && seenA.filter((s) => s.gameId === 'rock-paper-scissors').at(-1)?.status !== 'over') await sleep(250);
  const spsStates = seenA.filter((s) => s.gameId === 'rock-paper-scissors');
  const rps = spsStates.at(-1);
  check(spsStates[0]?.view.phase === 'ready', 'SPS starts with both players pressing Ready');
  check(spsStates.some((s) => s.view.phase === 'picking' && s.view.windowMs === 1500), 'first round gets the long pick timer');
  check(spsStates.some((s) => s.view.phase === 'picking' && s.view.round > 1 && s.view.windowMs === 700), 'later rounds get the short pick timer');
  check(spsStates.some((s) => s.view.phase === 'reveal'), 'each round pauses on a reveal');
  check(rps?.status === 'over' && Math.max(...rps.view.score) === 5, `invite-code SPS match played to 5 (score ${rps?.view.score})`);
  check(seenA.filter((s) => s.gameId === 'rock-paper-scissors').every((s) => !('choice' in s.view)), 'opponent picks never leak');

  // Not picking 3 times loses the whole match
  const c = await signup(`cal_${tag}`, `cal_${tag}@t.dev`);
  const sc = await connect(c.token);
  const seenC = autoplay(sc, 'cal', { idle: true });
  const sa3 = await connect(a.token);
  const seenA3 = autoplay(sa3, 'ann');
  const code2 = await new Promise((res) => {
    sc.once('invite:created', (d) => res(d.code));
    sc.emit('invite:create', { gameId: 'rock-paper-scissors' });
  });
  sa3.emit('invite:join', { code: code2 });
  const missDeadline = Date.now() + 30_000;
  while (Date.now() < missDeadline && seenC.at(-1)?.status !== 'over') await sleep(250);
  const idle = seenC.at(-1);
  check(idle?.status === 'over' && idle.result?.reason === 'timeouts' && idle.result?.winner === `ann_${tag}`, `missing 3 picks loses the match (${idle?.result?.reason}, misses ${idle?.view.misses})`);
  check(seenA3.at(-1)?.view.misses?.[seenA3.at(-1).you] === 0, 'the active player has no misses');
  sc.disconnect();
  sa3.disconnect();

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
    body: { title: `E2E Cup ${tag}`, gameId: 'tic-tac-toe', entryFee: 49, maxPlayers: 4, startsAt, image: PNG, imageAspect: 'square' },
  });
  check(created.status === 201, 'admin creates tournament');
  check(created.data.tournament.imageAspect === 'square', 'the chosen picture shape is saved');
  const tid = created.data.tournament.id;
  const noImage = await api('/api/tournaments', {
    method: 'POST',
    token: admin.token,
    body: { title: `No image ${tag}`, gameId: 'tic-tac-toe', entryFee: 0, maxPlayers: 4, startsAt },
  });
  check(noImage.status === 400, 'a tournament needs a cover image');
  const badImage = await api('/api/tournaments', {
    method: 'POST',
    token: admin.token,
    body: { title: `Bad image ${tag}`, gameId: 'tic-tac-toe', entryFee: 0, maxPlayers: 4, startsAt, image: 'data:image/png;base64,aGVsbG8gd29ybGQ=' },
  });
  check(badImage.status === 400, 'a fake image is rejected');
  const imgRes = await fetch(API + created.data.tournament.imageUrl);
  check(
    imgRes.status === 200 && imgRes.headers.get('content-type') === 'image/png' && imgRes.headers.get('cross-origin-resource-policy') === 'cross-origin',
    'cover image is served and loadable from the site domain'
  );
  const imgBytes = Buffer.from(await imgRes.arrayBuffer());
  check(imgBytes.equals(Buffer.from(PNG.split(',')[1], 'base64')), 'cover image comes back byte-for-byte');

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
    check(ok.status === 201 && /^MV-TTT-/.test(ok.data.registration?.entryId), `p${i + 1} paid → ${ok.data.registration?.entryId}`);
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
    body: { title: `Walkover ${tag}`, gameId: 'connect-four', entryFee: 0, maxPlayers: 2, startsAt: new Date(Date.now() + 8000).toISOString(), image: PNG },
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
// Needs EXPOSE_DEV_OUTBOX=1 and REMINDER_MINUTES=1 on the server.
const outbox = async () => (await api('/api/dev/emails')).data.emails || [];
const findEmail = async (to, subjectPart) => (await outbox()).find((e) => e.to === to && e.subject.includes(subjectPart));

async function accounts() {
  console.log('\n— Accounts: reset + change password —');
  const short = await api('/api/auth/register', { method: 'POST', body: { username: `sh_${tag}`, email: `sh_${tag}@t.dev`, password: 'abc123' } });
  check(short.status === 400, 'signup rejects passwords under 8 characters');

  const u = await signup(`acc_${tag}`, `acc_${tag}@t.dev`);
  const unknown = await api('/api/auth/forgot-password', { method: 'POST', body: { email: `nobody_${tag}@t.dev` } });
  const known = await api('/api/auth/forgot-password', { method: 'POST', body: { email: `acc_${tag}@t.dev` } });
  check(unknown.status === 200 && unknown.data.message === known.data.message, 'forgot-password answers the same for unknown emails');

  await sleep(200);
  const mail = await findEmail(`acc_${tag}@t.dev`, 'Reset your MivoPlay password');
  const token = mail?.text.match(/token=([a-f0-9]{64})/)?.[1];
  check(Boolean(token), 'reset email contains a one-time link');

  const bad = await api('/api/auth/reset-password', { method: 'POST', body: { token: 'f'.repeat(64), password: 'newpassword1' } });
  check(bad.status === 400, 'made-up reset token rejected');

  await sleep(1100); // make sure the old login is from an earlier second
  const reset = await api('/api/auth/reset-password', { method: 'POST', body: { token, password: 'newpassword1' } });
  check(reset.status === 200 && reset.data.token, 'reset sets the new password and logs in');

  const oldMe = await api('/api/auth/me', { token: u.token });
  check(oldMe.status === 401 && oldMe.data.code === 'session_expired', 'old login stops working after reset');
  const oldSocket = await connect(u.token).then((s) => (s.disconnect(), 'connected')).catch((e) => e.message);
  check(oldSocket === 'unauthorized', 'old login is refused by the game server too');

  const reuse = await api('/api/auth/reset-password', { method: 'POST', body: { token, password: 'another-pass1' } });
  check(reuse.status === 400, 'reset link works only once');
  const oldPw = await api('/api/auth/login', { method: 'POST', body: { email: `acc_${tag}@t.dev`, password: 'secret123' } });
  const newPw = await api('/api/auth/login', { method: 'POST', body: { email: `acc_${tag}@t.dev`, password: 'newpassword1' } });
  check(oldPw.status === 401 && newPw.status === 200, 'old password fails, new password works');

  const wrong = await api('/api/auth/change-password', { method: 'POST', token: newPw.data.token, body: { currentPassword: 'nope', newPassword: 'third-pass1' } });
  check(wrong.status === 400, 'change-password needs the current password');
  await sleep(1100);
  const changed = await api('/api/auth/change-password', {
    method: 'POST',
    token: newPw.data.token,
    body: { currentPassword: 'newpassword1', newPassword: 'third-pass1' },
  });
  check(changed.status === 200, 'change-password works');
  const staleAfterChange = await api('/api/auth/me', { token: newPw.data.token });
  const fresh = await api('/api/auth/me', { token: changed.data.token });
  check(staleAfterChange.status === 401 && fresh.status === 200, 'other sessions logged out, this one kept');
  await sleep(200);
  check((await outbox()).filter((e) => e.to === `acc_${tag}@t.dev` && e.subject.includes('was changed')).length === 2, '"password changed" notice sent each time');
}

async function tournamentEmails() {
  console.log('\n— Tournament emails —');
  const admin = (await api('/api/auth/login', { method: 'POST', body: { email: 'admin-e2e@playarena.dev', password: 'secret123' } })).data;
  const t = (
    await api('/api/tournaments', {
      method: 'POST',
      token: admin.token,
      body: { title: `Mail Cup ${tag}`, gameId: 'connect-four', entryFee: 25, maxPlayers: 4, startsAt: new Date(Date.now() + 75_000).toISOString(), image: PNG },
    })
  ).data.tournament;
  const u = await signup(`ml_${tag}`, `ml_${tag}@t.dev`);
  const order = (await api(`/api/tournaments/${t.id}/checkout`, { method: 'POST', token: u.token })).data;
  const reg = (await api(`/api/payments/${order.orderId}/confirm`, { method: 'POST', token: u.token, body: {} })).data.registration;
  await sleep(300);
  const pass = await findEmail(`ml_${tag}@t.dev`, `Your pass for Mail Cup ${tag}`);
  check(pass?.text.includes(reg.entryId) && pass?.text.includes(reg.passkey), 'booking email carries the Entry ID and passkey');
  check(/IST/.test(pass?.text || ''), 'times in emails are shown in IST');

  console.log('  waiting for the reminder window…');
  let reminder;
  for (let i = 0; i < 30 && !reminder; i++) {
    await sleep(1000);
    reminder = await findEmail(`ml_${tag}@t.dev`, 'starts in');
  }
  check(Boolean(reminder), `reminder sent before the start ("${reminder?.subject}")`);
  await sleep(6000);
  const reminders = (await outbox()).filter((e) => e.to === `ml_${tag}@t.dev` && e.subject.includes('starts in'));
  check(reminders.length === 1, 'reminder sent only once');

  const byPlayer = await api(`/api/tournaments/${t.id}/delete`, { method: 'POST', token: u.token, body: {} });
  check(byPlayer.status === 403, 'players cannot delete tournaments');
  const del = await api(`/api/tournaments/${t.id}/delete`, { method: 'POST', token: admin.token, body: { reason: 'Server maintenance' } });
  check(del.status === 200 && del.data.tournament.status === 'deleted', 'admin deletes an upcoming tournament');
  await sleep(500);
  const cancel = await findEmail(`ml_${tag}@t.dev`, 'was called off');
  check(cancel?.text.includes('will be refunded'), 'called-off email says the fee will be refunded');
  const again = await api(`/api/tournaments/${t.id}/delete`, { method: 'POST', token: admin.token, body: {} });
  check(again.status === 409, 'a deleted tournament cannot be deleted again');

  const pub = await api('/api/tournaments?status=upcoming,live,completed,cancelled,deleted');
  check(!pub.data.tournaments.some((x) => x.id === t.id), 'deleted tournament is hidden from the public list');
  const stranger = await signup(`st_${tag}`, `st_${tag}@t.dev`);
  check((await api(`/api/tournaments/${t.id}`, { token: stranger.token })).status === 404, 'deleted tournament page is hidden from strangers');
  check((await api(`/api/tournaments/${t.id}`, { token: u.token })).status === 200, 'registered player can still see it');
  check((await api(`/api/tournaments/${t.id}/checkout`, { method: 'POST', token: stranger.token })).status >= 400, 'nobody can book a deleted tournament');
  const entry = await api('/api/tournaments/enter', { method: 'POST', token: u.token, body: reg });
  check(entry.status === 410, 'its pass no longer opens the lobby');

  const all = await api('/api/tournaments/admin/all', { token: admin.token });
  const row = all.data.tournaments?.find((x) => x.id === t.id);
  check(row?.status === 'deleted' && row.money.refundPending === 25, 'admin list keeps it with ₹25 to refund');
  check((await api('/api/tournaments/admin/all', { token: u.token })).status === 403, 'only admins see the admin list');

  const parts = await api(`/api/tournaments/${t.id}/participants`, { token: admin.token });
  const me = parts.data.participants?.[0];
  check(
    parts.status === 200 && me?.username === `ml_${tag}` && me?.email === `ml_${tag}@t.dev` && me?.entryId === reg.entryId,
    'participant list has name, email and Entry ID'
  );
  check(me?.payment?.status === 'refund_pending' && me.payment.amount === 25 && me.payment.orderId === order.orderId, 'payment shows refund pending');
  check((await api(`/api/tournaments/${t.id}/participants`, { token: u.token })).status === 403, 'players cannot see the participant list');
  const myPays = await api('/api/payments/me', { token: u.token });
  check(myPays.data.payments?.find((x) => x.orderId === order.orderId)?.status === 'refund_pending', 'player sees "refund pending" on their payment');

  const done = await api(`/api/tournaments/${t.id}/refunds`, { method: 'POST', token: admin.token, body: { orderId: order.orderId } });
  check(done.status === 200, 'admin marks the refund as sent');
  const after = (await api(`/api/tournaments/${t.id}/participants`, { token: admin.token })).data.participants[0];
  check(after.payment.status === 'refunded' && after.payment.refundedAt, 'payment is now refunded');
  const row2 = (await api('/api/tournaments/admin/all', { token: admin.token })).data.tournaments.find((x) => x.id === t.id);
  check(row2.money.refundPending === 0 && row2.money.refunded === 25, 'admin totals move from pending to refunded');
}

async function liveDelete() {
  console.log('\n— Deleting a live tournament —');
  const admin = (await api('/api/auth/login', { method: 'POST', body: { email: 'admin-e2e@playarena.dev', password: 'secret123' } })).data;
  const t = (
    await api('/api/tournaments', {
      method: 'POST',
      token: admin.token,
      body: { title: `Live Del ${tag}`, gameId: 'rock-paper-scissors', entryFee: 10, maxPlayers: 2, startsAt: new Date(Date.now() + 8000).toISOString(), image: PNG },
    })
  ).data.tournament;
  const users = [await signup(`ld1_${tag}`, `ld1_${tag}@t.dev`), await signup(`ld2_${tag}`, `ld2_${tag}@t.dev`)];
  const lobby = [];
  const matchStates = [];
  const socks = [];
  for (const [i, u] of users.entries()) {
    const order = (await api(`/api/tournaments/${t.id}/checkout`, { method: 'POST', token: u.token })).data;
    const reg = (await api(`/api/payments/${order.orderId}/confirm`, { method: 'POST', token: u.token, body: {} })).data.registration;
    const enter = await api('/api/tournaments/enter', { method: 'POST', token: u.token, body: reg });
    const s = await connect(u.token);
    s.on('tournament:state', (st) => (lobby[i] = st));
    s.on('match:state', (st) => matchStates.push(st)); // nobody presses Ready, so the match stays open
    s.emit('tournament:join', { token: enter.data.token });
    socks.push(s);
  }
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline && !matchStates.some((m) => m.status === 'playing')) await sleep(500);
  check(lobby[0]?.status === 'live' && matchStates.some((m) => m.status === 'playing' && m.view.phase === 'ready'), 'tournament SPS match waits for Ready');
  const del = await api(`/api/tournaments/${t.id}/delete`, { method: 'POST', token: admin.token, body: {} });
  check(del.status === 200, 'admin deletes the live tournament');
  await sleep(800);
  check(matchStates.at(-1)?.status === 'over' && matchStates.at(-1)?.result?.reason === 'cancelled', 'the match in progress is stopped');
  check(lobby[0]?.status === 'deleted', 'lobby shows the tournament was called off');
  const parts = (await api(`/api/tournaments/${t.id}/participants`, { token: admin.token })).data.participants;
  check(parts.length === 2 && parts.every((x) => x.payment.status === 'refund_pending'), 'both paid players are marked refund pending');
  const refundAll = await api(`/api/tournaments/${t.id}/refunds`, { method: 'POST', token: admin.token, body: {} });
  const parts2 = (await api(`/api/tournaments/${t.id}/participants`, { token: admin.token })).data.participants;
  check(refundAll.status === 200 && parts2.every((x) => x.payment.status === 'refunded'), '"mark all refunded" clears every pending refund');
  socks.forEach((s) => s.disconnect());
}

async function hero() {
  console.log('\n— Homepage slides —');
  const admin = (await api('/api/auth/login', { method: 'POST', body: { email: 'admin-e2e@playarena.dev', password: 'secret123' } })).data;
  const u = await signup(`hr_${tag}`, `hr_${tag}@t.dev`);
  const start = await api('/api/hero');
  check(start.status === 200 && Array.isArray(start.data.slides), 'homepage slides are public');
  check((await api('/api/hero/slides', { method: 'POST', token: u.token, body: {} })).status === 403, 'players cannot add slides');
  check((await api('/api/hero/slides', { method: 'POST', token: admin.token, body: { layout: 'side', title: 'No pic' } })).status === 400, 'a slide needs a picture');
  check((await api('/api/hero/slides', { method: 'POST', token: admin.token, body: { layout: 'side', image: PNG } })).status === 400, 'a picture-and-text slide needs a headline');
  check(
    (await api('/api/hero/slides', { method: 'POST', token: admin.token, body: { layout: 'banner', image: PNG, ctaTo: 'javascript:alert(1)' } })).status === 400,
    'unsafe links are refused'
  );
  const side = await api('/api/hero/slides', {
    method: 'POST',
    token: admin.token,
    body: { layout: 'side', title: `Cup ${tag}`, text: 'Join now', ctaLabel: 'Book', ctaTo: '/tournaments', theme: 'sps', image: PNG },
  });
  const banner = await api('/api/hero/slides', { method: 'POST', token: admin.token, body: { layout: 'banner', title: 'Banner', ctaTo: 'https://mivoplay.fun/x', image: PNG, imageMobile: PNG } });
  check(side.status === 201 && banner.status === 201, 'admin adds a picture-and-text slide and a banner');
  const img = await fetch(API + side.data.slide.imageUrl);
  check(img.status === 200 && img.headers.get('cross-origin-resource-policy') === 'cross-origin' && Buffer.from(await img.arrayBuffer()).length > 0, 'slide picture is served');
  const phone = await fetch(API + (banner.data.slide?.mobileImageUrl || '/none'));
  check(phone.status === 200 && Buffer.from(await phone.arrayBuffer()).equals(Buffer.from(PNG.split(',')[1], 'base64')), 'banner keeps a separate phone picture');
  const swapped = await api(`/api/hero/slides/${banner.data.slide.id}/update`, { method: 'POST', token: admin.token, body: { removeMobileImage: true, image: PNG } });
  check(swapped.status === 200 && swapped.data.slide.mobileImageUrl === null && swapped.data.slide.imageUrl.endsWith('v=2'), 'pictures can be replaced and the phone picture removed');
  const both = await api('/api/hero/settings', { method: 'POST', token: admin.token, body: { mode: 'both' } });
  const pub = await api('/api/hero');
  check(both.status === 200 && pub.data.mode === 'both' && pub.data.slides.some((x) => x.id === side.data.slide.id), 'switching to "my slides" shows them publicly');
  await api(`/api/hero/slides/${banner.data.slide.id}/update`, { method: 'POST', token: admin.token, body: { active: false } });
  check(!(await api('/api/hero')).data.slides.some((x) => x.id === banner.data.slide.id), 'hidden slides are not shown');
  const order = await api('/api/hero/order', { method: 'POST', token: admin.token, body: { ids: [banner.data.slide.id, side.data.slide.id] } });
  const adminList = (await api('/api/hero/admin', { token: admin.token })).data.slides;
  check(order.status === 200 && adminList.findIndex((x) => x.id === banner.data.slide.id) < adminList.findIndex((x) => x.id === side.data.slide.id), 'slides can be reordered');
  for (const sl of adminList) await api(`/api/hero/slides/${sl.id}/delete`, { method: 'POST', token: admin.token });
  check((await api('/api/hero')).data.mode === 'default', 'deleting every slide goes back to the built-in ones');
}

await tournament();
await hero();
await walkover();
await accounts();
await tournamentEmails();
await liveDelete();
console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
