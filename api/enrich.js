// api/enrich.js - Visits each job detail page to get band + sponsorship
//
// IMPORTANT: default batch size dropped from 100 to 15. The old version processed up to
// 100 jobs per call with a 150ms delay between each — that's 15+ seconds of delay alone,
// before counting actual page-fetch time, which blew past Vercel Hobby's 10-second
// function limit on almost every run. This version finishes one small batch quickly and
// reliably; call it repeatedly (runner.js already does this, or the GitHub Actions
// workflow) until `remaining` hits 0.

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://opntstuzymdqkcddfjfn.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || ''; // service_role key — updates/deletes need this to bypass RLS

const HDRS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
  'Accept': 'text/html',
  'Accept-Language': 'en-GB,en;q=0.9',
};

const DEFAULT_LIMIT = 15;
const MAX_LIMIT = 25; // hard ceiling regardless of ?limit= — keeps every call safely under 10s

function parseDetail(html) {
  const text = html.toLowerCase();

  let band = null;
  const bm = html.match(/Band\s+(\d+[a-z]?)/i);
  if (bm) {
    const n = parseInt(bm[1]);
    if (!isNaN(n)) band = n;
  }

  let hassponsor = false;
  if (text.includes('skilled worker sponsorship to work in the uk') ||
      text.includes('skilled worker sponsorship') ||
      text.includes('certificate of sponsorship')) {
    const idx = text.indexOf('skilled worker sponsor');
    const nearby = idx >= 0 ? text.slice(idx, idx + 300) : '';
    if (!nearby.includes('not available') && nearby.includes('welcome')) {
      hassponsor = true;
    }
    if (text.includes('sponsorship available') && !text.includes('sponsorship not available')) {
      hassponsor = true;
    }
  }

  const isFullTime = text.includes('full-time') || text.includes('full time');
  const isPartTime = text.includes('part-time') || text.includes('part time');
  const isFixedTerm = text.includes('fixed term') || text.includes('fixed-term');
  const isPermanent = text.includes('permanent');

  return { band, hassponsor, isFullTime, isPartTime, isFixedTerm, isPermanent };
}

async function getUnenriched(limit) {
  const r = await fetch(
    SUPABASE_URL + '/rest/v1/jobs?enriched=eq.false&select=id,url&limit=' + limit,
    { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY } }
  );
  if (!r.ok) return [];
  return r.json();
}

async function updateJob(id, data) {
  await fetch(SUPABASE_URL + '/rest/v1/jobs?id=eq.' + encodeURIComponent(id), {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ...data, enriched: true }),
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  if (!SUPABASE_KEY) {
    return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY is not set. Add it as an environment variable in your Vercel project settings.' });
  }

  const requested = parseInt(req.query.limit || String(DEFAULT_LIMIT), 10);
  const limit = Math.min(requested, MAX_LIMIT);

  const jobs = await getUnenriched(limit);
  if (!jobs.length) return res.status(200).json({ ok: true, enriched: 0, rejected: 0, remaining: 0 });

  let enriched = 0, rejected = 0;

  for (const job of jobs) {
    try {
      const r = await fetch(job.url, { headers: HDRS, signal: AbortSignal.timeout(6000) });
      if (!r.ok) { await updateJob(job.id, {}); continue; }
      const detail = parseDetail(await r.text());

      if ((detail.band && detail.band <= 2) || detail.isPartTime || detail.isFixedTerm) {
        await fetch(SUPABASE_URL + '/rest/v1/jobs?id=eq.' + encodeURIComponent(job.id), {
          method: 'DELETE',
          headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY },
        });
        rejected++;
      } else {
        await updateJob(job.id, detail);
        enriched++;
      }
    } catch {
      await updateJob(job.id, {});
    }
  }

  const countR = await fetch(
    SUPABASE_URL + '/rest/v1/jobs?enriched=eq.false&select=id&limit=1',
    { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Prefer': 'count=exact' } }
  );
  const remaining = parseInt(countR.headers.get('content-range')?.split('/')[1] || '0');

  return res.status(200).json({ ok: true, enriched, rejected, remaining });
}
