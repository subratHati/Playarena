import crypto from 'node:crypto';

// No 0/O/1/I/L so codes are easy to read out and type.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function code(len) {
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return out;
}

const GAME_CODES = { 'tic-tac-toe': 'TTT', 'rock-paper-scissors': 'SPS', 'connect-four': 'C4' };

export const newEntryId = (gameId) => `PA-${GAME_CODES[gameId] || 'GM'}-${code(6)}`;
export const newPasskey = () => code(8);
export const newOrderId = () => `order_mock_${Date.now().toString(36)}${code(6).toLowerCase()}`;

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
