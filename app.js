// ===== app.js =====
// State, Persistenz, Queue-Logik, Runden-Verwaltung, Einstellungen, Theme, Init.
// Ladereihenfolge: lang.js → calc.js → ui.js → app.js

// ===== STATE & GLOBALS =====
let state = { names:['Spieler 1','Spieler 2','Spieler 3'], rounds:[], totals:[0,0,0], lang:'de', has4:false, queue:[] };
let moneySettings = { rate:0, currency:'€' };
let openRoundIdx  = -1;
let editRoundIdx  = -1;
let selectedPlayers = [], sign = 1, lastDeleted = null, panelOpen = true, tableView = 'std';
// Hinweis: lang wird in lang.js als var deklariert, hier nur neu zugewiesen

let calc = {
  type:'', farbeIdx:0, factor:2, nullVal:23,
  jackCount:1, jackDir:'mit',
  hand:false, schneider:false, schneiderA:false, schwarz:false, schwarzA:false, ouvert:false,
  kontra:false, re:false, bock:false, jungfrau:false, geschoben:0, verloren:false
};

// ===== ÜBERSETZUNG =====
// t() muss als erstes definiert werden – wird von calc.js und ui.js genutzt
function t(key){ return (T[lang]&&T[lang][key]) || T['de'][key] || key; }

// ===== HILFSFUNKTIONEN =====
function getAussetzer(){
  if(!state.has4) return -1;
  let idx=0;
  for(const r of state.rounds){
    if(!r.isRamschGH && r.typeKey!=='rgh') idx=(idx+1)%4;
  }
  return idx;
}

function countRegularRounds(){
  return state.rounds.filter(r=>!r.isRamschGH).length;
}

function hasOpenRound(){
  if(openRoundIdx>=0 && (!state.rounds[openRoundIdx] || !state.rounds[openRoundIdx].open)){
    openRoundIdx=-1;
  }
  if(openRoundIdx<0){
    const idx=state.rounds.findIndex(r=>r.open===true);
    if(idx>=0) openRoundIdx=idx;
  }
  return openRoundIdx>=0;
}

// ===== PERSISTENZ =====
function save(){
  try{ localStorage.setItem('skat_v4', JSON.stringify(state)); }catch(e){}
}
function load(){
  try{
    const d=localStorage.getItem('skat_v4');
    if(d){ state=JSON.parse(d); if(!state.queue) state.queue=[]; }
  }catch(e){}
}

// ===== QUEUE =====
function queueBlockSize(){ return state.has4 ? 4 : 3; }

function queueTailIsBlock(tp){
  const n=queueBlockSize(), q=state.queue;
  if(q.length<n) return false;
  for(let i=q.length-n; i<q.length; i++){ if(q[i].type!==tp) return false; }
  return true;
}

function toggleQueueBlock(tp){
  const q = state.queue;
  const n = queueBlockSize();

  // Trailing Slots dieses Typs am Ende der Queue
  const trailingCount = (() => {
    let c = 0;
    for(let i = q.length-1; i >= 0; i--){
      if(q[i].type === tp) c++; else break;
    }
    return c;
  })();

  if(trailingCount >= n){
    // Es liegt mindestens ein vollständiger Block am Ende → entfernen
    state.queue.splice(q.length - n, n);
  } else {
    // Keinen oder unvollständigen Block am Ende → neuen Block anhängen
    const n2 = queueBlockSize();
    for(let i=0;i<n2;i++) state.queue.push({type:tp});
  }
  save(); renderAll(); updateQueueUI();
  // Direkt zur Tabellenansicht springen wenn Queue aktiv und noch keine Runden
  if(state.queue.length > 0 && state.rounds.length === 0){
    const el=document.getElementById('emptyState');
    const sc=document.getElementById('scoreTable');
    const tw=document.getElementById('tableWrap');
    if(el) el.style.display='none';
    if(sc) sc.style.display='table';
    if(tw) tw.classList.remove('no-tabs');
  }
}

