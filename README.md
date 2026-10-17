# MivoPlay

A two-player gaming platform with a tournament zone, at mivoplay.fun.

- **Games:** Tic Tac Toe, Stone Paper Scissors (best of 3), Connect Four.
- **Friendly play:** vs Mivo the computer (easy level, no login needed) or online with a friend using a 5-letter invite code. Random matchmaking is built and tested but switched off until there's traffic (`ENABLE_MATCHMAKING=1` on the server turns it on). Rematches, forfeits and reconnects are handled.
- **Homepage hero:** rotating slides configured in `client/src/content/heroSlides.js`. To use your own image, drop it in `client/public/hero/` and set `image` on the slide.
- **Accounts:** forgot/reset password by email, change password, and logging out other devices when the password changes.
- **Emails:** booking pass, reminder before the start, cancellation and refund notice. Without an email key they're printed in the server terminal, so local testing needs no setup.
- **Tournament zone:** admins schedule knockout tournaments with an entry fee, seat limit and start time. Players pay (mock checkout), receive an **Entry ID + passkey**, and use them to enter the lobby. At the start time the bracket is drawn automatically and matches are played live online. Rewards are non-cash (badges + leaderboard).

Stack: React + Vite + Tailwind v4 (client), Node + Express + MongoDB/Mongoose + Socket.io (server).

```
playarena/
├─ shared/games/      Game rules used by BOTH server and client (one source of truth)
├─ server/            Express API, Socket.io, tournament scheduler
│  ├─ src/models/     User, Tournament, Registration, Payment, Match
│  ├─ src/routes/     auth, tournaments, payments (mock), leaderboard/history
│  ├─ src/sockets/    rooms.js (live matches), matchmaking.js (queue + invites)
│  ├─ src/services/   tournamentEngine.js (check-in, bracket, rounds, resume)
│  └─ scripts/e2e.js  End-to-end test against a running server
└─ client/            React app
   ├─ src/lib/ai.js   Computer opponents (minimax / alpha-beta / pattern counter)
   └─ src/pages/      Home, Play, Match, Tournaments, Detail, Enter, Lobby, Me, Admin
```

## Run locally

Needs Node 20+ and MongoDB (local or a free Atlas cluster).

```bash
# 1. API
cd server
cp .env.example .env        # set MONGO_URI, JWT_SECRET, ADMIN_EMAILS
npm install
npm run seed                # admin@playarena.dev / admin123 + 4 sample tournaments (local only)
npm run dev                 # http://localhost:5000

# 2. Client (new terminal)
cd client
cp .env.example .env        # VITE_API_URL=http://localhost:5000
npm install
npm run dev                 # http://localhost:5173
```

Log in as the admin to see the **Admin** tab and schedule tournaments. Anyone who signs up with an email listed in `ADMIN_EMAILS` becomes an admin. **Change the seeded admin password** (or delete that user) before going live.

### Trying a tournament quickly

1. In `server/.env` set `CHECKIN_OPENS_MINUTES=1` and `NO_SHOW_SECONDS=15`, restart the server.
2. As admin, schedule a tournament 2–3 minutes from now.
3. In two different browsers (or one normal + one private window), sign up two players, book seats, copy each pass, and enter the lobby with **Enter with pass**.
4. At the start time both players get their match in the lobby.

### End-to-end test

With the server running and `admin-e2e@playarena.dev` in `ADMIN_EMAILS`, plus `NO_SHOW_SECONDS=8`, `REMINDER_MINUTES=1`, `EXPOSE_DEV_OUTBOX=1` and high `SIGNUP_LIMIT_PER_HOUR` / `RESET_LIMIT_PER_HOUR`:

```bash
cd server && npm install && node scripts/e2e.js
```

It covers matchmaking, invite codes, rematch, forfeit, hidden SPS picks, admin-only creation, full tournaments, failed + successful payments, duplicate registration, wrong/stolen passkeys, byes, walkovers, champion placement and the leaderboard.

## How the tournament flow works

| Step | What happens |
|---|---|
| Book | `POST /api/tournaments/:id/checkout` creates a payment order (free tournaments skip straight to the pass). |
| Pay | `POST /api/payments/:orderId/confirm` — the seat is reserved atomically, then a `Registration` with an Entry ID (`MV-TTT-7K3QX9`) and 8-character passkey is issued. |
| Enter | `POST /api/tournaments/enter` checks Entry ID + passkey belong to the logged-in user and returns a short-lived lobby pass. |
| Check in | The lobby socket joins with that pass. Players are checked in automatically once check-in opens (`CHECKIN_OPENS_MINUTES` before start). |
| Start | The scheduler (every 5 s) draws a random bracket from checked-in players. Odd count → one bye. Fewer than 2 → cancelled and refunded. |
| Play | Each match is a live server-run room. Draws are replayed (other player starts). A player who doesn't join within `NO_SHOW_SECONDS` loses by walkover; one who disconnects mid-match has `RECONNECT_SECONDS` to return. |
| Finish | Winners advance round by round. Champion and runner-up are recorded on registrations; `tournamentsWon` feeds the leaderboard. |

If the server restarts mid-tournament, unfinished matches of the current round are recreated on boot and players reconnect from their lobby.

## Replacing the mock payment

`server/src/routes/payments.js` is the only place to change. For Razorpay (or Cashfree, PhonePe PG):

1. In `/checkout`, create the order on the gateway and return its order id + key to the client.
2. In the client, replace `PaymentModal` with the gateway's checkout script.
3. Replace `/confirm` with signature verification (and ideally a webhook), then call the existing `completePayment(payment, user, method)` — it already handles the atomic seat reservation, credentials, and refund-on-full.

**Legal note:** India's Promotion and Regulation of Online Gaming Act, 2025 prohibits online money games — games where users pay a fee or deposit expecting monetary winnings. This build deliberately offers no cash prizes. Keep rewards non-monetary, and get legal advice before introducing paid entry at scale.

## Deploy

Step-by-step guide: **[DEPLOY.md](DEPLOY.md)** (Atlas → Render → Vercel).

In short: API on Render using `render.yaml`, client on Vercel with root directory `client`, database on Atlas. Socket.io needs a long-running server, so don't put the API on Vercel.

Live matches, presence and tournament locks are in memory, so run **one** API instance. To scale out, add the Socket.io Redis adapter and move room state and locks into Redis.

## Adding a game

1. Add `shared/games/yourGame.js` exporting `createState`, `applyMove`, `replay`, `view`, `result` (see the existing three).
2. Register it in `server/src/games/index.js` and `client/src/lib/games.js`.
3. Add a board component in `client/src/components/Boards.jsx`, an illustration in `GameArt.jsx`, and a computer opponent in `client/src/lib/ai.js`.
4. Add its short code in `server/src/services/ids.js` for Entry IDs.
