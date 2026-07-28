// api/jobs.js - Serves jobs from Supabase

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://opntstuzymdqkcddfjfn.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || ''; // anon key — read-only, safe under RLS

const MONTHS = {january:1,february:2,march:3,april:4,may:5,june:6,july:7,august:8,september:9,october:10,november:11,december:12,jan:1,feb:2,mar:3,apr:4,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};

function parseDate(s) {
  if (!s) return null;
  const m = s.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (m) { const mo = MONTHS[m[2].toLowerCase()]; if (mo) return m[3]+'-'+String(mo).padStart(2,'0')+'-'+m[1].padStart(2,'0'); }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10);
  return null;
}

// Title inclusion/exclusion lists per category
const SW_INC = ['healthcare support worker','healthcare assistant','health care assistant','hcsw','hca','clinical support worker','nursing assistant','senior healthcare support worker','ward support worker','patient support worker','patient care assistant','therapy support worker','occupational therapy support worker','physiotherapy support worker','speech and language therapy assistant','rehabilitation support worker','mental health support worker','mental health healthcare assistant','psychiatric support worker','psychiatric nursing assistant','picu support worker','crisis support worker','dementia support worker','forensic mental health support worker','learning disability support worker','autism support worker','positive behaviour support worker','behaviour support worker','intensive support worker','community support worker','community healthcare support worker','community rehabilitation support worker','community mental health support worker','maternity support worker','maternity care assistant','neonatal support worker','neonatal healthcare assistant','paediatric support worker','nursery assistant','theatre support worker','operating department support worker','perioperative support worker','endoscopy support worker','sterile services support worker','emergency department support worker','a&e support worker','critical care support worker','icu support worker','hdu support worker','renal support worker','dialysis support worker','oncology support worker','cancer support worker','cardiology support worker','stroke support worker','respiratory support worker','orthopaedic support worker','diabetes support worker','palliative care support worker','hospice support worker','radiology support worker','imaging assistant','laboratory support worker','outpatient support worker','clinic support worker','gp healthcare assistant','primary care support worker','care navigator','peer support worker','mortuary assistant','decontamination support worker'];
const SW_EXC = ['registered nurse','staff nurse','charge nurse','ward sister','nurse specialist','nurse consultant','nurse practitioner','advanced nurse','community nurse','district nurse','school nurse','practice nurse','nurse associate','nursing associate','student nurse','midwife','midwifery','doctor','consultant','registrar','physician','surgeon','scientist','pharmacist','radiographer','psychologist','paramedic','sonographer','biomedical','occupational therapist','physiotherapist','speech and language therapist','dietitian','dietician','podiatrist','social worker','ward manager','service manager','clinical manager','team manager','general manager','deputy manager','head of','director','assistant practitioner','physiotherapy assistant','occupational therapy assistant','therapy assistant','rehabilitation assistant','social prescribing link worker','rehab therapy assistant','dietetic assistant'];

