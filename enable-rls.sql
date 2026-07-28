-- Run this in Supabase: Dashboard → SQL Editor → New query → paste this → Run
--
-- What it does: turns on Row Level Security for the jobs table, then adds one rule —
-- anyone can READ jobs (the site needs that), but nothing can insert/update/delete
-- using the public anon key. Only your secret service_role key (used by fetch.js and
-- enrich.js) can write, because service_role bypasses RLS entirely by design.

alter table jobs enable row level security;

create policy "Public can read jobs"
on jobs
for select
to anon
using (true);

-- No insert/update/delete policy is created for `anon` on purpose — with RLS on and no
-- matching policy, those actions are denied by default for the public key.
