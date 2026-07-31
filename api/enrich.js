// api/enrich.js - Visits each job detail page to get band + sponsorship
//
// IMPORTANT: processes its batch in PARALLEL, not sequentially. The previous version
// looped through jobs one at a time with up to a 6-second timeout each — worst case,
// 15 jobs × 6s = 90 seconds, wildly over Vercel Hobby's 10-second hard limit. Vercel
// killed the function mid-run every time, which is why every single "Enrich NHS Jobs"
// workflow run was failing. Fetching all jobs in a batch concurrently means the whole
// batch takes roughly as long as the SLOWEST single request, not the sum of all of them.

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://opntstuzymdqkcddfjfn.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || ''; // service_role key — updates/deletes need this to bypass RLS

const HDRS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
  'Accept': 'text/html',
  'Accept-Language': 'en-GB,en;q=0.9',
};

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 12; // hard ceiling regardless of ?limit= — keeps every call safely under 10s even in parallel
const PER_REQUEST_TIMEOUT = 5000; // 5s per job page fetch — batch runs concurrently, so total time ≈ this, not limit × this

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

async function deleteJob(id) {
  await fetch(SUPABASE_URL + '/rest/v1/jobs?id=eq.' + encodeURIComponent(id), {
    method: 'DELETE',
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY },
  });
}

// Processes one job: fetch its detail page, then either delete it (if it turns out to be
// Band ≤2 / part-time / fixed-term) or mark it enriched with the parsed band/sponsorship.
async function processJob(job) {
  try {
    const r = await fetch(job.url, { headers: HDRS, signal: AbortSignal.timeout(PER_REQUEST_TIMEOUT) });
    if (!r.ok) { await updateJob(job.id, {}); return 'enriched'; }
    const detail = parseDetail(await r.text());

    if ((detail.band && detail.band <= 2) || detail.isPartTime || detail.isFixedTerm) {
      await deleteJob(job.id);
      return 'rejected';
    }
    await updateJob(job.id, detail);
    return 'enriched';
  } catch {
    await updateJob(job.id, {});
    return 'enriched';
  }
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

  // Run the whole batch concurrently instead of one at a time — this is the actual fix.
  const results = await Promise.all(jobs.map(processJob));
  const enriched = results.filter(r => r === 'enriched').length;
  const rejected = results.filter(r => r === 'rejected').length;

  const countR = await fetch(
    SUPABASE_URL + '/rest/v1/jobs?enriched=eq.false&select=id&limit=1',
    { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Prefer': 'count=exact' } }
  );
  const remaining = parseInt(countR.headers.get('content-range')?.split('/')[1] || '0');

  return res.status(200).json({ ok: true, enriched, rejected, remaining });
}