function updateQueueUI(){
  const q=state.queue;
  const bockCount  =q.filter(x=>x.type==='bock').length;
  const ramschCount=q.filter(x=>x.type==='ramsch').length;
  // Header-Buttons weg sobald erste Runde existiert (offen oder abgeschlossen)
  const hasRounds = state.rounds.length > 0;

  // Header-Buttons (sichtbar solange noch kein abgeschlossenes Spiel)
  const bockBtnH  =document.getElementById('queueBockBtn');
  const ramschBtnH=document.getElementById('queueRamschBtn');
  const bockCntH  =document.getElementById('queueBockCount');
  const ramschCntH=document.getElementById('queueRamschCount');
  if(bockBtnH){
    bockBtnH.style.display   = hasRounds ? 'none' : '';
    bockBtnH.classList.toggle('bock-active', bockCount>0);
    if(bockCntH) bockCntH.textContent=bockCount;
  }
  if(ramschBtnH){
    ramschBtnH.style.display   = hasRounds ? 'none' : '';
    ramschBtnH.classList.toggle('ramsch-active', ramschCount>0);
    if(ramschCntH) ramschCntH.textContent=ramschCount;
  }

  // Tab-Buttons (sichtbar wenn Runden vorhanden, in viewTabs)
  const bockBtnT  =document.getElementById('queueBockBtnTab');
  const ramschBtnT=document.getElementById('queueRamschBtnTab');
  const bockCntT  =document.getElementById('queueBockCountTab');
  const ramschCntT=document.getElementById('queueRamschCountTab');
  if(bockBtnT){
    bockBtnT.classList.toggle('bock-active', bockCount>0);
    if(bockCntT) bockCntT.textContent=bockCount;
  }
  if(ramschBtnT){
    ramschBtnT.classList.toggle('ramsch-active', ramschCount>0);
    if(ramschCntT) ramschCntT.textContent=ramschCount;
  }

  const isRamschForced=q.length>0&&q[0].type==='ramsch';
  const hint=document.getElementById('ramschRestrictHint');
  if(hint) hint.style.display=isRamschForced?'':'none';
  applyQueueTypeRestriction();
}

function applyQueueTypeRestriction(){
  const isRamschForced=state.queue.length>0&&state.queue[0].type==='ramsch';
  document.querySelectorAll('.type-btn').forEach(b=>{
    const tp=b.dataset.type;
    if(editRoundIdx<0){
      const blocked=isRamschForced&&tp!=='ramsch'&&tp!=='rgh';
      b.disabled=blocked;
      b.style.opacity=blocked?'0.25':'';
    }
  });
}

function currentQueueType(){
  if(!state.queue||state.queue.length===0) return null;
  return state.queue[0].type;
}

