import ticTacToe from '../../../shared/games/ticTacToe.js';
import rockPaperScissors from '../../../shared/games/rockPaperScissors.js';
import connectFour from '../../../shared/games/connectFour.js';

// To add a game: write a module with createState / applyMove / replay / view / result,
// register it here, and add a board component on the client.
export const engines = {
  'tic-tac-toe': ticTacToe,
  'rock-paper-scissors': rockPaperScissors,
  'connect-four': connectFour,
};

export const catalog = [
  {
    id: 'tic-tac-toe',
    name: 'Tic Tac Toe',
    tagline: 'Three in a row wins.',
    description: 'The classic 3×3 duel. Take turns placing X and O; first to line up three wins.',
    players: '2 players',
    duration: '~1 min',
    accent: 'cyan',
  },
  {
    id: 'rock-paper-scissors',
    name: 'Stone Paper Scissors',
    tagline: 'First to 5. Think fast.',
    description: 'Timed rounds: 10 seconds for the first pick, then 3 seconds. Stone breaks scissors, scissors cut paper, paper wraps stone. First to 5 points wins; more than 2 missed picks loses the match.',
    players: '2 players',
    duration: '~30 sec',
    accent: 'amber',
  },
  {
    id: 'connect-four',
    name: 'Connect Four',
    tagline: 'Drop discs, connect four.',
    description: 'Drop discs into a 7×6 grid. Connect four horizontally, vertically or diagonally before your opponent does.',
    players: '2 players',
    duration: '~4 min',
    accent: 'rose',
  },
];

export const gameIds = Object.keys(engines);
