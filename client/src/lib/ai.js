// Computer opponents for vs-computer mode. The computer is always player 1.
import { winnerOf } from '../../../shared/games/ticTacToe.js';
import { COLS, ROWS, dropRow, findWin } from '../../../shared/games/connectFour.js';

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ---------- Tic Tac Toe: minimax ----------
function tttScore(board, me, turn, depth) {
  const w = winnerOf(board);
  if (w) return w.mark === me ? 10 - depth : depth - 10;
  if (board.every(Boolean)) return 0;
  const mark = turn === 0 ? 'X' : 'O';
  const scores = [];
  board.forEach((c, i) => {
    if (c) return;
    const next = [...board];
    next[i] = mark;
    scores.push(tttScore(next, me, 1 - turn, depth + 1));
  });
  return mark === me ? Math.max(...scores) : Math.min(...scores);
}

function tttMove(view, difficulty) {
  const empty = view.board.map((c, i) => (c ? null : i)).filter((i) => i !== null);
  const smart = { easy: 0.2, medium: 0.65, hard: 1 }[difficulty] ?? 1;
  if (Math.random() > smart) return { cell: pick(empty) };
  let best = -Infinity;
  let moves = [];
  for (const i of empty) {
    const next = [...view.board];
    next[i] = 'O';
    const s = tttScore(next, 'O', 0, 1);
    if (s > best) [best, moves] = [s, [i]];
    else if (s === best) moves.push(i);
  }
  return { cell: pick(moves) };
}

// ---------- Connect Four: alpha-beta search ----------
function windowScore(cells, me) {
  const mine = cells.filter((c) => c === me).length;
  const theirs = cells.filter((c) => c === 1 - me).length;
  const empty = cells.filter((c) => c === null).length;
  if (mine === 4) return 1000;
  if (mine === 3 && empty === 1) return 6;
  if (mine === 2 && empty === 2) return 2;
  if (theirs === 3 && empty === 1) return -8;
  return 0;
}

function evaluate(board, me) {
  let score = 0;
  for (let r = 0; r < ROWS; r++) if (board[r * COLS + 3] === me) score += 3; // centre column
  const at = (r, c) => board[r * COLS + c];
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      if (c + 3 < COLS) score += windowScore([0, 1, 2, 3].map((k) => at(r, c + k)), me);
      if (r + 3 < ROWS) score += windowScore([0, 1, 2, 3].map((k) => at(r + k, c)), me);
      if (r + 3 < ROWS && c + 3 < COLS) score += windowScore([0, 1, 2, 3].map((k) => at(r + k, c + k)), me);
      if (r + 3 < ROWS && c - 3 >= 0) score += windowScore([0, 1, 2, 3].map((k) => at(r + k, c - k)), me);
    }
  return score;
}

const ORDER = [3, 2, 4, 1, 5, 0, 6];

function search(board, depth, alpha, beta, maximizing, me) {
  const win = findWin(board);
  if (win) return win.player === me ? 100000 + depth : -100000 - depth;
  const cols = ORDER.filter((c) => dropRow(board, c) >= 0);
  if (!cols.length) return 0;
  if (depth === 0) return evaluate(board, me);

  let best = maximizing ? -Infinity : Infinity;
  for (const c of cols) {
    const next = [...board];
    next[dropRow(board, c) * COLS + c] = maximizing ? me : 1 - me;
    const s = search(next, depth - 1, alpha, beta, !maximizing, me);
    if (maximizing) {
      best = Math.max(best, s);
      alpha = Math.max(alpha, s);
    } else {
      best = Math.min(best, s);
      beta = Math.min(beta, s);
    }
    if (alpha >= beta) break;
  }
  return best;
}

function c4Move(view, difficulty) {
  const cols = ORDER.filter((c) => dropRow(view.board, c) >= 0);
  if (difficulty === 'easy' && Math.random() < 0.5) return { col: pick(cols) };
  const depth = { easy: 1, medium: 3, hard: 6 }[difficulty] ?? 6;
  let best = -Infinity;
  let moves = [];
  for (const c of cols) {
    const next = [...view.board];
    next[dropRow(view.board, c) * COLS + c] = 1;
    const s = search(next, depth, -Infinity, Infinity, false, 1);
    if (s > best) [best, moves] = [s, [c]];
    else if (s === best) moves.push(c);
  }
  return { col: moves[0] };
}

// ---------- Stone Paper Scissors ----------
const COUNTER = { rock: 'paper', paper: 'scissors', scissors: 'rock' };

function rpsMove(view, difficulty) {
  const options = ['rock', 'paper', 'scissors'];
  const mine = view.rounds.map((r) => r.picks[0]);
  if (difficulty === 'easy' || mine.length === 0) return { choice: pick(options) };
  // Medium/hard: counter what the player has picked most often (hard also weights their last pick).
  const counts = { rock: 0, paper: 0, scissors: 0 };
  mine.forEach((p) => (counts[p] += 1));
  if (difficulty === 'hard') counts[mine.at(-1)] += 1.5;
  const likely = options.sort((a, b) => counts[b] - counts[a])[0];
  return { choice: Math.random() < (difficulty === 'hard' ? 0.75 : 0.5) ? COUNTER[likely] : pick(options) };
}

export function computerMove(gameId, view, difficulty) {
  if (gameId === 'tic-tac-toe') return tttMove(view, difficulty);
  if (gameId === 'connect-four') return c4Move(view, difficulty);
  return rpsMove(view, difficulty);
}
