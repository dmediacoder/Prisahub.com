// api/fetch.js - Fetches NHS Jobs and saves to Supabase
//
// IMPORTANT: this handles ONE (category, keyword) combo per call, capped at MAX_PAGES.
// That's deliberate — Vercel's Hobby plan hard-caps every function at 10 seconds with
// no override, and the old version tried to loop through all 26 categories (each with
// several keywords, each up to 30 pages) in a single call. It got killed by the timeout
// partway through every day, which is why most categories were thin or empty.
//
// Scheduling now lives in .github/workflows/fetch-jobs.yml, which calls this endpoint
// once per combo, in a loop, from GitHub's infrastructure (no 10s limit there).

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://opntstuzymdqkcddfjfn.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || ''; // service_role key — writes need this to bypass RLS

const HDRS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
  'Accept': 'text/html',
  'Accept-Language': 'en-GB,en;q=0.9',
};

// Capped well below what used to be 30 pages/keyword — this is what keeps a single
// invocation fast enough to survive the 10-second ceiling. Most new postings show up
// in the first few pages anyway (NHS Jobs sorts by relevance/date), so this trades a
// small amount of very-deep-page coverage for actually running reliably every time.
const MAX_PAGES = 15;

function dec(s) {
  return s.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
          .replace(/&quot;/g,'"').replace(/&#039;/g,"'").replace(/&nbsp;/g,' ');
}
function clean(s) {
  return dec(s.replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim();
}
function pickField(block, attr) {
  const re = new RegExp('<li[^>]*data-test="' + attr + '"[^>]*>([\\s\\S]*?)<\\/li>', 'i');
  const m = block.match(re);
  return m ? clean(m[1]).replace(/^[A-Za-z &\/]+:\s*/, '').trim() : '';
}

function parseNhs(html) {
  const jobs = [];
  const re = /<li[^>]*class="[^"]*\bsearch-result\b[^"]*"[^>]*>([\s\S]*?)(?=<li[^>]*class="[^"]*\bsearch-result\b|<\/ul)/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const b = m[1];
    const tm = b.match(/<a[^>]*href="(\/candidate\/jobadvert\/[^"]+)"[^>]*data-test="search-result-job-title"[^>]*>([\s\S]*?)<\/a>/i)
            || b.match(/<a[^>]*data-test="search-result-job-title"[^>]*href="(\/candidate\/jobadvert\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!tm) continue;
    const href = dec(tm[1]), title = clean(tm[2]);
    if (!title) continue;

    let org = 'NHS', loc = 'United Kingdom';
    const lb = b.match(/<div[^>]*data-test="search-result-location"[^>]*>([\s\S]*?)<\/div>\s*<div[^>]*class="nhsuk-grid-row/i);
    if (lb) {
      const inn = lb[1];
      const om = inn.match(/<h3[^>]*>([\s\S]*?)<div[^>]*class="location-font-size"/i);
      if (om) org = clean(om[1]);
      const lm = inn.match(/<div[^>]*class="location-font-size"[^>]*>([\s\S]*?)<\/div>/i);
      if (lm) loc = clean(lm[1]).replace(/,\s*$/, '');
    }

    const salary  = pickField(b, 'search-result-salary');
    const contract = pickField(b, 'search-result-jobType');
    const pattern  = pickField(b, 'search-result-workingPattern');
    const closing  = pickField(b, 'search-result-closingDate');
    let posted = pickField(b, 'search-result-publicationDate');
    if (!posted) {
      const dm = b.match(/(\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4})/i);
      if (dm) posted = dm[1];
    }

    const idM = href.match(/\/jobadvert\/([^?#]+)/);
    if (!idM) continue;
    const id  = idM[1];
    const url = 'https://www.jobs.nhs.uk' + href;

    // Skip obviously bad jobs at parse time
    const t = title.toLowerCase();
    const all = t + ' ' + (contract||'').toLowerCase() + ' ' + (pattern||'').toLowerCase();
    if (all.includes('band 2') || all.includes('band two')) continue;
    if (all.includes('internal only') || all.includes('*internal')) continue;
    if (all.includes('fixed term') || all.includes('fixed-term')) continue;
    if (all.includes('locum') || all.includes('temporary')) continue;
    if (t.includes('part time') || t.includes('part-time')) continue;
    if ((pattern||'').toLowerCase().includes('part time')) continue;
    if (t.includes('bank') && !t.includes('blood bank') && !t.includes('bank manager')) continue;

    jobs.push({ id, title, organisation: org, location: loc, salary, contract, pattern, closing, posted, url });
  }
  return jobs;
}

function isNhs(org) {
  const o = (org || '').toLowerCase();
  if (o.includes('nhs'))          return true;
  if (o.includes('health board')) return true;
  if (o.includes('integrated care')) return true;
  if (o.includes('ambulance') && o.includes('service')) return true;
  if (o.includes('university hospitals')) return true;
  if (o.includes('royal') && (o.includes('hospital') || o.includes('infirmary'))) return true;
  if (o.includes('foundation trust')) return true;
  if (o.includes('hospital trust'))   return true;
  return false;
}

async function fetchPage(kw, loc, page, ft, bands, dist) {
  const p = new URLSearchParams({ keyword: kw, language: 'en', contractType: 'Permanent' });
  if (loc) {
    p.set('location', loc);
    p.set('distance', String(dist || 20)); // NHS Jobs' location filter needs a radius — without one, a bare town/city name doesn't reliably resolve
  }
  if (page > 1) p.set('page', String(page));
  if (ft)       p.set('workingPattern', 'full-time');
  if (bands)    p.set('payBand', bands);
  try {
    const r = await fetch('https://www.jobs.nhs.uk/candidate/search/results?' + p, {
      headers: HDRS, signal: AbortSignal.timeout(8000)
    });
    if (!r.ok) return [];
    return parseNhs(await r.text());
  } catch { return []; }
}

async function dbSave(jobs, category) {
  if (!jobs.length) return 0;
  const rows = jobs
    .filter(j => isNhs(j.organisation))
    .map(j => ({ ...j, category, source: 'england', enriched: false, hassponsor: false }));
  if (!rows.length) return 0;
  // on_conflict targets the (id, category) composite key added by fix-duplicate-category.sql —
  // without this, a job matching two categories' keywords would have its second save silently
  // overwrite the first save's category tag instead of existing as a row under both.
  const r = await fetch(SUPABASE_URL + '/rest/v1/jobs?on_conflict=id,category', {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates',
    },
    body: JSON.stringify(rows),
  });
  if (!r.ok) console.error('DB error:', await r.text());
  return rows.length;
}

// Category metadata — same categories as before, kw arrays are now addressed by index
// so each (category, keyword) pair can be fetched as its own small, fast request.
const CATS = [
  { id: 'sw-out',   kw: ['support worker', 'healthcare assistant', 'nursing assistant'], loc: '',             ft: true,  bands: 'BAND_3,BAND_4,BAND_5,BAND_6,BAND_7' },
  { id: 'sw-lon',   kw: ['support worker', 'healthcare assistant', 'nursing assistant'], loc: 'London', dist: 20, ft: true,  bands: 'BAND_3,BAND_4,BAND_5,BAND_6,BAND_7' },
  { id: 'sw-wm',    kw: ['support worker', 'healthcare assistant', 'nursing assistant'], loc: 'Birmingham', dist: 25, ft: true,  bands: 'BAND_3,BAND_4,BAND_5,BAND_6,BAND_7' },
  { id: 'sw-wales', kw: ['support worker', 'healthcare assistant', 'nursing assistant'], loc: 'Cardiff',    dist: 70, ft: true,  bands: 'BAND_3,BAND_4,BAND_5,BAND_6,BAND_7' },
  { id: 'sw-manc',  kw: ['support worker', 'healthcare assistant', 'nursing assistant'], loc: 'Manchester', dist: 20, ft: true,  bands: 'BAND_3,BAND_4,BAND_5,BAND_6,BAND_7' },
  { id: 'sw-wy',    kw: ['support worker', 'healthcare assistant', 'nursing assistant'], loc: 'Leeds',      dist: 20, ft: true,  bands: 'BAND_3,BAND_4,BAND_5,BAND_6,BAND_7' },
  { id: 'sw-ey',    kw: ['support worker', 'healthcare assistant', 'nursing assistant'], loc: 'Hull',       dist: 25, ft: true,  bands: 'BAND_3,BAND_4,BAND_5,BAND_6,BAND_7' },
  { id: 'admin-out', kw: ['administrator','medical secretary','receptionist','patient coordinator','business support officer','project administrator','communications officer','office manager'], loc: '', ft: false, bands: 'BAND_5,BAND_6,BAND_7,BAND_8A' },
  { id: 'admin-lon', kw: ['administrator','medical secretary','receptionist','patient coordinator','business support officer','project administrator','communications officer','office manager'], loc: 'London', dist: 20, ft: false, bands: 'BAND_5,BAND_6,BAND_7,BAND_8A' },
  { id: 'nurse',    kw: ['staff nurse', 'registered nurse'],               loc: '', ft: false, bands: 'BAND_5' },
  { id: 'mh-nurse', kw: ['mental health nurse', 'psychiatric nurse'],      loc: '', ft: false, bands: 'BAND_5' },
  { id: 'res-nurse',kw: ['research nurse', 'clinical research nurse'],     loc: '', ft: false, bands: 'BAND_5' },
  { id: 'fellow',   kw: ['clinical fellow', 'junior clinical fellow', 'foundation year 1', 'foundation year 2', 'fy1', 'fy2'], loc: '', ft: false, bands: '', excludeTitle: ['senior clinical fellow', 'specialty doctor', 'specialist doctor', 'associate specialist', 'consultant', 'registrar'] },
  { id: 'coder',    kw: ['clinical coder', 'clinical coding'],             loc: '', ft: false, bands: '' },
  { id: 'diet',     kw: ['dietitian', 'dietician'],                        loc: '', ft: false, bands: 'BAND_5' },
  { id: 'micro',    kw: ['microbiology', 'microbiologist'],                loc: '', ft: false, bands: '' },
  { id: 'phleb',    kw: ['phlebotomist', 'phlebotomy'],                   loc: '', ft: false, bands: '' },
  { id: 'res-asst', kw: ['research assistant', 'clinical research assistant', 'research coordinator', 'research administrator', 'research support officer', 'clinical trials assistant', 'study coordinator'], loc: '', ft: false, bands: '' },
  { id: 'sw3',      kw: ['social worker', 'amhp'],                         loc: '', ft: false, bands: '' },
  { id: 'data',     kw: ['data analyst', 'data engineer', 'information analyst', 'reporting analyst', 'performance analyst'], loc: '', ft: false, bands: '' },
  { id: 'bi',       kw: ['business intelligence analyst', 'bi analyst', 'bi developer'],                                      loc: '', ft: false, bands: '' },
  { id: 'fin',      kw: ['finance officer', 'finance manager', 'management accountant', 'payroll officer', 'finance business partner'], loc: '', ft: false, bands: '' },
  { id: 'hr',       kw: ['hr adviser', 'hr officer', 'hr business partner', 'workforce administrator', 'recruitment adviser', 'learning and development', 'employee relations'], loc: '', ft: false, bands: '' },
  { id: 'it',       kw: ['it engineer', 'network engineer', 'software developer', 'software engineer', 'infrastructure engineer', 'cyber security', 'cloud engineer', 'devops', 'it support officer', 'service desk analyst', 'biomedical engineer'], loc: '', ft: false, bands: '' },
  { id: 'pm',       kw: ['project manager', 'programme manager', 'project coordinator', 'pmo', 'transformation manager', 'change manager', 'improvement manager'], loc: '', ft: false, bands: '' },
  { id: 'ba',       kw: ['business analyst', 'systems analyst', 'transformation analyst', 'digital analyst', 'service improvement analyst', 'process improvement analyst'], loc: '', ft: false, bands: '' },
  { id: 'log',      kw: ['logistics manager', 'logistics officer', 'supply chain manager', 'procurement officer', 'stores officer', 'transport manager'], loc: '', ft: false, bands: '' },
  { id: 'coord',    kw: ['pathway coordinator', 'care coordinator', 'referral coordinator', 'discharge coordinator', 'patient coordinator', 'waiting list coordinator'], loc: '', ft: false, bands: '' },
  { id: 'est',      kw: ['estates manager', 'estates officer', 'facilities manager', 'building services manager', 'estates engineer', 'fire safety manager', 'energy manager'], loc: '', ft: false, bands: '' },
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  if (!SUPABASE_KEY) {
    return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY is not set. Add it as an environment variable in your Vercel project settings.' });
  }

  // Discovery mode: returns every (category, kwIndex) combo that needs fetching.
  // The GitHub Actions workflow calls this first, then loops through the list.
  if (req.query.list === 'true') {
    const combos = [];
    CATS.forEach(cat => cat.kw.forEach((kw, i) => combos.push({ category: cat.id, kwIndex: i, keyword: kw })));
    return res.status(200).json({ count: combos.length, combos });
  }

  const { category, kwIndex } = req.query;
  if (!category) {
    return res.status(400).json({ error: 'Missing ?category=. Use ?list=true to see every valid (category, kwIndex) combo.' });
  }
  const cat = CATS.find(c => c.id === category);
  if (!cat) return res.status(404).json({ error: 'Unknown category: ' + category });

  const idx = kwIndex !== undefined ? parseInt(kwIndex, 10) : 0;
  const kw = cat.kw[idx];
  if (kw === undefined) return res.status(404).json({ error: 'kwIndex ' + idx + ' out of range for category ' + category + ' (has ' + cat.kw.length + ' keywords)' });

  const seen = new Set(), batch = [];
  for (let pg = 1; pg <= MAX_PAGES; pg += 5) {
    const pages = [pg, pg+1, pg+2, pg+3, pg+4].filter(p => p <= MAX_PAGES);
    const results = await Promise.all(pages.map(p => fetchPage(kw, cat.loc, p, cat.ft, cat.bands, cat.dist)));
    let anyNewListing = false;
    for (const jobs of results) {
      for (const j of jobs) {
        if (seen.has(j.id)) continue;
        seen.add(j.id);
        anyNewListing = true; // keep paginating based on raw new listings, not post-filter survivors
        if (cat.excludeTitle && cat.excludeTitle.some(x => j.title.toLowerCase().includes(x))) continue;
        batch.push(j);
      }
    }
    if (!anyNewListing) break;
  }

  const saved = await dbSave(batch, cat.id);
  return res.status(200).json({
    ok: true, category, kwIndex: idx, keyword: kw,
    found: batch.length, saved, at: new Date().toISOString(),
  });
}