const ADMIN_INC = ['administrative assistant','administrator','administration officer','administrative officer','administrative coordinator','senior administrator','administration team leader','office administrator','business administrator','executive administrator','receptionist','medical receptionist','senior receptionist','outpatient receptionist','ward receptionist','clinic receptionist','health records receptionist','switchboard operator','medical secretary','senior medical secretary','personal assistant','executive assistant','team secretary','clinical secretary','divisional secretary','directorate secretary','executive support officer','patient services administrator','patient pathway coordinator','patient pathway administrator','patient access administrator','patient booking coordinator','appointments administrator','admissions officer','admissions coordinator','waiting list coordinator','referral coordinator','clinic coordinator','outpatient administrator','theatre booking coordinator','cancer pathway coordinator','health records clerk','health records officer','medical records officer','medical records administrator','clinical coding administrator','records coordinator','hr administrator','workforce administrator','recruitment administrator','medical staffing administrator','esr administrator','people administrator','workforce officer','learning and development administrator','temporary staffing administrator','finance administrator','finance assistant','accounts assistant','payroll administrator','procurement administrator','purchasing officer','supplies administrator','accounts payable officer','accounts receivable officer','information administrator','data administrator','information officer','data quality officer','digital administrator','epr administrator','clinical systems administrator','governance administrator','quality administrator','risk administrator','compliance administrator','audit administrator','complaints administrator','patient safety administrator','project administrator','project support officer','programme support officer','pmo administrator','project coordinator','transformation administrator','service improvement administrator','operational administrator','operations coordinator','service administrator','directorate administrator','department administrator','divisional administrator','business support officer','business support administrator','operational support officer','community administrator','mental health administrator','community team administrator','crisis team administrator','camhs administrator','therapy administrator','maternity administrator','neonatal administrator','paediatric administrator','research administrator','clinical trials administrator','medical education administrator','training administrator','education coordinator','corporate administrator','board administrator','committee administrator','corporate governance administrator','executive office administrator','senior administrative officer','administration manager','office manager','business manager','operations manager','corporate services manager','service manager','communications manager','communications officer','communications adviser','senior communications officer','media officer','press officer','social media manager','internal communications manager','public affairs manager','stakeholder engagement manager','marketing manager','content manager','patient engagement manager','patient experience manager','community engagement manager','policy officer','policy manager','policy adviser','information governance officer','data protection officer','foi officer','facilities manager','facilities officer','facilities coordinator'];
const ADMIN_EXC = ['nurse','nursing','doctor','consultant','registrar','physician','surgeon','midwife','therapist','pharmacist','radiographer','psychologist','paramedic','sonographer','support worker','healthcare assistant','hca','biomedical','social worker','scientist','technician','director','head of'];

const HR_INC = ['hr assistant','hr administrator','hr officer','hr adviser','hr advisor','senior hr adviser','hr business partner','senior hr business partner','lead hr business partner','hr manager','workforce administrator','workforce officer','workforce adviser','workforce information officer','workforce analyst','workforce planning analyst','workforce planning manager','workforce development manager','workforce transformation manager','workforce project manager','recruitment administrator','recruitment officer','recruitment adviser','recruitment business partner','recruitment manager','resourcing officer','resourcing adviser','talent acquisition adviser','talent acquisition partner','talent acquisition manager','medical recruitment officer','medical staffing officer','medical staffing manager','employee relations officer','employee relations adviser','senior employee relations adviser','employee relations manager','learning and development administrator','learning and development officer','learning and development adviser','learning and development manager','l&d administrator','l&d officer','l&d manager','organisational development officer','organisational development adviser','od business partner','od manager','leadership development manager','training coordinator','education coordinator','esr administrator','esr officer','esr systems analyst','payroll officer','payroll manager','hr systems administrator','hr systems analyst','hris analyst','reward adviser','reward manager','job evaluation adviser','edi officer','edi adviser','inclusion manager','workforce equality officer','staff experience officer','staff wellbeing officer','wellbeing adviser','health and wellbeing manager','staff experience manager','hr project officer','hr project manager','workforce transformation officer','people transformation manager','hr change manager','hr analyst','people analyst','workforce information analyst','hr data analyst','people analytics manager','hr reporting analyst'];
const HR_EXC = ['nurse','doctor','support worker','healthcare assistant','project manager','programme manager','it engineer','software','biomedical','radiographer','pharmacist','director','head of'];

const PM_INC = ['project support officer','project administrator','project coordinator','pmo administrator','pmo support officer','programme support officer','transformation support officer','change support officer','improvement support officer','assistant project manager','junior project manager','project manager','senior project manager','digital project manager','it project manager','clinical project manager','transformation project manager','workforce project manager','epr project manager','service improvement project manager','operational project manager','programme project manager','programme manager','senior programme manager','transformation programme manager','digital programme manager','clinical programme manager','workforce programme manager','strategic programme manager','improvement programme manager','programme delivery manager','pmo officer','pmo analyst','pmo coordinator','pmo manager','senior pmo manager','portfolio office manager','change manager','organisational change manager','transformation manager','service transformation manager','improvement manager','continuous improvement manager','quality improvement manager','business change manager','transformation lead','digital transformation manager','informatics project manager','it programme manager','systems implementation manager','epr implementation manager','digital delivery manager','technical project manager','data project manager'];
const PM_EXC = ['nurse','doctor','support worker','healthcare assistant','administrator','receptionist','secretary','director','head of','capital project','estates project','construction project'];

