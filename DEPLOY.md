# Deploying PlayArena

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
| `SIGNUP_LIMIT_PER_HOUR` / `LOGIN_FAIL_LIMIT` | Render | Abuse limits per IP (defaults 20 and 10) |
| `VITE_API_URL` | Vercel | Where the client finds the API |

In production the API **refuses to start** if `MONGO_URI` or `CLIENT_URL` is missing or `JWT_SECRET` is weak.
The Render log says which one.