// ===== RUNDEN: Eintragen =====
function addRound(){
  if(editRoundIdx>=0){ saveEditRound(); return; }
  if(hasOpenRound()){
    // Stufe 2: offene Runde abschließen
    const r=state.rounds[openRoundIdx];
    const n=state.has4?4:3;
    const value=r.noPlayer?0:getFinalValue();
    r.value=value;
    r.open=false; delete r.open;
    r.typeKey=getTypeKey()||(r.savedCalc?r.typeKey:'');
    // Stage-2-Werte in savedCalc nachführen (wurden in vormerken() noch nicht gespeichert)
    if(r.savedCalc){
      r.savedCalc.schneider  = calc.schneider;
      r.savedCalc.schwarz    = calc.schwarz;
      r.savedCalc.spitze     = calc.spitze;
      r.savedCalc.kontra     = calc.kontra;
      r.savedCalc.re         = calc.re;
      r.savedCalc.bock       = calc.bock;
      r.savedCalc.verloren   = calc.verloren;
      r.savedCalc.jackCount  = calc.jackCount;
      r.savedCalc.jackDir    = calc.jackDir;
      r.savedCalc.factor     = calc.factor;
    }
    r.label=getShortLabel()||r.label;
    const queueBefore=r.queueBefore||[...state.queue];
    const nextQ=queueBefore[0];
    if(nextQ){
      if(nextQ.type==='ramsch'){
        const isRGH=calc.type==='rgh'||r.isRamschGH;
        if(!isRGH) state.queue.shift();
      } else if(nextQ.type==='bock'){
        state.queue.shift();
      }
    }
    r.wasBock  =!!(nextQ&&nextQ.type==='bock');
    r.wasRamsch=!!(nextQ&&nextQ.type==='ramsch');
    const base=openRoundIdx>0?[...state.rounds[openRoundIdx-1].totals]:new Array(n).fill(0);
    while(base.length<n) base.push(0);
    if(!r.noPlayer) r.players.forEach(i=>{ base[i]+=value; });
    r.totals=[...base];
    state.totals=[...base];
    openRoundIdx=-1;
    save();
  } else {
    // Stage 1 direkt: nur noch Leer
    const isRamschGH=calc.type==='rgh';
    const isLeer=calc.type==='leer';
    if(!isLeer && !isRamschGH && currentQueueType()==='bock') calc.bock=true;
    const noPlayer=isLeer||selectedPlayers.length===0;
    const value=isLeer?0:(selectedPlayers.length>0?getFinalValue():0);
    const label=isLeer?getShortLabel():(selectedPlayers.length>0?getShortLabel():'');
    const typeKey=getTypeKey();
    const aussetzer=state.has4?getAussetzer():-1;
    const newTotals=[...state.totals];
    while(newTotals.length<(state.has4?4:3)) newTotals.push(0);
    if(!isLeer) selectedPlayers.forEach(i=>{ newTotals[i]+=value; });
    const queueBefore=[...state.queue];
    const nextQ=state.queue[0];
    let wasBock=false, wasRamsch=false;
    if(nextQ){
      if(nextQ.type==='ramsch'){
        if(!isRamschGH) state.queue.shift();
        wasRamsch=true;
      } else if(nextQ.type==='bock'){
        state.queue.shift(); wasBock=true;
      }
    }
    state.rounds.push({
      players:isLeer?[]:[...selectedPlayers],
      value, label, typeKey, noPlayer, isRamschGH, aussetzer,
      totals:[...newTotals], queueBefore, wasBock, wasRamsch,
      savedCalc:{
        type:calc.type, farbeIdx:calc.farbeIdx, nullVal:calc.nullVal,
        nullHand:calc.nullHand||false, nullOuvert:calc.nullOuvert||false, nullRevol:calc.nullRevol||false,
        hand:calc.hand, schneider:calc.schneider, schneiderA:calc.schneiderA,
        schwarz:calc.schwarz, schwarzA:calc.schwarzA, ouvert:calc.ouvert,
        spitze:calc.spitze, spitzeA:calc.spitzeA,
        kontra:calc.kontra, re:calc.re, bock:calc.bock,
        jungfrau:calc.jungfrau, geschoben:calc.geschoben, verloren:calc.verloren,
        jackCount:calc.jackCount, jackDir:calc.jackDir, factor:calc.factor
      }
    });
    state.totals=newTotals; save();
  }
  openRoundIdx=-1;
  resetPanel();
  panelOpen=true;
  document.getElementById('inputPanel').classList.add('open');
  renderAll(); updateCalcUI(); updatePanelHeight(); updateQueueUI();
}

function cancelOpenRound(){
  if(editRoundIdx>=0){ cancelEditRound(); resetPanel(); renderAll(); return; }
  if(!hasOpenRound()) return;
  state.rounds.splice(openRoundIdx,1);
  openRoundIdx=-1;
  save();
}

// ===== UNDO =====
function undoLast(){
  hideToast();
  if(state.rounds.length===0) return;
  lastDeleted=state.rounds.pop();
  if(lastDeleted.queueBefore!==undefined) state.queue=[...lastDeleted.queueBefore];
  if(state.rounds.length===0){ state.totals=state.has4?[0,0,0,0]:[0,0,0]; }
  else { state.totals=[...state.rounds[state.rounds.length-1].totals]; }
  save(); renderAll(); showToast(); updateQueueUI();
}

let toastTimer;
function showToast(){
  document.getElementById('toastText').textContent=t('eingetragen');
  document.getElementById('toast').classList.add('show');
  clearTimeout(toastTimer); toastTimer=setTimeout(hideToast,4000);
}
function hideToast(){ document.getElementById('toast').classList.remove('show'); }

// ===== RESET =====
function closeReset(){ document.getElementById('resetModal').classList.remove('show'); }

