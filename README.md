# PrisaHub — job-fetching fix

## What changed and why

**The bug:** `/api/fetch` used to loop through all 26 job categories (each with several
keywords, each up to 30 pages) in one request. Vercel's Hobby plan hard-caps every
function at 10 seconds with no override — so it got killed partway through every run,
and most categories never finished fetching. That's why jobs were thin or missing.

**The fix:**
- `/api/fetch` now handles **one category + one keyword per call**, capped at 15 pages
  instead of 30. Each call finishes in a couple of seconds instead of minutes.
- `/api/enrich` now processes **15 jobs per call** instead of 100 (the old delay alone —
  100 × 150ms — was already over a second before counting real fetch time).
- Scheduling moved from Vercel Cron to **GitHub Actions** (`.github/workflows/`), which
  has no 10-second limit and can loop through every combo in one run. `vercel.json` is
  now empty on purpose — the old `crons` entries are gone since they can't do this job.
- Supabase credentials moved out of the source code and into environment variables.

The website itself (`index.html`) is unchanged — this is entirely a behind-the-scenes fix.

## Round 2 fixes (location + band accuracy)

- **West Midlands / Wales / Manchester / W Yorkshire / E Yorkshire Support Worker
  categories returned zero jobs.** Two bugs: "West Midlands" and "Wales" are region/
  country names, not valid location values (NHS Jobs' location search expects a specific
  town or city) — swapped for real cities (Birmingham, Cardiff). And `location` was being
  sent without a `distance` radius, which the search likely needs to resolve any location
  reliably, including Manchester/Leeds/Hull. All location-based categories now send a
  `distance` in miles alongside `location`.
- **Staff Nurse / Mental Health Nurse / Research Nurse** — all three now restricted to
  Band 5 only (Mental Health Nurse and Research Nurse previously had no band restriction
  or a wider one).
- **Clinical Fellow** — keywords tightened to junior-level titles only (FY1, FY2, junior
  clinical fellow, clinical fellow), dropped the overly broad "trust doctor" keyword, and
  added a title-based exclusion filter to screen out senior clinical fellow, specialty
  doctor, associate specialist, and consultant roles that otherwise matched on keyword.
- **Dietician** — restricted to Band 5 only (previously unrestricted).

## Setup steps (required before this works)

### 1. Lock down your database with Row Level Security
In Supabase: **Dashboard → SQL Editor → New query**, paste the contents of
`enable-rls.sql` from this folder, and click **Run**. This makes the `jobs` table
public-readable but not writable by anyone using the public key — only your secret key
(step 2) can write to it.

### 2. Get both your keys
In Supabase: **Project Settings → API**. You need two different keys now, not one:
- **`anon` / `public` key** — safe to use in the read-only part of the app, protected by
  the RLS policy you just added.
- **`service_role` key** — secret, bypasses RLS entirely. This is what lets your scraper
  write to the database even though the public key can't. **Never expose this one to the
  browser or commit it to a public repo.**

If your current key still shown in Supabase's dashboard is the same one that was pasted
in this chat, rotate/reset it first (there's a reset option next to the key) — then get
the fresh `service_role` and `anon` values.

### 3. Add three environment variables in Vercel
Project Settings → Environment Variables:
- `SUPABASE_URL` — your project URL
- `SUPABASE_SERVICE_KEY` — the secret `service_role` key (used by `fetch.js`, `enrich.js`)
- `SUPABASE_ANON_KEY` — the public `anon` key (used by `jobs.js`, the read-only site API)

### 4. Add a GitHub Actions secret
In your GitHub repo: Settings → Secrets and variables → Actions → New repository secret:
- Name: `PRISAHUB_URL`
- Value: your deployed Vercel URL, e.g. `https://prisahub.vercel.app` (no trailing slash)

### 5. Deploy
Push this to your repo and deploy to Vercel as usual. The GitHub Actions workflows will
run on their schedule automatically, or you can trigger them manually right away from
the **Actions** tab in GitHub (each workflow has `workflow_dispatch` enabled) — that's
the fastest way to check it's working without waiting for the next 6am run.

## Checking it worked

- GitHub → **Actions** tab → run "Fetch NHS Jobs" manually → watch the log; you should
  see every category/keyword combo print a `found`/`saved` count instead of one silent
  timeout.
- Supabase → **Table Editor → jobs** → row count should climb noticeably compared to
  before, across categories that were previously empty.
