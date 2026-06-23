# CPMS — Deployment & User Access Guide

This guide takes the system from "works on localhost" to "live, private, login-protected, on any device."
Follow the steps in order. **Do Step 1 (test locally) before deploying** — it confirms the new login works.

---

## What's already been done (in code + database)

- **Login + route gate:** a `/login` screen (email + password) and `middleware.ts` that redirects anyone not signed in. No page is reachable without logging in.
- **Session-aware clients:** every screen now carries the logged-in user's identity to the database.
- **Database locked down:** Row-Level Security is on for every table, and every function is restricted to logged-in users. The public browser key can read/do nothing until someone signs in.
- **Dead code removed:** the old global Billing page and the legacy `fn_record_payment` / `fn_issue_charges` functions are gone.

You provide: a GitHub account, a Vercel account, and you create the user logins.

---

## Step 1 — Test the login locally (do this first)

1. In the project folder, install the one new dependency:
   ```
   npm install
   ```
2. **Create your login** in Supabase (this is how you "add users"):
   - Go to the Supabase dashboard → your project → **Authentication → Users → Add user**.
   - Enter your email + a password, and tick **Auto Confirm User** (so no email confirmation is needed).
   - Repeat for anyone else who needs access (everyone gets the same full access).
3. **Turn off public sign-ups** so only people you add can get in:
   - Supabase → **Authentication → Sign In / Providers → Email** → disable "Allow new users to sign up" (keep Email provider enabled).
4. Run the app:
   ```
   npm run dev
   ```
   Open `http://localhost:3000` → you should be redirected to **/login**. Sign in with the user you created. You should land on the dashboard, and **Sign out** is at the bottom of the sidebar.
5. Quick check that actions still work while logged in: open a tenancy and attach/save a note, or open Rent: Invoicing. If something errors, tell me the message — it's almost certainly a quick fix.

> If login itself fails, paste the error. If needed I can temporarily re-open the database (re-grant the anon role) to isolate whether it's the app or the database, then restore the lockdown.

---

## Step 2 — Put the code on GitHub

1. Create a **new private repository** on GitHub (e.g. `cpms`). Don't add a README/.gitignore (the project has them).
2. In the project folder:
   ```
   git add -A
   git commit -m "Auth, RLS lockdown, electric + arrears, cleanup — deploy-ready"
   git branch -M main
   git remote add origin https://github.com/<your-username>/cpms.git
   git push -u origin main
   ```
   (If `origin` already exists, use `git remote set-url origin …`.)

> `.env.local` is git-ignored and will **not** be pushed — that's correct. You'll set those values in Vercel instead (Step 3).

---

## Step 3 — Deploy on Vercel

1. Go to **vercel.com → Add New → Project**, and import the GitHub repo. Vercel auto-detects Next.js.
2. Before deploying, add **Environment Variables** (Settings → Environment Variables) — copy the values from your local `.env.local`:

   | Name | Value | Notes |
   |---|---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://jkpftidophjivmaqpkuu.supabase.co` | public |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | (anon/publishable key) | public, safe in browser |
   | `SUPABASE_SERVICE_ROLE_KEY` | (service-role key) | **secret — server only, never expose** |

   Add each to **Production** (and Preview if you want preview deploys).
3. Click **Deploy**. You'll get a URL like `https://cpms-xxxx.vercel.app`.
4. **Point Supabase Auth at the live URL:** Supabase → Authentication → **URL Configuration** → set **Site URL** to your Vercel URL (and add it to Redirect URLs).
5. Open the Vercel URL on any device → you'll get the login → sign in. Done.

---

## Step 4 — Post-deploy checks

- Visiting the URL while logged out redirects to /login. ✅ (the gate works)
- Sign in → dashboard loads with live data.
- Record a test action (then undo if needed) to confirm writes work as the logged-in user.
- Open an invoice PDF link (it should render for a logged-in session).

---

## Adding / removing users later

- **Add:** Supabase → Authentication → Users → Add user (email + password, Auto Confirm).
- **Remove:** delete the user there; they can no longer sign in.
- Everyone currently has the **same full access** (no roles). If you later want an owner-vs-bookkeeper split, that's a future enhancement (see BACKLOG / COUNCIL_REVIEW).

---

## Rolling out future changes

After the first deploy, any change is: `git commit` → `git push` → Vercel auto-builds and redeploys. Database changes are applied to Supabase separately (as we've been doing).