const BA_INC = ['business analyst','senior business analyst','lead business analyst','junior business analyst','digital business analyst','clinical business analyst','technical business analyst','it business analyst','systems business analyst','data business analyst','transformation business analyst','change business analyst','change analyst','transformation analyst','digital analyst','service transformation analyst','service improvement analyst','project analyst','programme analyst','pmo analyst','business improvement analyst','clinical systems analyst','epr analyst','ehr analyst','clinical informatics analyst','information systems analyst','application analyst','systems analyst','digital systems analyst','configuration analyst','integration analyst','quality improvement analyst','improvement analyst','service improvement officer','service improvement facilitator','performance improvement analyst','process improvement analyst','operational business analyst','business process analyst','process mapping analyst','automation analyst','rpa analyst','power platform analyst','power bi analyst'];
const BA_EXC = ['nurse','doctor','support worker','healthcare assistant','project manager','programme manager','financial analyst','director','head of'];

const DATA_INC = ['data analyst','senior data analyst','lead data analyst','data engineer','analytics engineer','data warehouse developer','data scientist','information analyst','reporting analyst','performance analyst','workforce analyst','operational analyst','service analyst','insight analyst','analytics officer','power bi developer','sql developer','database administrator','dba','workforce information analyst','workforce planning analyst','people analytics analyst','hr data analyst','workforce intelligence analyst','commissioning analyst','contract performance analyst','population health analyst','clinical informatics analyst'];
const DATA_EXC = ['nurse','doctor','support worker','healthcare assistant','business analyst','project manager','business intelligence analyst','director','head of'];

const BI_INC = ['business intelligence analyst','bi analyst','senior bi analyst','bi developer','business intelligence developer','bi lead','bi manager','bi engineer','power bi analyst','tableau analyst','analytics engineer'];

const IT_INC = ['it support officer','it support technician','it service desk analyst','it helpdesk analyst','desktop support engineer','field support engineer','ict support officer','ict technician','infrastructure engineer','infrastructure support engineer','technical support engineer','systems support engineer','systems administrator','network administrator','server administrator','cloud administrator','active directory administrator','microsoft 365 administrator','azure administrator','vmware administrator','network engineer','senior network engineer','network analyst','wireless network engineer','network operations engineer','telecommunications engineer','unified communications engineer','cloud engineer','devops engineer','platform engineer','site reliability engineer','software developer','software engineer','senior software engineer','full stack developer','backend developer','frontend developer','.net developer','java developer','python developer','mobile application developer','web developer','integration developer','api developer','it engineer','ict engineer','cyber security analyst','cyber security engineer','information security officer','security operations analyst','security engineer','grc analyst','penetration tester','soc analyst','digital product manager','product owner','scrum master','agile delivery manager','clinical systems analyst','epr systems analyst','ehr analyst','clinical applications specialist','pacs administrator','ris administrator','biomedical engineer','clinical engineer','medical equipment engineer','medical electronics engineer','biomedical engineering technician','clinical technologist','medical device specialist'];
const IT_EXC = ['nurse','doctor','support worker','healthcare assistant','project manager','programme manager','business analyst','director','head of'];

const FIN_INC = ['finance officer','finance assistant','finance administrator','finance manager','management accountant','financial accountant','senior accountant','accounts payable officer','accounts receivable officer','payroll administrator','payroll manager','payroll officer','treasury officer','finance business partner','financial analyst','financial planning analyst','cost improvement analyst','financial reporting analyst'];
const FIN_EXC = ['nurse','doctor','support worker','healthcare assistant','project manager','business analyst','director'];

