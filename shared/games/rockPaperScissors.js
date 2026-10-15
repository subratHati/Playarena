// Server-authoritative Rock Paper Scissors, best of 3 (first to 2 round wins).
// Both players pick secretly; choices are revealed only when both are in.

const BEATS = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
const CHOICES = Object.keys(BEATS);
export const TARGET_WINS = 2;
const MAX_ROUNDS = 9; // safety cap against endless ties

export function roundWinner(a, b) {
  if (a === b) return null;
  return BEATS[a] === b ? 0 : 1;
}

export default {
  id: 'rock-paper-scissors',

  createState() {
    return { picks: [null, null], score: [0, 0], rounds: [], outcome: null };
  },

  applyMove(state, player, move) {
    if (state.outcome) return { error: 'Game is over' };
    const choice = move?.choice;
    if (!CHOICES.includes(choice)) return { error: 'Invalid choice' };
    if (state.picks[player]) return { error: 'Already picked this round' };

    const picks = [...state.picks];
    picks[player] = choice;
    if (!picks[0] || !picks[1]) return { state: { ...state, picks } };

    const w = roundWinner(picks[0], picks[1]);
    const score = [...state.score];
    if (w !== null) score[w] += 1;
    const rounds = [...state.rounds, { picks, winner: w }];

    let outcome = null;
    if (score[0] >= TARGET_WINS) outcome = { winner: 0 };
    else if (score[1] >= TARGET_WINS) outcome = { winner: 1 };
    else if (rounds.length >= MAX_ROUNDS) {
      outcome = { winner: score[0] === score[1] ? null : score[0] > score[1] ? 0 : 1 };
    }

    return { state: { picks: [null, null], score, rounds, outcome } };
  },

  replay() {
    return this.createState();
  },

  // Never leak the opponent's pending pick.
  view(state, player) {
    return {
      score: state.score,
      rounds: state.rounds,
      myPick: player === undefined ? null : state.picks[player],
      opponentPicked: player === undefined ? false : Boolean(state.picks[1 - player]),
      target: TARGET_WINS,
    };
  },

  result(state) {
    return state.outcome;
  },
};