function confirmReset(){
  const isHard = document.getElementById('resetModal').dataset.hard === 'true';
  if(isHard){
    // Alles löschen: State, Namen, Geld, Theme, Font, Sprache
    try{ localStorage.clear(); }catch(e){}
    state={ names:['Spieler 1','Spieler 2','Spieler 3'], rounds:[], totals:[0,0,0], lang:'de', has4:false, queue:[] };
    moneySettings={ rate:0, currency:'€' };
    lang='de';
    applyTheme(window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');
    const html=document.documentElement;
    html.classList.remove('zoom-2','zoom-3','zoom-4'); html.classList.add('zoom-2');
    const fontBtn=document.getElementById('fontBtn'); if(fontBtn) fontBtn.textContent='A';
    setLang('de');
  } else {
    // Nur Runden löschen
    openRoundIdx=-1;
    state.rounds=[]; state.totals=state.has4?[0,0,0,0]:[0,0,0]; state.queue=[];
    save();
  }
  resetPanel(); renderAll(); closeReset(); updateQueueUI();
}

// ===== SPIELER TAUSCHEN =====
function swapPlayers(i, j){
  [state.names[i], state.names[j]] = [state.names[j], state.names[i]];
  [state.totals[i], state.totals[j]] = [state.totals[j], state.totals[i]];
  state.rounds.forEach(r => {
    r.players = r.players.map(p => p===i ? j : p===j ? i : p);
    if(r.totals && r.totals.length > Math.max(i,j)){
      [r.totals[i], r.totals[j]] = [r.totals[j], r.totals[i]];
    }
    if(r.aussetzer === i)      r.aussetzer = j;
    else if(r.aussetzer === j) r.aussetzer = i;
  });
  save();
  renderAll();
}

function openResetDialog(hard){
  const modal = document.getElementById('resetModal');
  modal.dataset.hard = hard ? 'true' : 'false';
  if(hard){
    document.getElementById('modalTitle').textContent  = '⚠️ Alles zurücksetzen?';
    document.getElementById('modalText').textContent   = 'Namen, Währung, Sprache, Theme – wirklich alles wird gelöscht.';
    document.getElementById('modalConfirm').textContent= 'Alles löschen';
  } else {
    document.getElementById('modalTitle').textContent  = t('modalTitle');
    document.getElementById('modalText').textContent   = t('modalText');
    document.getElementById('modalConfirm').textContent= t('loeschen');
  }
  modal.classList.add('show');
}

// ===== EINSTELLUNGEN =====
function saveSettings(){
  const r=parseFloat(document.getElementById('moneyRate').value)||0;
  moneySettings.rate=r;
  try{ localStorage.setItem('skat_money',JSON.stringify(moneySettings)); }catch(e){}
  renderTable();
}
function loadSettings(){
  try{ const d=localStorage.getItem('skat_money'); if(d) moneySettings=JSON.parse(d); }catch(e){}
}
function setCurrency(c){
  moneySettings.currency=c;
  document.querySelectorAll('.currency-btn').forEach(b=>b.classList.toggle('active',b.dataset.c===c));
  saveSettings();
}
function openSettings(){
  document.getElementById('moneyRate').value=moneySettings.rate||'';
  document.querySelectorAll('.currency-btn').forEach(b=>b.classList.toggle('active',b.dataset.c===moneySettings.currency));
  document.getElementById('settingsModal').classList.add('show');
}
function closeSettings(){ document.getElementById('settingsModal').classList.remove('show'); }
function closeSettingsOutside(e){ if(e.target.id==='settingsModal') closeSettings(); }

// ===== SPRACHE =====
function toggleLangDropdown(e){
  e.stopPropagation();
  document.getElementById('langDropdown').classList.toggle('open');
}
function pickLang(l, e){
  if(e) e.stopPropagation();
  document.getElementById('langDropdown').classList.remove('open');
  setLang(l);
}
document.addEventListener('click', ()=>{
  const d=document.getElementById('langDropdown'); if(d) d.classList.remove('open');
});

function setLang(l){
  lang=l; state.lang=l; save();
  const flags={'de':'🇩🇪','en':'🇬🇧','fr':'🇫🇷','es':'🇪🇸','it':'🇮🇹','da':'🇩🇰','th':'🇹🇭','vi':'🇻🇳','ja':'🇯🇵'};
  document.getElementById('langFlag').textContent=flags[l]||'🌐';
  document.getElementById('langCode').textContent=l.toUpperCase();
  document.querySelectorAll('.lang-option').forEach(o=>o.classList.toggle('active',o.dataset.lang===l));
  applyTranslations(); buildNullBtns(); buildJackRow(); renderAll(); updateCalcUI();
}

function applyTranslations(){
  document.querySelectorAll('[data-t]').forEach(el=>{
    el.textContent=t(el.getAttribute('data-t'));
  });
  if(editRoundIdx<0) document.getElementById('addBtn').textContent=t('eintragen');
  else               document.getElementById('addBtn').textContent=t('speichern');
  document.getElementById('modalTitle').textContent =t('modalTitle');
  document.getElementById('modalText').textContent  =t('modalText');
  document.getElementById('modalCancel').textContent=t('abbrechen');
  document.getElementById('modalConfirm').textContent=t('loeschen');
  document.getElementById('toastUndo').textContent  =t('rueckgaengig');
  document.getElementById('thVal').textContent      =t('wert');
  document.getElementById('thSpiel').textContent    =t('spiel');
  const ep=document.getElementById('emptyText');
  ep.innerHTML=t('emptyText').replace('\n','<br>');
  document.getElementById('tab-std').textContent=t('tabStd');
  document.getElementById('tab-sf').textContent =t('tabSf');
  document.getElementById('tab-bl').textContent =t('tabBl');
  updateSummaryBar(); updateHint();
}

// ===== FONT =====
function toggleFont(){
  const html=document.documentElement;
  const LEVELS=['zoom-2','zoom-3','zoom-4'];
  const cur=LEVELS.find(c=>html.classList.contains(c))||'zoom-2';
  const next=LEVELS[(LEVELS.indexOf(cur)+1)%LEVELS.length];
  html.classList.remove('zoom-2','zoom-3','zoom-4');
  html.classList.add(next);
  const labels={'zoom-2':'A','zoom-3':'A+','zoom-4':'A++'};
  document.getElementById('fontBtn').textContent=labels[next];
  try{ localStorage.setItem('skat_font',next); }catch(e){}
}

// ===== WAKELOCK =====
let wakeLockSentinel=null;
async function toggleWakeLock(){
  const btn=document.getElementById('wakeLockBtn');
  if(wakeLockSentinel){
    await wakeLockSentinel.release(); wakeLockSentinel=null; btn.style.opacity='0.4';
  } else {
    try{
      wakeLockSentinel=await navigator.wakeLock.request('screen');
      btn.style.opacity='1';
      wakeLockSentinel.addEventListener('release',()=>{ wakeLockSentinel=null; btn.style.opacity='0.4'; });
    }catch(e){}
  }
}

// ===== THEME =====
function applyTheme(theme){
  const html=document.documentElement;
  const themeBtn=document.getElementById('themeBtn');
  const metaTheme=document.querySelector('meta[name="theme-color"]');
  if(theme==='light'){
    html.setAttribute('data-theme','light');
    if(themeBtn) themeBtn.textContent='🌙';
    if(metaTheme) metaTheme.content='#1a3a8f';
  } else {
    html.setAttribute('data-theme','dark');
    if(themeBtn) themeBtn.textContent='☀';
    if(metaTheme) metaTheme.content='#1a1a2e';
  }
  try{ localStorage.setItem('skat_theme',theme); }catch(e){}
}
function toggleTheme(){
  applyTheme(document.documentElement.getAttribute('data-theme')==='light'?'dark':'light');
}

// ===== INIT =====
// Kritische Reihenfolge:
// 1. State laden  →  2. lang setzen  →  3. Theme/Font  →  4. DOM befüllen

load();
loadSettings();

// Lang aus gespeichertem State setzen – VOR jedem DOM-Render
lang = state.lang || 'de';

// Theme initialisieren
(function(){
  let theme=null;
  try{ theme=localStorage.getItem('skat_theme'); }catch(e){}
  if(!theme){ theme=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'; }
  applyTheme(theme);
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', e=>{
    try{ if(!localStorage.getItem('skat_theme')) applyTheme(e.matches?'light':'dark'); }catch(ex){}
  });
})();

