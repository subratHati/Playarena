// Server-authoritative Tic Tac Toe.
// Players: index 0 = X, index 1 = O. X always starts a fresh board; on a replay
// (tournament draw) the starter alternates so nobody keeps the first-move edge.

const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

export function winnerOf(board) {
  for (const [a, b, c] of LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { mark: board[a], line: [a, b, c] };
    }
  }
  return null;
}

const MARKS = ['X', 'O'];

export default {
  id: 'tic-tac-toe',

  createState({ starter = 0 } = {}) {
    return { board: Array(9).fill(null), turn: starter, starter, game: 1, line: null, outcome: null };
  },

  applyMove(state, player, move) {
    if (state.outcome) return { error: 'Game is over' };
    if (state.turn !== player) return { error: 'Not your turn' };
    const cell = Number(move?.cell);
    if (!Number.isInteger(cell) || cell < 0 || cell > 8) return { error: 'Invalid cell' };
    if (state.board[cell]) return { error: 'Cell already taken' };

    const board = [...state.board];
    board[cell] = MARKS[player];
    const win = winnerOf(board);
    let outcome = null;
    if (win) outcome = { winner: player };
    else if (board.every(Boolean)) outcome = { winner: null };

    return {
      state: { ...state, board, turn: outcome ? state.turn : 1 - player, line: win?.line || null, outcome },
    };
  },

  // A draw in a tournament is replayed with the other player starting.
  replay(state) {
    const starter = 1 - state.starter;
    return { ...this.createState({ starter }), game: state.game + 1 };
  },

  view(state) {
    return { board: state.board, turn: state.turn, line: state.line, game: state.game };
  },

  result(state) {
    return state.outcome;
  },
};
