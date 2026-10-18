// Timed Stone Paper Scissors, shared by the server (online + tournaments) and the browser (vs Mivo).
//
// Flow:  ready  →  picking (10s first round, 3s after)  →  reveal (1s)  →  picking  → …  →  over
// - Both players press Ready before round 1.
// - A round ends as soon as both have picked, or when the timer runs out.
// - A player who hasn't picked when time runs out gets a random pick and a "miss".
//   MAX_MISSES misses are allowed; one more loses the whole match.
// - First to TARGET_WINS round wins takes the match. Tie rounds score nobody.
//
// The engine is pure: callers pass the current time (ctx.now) and, optionally, a random function.
// nextEventAt(state) tells the caller when to call tick(state, ctx) next.

const BEATS = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
export const CHOICES = Object.keys(BEATS);
export const TARGET_WINS = 5;
export const MAX_MISSES = 2;
const MAX_ROUNDS = 40; // safety cap against endless ties

export const DEFAULT_TIMING = { firstPickMs: 10_000, pickMs: 3_000, revealMs: 1_000, readyMs: null };

export function roundWinner(a, b) {
  if (a === b) return null;
  return BEATS[a] === b ? 0 : 1;
}

const randomChoice = (rand = Math.random) => CHOICES[Math.floor(rand() * CHOICES.length) % CHOICES.length];

function startPicking(state, now, first) {
  const ms = first ? state.timing.firstPickMs : state.timing.pickMs;
  return { ...state, phase: 'picking', picks: [null, null], deadline: now + ms, windowMs: ms };
}

function resolveRound(state, now, rand) {
  const timedOut = state.picks.map((p) => !p);
  const picks = state.picks.map((p) => p || randomChoice(rand));
  const misses = state.misses.map((m, i) => m + (timedOut[i] ? 1 : 0));
  const w = roundWinner(picks[0], picks[1]);
  const score = [...state.score];
  if (w !== null) score[w] += 1;
  const rounds = [...state.rounds, { picks, winner: w, timedOut }];

  let outcome = null;
  const out = misses.map((m) => m > MAX_MISSES);
  if (out[0] && out[1]) outcome = { winner: null, reason: 'double timeout' };
  else if (out[0]) outcome = { winner: 1, reason: 'timeouts' };
  else if (out[1]) outcome = { winner: 0, reason: 'timeouts' };
  else if (score[0] >= TARGET_WINS) outcome = { winner: 0 };
  else if (score[1] >= TARGET_WINS) outcome = { winner: 1 };
  else if (rounds.length >= MAX_ROUNDS) outcome = { winner: score[0] === score[1] ? null : score[0] > score[1] ? 0 : 1 };

  const next = { ...state, picks: [null, null], score, misses, rounds, outcome, windowMs: null };
  if (outcome) return { ...next, phase: 'over', deadline: null };
  return { ...next, phase: 'reveal', deadline: now + state.timing.revealMs };
}

export default {
  id: 'rock-paper-scissors',
  timed: true,

  createState({ timing } = {}) {
    return {
      phase: 'ready',
      ready: [false, false],
      picks: [null, null],
      score: [0, 0],
      misses: [0, 0],
      rounds: [],
      outcome: null,
      deadline: null, // ready deadline (if any) or end of the current window
      windowMs: null,
      timing: { ...DEFAULT_TIMING, ...(timing || {}) },
    };
  },

  // Called once both players are present. Starts the optional "press Ready in time" window.
  onStart(state, { now }) {
    if (state.phase !== 'ready' || !state.timing.readyMs || state.deadline) return state;
    return { ...state, deadline: now + state.timing.readyMs };
  },

  applyMove(state, player, move, { now = Date.now(), rand } = {}) {
    if (state.outcome) return { error: 'Game is over' };

    if (move?.ready) {
      if (state.phase !== 'ready') return { error: 'The match has already started' };
      if (state.ready[player]) return { state };
      const ready = [...state.ready];
      ready[player] = true;
      const next = { ...state, ready };
      return { state: ready[0] && ready[1] ? startPicking(next, now, true) : next };
    }

    const choice = move?.choice;
    if (!CHOICES.includes(choice)) return { error: 'Invalid choice' };
    if (state.phase === 'ready') return { error: 'Press Ready first' };
    if (state.phase !== 'picking') return { error: 'Wait for the next round' };
    if (state.picks[player]) return { error: 'Already picked this round' };

    const picks = [...state.picks];
    picks[player] = choice;
    const next = { ...state, picks };
    return { state: picks[0] && picks[1] ? resolveRound(next, now, rand) : next };
  },

  nextEventAt(state) {
    return state.outcome ? null : state.deadline;
  },

  // Advance the clock: end an expired pick window, start the next round after a reveal,
  // or end the match if someone never pressed Ready.
  tick(state, { now = Date.now(), rand } = {}) {
    if (state.outcome || !state.deadline || now < state.deadline) return state;
    if (state.phase === 'picking') return resolveRound(state, now, rand);
    if (state.phase === 'reveal') return startPicking(state, now, false);
    if (state.phase === 'ready') {
      const [a, b] = state.ready;
      const outcome = a && !b ? { winner: 0, reason: 'not ready' } : b && !a ? { winner: 1, reason: 'not ready' } : { winner: null, reason: 'double no-show' };
      return { ...state, phase: 'over', deadline: null, outcome };
    }
    return state;
  },

  replay(state) {
    return this.createState({ timing: state.timing });
  },

  // Never leak the opponent's pending pick. remainingMs lets each client run its own countdown.
  view(state, player, { now = Date.now() } = {}) {
    const me = player ?? 0;
    return {
      phase: state.phase,
      ready: state.ready,
      score: state.score,
      misses: state.misses,
      maxMisses: MAX_MISSES,
      rounds: state.rounds,
      target: TARGET_WINS,
      myPick: state.picks[me],
      opponentPicked: Boolean(state.picks[1 - me]),
      remainingMs: state.deadline ? Math.max(0, state.deadline - now) : null,
      windowMs: state.windowMs,
      round: state.rounds.length + (state.phase === 'picking' ? 1 : 0),
    };
  },

  result(state) {
    return state.outcome;
  },
};
