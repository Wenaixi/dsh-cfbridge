// scripts/sync-vendor-skills.js — 幂等拉取 cloudflare/skills 13 个 SKILL.md 快照
// 用法: node scripts/sync-vendor-skills.js [--force]
// 行为: 访问 https://raw.githubusercontent.com/cloudflare/skills/main/skills/<name>/SKILL.md
//       写入 skills/<name>/SKILL.md，头部追加 vendored 注释，校验 front-matter 含 name: <name>
//       超时 30s，重试 3 次；已存在且非 --force 时跳过
const fs = require('fs');
const path = require('path');
const https = require('https');
const ROOT = path.resolve(__dirname, '..');
const SKILLS = ['cloudflare','wrangler','agents-sdk','durable-objects','cloudflare-one','cloudflare-one-migrations','cloudflare-email-service','sandbox-next','sandbox-stable','sandbox-migrate-to-next','turnstile-spin','web-perf','workers-best-practices'];
const BASE = 'https://raw.githubusercontent.com/cloudflare/skills/main/skills';
function fetchRaw(url, timeoutMs=30000){
  return new Promise((resolve, reject)=>{
    const req = https.get(url, {headers:{'User-Agent':'cfbridge-sync'}}, res=>{
      if(res.statusCode!==200) return reject(new Error('HTTP '+res.statusCode+' '+url));
      let data=''; res.setEncoding('utf8'); res.on('data', c=>data+=c); res.on('end', ()=>resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, ()=>{ req.destroy(new Error('timeout '+url)); });
  });
}
async function fetchWithRetry(url, tries=3){
  let last;
  for(let i=1;i<=tries;i++){
    try{ return await fetchRaw(url); } catch(e){ last=e; if(i<tries) await new Promise(r=>setTimeout(r, 1500*i)); }
  }
  throw last;
}
async function main(){
  const force = process.argv.includes('--force');
  let ok=0, skip=0, fail=[];
  for(const name of SKILLS){
    const dir = path.join(ROOT, 'skills', name);
    const dst = path.join(dir, 'SKILL.md');
    if(!force && fs.existsSync(dst)){
      // quick front-matter check; if present, skip (still validates)
      const cur = fs.readFileSync(dst,'utf8');
      if(cur.includes('name: '+name)) { console.log('skip '+name+' (exists)'); skip++; continue; }
    }
    const url = BASE+'/'+name+'/SKILL.md';
    try{
      console.log('fetch '+name+' ...');
      const content = await fetchWithRetry(url, 3);
      if(!content.startsWith('---') || !content.includes('name: '+name)) throw new Error('front-matter missing name: '+name);
      fs.mkdirSync(dir, {recursive:true});
      // 仅 vendor SKILL.md 单文件；正文引用的 references/<name>/ 子目录不入包，
      // 离线时不可用，需走官方 raw URL 在线读取 —— 此声明必须随快照头部写入。
      const header = '<!-- vendored from cloudflare/skills@main on '+new Date().toISOString().slice(0,10)+' via scripts/sync-vendor-skills.js -->\n<!-- NOTE: only SKILL.md is vendored; references/ subdirectories are NOT included. Resolve referenced files online (raw.githubusercontent.com/cloudflare/skills) when offline access to them is needed. -->\n';
      fs.writeFileSync(dst, header+content, 'utf8');
      console.log('  -> '+name+' '+content.length+' chars');
      ok++;
    } catch(e){
      console.error('  FAIL '+name+': '+e.message);
      fail.push(name);
    }
  }
  console.log('done ok='+ok+' skip='+skip+' fail='+fail.length+(fail.length?' ['+fail.join(',')+']':''));
  if(fail.length) process.exit(1);
}
main().catch(e=>{ console.error(e.stack||e.message); process.exit(1); });