const COORD_INC = ['pathway coordinator','patient coordinator','care coordinator','referral coordinator','discharge coordinator','admissions coordinator','outpatient coordinator','scheduling coordinator','appointments coordinator','waiting list coordinator','access coordinator','service coordinator','booking coordinator','clinical coordinator','patient flow coordinator','elective care coordinator','cancer pathway coordinator','theatre booking coordinator','clinic coordinator'];

const LOG_INC = ['logistics manager','logistics officer','logistics coordinator','supply chain manager','procurement officer','procurement manager','procurement specialist','stores officer','supplies officer','materials manager','inventory manager','transport manager','fleet manager','distribution manager','warehousing manager','stock controller'];

const EST_INC = ['estates assistant','estates administrator','estates officer','assistant estates officer','estates coordinator','estates support officer','property assistant','maintenance coordinator','facilities officer','facilities coordinator','estates manager','assistant estates manager','estates operations manager','estates maintenance manager','building services manager','property manager','facilities manager','compliance manager','contracts manager','engineering manager','hard fm manager','maintenance manager','senior estates manager','estates programme manager','operational estates manager','infrastructure manager','engineering services manager','strategic estates manager','asset manager','fire safety manager','water safety manager','health and safety manager','energy manager','sustainability manager','environmental manager','estates project manager','property surveyor','estate surveyor','accommodation manager','building services engineer','estates engineer','senior estates engineer'];

const NURSE_INC = ['staff nurse','registered nurse','rgn'];
const NURSE_EXC = ['assistant','support worker','student','trainee','apprentice','mental health','research','community','district','school','specialist','consultant','nurse practitioner','advanced nurse','senior staff nurse','sister','charge nurse','ward manager'];

const MH_INC = ['mental health nurse','rmn','registered mental health','psychiatric nurse','mental health practitioner'];
const MH_EXC = ['support worker','assistant','student','trainee'];

const RN_INC = ['research nurse','clinical research nurse','senior research nurse','research sister'];

const FEL_INC = ['clinical fellow','junior clinical fellow','foundation year 1','foundation year 2','fy1','fy2','fy3','st1','st2','st3','trust doctor'];
const FEL_EXC = ['senior clinical fellow','consultant','registrar','specialist','associate specialist','sas doctor','specialty doctor','specialty registrar'];

const COD_INC = ['clinical coder','clinical coding','coding auditor','clinical coding manager','senior clinical coder','lead clinical coder','clinical coding officer','clinical coding analyst','chief clinical coder'];

const DIET_INC = ['dietitian','dietician','community dietitian','specialist dietitian','paediatric dietitian','senior dietitian','lead dietitian','renal dietitian','oncology dietitian','clinical dietitian'];

const MICRO_INC = ['biomedical scientist microbiology','microbiologist','microbiology scientist','consultant microbiologist','clinical microbiologist','specialist biomedical scientist microbiology','senior biomedical scientist microbiology','microbiology'];

const PHLEB_INC = ['phlebotomist','phlebotomy','lead phlebotomist','senior phlebotomist','phlebotomy team leader','chief phlebotomist','community phlebotomist','phlebotomy supervisor','phlebotomy manager'];

const RES_INC = ['research assistant','clinical research assistant','research support assistant','assistant research practitioner','research assistant practitioner','research practitioner','clinical research practitioner','clinical trials assistant','clinical trial assistant','trial assistant','research administrator','research coordinator','junior research coordinator','research project assistant','research delivery assistant','research support officer','clinical research support officer','research governance assistant','research data assistant','research data coordinator','research data officer','research technician','laboratory research assistant','biomedical research assistant','research intern','community research assistant','public health research assistant','mental health research assistant','cancer research assistant','nursing research assistant','allied health research assistant','research and development assistant','research and development administrator','clinical studies assistant','clinical studies coordinator','clinical trial coordinator','research facilitator','patient recruitment assistant','research recruitment assistant','study support assistant','study coordinator assistant','research programme assistant','research office assistant','research compliance assistant','research quality assistant','clinical research administrator','research project administrator','research secretary','research clerk'];
const RES_EXC = ['research nurse','research midwife','research manager','research director','senior research fellow','principal researcher','chief investigator','postdoctoral','post-doctoral'];