// Font initialisieren
try{
  const fp=localStorage.getItem('skat_font');
  const labels={'zoom-2':'A','zoom-3':'A+','zoom-4':'A++'};
  const cls=(fp&&labels[fp])?fp:'zoom-2';
  document.documentElement.classList.add(cls);
  const fontBtn=document.getElementById('fontBtn');
  if(fontBtn) fontBtn.textContent=labels[cls];
}catch(e){ document.documentElement.classList.add('zoom-2'); }

// WakeLock
if('wakeLock' in navigator){
  const wlBtn=document.getElementById('wakeLockBtn');
  if(wlBtn) wlBtn.style.display='';
}

// Offene Runde aus State wiederherstellen
{ const idx=state.rounds.findIndex(r=>r.open===true); if(idx>=0) openRoundIdx=idx; }

// Sprach-UI initialisieren (Flag + aktive Option markieren)
{
  const flags={'de':'🇩🇪','en':'🇬🇧','fr':'🇫🇷','es':'🇪🇸','it':'🇮🇹','da':'🇩🇰','th':'🇹🇭','vi':'🇻🇳','ja':'🇯🇵'};
  const flagEl=document.getElementById('langFlag');
  const codeEl=document.getElementById('langCode');
  if(flagEl) flagEl.textContent=flags[lang]||'🌐';
  if(codeEl) codeEl.textContent=lang.toUpperCase();
  document.querySelectorAll('.lang-option').forEach(o=>o.classList.toggle('active',o.dataset.lang===lang));
}

