import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {spawn} from "node:child_process";

const ROOT = path.resolve(".");
const PORT = 47819;
const CDP_PORT = 9222;
const DEFAULT_GAME_FOLDER = "D:\\Steam\\steamapps\\common\\The Legend of Mala Tokmachka";
const SEARCH_DEPTH = 3;
let game = null;
let ws = null;
let msgId = 0;
const pending = new Map();

function json(res, code, data) {
  const body = JSON.stringify(data);
  res.writeHead(code, {"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"});
  res.end(body);
}

async function cdpConnect() {
  if (ws && ws.readyState === 1) return true;
  try {
    const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
    const targets = await r.json();
    const target = targets.find(x => x.type === "page" && x.webSocketDebuggerUrl);
    if (!target) return false;
    ws = new WebSocket(target.webSocketDebuggerUrl);
    ws.onmessage = e => {
      const m = JSON.parse(e.data);
      if (m.id && pending.has(m.id)) {
        const {resolve,reject} = pending.get(m.id);
        pending.delete(m.id);
        if (m.error) reject(new Error(m.error.message || "CDP error"));
        else resolve(m.result);
      }
    };
    ws.onclose = () => { ws = null; };
    await new Promise((resolve,reject) => {
      const t = setTimeout(()=>reject(new Error("CDP timeout")),3000);
      ws.onopen = () => { clearTimeout(t); resolve(); };
      ws.onerror = () => { clearTimeout(t); reject(new Error("CDP connection failed")); };
    });
    return true;
  } catch { ws = null; return false; }
}

function cdp(method, params={}) {
  return new Promise((resolve,reject) => {
    if (!ws || ws.readyState !== 1) return reject(new Error("Game not connected"));
    const id = ++msgId;
    pending.set(id,{resolve,reject});
    ws.send(JSON.stringify({id,method,params}));
    setTimeout(()=>{ if(pending.has(id)){pending.delete(id);reject(new Error("CDP request timeout"));}},5000);
  });
}

async function evaluate(expression) {
  if (!(await cdpConnect())) throw new Error("LOMT WebView2 nicht gefunden. Starte das Spiel über den Trainer.");
  const r = await cdp("Runtime.evaluate",{
    expression, awaitPromise:true, returnByValue:true, userGesture:true
  });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text || "JavaScript error");
  return r.result?.value;
}