const SW2_INC = ['social worker','senior social worker','amhp','approved mental health professional','children social worker','adult social worker','community social worker','statutory social worker','qualified social worker','practice educator','social work practitioner'];
const SW2_EXC = ['support worker','healthcare assistant','admin','administrator'];

const CATS = {
  'sw-out':   {label:'Support Worker Outside London',  group:'sw',    exLoc:'london', inc:SW_INC,    exc:SW_EXC},
  'sw-lon':   {label:'Support Worker in London',       group:'sw',    loc:'london',   inc:SW_INC,    exc:SW_EXC},
  'sw-wm':    {label:'Support Worker West Midlands',   group:'sw',    loc:'west midlands', inc:SW_INC, exc:SW_EXC},
  'sw-wales': {label:'Support Worker in Wales',        group:'sw',    loc:'wales',    inc:SW_INC,    exc:SW_EXC},
  'sw-manc':  {label:'Support Worker Manchester',      group:'sw',    loc:'manchester', inc:SW_INC,  exc:SW_EXC},
  'sw-wy':    {label:'Support Worker W Yorkshire',     group:'sw',    loc:'leeds',    inc:SW_INC,    exc:SW_EXC},
  'sw-ey':    {label:'Support Worker E Yorkshire',     group:'sw',    loc:'hull',     inc:SW_INC,    exc:SW_EXC},
  'admin-out':{label:'Admin Outside London',           group:'admin', exLoc:'london', inc:ADMIN_INC, exc:ADMIN_EXC},
  'admin-lon':{label:'Admin in London',                group:'admin', loc:'london',   inc:ADMIN_INC, exc:ADMIN_EXC},
  'nurse':    {label:'Staff Nurse',                    group:'nurse', minBand:5, maxBand:5, inc:NURSE_INC, exc:NURSE_EXC},
  'mh-nurse': {label:'Mental Health Nurse',            group:'mhnurse', inc:MH_INC,   exc:MH_EXC},
  'res-nurse':{label:'Research Nurse',                 group:'resnurse', inc:RN_INC},
  'fellow':   {label:'Clinical Fellow',                group:'fellow', inc:FEL_INC,  exc:FEL_EXC},
  'coder':    {label:'Clinical Coder',                 group:'coder',  inc:COD_INC},
  'diet':     {label:'Dietician',                      group:'diet',   inc:DIET_INC},
  'micro':    {label:'Microbiology',                   group:'micro',  inc:MICRO_INC},
  'phleb':    {label:'Phlebotomist Leader',            group:'phleb',  inc:PHLEB_INC},
  'res-asst': {label:'Research Assistant',             group:'res',    inc:RES_INC,   exc:RES_EXC},
  'sw3':      {label:'Social Worker',                  group:'sw3',    inc:SW2_INC,   exc:SW2_EXC},
  'data':     {label:'Data Analyst',                   group:'data',   inc:DATA_INC,  exc:DATA_EXC},
  'bi':       {label:'BI Analyst',                     group:'bi',     inc:BI_INC},
  'fin':      {label:'Finance',                        group:'fin',    inc:FIN_INC,   exc:FIN_EXC},
  'hr':       {label:'HR',                             group:'hr',     inc:HR_INC,    exc:HR_EXC},
  'it':       {label:'IT / Engineering',               group:'it',     inc:IT_INC,    exc:IT_EXC},
  'pm':       {label:'Project Manager',                group:'pm',     inc:PM_INC,    exc:PM_EXC},
  'ba':       {label:'Business Analyst',               group:'ba',     inc:BA_INC,    exc:BA_EXC},
  'log':      {label:'Logistics',                      group:'log',    inc:LOG_INC},
  'coord':    {label:'Coordinator',                    group:'coord',  inc:COORD_INC},
  'est':      {label:'Estates',                        group:'est',    inc:EST_INC},
};