// Alles rendern – nur wenn Skat-DOM vorhanden
if(document.getElementById('inputPanel')){
  buildNullBtns();
  buildJackRow();
  applyTranslations();
  renderAll();
  updateCalcUI();
  updateQueueUI();
  document.getElementById('inputPanel').classList.add('open');

  // Offene Runde: Stage 2 wiederherstellen
  if(hasOpenRound()){
    const r=state.rounds[openRoundIdx];
    const sc=r.savedCalc||{};
    calc={type:sc.type||'', farbeIdx:sc.farbeIdx||0, factor:sc.factor||2,
      nullVal:sc.nullVal||23, jackCount:1, jackDir:'mit',
      hand:sc.hand||false, schneider:false, schneiderA:sc.schneiderA||false,
      schwarz:false, schwarzA:sc.schwarzA||false, ouvert:sc.ouvert||false,
      spitze:false, spitzeA:sc.spitzeA||false,
      kontra:false, re:false, bock:false, jungfrau:sc.jungfrau||false,
      geschoben:sc.geschoben||0, verloren:false};
    const suitType=sc.type==='farbe'?['karo','herz','pik','kreuz'][sc.farbeIdx||0]:sc.type;
    setType(suitType||'');
    showStage2();
    updateCalcUI(); updatePlayerBtns(); updatePanelHeight();
  }

  // Event Listener
  document.getElementById('resetBtn').addEventListener('click', ()=>{
    const noRounds = state.rounds.length === 0;
    openResetDialog(noRounds);
  });
  document.getElementById('undoBtn').addEventListener('click', undoLast);
  document.getElementById('toastUndo').onclick = function(){
    if(!lastDeleted) return;
    if(lastDeleted.queueBefore!==undefined){
      const qb=[...lastDeleted.queueBefore];
      const nextQ=qb[0];
      if(nextQ){
        const isRGH=lastDeleted.isRamschGH;
        if(nextQ.type==='ramsch'&&!isRGH) qb.shift();
        else if(nextQ.type==='bock') qb.shift();
      }
      state.queue=qb;
    }
    state.rounds.push(lastDeleted);
    state.totals=[...lastDeleted.totals];
    lastDeleted=null; save(); renderAll(); hideToast(); updateQueueUI();
  };

  updatePanelHeight();
  window.addEventListener('resize', updatePanelHeight);
}

// ===== SERVICE WORKER =====
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('sw.js').catch(()=>{});
}