const cheatCode = {
  money: `(() => { window.__LOMTTrainer ||= {}; window.__LOMTTrainer.money = true; budget = 99999999900; return budget; })()`,
  moneyOff: `(() => { window.__LOMTTrainer ||= {}; window.__LOMTTrainer.money = false; })()`,
  god: `(() => { window.__LOMTTrainer ||= {}; window.__LOMTTrainer.god = true; return true; })()`,
  godOff: `(() => { if(window.__LOMTTrainer) window.__LOMTTrainer.god=false; })()`,
  research: `(() => {
    const s=getResearchState(), u=getUpgradeSystem();
    const nodes=u && u.listNodes ? u.listNodes() : [];
    s.points=999999999; s.completed=getDefaultCompletedUpgradeIds().slice(); s.ranks={};
    for(const n of nodes||[]){
      if(!n || !n.id) continue;
      if(n.type==='repeatable' && Number.isFinite(n.maxRank)) s.ranks[n.id]=Math.floor(n.maxRank);
      else if(n.type!=='repeatable' && n.id!==getRootUpgradeId() && !s.completed.includes(n.id)) s.completed.push(n.id);
    }
    s.spent=calculateUpgradeSpent(s); researchRevision++;
    invalidateEffectiveCombatDefinitionCache(); invalidateRuntimeGuidanceCaches();
    return {completed:s.completed.length,ranks:Object.keys(s.ranks).length};
  })()`,
  xp: `(() => { window.__LOMTTrainer ||= {}; window.__LOMTTrainer.xp=true; window.playerLevel=999999999; window.playerXp=999999999; window.maxXp=999999999; window.totalKills=999999999; return true; })()`,
  free: `(() => { window.__LOMTTrainer ||= {}; window.__LOMTTrainer.free=true; if(!grid) return false; for(const row of grid.matrix||[]) for(const b of row||[]) if(b){ b.purchaseCost=0; if(b.weaponPurchaseCosts){b.weaponPurchaseCosts.embedded=0;b.weaponPurchaseCosts.rooftop=0;} } return true; })()`,
  cooldown: `(() => { window.__LOMTTrainer ||= {}; window.__LOMTTrainer.cooldown=true; if(!grid) return false; for(const row of grid.matrix||[]) for(const b of row||[]) if(b && b.weaponRuntime) for(const k of ['embedded','rooftop']) { const r=b.weaponRuntime[k]; if(r){ r.lastShotTime=-1e15; r.lastTargetSearchTime=-1e15; r.nextShotTick=0; r.nextRetargetTick=0; r.nextChargeTick=0; r.nextRetargetTick=0; r.nextChargeTick=0; r.nextInterceptorTick=0; r.chargeStartTime=0; } } return true; })()`,
  repair: `(() => { window.__LOMTTrainer ||= {}; window.__LOMTTrainer.repair=true; if(!grid) return false; let fixed=0; for(const row of grid.matrix||[]) for(const b of row||[]) if(b){const max=b.maxHp??b.type?.maxHp;if(Number.isFinite(max)){b.hp=max;fixed++;}} return fixed; })()`,
  ammo: `(() => { window.__LOMTTrainer ||= {}; window.__LOMTTrainer.ammo=true; if(!grid) return false; let changed=0; for(const row of grid.matrix||[]) for(const b of row||[]) if(b&&b.weaponRuntime) for(const r of Object.values(b.weaponRuntime)){if(!r||typeof r!=='object')continue;for(const k of ['ammo','currentAmmo','ammoCount','magazine','charges'])if(typeof r[k]==='number'){const max=r['max'+k[0].toUpperCase()+k.slice(1)];r[k]=Number.isFinite(max)?max:999999;changed++;}} return changed; })()`,
  resources: `(() => { window.__LOMTTrainer ||= {}; window.__LOMTTrainer.resources=true; let changed=0; for(const key of ['resources','materials','inventory','stockpile']){const v=globalThis[key];if(!v||typeof v!=='object')continue;for(const k of Object.keys(v))if(typeof v[k]==='number'){v[k]=999999999;changed++;}} return changed; })()`,
  instantBuild: `(() => { window.__LOMTTrainer ||= {}; window.__LOMTTrainer.instantBuild=true; if(!grid)return false;let changed=0;for(const row of grid.matrix||[])for(const b of row||[])if(b)for(const k of ['buildTime','constructionTime','remainingBuildTime','remainingConstructionTime'])if(typeof b[k]==='number'){b[k]=0;changed++;}return changed; })()`
};

const persistent = `(() => {
  const t=window.__LOMTTrainer||{};
  if(t.money) budget=99999999900;
  if(t.god && grid) for(const row of grid.matrix||[]) for(const b of row||[]) if(b) b.hp=(b.maxHp??b.type?.maxHp??b.hp);
  if(t.free && grid) for(const row of grid.matrix||[]) for(const b of row||[]) if(b){b.purchaseCost=0;if(b.weaponPurchaseCosts){b.weaponPurchaseCosts.embedded=0;b.weaponPurchaseCosts.rooftop=0;}}
  if(t.cooldown && grid) for(const row of grid.matrix||[]) for(const b of row||[]) if(b&&b.weaponRuntime) for(const k of ['embedded','rooftop']){const r=b.weaponRuntime[k];if(r){r.lastShotTime=-1e15;r.lastTargetSearchTime=-1e15;r.nextShotTick=0;r.nextRetargetTick=0;r.nextChargeTick=0;r.nextInterceptorTick=0;r.chargeStartTime=0;}}
  if(t.xp){window.playerLevel=999999999;window.playerXp=999999999;window.maxXp=999999999;window.totalKills=999999999;}
  if(t.repair && grid) for(const row of grid.matrix||[]) for(const b of row||[]) if(b){const max=b.maxHp??b.type?.maxHp;if(Number.isFinite(max))b.hp=max;}
  if(t.ammo && grid) for(const row of grid.matrix||[]) for(const b of row||[]) if(b&&b.weaponRuntime) for(const r of Object.values(b.weaponRuntime)){if(!r||typeof r!=='object')continue;for(const k of ['ammo','currentAmmo','ammoCount','magazine','charges'])if(typeof r[k]==='number'){const max=r['max'+k[0].toUpperCase()+k.slice(1)];r[k]=Number.isFinite(max)?max:999999;}}
  if(t.resources)for(const key of ['resources','materials','inventory','stockpile']){const v=globalThis[key];if(v&&typeof v==='object')for(const k of Object.keys(v))if(typeof v[k]==='number')v[k]=999999999;}
  if(t.instantBuild && grid)for(const row of grid.matrix||[])for(const b of row||[])if(b)for(const k of ['buildTime','constructionTime','remainingBuildTime','remainingConstructionTime'])if(typeof b[k]==='number')b[k]=0;
  if(t.speed)for(const k of ['gameSpeed','simulationSpeed','timeScale'])if(typeof globalThis[k]==='number')globalThis[k]=t.speed;
  if(t.freezeWaves)for(const k of ['paused','isPaused','wavePaused','enemyWavesPaused'])if(typeof globalThis[k]==='boolean')globalThis[k]=true;
})()`;

