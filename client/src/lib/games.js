import ticTacToe from '../../../shared/games/ticTacToe.js';
import rockPaperScissors from '../../../shared/games/rockPaperScissors.js';
import connectFour from '../../../shared/games/connectFour.js';

export const engines = {
  'tic-tac-toe': ticTacToe,
  'rock-paper-scissors': rockPaperScissors,
  'connect-four': connectFour,
};

// Mirrors the server catalog so the shelf renders instantly; the server list is the source of truth.
export const GAMES = {
  'tic-tac-toe': {
    id: 'tic-tac-toe',
    name: 'Tic Tac Toe',
    tagline: 'Three in a row wins.',
    rules: 'Take turns placing X and O on a 3×3 grid. Line up three — across, down or diagonally — to win.',
    color: 'var(--color-ttt)',
    text: 'text-ttt',
    bg: 'bg-ttt',
  },
  'rock-paper-scissors': {
    id: 'rock-paper-scissors',
    name: 'Stone Paper Scissors',
    tagline: 'First to 5. Think fast.',
    rules: 'Both press Ready, then pick in secret before the timer runs out: 10 seconds for the first round, 3 seconds after that. Stone breaks scissors, scissors cut paper, paper wraps stone. First to 5 points wins. Miss more than 2 picks and you lose the match.',
    color: 'var(--color-sps)',
    text: 'text-sps',
    bg: 'bg-sps',
  },
  'connect-four': {
    id: 'connect-four',
    name: 'Connect Four',
    tagline: 'Drop discs, connect four.',
    rules: 'Drop discs into a 7-column grid. First to connect four in a row — any direction — wins.',
    color: 'var(--color-c4)',
    text: 'text-c4',
    bg: 'bg-c4',
  },
};

export const GAME_LIST = Object.values(GAMES);
