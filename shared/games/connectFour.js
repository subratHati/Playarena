// Server-authoritative Connect Four (7 columns x 6 rows).
// Board is stored row-major, row 0 at the top. Player 0 = red, player 1 = yellow.

export const COLS = 7;
export const ROWS = 6;

export function dropRow(board, col) {
  for (let r = ROWS - 1; r >= 0; r--) if (board[r * COLS + col] === null) return r;
  return -1;
}

export function findWin(board) {
  const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = board[r * COLS + c];
      if (p === null) continue;
      for (const [dr, dc] of dirs) {
        const cells = [r * COLS + c];
        for (let k = 1; k < 4; k++) {
          const rr = r + dr * k;
          const cc = c + dc * k;
          if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS || board[rr * COLS + cc] !== p) break;
          cells.push(rr * COLS + cc);
        }
        if (cells.length === 4) return { player: p, cells };
      }
    }
  }
  return null;
}

export default {
  id: 'connect-four',

  createState({ starter = 0 } = {}) {
    return { board: Array(ROWS * COLS).fill(null), turn: starter, starter, game: 1, line: null, last: null, outcome: null };
  },

  applyMove(state, player, move) {
    if (state.outcome) return { error: 'Game is over' };
    if (state.turn !== player) return { error: 'Not your turn' };
    const col = Number(move?.col);
    if (!Number.isInteger(col) || col < 0 || col >= COLS) return { error: 'Invalid column' };
    const row = dropRow(state.board, col);
    if (row < 0) return { error: 'Column is full' };

    const board = [...state.board];
    const idx = row * COLS + col;
    board[idx] = player;
    const win = findWin(board);
    let outcome = null;
    if (win) outcome = { winner: player };
    else if (board.every((v) => v !== null)) outcome = { winner: null };

    return {
      state: { ...state, board, turn: outcome ? state.turn : 1 - player, line: win?.cells || null, last: idx, outcome },
    };
  },

  replay(state) {
    return { ...this.createState({ starter: 1 - state.starter }), game: state.game + 1 };
  },

  view(state) {
    return { board: state.board, turn: state.turn, line: state.line, last: state.last, game: state.game };
  },

  result(state) {
    return state.outcome;
  },
};
