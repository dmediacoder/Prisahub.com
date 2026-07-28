// api/runner.js - Auto enrichment runner
export default async function handler(req, res) {
  res.setHeader('Content-Type', 'text/html');
  res.status(200).send(`<!DOCTYPE html>
<html>
<head>
<title>Prisahub Enricher</title>
<style>
body{font-family:system-ui,sans-serif;max-width:560px;margin:60px auto;padding:20px;background:#f8faff}
.box{background:#fff;border-radius:14px;padding:28px;box-shadow:0 2px 12px rgba(0,0,0,.08)}
h2{color:#0f172a;margin-bottom:8px;font-size:18px}
p{color:#64748b;font-size:13px;margin-bottom:20px;line-height:1.6}
.bar{background:#e2e8f0;border-radius:8px;height:8px;margin:14px 0;overflow:hidden}
.fill{background:linear-gradient(90deg,#3b82f6,#6366f1);height:8px;border-radius:8px;width:0%;transition:width .5s}
.count{font-size:22px;font-weight:800;color:#1d4ed8;margin:6px 0}
.status{font-size:12px;color:#94a3b8;min-height:18px}
.stats{display:flex;gap:16px;margin:12px 0;font-size:12px}
.stat{background:#f1f5f9;padding:8px 14px;border-radius:8px;text-align:center}
.stat b{display:block;font-size:16px;font-weight:800;color:#0f172a}
.stat span{color:#64748b}
button{background:linear-gradient(135deg,#1d4ed8,#4f46e5);color:#fff;border:none;padding:12px 28px;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;transition:all .2s}
button:hover{transform:translateY(-1px);box-shadow:0 4px 12px rgba(29,78,216,.3)}
button:disabled{opacity:.5;cursor:not-allowed;transform:none}
</style>
</head>
<body>
<div class="box">
  <h2>Prisahub Job Enricher</h2>
  <p>Visits each job detail page to read the exact band number and sponsorship status. Runs automatically until all jobs are processed.</p>
  <div class="bar"><div class="fill" id="fill"></div></div>
  <div class="count" id="count">0 jobs enriched</div>
  <div class="stats">
    <div class="stat"><b id="s-enriched">0</b><span>Enriched</span></div>
    <div class="stat"><b id="s-rejected">0</b><span>Removed</span></div>
    <div class="stat"><b id="s-remaining">?</b><span>Remaining</span></div>
  </div>
  <div class="status" id="status">Click Start to begin</div>
  <br/>
  <button id="btn" onclick="start()">Start Enriching</button>
</div>
<script>
var total=0,totalRejected=0,running=false,batch=0;
async function start(){
  if(running)return;
  running=true;
  document.getElementById('btn').disabled=true;
  document.getElementById('status').textContent='Starting...';
  while(true){
    batch++;
    document.getElementById('status').textContent='Processing batch '+batch+'...';
    try{
      var r=await fetch('/api/enrich?limit=100');
      var d=await r.json();
      total+=(d.enriched||0);
      totalRejected+=(d.rejected||0);
      document.getElementById('count').textContent=total+' jobs enriched';
      document.getElementById('s-enriched').textContent=total;
      document.getElementById('s-rejected').textContent=totalRejected;
      document.getElementById('s-remaining').textContent=d.remaining||0;
      document.getElementById('fill').style.width=Math.min(batch*5,95)+'%';
      if(d.remaining===0||d.enriched===0){
        document.getElementById('status').textContent='All done!';
        document.getElementById('count').textContent='✅ Complete — '+total+' enriched, '+totalRejected+' removed';
        document.getElementById('fill').style.width='100%';
        document.getElementById('btn').textContent='Done';
        break;
      }
      await new Promise(r=>setTimeout(r,500));
    }catch(e){
      document.getElementById('status').textContent='Error - retrying...';
      await new Promise(r=>setTimeout(r,3000));
    }
  }
  running=false;
}
</script>
</body>
</html>`);
}