let persistentTimer = null;
function startPersistentLoop() {
  if (!persistentTimer) persistentTimer = setInterval(()=>evaluate(persistent).catch(()=>{}),250);
}
async function applyCheat(name, on) {
  const expr = on ? cheatCode[name] : (cheatCode[name+"Off"] || `(()=>{if(window.__LOMTTrainer)window.__LOMTTrainer.${name}=false})()`);
  const result = await evaluate(expr);
  startPersistentLoop();
  return result;
}

async function runAction(name, value) {
  startPersistentLoop();
  if (name === "speed") {
    const multiplier = Number(value);
    if (!Number.isFinite(multiplier) || multiplier < 0.25 || multiplier > 5) throw new Error("Ungültige Spielgeschwindigkeit.");
    return evaluate(`(() => { window.__LOMTTrainer ||= {}; window.__LOMTTrainer.speed=${multiplier}; let changed=0; for(const k of ['gameSpeed','simulationSpeed','timeScale'])if(typeof globalThis[k]==='number'){globalThis[k]=${multiplier};changed++;} return {multiplier:${multiplier},changed}; })()`);
  }
  if (name === "freezeWaves") {
    const on = value === "1";
    return evaluate(`(() => { window.__LOMTTrainer ||= {}; window.__LOMTTrainer.freezeWaves=${on}; let changed=0; for(const k of ['paused','isPaused','wavePaused','enemyWavesPaused'])if(typeof globalThis[k]==='boolean'){globalThis[k]=${on};changed++;} for(const v of [globalThis.waveController,globalThis.waves,globalThis.waveSystem])if(v&&typeof v==='object')for(const k of ['paused','isPaused','frozen'])if(typeof v[k]==='boolean'){v[k]=${on};changed++;} return changed; })()`);
  }
  if (name === "skipWave") {
    return evaluate(`(() => { for(const k of ['skipWave','startNextWave','beginNextWave','advanceWave','completeCurrentWave'])if(typeof globalThis[k]==='function'){globalThis[k]();return k;} return false; })()`);
  }
  if (name === "backup") {
    const storage = await evaluate(`(() => Object.fromEntries(Object.entries(localStorage)))()`);
    const backupDir = path.join(ROOT, "backups");
    fs.mkdirSync(backupDir, {recursive:true});
    const filename = `LOMT-local-storage-${new Date().toISOString().replace(/[:.]/g,"-")}.json`;
    fs.writeFileSync(path.join(backupDir, filename), JSON.stringify(storage, null, 2), "utf8");
    return {filename};
  }
  throw new Error("Unbekannte Aktion");
}

async function setAllCheats(on) {
  const names = ["money","god","research","xp","free","cooldown","repair","ammo","resources","instantBuild"];
  const result = {};
  for (const name of names) result[name] = await applyCheat(name, on);
  return result;
}

function findEdge() {
  const candidates = [
    process.env.ProgramFiles + "\\Microsoft\\Edge\\Application\\msedge.exe",
    process.env["ProgramFiles(x86)"] + "\\Microsoft\\Edge\\Application\\msedge.exe",
    process.env.LOCALAPPDATA + "\\Microsoft\\Edge\\Application\\msedge.exe"
  ].filter(Boolean);
  return candidates.find(p=>fs.existsSync(p)) || "msedge.exe";
}

function availableDriveRoots() {
  const roots = [];
  for (let code = 67; code <= 90; code++) {
    const root = `${String.fromCharCode(code)}:\\`;
    if (fs.existsSync(root)) roots.push(root);
  }
  return roots;
}

