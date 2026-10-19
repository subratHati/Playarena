# Deploying MivoPlay

Three pieces: **MongoDB Atlas** (database) → **Render** (API + Socket.io) → **Vercel** (React client).
Do them in this order, because each one needs the URL of the one before.

---

## 0. Put the project on GitHub

Render and Vercel both deploy from a GitHub repo. From the `playarena` folder:

```powershell
git init
git add .
git commit -m "PlayArena"
git branch -M main
git remote add origin https://github.com/<you>/playarena.git
git push -u origin main
```

`.gitignore` already keeps out `node_modules` and your `.env` files. Check that `git status` doesn't list any `.env` before committing.

---

## 1. MongoDB Atlas

You already have a cluster. Two things to set:

- **Network Access → Add IP Address → Allow access from anywhere (`0.0.0.0/0`).**
  Render doesn't give you a fixed IP, so this is required. Your database password is what protects it.
- **Use a separate database for production.** In the connection string, change the name after `.mongodb.net/`
  from `playarena` to `playarena-prod`, so your local test data stays separate:
  ```
  mongodb+srv://USER:PASSWORD@cluster0.f5tsg4g.mongodb.net/playarena-prod?retryWrites=true&w=majority
  ```

---

## 2. API on Render

1. Render dashboard → **New → Blueprint** → connect your GitHub repo. Render reads `render.yaml`.
2. It asks for the values that aren't in the file:
   | Key | Value |
   |---|---|
   | `MONGO_URI` | the production connection string from step 1 |
   | `CLIENT_URL` | put `http://localhost:5173` for now — you'll change it after step 3 |
   | `ADMIN_EMAILS` | your own email, e.g. `you@gmail.com` |

   `JWT_SECRET` is generated automatically.
3. Click **Apply**. The first deploy takes a few minutes. When it's done, open
   `https://playarena-api.onrender.com/api/health` (your URL may differ). It should show `{"ok":true}`.

**About the plan:** `render.yaml` uses the paid **Starter** plan. Free instances go to sleep after about
15 minutes without traffic. That drops live matches, and the first visitor waits around a minute for it to
wake up. Free is fine for showing friends; change `plan: starter` to `plan: free` in `render.yaml` if
you want that. Use Starter (or Railway) before running real tournaments.

The region is set to Singapore, the closest Render region to India.

---

## 3. Client on Vercel

1. Vercel → **Add New → Project** → import the same repo.
2. Settings:
   - **Root Directory:** `client`
   - **Framework preset:** Vite (auto-detected)
   - **Environment variable:** `VITE_API_URL` = your Render URL, e.g. `https://playarena-api.onrender.com` (no trailing slash)
3. Deploy. You get a URL like `https://playarena-xyz.vercel.app`.

> The client imports game rules from `../shared`, outside the `client` folder. Vercel allows this by default.
> If the build fails with "Could not resolve ../../../shared/games/…", go to **Project → Settings → Build
> and Deployment** and turn on **Include files outside the root directory in the Build Step**.

`VITE_API_URL` is baked in at build time. If you change it later, **redeploy** the client.

---

## 4. Connect the two

1. Render → your service → **Environment** → set `CLIENT_URL` to your Vercel URL, e.g. `https://playarena-xyz.vercel.app`.
   For more than one URL (say a custom domain too), separate them with commas.
2. Save. Render restarts the API. Its log shows `Allowed frontend origins: …` so you can check.

If the site loads but shows "Can't reach the server", or the browser console shows a **CORS** error,
`CLIENT_URL` doesn't exactly match the address in your browser bar (watch for `www`, `https`, trailing `/`).

---

## 5. Create your admin account

Easiest: since your email is in `ADMIN_EMAILS`, just **sign up on the live site with that email**. You're admin
from the start, and you choose your own password.

(Alternative: in Render → **Shell**, run `cd server && ADMIN_PASSWORD='a-strong-password' npm run seed`.
In production the seed only creates the admin; it skips the sample tournaments.)

Don't reuse `admin123` anywhere live.

---

## 6. Smoke test

- Open the Vercel URL on your phone and laptop.
- Play the computer (no login).
- Sign up on both devices and play each other online.
- As admin, schedule a free tournament 20 minutes out, book from both devices, enter the lobby
  ~15 minutes before, and play it.

---

## 7. Turn on email (password reset, passes, reminders)

Until this is set up, the site works but emails are only written to the Render log. Nobody receives a reset link,
booking pass or reminder.

Render's free plan blocks normal email (SMTP), so MivoPlay sends through **Brevo's web API**, which works on any plan.
Brevo's free tier allows 300 emails a day.

1. Sign up at **brevo.com** (free).
2. **Add a sender:** top-right menu → **Senders, Domains & Dedicated IPs** → **Senders** → **Add a sender**.
   Use the address emails should come from, e.g. your Gmail. Brevo emails you a code to verify it.