function passesFilter(job, cat, sponsorOnly) {
  const t   = (job.title   || '').toLowerCase();
  const ct  = (job.contract|| '').toLowerCase();
  const wp  = (job.pattern || '').toLowerCase();
  const all = t + ' ' + ct + ' ' + wp + ' ' + (job.salary||'').toLowerCase();

  // Band 2 — absolute rejection
  if (all.includes('band 2') || all.includes('band two')) return false;
  if (job.band !== null && job.band !== undefined && job.band <= 2) return false;

  // Not permanent
  if (ct && !ct.includes('permanent')) return false;

  // Part time / fixed term / bank
  if (wp.includes('part time') || wp.includes('part-time')) return false;
  if (t.includes('part time')  || t.includes('part-time'))  return false;
  if (all.includes('fixed term') || all.includes('fixed-term')) return false;
  if (all.includes('locum') || all.includes('temporary') || all.includes('bank shift')) return false;
  if (t.includes('bank') && !t.includes('blood bank') && !t.includes('bank manager') && !t.includes('eye bank')) return false;

  // Internal only
  if (t.includes('internal only') || t.includes('*internal') || t.includes('(internal)')) return false;

  // Band filters
  if (cat.minBand && job.band && job.band < cat.minBand) return false;
  if (cat.maxBand && job.band && job.band > cat.maxBand) return false;

  // Location filters
  const loc = (job.location || '').toLowerCase();
  if (cat.exLoc && loc.includes(cat.exLoc)) return false;
  if (cat.loc   && !loc.includes(cat.loc))  return false;

  // Sponsorship filter
  if (sponsorOnly && !job.hassponsor) return false;

  // Title exclusions
  if (cat.exc && cat.exc.some(x => t.includes(x))) return false;

  // Title inclusions
  if (cat.inc && !cat.inc.some(x => t.includes(x))) return false;

  return true;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=60');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  if (!SUPABASE_KEY) {
    return res.status(500).json({ error: 'SUPABASE_ANON_KEY is not set. Add it as an environment variable in your Vercel project settings.' });
  }

  try {
    const { category, page = '1', sponsor = 'false' } = req.query;
    const pg = Math.max(1, parseInt(page) || 1);
    const per = 20;
    const sponsorOnly = sponsor === 'true';

    if (!category) return res.status(200).json({ total: 0, page: 1, pages: 0, jobs: [] });

    const cat = CATS[category];
    if (!cat) return res.status(404).json({ error: 'Unknown category: ' + category });

    // Fetch all jobs for this category group from Supabase
    const r = await fetch(
      SUPABASE_URL + '/rest/v1/jobs?category=eq.' + encodeURIComponent(category) +
      '&select=*&order=posted.desc.nullslast&limit=2000',
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY } }
    );

    if (!r.ok) {
      const err = await r.text();
      return res.status(500).json({ error: 'Database error', detail: err });
    }

    const allJobs = await r.json();

    // Apply filters
    const filtered = allJobs.filter(j => passesFilter(j, cat, sponsorOnly));

    // Sort newest first
    filtered.sort((a, b) => {
      const da = parseDate(a.posted), db = parseDate(b.posted);
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return db < da ? -1 : db > da ? 1 : 0;
    });

    const total = filtered.length;
    const pages = Math.max(1, Math.ceil(total / per));
    const start = (pg - 1) * per;

    return res.status(200).json({
      fetchedAt: new Date().toISOString(),
      total, page: pg, pages,
      jobs: filtered.slice(start, start + per).map(j => ({
        id:             j.id,
        title:          j.title,
        organisation:   j.organisation,
        location:       j.location,
        salary:         j.salary,
        band:           j.band,
        postedDate:     j.posted,
        closingDate:    j.closing,
        contractType:   j.contract,
        workingPattern: j.pattern,
        hassponsor:     j.hassponsor,
        url:            j.url,
        category:       cat.label,
      })),
    });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