async function steamLibraryFolders() {
  const folders = new Set([DEFAULT_GAME_FOLDER]);
  const steamRoots = new Set();
  for (const root of availableDriveRoots()) {
    for (const candidate of [path.join(root, "Steam"), path.join(root, "Program Files (x86)", "Steam"), path.join(root, "Program Files", "Steam")]) {
      if (fs.existsSync(path.join(candidate, "steamapps"))) steamRoots.add(candidate);
    }
    try {
      const entries = await fs.promises.readdir(root, {withFileTypes:true});
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const candidate = path.join(root, entry.name, "Steam");
        if (fs.existsSync(path.join(candidate, "steamapps"))) steamRoots.add(candidate);
      }
    } catch {}
  }
  for (const steamRoot of steamRoots) {
    folders.add(path.join(steamRoot, "steamapps", "common", "The Legend of Mala Tokmachka"));
    try {
      const vdf = await fs.promises.readFile(path.join(steamRoot, "steamapps", "libraryfolders.vdf"), "utf8");
      for (const match of vdf.matchAll(/"path"\s*"([^"]+)"/g)) {
        folders.add(path.join(match[1].replace(/\\\\/g, "\\"), "steamapps", "common", "The Legend of Mala Tokmachka"));
      }
    } catch {}
  }
  return [...folders];
}

async function findGameExecutableIn(folder, depth = 0) {
  let entries;
  try { entries = await fs.promises.readdir(folder, {withFileTypes:true}); }
  catch { return null; }
  for (const entry of entries) {
    if (entry.isFile() && entry.name.toLowerCase() === "lomt.exe") return path.join(folder, entry.name);
  }
  if (depth >= SEARCH_DEPTH) return null;
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const found = await findGameExecutableIn(path.join(folder, entry.name), depth + 1);
    if (found) return found;
  }
  return null;
}

async function findGameExecutable() {
  for (const folder of await steamLibraryFolders()) {
    const found = await findGameExecutableIn(folder);
    if (found) return found;
  }
  return null;
}

function launchGame(exe) {
  if (game && !game.killed) return;
  const env = {...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-port=${CDP_PORT}`};
  game = spawn(exe, [], {env, detached:false, stdio:"ignore"});
  game.on("exit",()=>{game=null;ws=null;});
}

const ui = fs.readFileSync(path.join(ROOT,"ui","index.html"));

const server = http.createServer(async (req,res)=>{
  const u = new URL(req.url,`http://${req.headers.host}`);
  try {
    if(u.pathname==="/"){res.writeHead(200,{"Content-Type":"text/html; charset=utf-8"});return res.end(ui);}
    if(u.pathname==="/api/status"){
      const exe = await findGameExecutable();
      return json(res,200,{gameRunning:!!game,connected:!!ws || await cdpConnect(),gameFound:!!exe,exe,folder:DEFAULT_GAME_FOLDER,searchingAllDrives:true});
    }
    if(u.pathname==="/api/launch"){
      const exe=await findGameExecutable();
      if(!exe) return json(res,404,{error:`LOMT.exe wurde in den Steam-Bibliotheken auf allen Laufwerken nicht gefunden.`});
      launchGame(exe); return json(res,200,{ok:true});
    }
    if(u.pathname==="/api/cheat"){
      const name=u.searchParams.get("name"), on=u.searchParams.get("on")==="1";
      if(!cheatCode[name]) return json(res,400,{error:"Unbekannter Cheat"});
      const result=await applyCheat(name,on);
      return json(res,200,{ok:true,result});
    }
    if(u.pathname==="/api/all"){
      const on=u.searchParams.get("on")==="1";
      const result=await setAllCheats(on);
      return json(res,200,{ok:true,result});
    }
    if(u.pathname==="/api/action"){
      const result=await runAction(u.searchParams.get("name"),u.searchParams.get("value"));
      return json(res,200,{ok:true,result});
    }
    if(u.pathname==="/api/command"){
      const expr=u.searchParams.get("expr");
      if(!expr) return json(res,400,{error:"Ausdruck fehlt"});
      const result=await evaluate(expr); return json(res,200,{ok:true,result});
    }
    res.writeHead(404);res.end();
  } catch(e){ json(res,500,{error:e.message}); }
});
server.listen(PORT, "127.0.0.1", ()=>{
  console.log(`LOMT Trainer: http://127.0.0.1:${PORT}`);
  const edge=findEdge();
  spawn(edge,[`--app=http://127.0.0.1:${PORT}`],{stdio:"ignore",detached:true}).unref();
});