3. **Create an API key:** top-right menu → **SMTP & API** → **API Keys** → **Generate a new API key**. Copy it.
4. On Render → **Environment**, add:
   | Key | Value |
   |---|---|
   | `BREVO_API_KEY` | the key from step 3 |
   | `EMAIL_FROM` | the sender you verified in step 2 |
5. Save. Render restarts the API.
6. Test: on the live site, log out → **Log in** → **Forgot password?** → enter your email. The email should arrive within a minute.

Emails sent from a Gmail address through Brevo sometimes land in **Spam** at first. Mark one as "Not spam".
For reliable delivery at scale, buy a domain (e.g. `mivoplay.fun`), verify it in Brevo under **Domains**, and send from
an address on it, like `team@mivoplay.fun`.

If emails don't arrive, the Render log shows `[email] Brevo rejected …` with Brevo's reason. The usual causes are a sender
that isn't verified yet, or a new Brevo account still waiting for activation.

What gets emailed:
- **Booking:** the Entry ID and passkey, so players don't lose their pass.
- **Reminder:** `REMINDER_MINUTES` (default 30) before the start, with the pass and a lobby link.
- **Called off:** when an admin deletes a tournament, or too few players check in. Says the fee will be refunded; mark refunds as done in Admin after you send the money.
- **Password reset** link (valid 1 hour, single use) and a notice whenever a password changes.

## 8. Use your own domain (mivoplay.fun)

The goal: the site on `https://mivoplay.fun` (and `www`), the API on `https://api.mivoplay.fun`.
Nothing in the code is tied to a domain. Everything comes from environment variables, so this is DNS and settings only.

**Don't touch the Brevo DNS records** (the `brevo-code` TXT, DKIM and `_dmarc` records). Only add the new records below.

### 8a. Site on Vercel
1. Vercel → your project → **Settings** → **Domains** → add `mivoplay.fun`. Also add `www.mivoplay.fun` when Vercel offers it, and let it redirect to `mivoplay.fun`.
2. Vercel shows the DNS records to add, usually an **A** record for `@` and a **CNAME** for `www`.
   Add **exactly what Vercel shows** in your domain's DNS panel.
3. Wait until Vercel shows both domains as **Valid**. HTTPS is set up automatically.

### 8b. API on Render
1. Render → your API service → **Settings** → **Custom Domains** → add `api.mivoplay.fun`.
2. Render shows a **CNAME** target (like `playarena-api.onrender.com`). In your DNS, add a **CNAME** record with name `api` pointing to that target.
3. Wait until Render shows the domain as **Verified** with a certificate issued.
4. Check `https://api.mivoplay.fun/api/health` shows `{"ok":true}`.

### 8c. Point everything at the new addresses
| Where | Key | New value |
|---|---|---|
| Render → Environment | `CLIENT_URL` | `https://mivoplay.fun,https://www.mivoplay.fun` |
| Render → Environment | `APP_URL` | `https://mivoplay.fun` (links in emails) |
| Vercel → Settings → Environment Variables | `VITE_API_URL` | `https://api.mivoplay.fun` |

Save on Render (it restarts), then on Vercel go to **Deployments** → ⋯ → **Redeploy**, because `VITE_API_URL` is baked in at build time.

Players who logged in on the old `vercel.app` address need to log in once more on `mivoplay.fun`.
Keep the old `vercel.app` URL in `CLIENT_URL` for a few days if people still have it bookmarked.

---

## 9. Payment gateways (Razorpay, Cashfree, PhonePe)

You can turn on one, two or all three. Checkout shows each gateway whose keys are set. While none is set, the site keeps using the **test checkout** (no real money). As soon as one real gateway is set, the test checkout disappears automatically.

Dashboard menu names below may differ slightly as the gateways update their sites. Look for "API keys" and "Webhooks".

Start with each gateway's **test/sandbox keys**, try a booking end to end, then swap in live keys after the gateway approves your account. All keys go on **Render only** (never in Vercel, never in git).

First add this on Render, used for payment notification links:

| Key | Value |
|---|---|
| `API_PUBLIC_URL` | `https://api.mivoplay.fun` |

### 9a. Razorpay

1. Razorpay Dashboard → switch to **Test mode** → Account & Settings → **API Keys** → generate. You get a Key ID (`rzp_test_…`) and Key Secret.
2. Dashboard → **Webhooks** → Add new webhook:
   - URL: `https://api.mivoplay.fun/api/payments/webhooks/razorpay`
   - Secret: make up a long random string
   - Events: `payment.captured` and `order.paid`
3. Make sure payments are set to **capture automatically** (the default). MivoPlay also captures any that arrive only "authorized".
4. Render → Environment:

| Key | Value |
|---|---|
| `RAZORPAY_KEY_ID` | `rzp_test_…` (later `rzp_live_…`) |
| `RAZORPAY_KEY_SECRET` | the Key Secret |
| `RAZORPAY_WEBHOOK_SECRET` | the webhook secret from step 2 |

Test and live mode have **separate** keys and webhooks. Set the webhook up again in live mode when you go live.

### 9b. Cashfree

1. Cashfree Merchant Dashboard → Payment Gateway → switch to **Test** → Developers → **API Keys**. You get an App ID and Secret Key.
2. Developers → **Webhooks** → add `https://api.mivoplay.fun/api/payments/webhooks/cashfree` (payment events). MivoPlay also sends this link with every order.
3. For live payments, Cashfree must **whitelist your website domain** (`mivoplay.fun`). Request it in the dashboard (Developers → Whitelisting), otherwise the checkout won't open on your site.
4. Render → Environment:

| Key | Value |
|---|---|
| `CASHFREE_APP_ID` | App ID |
| `CASHFREE_SECRET_KEY` | Secret Key |
| `CASHFREE_ENV` | `sandbox` for test keys, `production` for live keys |

Cashfree requires the player's mobile number, so MivoPlay asks for it when Cashfree is chosen.

### 9c. PhonePe PG

1. PhonePe Business Dashboard → **Developer Settings** → API keys (use the UAT/test ones first). You get a Client ID, Client Secret and Client Version.
2. Developer Settings → **Webhooks** → create:
   - URL: `https://api.mivoplay.fun/api/payments/webhooks/phonepe`
   - Username and password: make up both
   - Events: `checkout.order.completed` and `checkout.order.failed`
3. Render → Environment:

| Key | Value |
|---|---|
| `PHONEPE_CLIENT_ID` | Client ID |
| `PHONEPE_CLIENT_SECRET` | Client Secret |
| `PHONEPE_CLIENT_VERSION` | Client Version (often `1`) |
| `PHONEPE_ENV` | `sandbox` for test keys, `production` for live keys |
| `PHONEPE_WEBHOOK_USERNAME` | the webhook username from step 2 |
| `PHONEPE_WEBHOOK_PASSWORD` | the webhook password from step 2 |

PhonePe opens its own payment page and then sends the player back to `https://mivoplay.fun/payments/return`. That works automatically as long as `APP_URL` or `CLIENT_URL` is your site address.

### 9d. Check it

After Render restarts, its log shows a line like `Payment options: razorpay, cashfree, phonepe`. Book a paid tournament with a fresh account and pay with each gateway's test method. You should get the pass on screen and by email. If a player pays but closes the tab, the pass still arrives within about a minute (webhook or background check).

To keep the test checkout available next to real gateways (for your own testing only), set `MOCK_PAYMENTS=1`. Remove it before real players arrive.

## Feature switches

| Key (Render) | Effect |
|---|---|
| `ENABLE_MATCHMAKING=1` | Turns on **Find a random opponent**. Any other value shows it as "Coming soon". Invite codes and tournaments work either way. Takes effect after Render restarts; no site redeploy needed. |

---

## Updating later

`git push` to `main` → Render and Vercel both redeploy automatically.

Avoid pushing **while a tournament is live**: a deploy restarts the API. Live matches in the current round are
recreated on boot and players reconnect from the lobby, but anyone mid-move loses that game's progress.

## Production settings reference

| Variable | Where | Purpose |
|---|---|---|
| `NODE_ENV=production` | Render | Turns on the startup safety checks |
| `MONGO_URI` | Render | Atlas connection string |
| `JWT_SECRET` | Render | Signs logins. Changing it logs everyone out |
| `CLIENT_URL` | Render | Allowed frontend origins (comma-separated) |
| `ADMIN_EMAILS` | Render | Emails that become admin when they sign up |
| `CHECKIN_OPENS_MINUTES` / `NO_SHOW_SECONDS` / `RECONNECT_SECONDS` | Render | Tournament timing |
| `SPS_FIRST_PICK_MS` / `SPS_PICK_MS` / `SPS_REVEAL_MS` / `SPS_READY_SECONDS` | Render (optional) | Stone Paper Scissors timers. Defaults: 10 s, 3 s, 1 s, 60 s |
| `SIGNUP_LIMIT_PER_HOUR` / `LOGIN_FAIL_LIMIT` | Render | Abuse limits per IP (defaults 20 and 10) |
| `BREVO_API_KEY` / `EMAIL_FROM` | Render | Sending email (see step 7) |
| `REMINDER_MINUTES` | Render | Reminder email before a tournament (0 turns it off) |
| `EMAIL_TIMEZONE` | Render | Timezone for times in emails (default `Asia/Kolkata`) |
| `APP_URL` | Render | Base address for links in emails (defaults to the first `CLIENT_URL`) |
| `ENABLE_MATCHMAKING` | Render | `1` turns on random matchmaking |
| `VITE_API_URL` | Vercel | Where the client finds the API |

In production the API **refuses to start** if `MONGO_URI` or `CLIENT_URL` is missing or `JWT_SECRET` is weak.
The Render log says which one.
