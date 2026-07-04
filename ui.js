// ===== ui.js =====
// Alles DOM-Manipulation: Rendering, Panel, Buttons, Stage-System, Edit-Modus.
// Abhängigkeiten: calc.js, app.js (Globals: state, calc, sign, selectedPlayers,
//   openRoundIdx, editRoundIdx, panelOpen, tableView, moneySettings, lang)

// ===== PANEL-HÖHE =====
function updatePanelHeight(){
  const h = document.getElementById('inputPanel').offsetHeight;
  document.documentElement.style.setProperty('--panel-h', h + 'px');
}

// ===== PANEL TOGGLE =====
function togglePanel(){
  panelOpen = !panelOpen;
  document.getElementById('inputPanel').classList.toggle('open', panelOpen);
  if(panelOpen && hasOpenRound()){
    const r  = state.rounds[openRoundIdx];
    const sc = r.savedCalc || {};
    const suitType = sc.type==='farbe' ? ['karo','herz','pik','kreuz'][sc.farbeIdx||0] : sc.type;
    calc = {type:sc.type||'', farbeIdx:sc.farbeIdx||0, factor:sc.factor||2,
      nullVal:sc.nullVal||23, jackCount:sc.jackCount||1, jackDir:sc.jackDir||'mit',
      hand:sc.hand||false, schneider:false, schneiderA:sc.schneiderA||false,
      schwarz:false, schwarzA:sc.schwarzA||false, ouvert:sc.ouvert||false,
      spitzeA:sc.spitzeA||false,
      kontra:false, re:false, bock:false, jungfrau:sc.jungfrau||false,
      geschoben:sc.geschoben||0, verloren:false};
    setType(suitType||'');
    showStage2();
    updateCalcUI(); updatePlayerBtns();
  }
  updatePanelHeight();
  if(panelOpen) setTimeout(()=>{ const w=document.getElementById('tableWrap'); w.scrollTop=w.scrollHeight; }, 60);
}

// ===== PANEL RESET =====
function resetPanel(){
  selectedPlayers=[]; sign=1;
  calc={type:'',farbeIdx:0,factor:2,nullVal:23,
    nullHand:false,nullOuvert:false,nullRevol:false,
    jackCount:1,jackDir:'mit',
    hand:false,schneider:false,schneiderA:false,schwarz:false,schwarzA:false,ouvert:false,
    spitze:false,spitzeA:false,kontra:false,re:false,bock:false,jungfrau:false,geschoben:0,verloren:false};
  const ri=document.getElementById('ramschInput');
  ri.value=''; ri.disabled=false; ri.style.opacity='';
  document.getElementById('geschobenVal').textContent='0';
  const _gp=document.getElementById('geschobenPips'); if(_gp) _gp.innerHTML='';
  document.getElementById('ramschDurch').classList.remove('active');
  document.getElementById('calcRamschInputRow').style.display='';
  document.getElementById('signBtn').textContent='+';
  document.getElementById('signBtn').className='sign-btn positive';
  document.querySelectorAll('.opt-btn,.dbl-btn').forEach(b=>b.classList.remove('active','implied'));
  const rbb=document.getElementById('ramschBockBar'); if(rbb) rbb.style.display='none';
  document.getElementById('stage1').style.display='';
  document.getElementById('stage2').style.display='none';
  document.getElementById('stage1Ansagen').style.display='none';
  ['stage2Buben','stage2Erreicht','detailRamsch','detailNormal'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.style.display='none';
  });
  editRoundIdx=-1;
  document.getElementById('addBtn').textContent=t('eintragen');
  document.getElementById('addBtn').classList.remove('edit-mode');
  setType(''); setFarbe(0); buildNullBtns(); refreshJackRow();
  panelOpen=false;
  document.getElementById('inputPanel').classList.remove('open');
  updateStageUI(0);
}

function updateStageUI(stage){
  const ind = document.getElementById('stageIndicator');
  if(!ind) return;
  if(stage===0) ind.style.display='none';
}

// ===== NULL-BUTTONS =====
function buildNullBtns(){
  const container = document.getElementById('nullBtns');
  container.innerHTML = '';
  const variants = [
    { id:'nullBtnHand',   sym:'✋', lbl:'Hand',       variant:'hand'       },
    { id:'nullBtnOuvert', sym:'👁', lbl:'Ouvert',     variant:'ouvert'     },
    { id:'nullBtnRevol',  sym:'🌀', lbl:'Revolution', variant:'revolution' },
  ];
  variants.forEach(v => {
    const b = document.createElement('button');
    b.className = 'opt-btn';
    b.id = v.id;
    b.innerHTML = `<span class="btn-sym">${v.sym}</span><span class="btn-lbl">${v.lbl}</span>`;
    b.onclick = () => toggleNullVariant(v.variant);
    container.appendChild(b);
  });
  refreshNullBtns();
}

function nullValFromState(){
  if(calc.nullRevol) return 92;
  if(calc.nullHand && calc.nullOuvert) return 59;
  if(calc.nullOuvert) return 46;
  if(calc.nullHand) return 35;
  return 23;
}

function toggleNullVariant(variant){
  if(variant === 'revolution'){
    calc.nullRevol = !calc.nullRevol;
    if(calc.nullRevol){ calc.nullHand = true; calc.nullOuvert = true; }
  } else if(variant === 'ouvert'){
    calc.nullOuvert = !calc.nullOuvert;
    if(!calc.nullOuvert) calc.nullRevol = false;
  } else if(variant === 'hand'){
    calc.nullHand = !calc.nullHand;
    if(!calc.nullHand) calc.nullRevol = false;
  }
  calc.nullVal = nullValFromState();
  refreshNullBtns();
  updateCalcResult();
}

function refreshNullBtns(){
  const hBtn = document.getElementById('nullBtnHand');
  const oBtn = document.getElementById('nullBtnOuvert');
  const rBtn = document.getElementById('nullBtnRevol');
  if(!hBtn) return;
  hBtn.classList.toggle('active', !!(calc.nullHand || calc.nullRevol));
  oBtn.classList.toggle('active', !!(calc.nullOuvert || calc.nullRevol));
  rBtn.classList.toggle('active', !!calc.nullRevol);
}

// ===== JACK ROW =====
function getTrumpLabels(){
  const j = t('bube') || 'B';
  const suits = ['♣'+j, '♠'+j, '♥'+j, '♦'+j];
  const k = t('koenig')||'K', d = t('dame')||'D';
  return ['', ...suits, 'A','10',k,d,'9','8','7'];
}

function buildJackRow(){
  const row = document.getElementById('jackRow');
  row.innerHTML = `
    <div class="jack-stepper">
      <button class="jack-btn" id="jackDirBtn" onclick="toggleJackDir()"></button>
      <button class="jack-btn" onclick="stepJack(-1)">−</button>
      <span id="jackNum" style="font-size:17px;font-weight:700;color:var(--text);min-width:16px;text-align:center"></span>
      <button class="jack-btn" onclick="stepJack(1)">+</button>
      <div class="jack-card" id="jackCard"></div>
    </div>`;
  refreshJackRow();
}

function refreshJackRow(){
  const dirBtn = document.getElementById('jackDirBtn');
  const card   = document.getElementById('jackCard');
  if(!dirBtn || !card) return;
  dirBtn.textContent = t(calc.jackDir==='mit' ? 'mit' : 'ohne');
  dirBtn.classList.toggle('active', calc.jackDir==='mit');
  const labels   = getTrumpLabels();
  const maxCount = calc.type==='farbe' ? 11 : 4;
  if(calc.jackCount > maxCount) calc.jackCount = maxCount;
  document.getElementById('jackNum').textContent = calc.jackCount;
  card.innerHTML = '';
  for(let i=1; i<=calc.jackCount; i++){
    const pip = document.createElement('span');
    pip.className = 'jack-pip';
    pip.textContent = labels[i] || i;
    card.appendChild(pip);
  }
}

function stepJack(d){
  const maxCount = calc.type==='farbe' ? 11 : 4;
  calc.jackCount = Math.max(1, Math.min(maxCount, calc.jackCount+d));
  refreshJackRow(); syncFactor(); updateCalcResult();
}
function toggleJackDir(){
  calc.jackDir = calc.jackDir==='mit' ? 'ohne' : 'mit';
  refreshJackRow(); syncFactor(); updateCalcResult();
}
function setJackCount(n){ calc.jackCount=n; refreshJackRow(); syncFactor(); updateCalcResult(); }

// ===== SPIELTYP-UI =====
function setType(tp){
  // RGH-Sperre
  if(editRoundIdx >= 0){
    const origR = state.rounds[editRoundIdx];
    if(origR && origR.isRamschGH && tp!=='rgh') return;
    if(origR && !origR.isRamschGH && tp==='rgh') return;
  }
  const isSuit = tp in SUIT_IDX;
  if(isSuit){ calc.farbeIdx=SUIT_IDX[tp]; calc.type='farbe'; }
  else { calc.type=tp; }

  // SpitzeA beim Typwechsel immer zurücksetzen – verhindert dirty State
  calc.spitzeA=false;
  const dSpAel=document.getElementById('dSpitzeA');
  if(dSpAel) dSpAel.classList.remove('active');

  if(tp !== 'ramsch'){
    document.getElementById('ramschDurch').classList.remove('active');
    document.getElementById('calcRamschInputRow').style.display='';
  }
  if(tp==='ramsch' && sign>0){
    sign=-1;
    const b=document.getElementById('signBtn');
    b.textContent='−'; b.className='sign-btn negative';
  } else if(tp!=='ramsch' && tp!=='leer' && sign<0){
    sign=1;
    const b=document.getElementById('signBtn');
    b.textContent='+'; b.className='sign-btn positive';
  }
  if(tp==='leer') selectedPlayers=[];
  if(tp==='rgh'){
    calc.schneiderA=false; calc.schwarzA=false; calc.ouvert=false; calc.hand=true;
    document.getElementById('dSchneiderA').classList.remove('active');
    document.getElementById('dSchwarzA').classList.remove('active');
    document.getElementById('dOuvert').classList.remove('active');
    document.getElementById('dHand').classList.add('active');
    syncFactor();
  } else if(tp!=='grand' && !isSuit){
    calc.hand=false; calc.schneiderA=false; calc.schwarzA=false; calc.ouvert=false;
    ['dHand','dSchneiderA','dSchwarzA','dOuvert'].forEach(id=>document.getElementById(id).classList.remove('active'));
  }

  document.querySelectorAll('.type-btn').forEach(b=>b.classList.toggle('active', b.dataset.type===tp));
  const inStage2 = document.getElementById('stage2').style.display!=='none';
  // Ramsch-Details in Stage 1 sichtbar (Eingabe, Durch, Jungfrau, Geschoben + Bock)
  document.getElementById('detailRamsch').style.display = (tp==='ramsch') ? '' : 'none';
  document.getElementById('calcRamsch').style.display   = (tp==='ramsch') ? '' : 'none';
  if(tp==='ramsch') document.getElementById('dJungfrau').style.display='';
  // Bock-Button in Stage 1 bei Ramsch zeigen wenn Bock-Runde aktiv
  const ramschBockBar = document.getElementById('ramschBockBar');
  if(ramschBockBar) ramschBockBar.style.display = (tp==='ramsch') ? '' : 'none';
  // Farbe/Grand/RGH Faktor-Stepper nur in Stage 2
  document.getElementById('calcFarbe').style.display  = (isSuit&&inStage2) ? '' : 'none';
  document.getElementById('calcGrand').style.display  = (tp==='grand'&&inStage2) ? '' : 'none';
  document.getElementById('calcRGH').style.display    = (tp==='rgh'&&inStage2) ? '' : 'none';
  document.getElementById('calcNull').style.display   = tp==='null' ? '' : 'none';
  document.getElementById('calcLeer').style.display   = tp==='leer' ? '' : 'none';
  document.getElementById('stage1Ansagen').style.display = (isSuit||tp==='grand') ? '' : 'none';

  const _s2 = document.getElementById('stage2');
  if(_s2 && _s2.style.display!=='none'){
    const _b=document.getElementById('stage2Buben'); if(_b) _b.style.display=(isSuit||tp==='grand'||tp==='rgh')?'':'none';
    const _e=document.getElementById('stage2Erreicht'); if(_e) _e.style.display=(isSuit||tp==='grand'||tp==='rgh')?'':'none';
    // In Stage 2: Ramsch-Details anzeigen
    const _cr=document.getElementById('calcRamsch'); if(_cr) _cr.style.display=tp==='ramsch'?'':'none';
    const _dr=document.getElementById('detailRamsch'); if(_dr) _dr.style.display=tp==='ramsch'?'':'none';
    const _dn=document.getElementById('detailNormal'); if(_dn) _dn.style.display=(tp===''||tp==='leer')?'none':'';
  }
  if(isSuit) document.getElementById('baseInfo').textContent =
    FARBEN_VALS[calc.farbeIdx]+'×'+calc.factor+'='+(FARBEN_VALS[calc.farbeIdx]*calc.factor);
  updatePlayerBtns();
  buildJackRow();
  // Bock aus Queue live vorbelegen (damit Anzeige stimmt)
  if(calc.type !== '' && calc.type !== 'rgh' && typeof currentQueueType === 'function'){
    if(currentQueueType() === 'bock'){
      calc.bock = true;
      // dBock (Stage2) und dBockRamsch (Stage1) aktiv setzen
      ['dBock','dBockRamsch'].forEach(id=>{
        const el=document.getElementById(id);
        if(el) el.classList.add('active');
      });
    }
  }
  updateCalcResult(); updateAnsagenUI(); updatePanelHeight();
}
  calc.farbeIdx=i;
  document.querySelectorAll('.farbe-btn').forEach(b=>b.classList.toggle('active', +b.dataset.fi===i));
  updateCalcResult();
}

function stepGeschoben(d){
  calc.geschoben = Math.max(0, Math.min(3, calc.geschoben+d));
  document.getElementById('geschobenVal').textContent = calc.geschoben;
  renderGeschobenPips();
  updateCalcResult();
}

function renderGeschobenPips(){
  const pipEl = document.getElementById('geschobenPips');
  if(!pipEl) return;
  if(calc.geschoben === 0){ pipEl.innerHTML = ''; return; }
  let html = '';
  for(let i = 0; i < calc.geschoben; i++){
    html += '<span class="jack-pip" style="font-size:14px">✋</span>';
  }
  pipEl.innerHTML = html;
}

function stepFactor(d){
  calc.factor = Math.max(2, calc.factor+d);
  document.getElementById('factorVal').textContent  = calc.factor;
  document.getElementById('factorValG').textContent = calc.factor;
  updateCalcResult();
}

// setNullType replaced by toggleNullVariant

// ===== ANSAGEN-UI =====
function updateAnsagenUI(){
  const h=calc.hand, sA=calc.schneiderA, swA=calc.schwarzA, ov=calc.ouvert;
  document.getElementById('dHand').classList.toggle('active', h||sA||swA||ov);
  document.getElementById('dSchneiderA').classList.toggle('active', sA||swA||ov);
  const dSwA=document.getElementById('dSchwarzA');
  if(dSwA) dSwA.classList.toggle('active', swA||ov);
  document.getElementById('dOuvert').classList.toggle('active', ov);
  document.getElementById('dHand').classList.toggle('implied', !h && (sA||swA||ov));
  document.getElementById('dSchneiderA').classList.toggle('implied', !sA && (swA||ov));
  if(dSwA) dSwA.classList.toggle('implied', !swA && ov);
  document.getElementById('dOuvert').classList.toggle('implied', false);
  const dSpitzeA=document.getElementById('dSpitzeA');
  if(dSpitzeA) dSpitzeA.classList.toggle('active', !!calc.spitzeA);
}

function toggleOpt(key){
  if(key==='hand'){
    calc.hand=!calc.hand;
    if(!calc.hand){ calc.schneiderA=false; calc.schwarzA=false; calc.ouvert=false; }
  } else if(key==='schneiderA'){
    calc.schneiderA=!calc.schneiderA;
    if(calc.schneiderA){ calc.hand=true; }
    else { calc.schwarzA=false; calc.ouvert=false; }
  } else if(key==='schwarzA'){
    calc.schwarzA=!calc.schwarzA;
    if(calc.schwarzA){ calc.hand=true; calc.schneiderA=true; }
    else { calc.ouvert=false; }
  } else if(key==='ouvert'){
    calc.ouvert=!calc.ouvert;
    if(calc.ouvert){ calc.hand=true; calc.schneiderA=true; calc.schwarzA=true; }
    document.getElementById('dOuvert').classList.toggle('active', calc.ouvert);
  } else if(key==='spitzeA'){
    // SpitzeA ist vollständig unabhängig von Hand/Schneider/Schwarz/Ouvert
    calc.spitzeA=!calc.spitzeA;
    document.getElementById('dSpitzeA').classList.toggle('active', calc.spitzeA);
    syncFactor(); updateCalcResult();
    return; // updateAnsagenUI nicht aufrufen – würde nichts kaputt machen, aber unnötig
  } else if(key==='spitze'){
    calc.spitze=!calc.spitze;
    document.getElementById('dSpitze').classList.toggle('active', calc.spitze);
    syncFactor(); updateCalcResult();
    return;
  } else if(key==='schneider'){
    calc.schneider=!calc.schneider;
    if(!calc.schneider) calc.schwarz=false;
    document.getElementById('dSchneider').classList.toggle('active', calc.schneider);
    const dsw=document.getElementById('dSchwarz'); if(dsw) dsw.classList.toggle('active', calc.schwarz);
    syncFactor(); updateCalcResult();
    return;
  } else if(key==='schwarz'){
    calc.schwarz=!calc.schwarz;
    if(calc.schwarz) calc.schneider=true;
    document.getElementById('dSchneider').classList.toggle('active', calc.schneider);
    const dsw=document.getElementById('dSchwarz'); if(dsw) dsw.classList.toggle('active', calc.schwarz);
    syncFactor(); updateCalcResult();
    return;
  } else {
    calc[key]=!calc[key];
    const el=document.getElementById('d'+key.charAt(0).toUpperCase()+key.slice(1));
    if(el) el.classList.toggle('active', calc[key]);
  }
  updateAnsagenUI();
  syncFactor(); updateCalcResult();
}

function toggleDbl(key){
  calc[key]=!calc[key];
  // Update alle Buttons mit diesem key (es kann mehrere geben z.B. dBock + dBockRamsch)
  ['d'+key.charAt(0).toUpperCase()+key.slice(1),
   'd'+key.charAt(0).toUpperCase()+key.slice(1)+'Ramsch'].forEach(id=>{
    const el=document.getElementById(id);
    if(el) el.classList.toggle('active', calc[key]);
  });
  if(key==='verloren' && calc[key] && sign>0){
    sign=-1;
    const b=document.getElementById('signBtn');
    b.textContent='−'; b.className='sign-btn negative';
  } else if(key==='verloren' && !calc[key] && calc.type!=='ramsch'){
    sign=1;
    const b=document.getElementById('signBtn');
    b.textContent='+'; b.className='sign-btn positive';
  }
  updateCalcResult();
}

function toggleDetails(){ updatePanelHeight(); }

function toggleSign(){
  sign*=-1;
  const b=document.getElementById('signBtn');
  b.textContent=sign>0?'+':'−';
  b.className='sign-btn '+(sign>0?'positive':'negative');
  updateCalcResult();
}

function toggleRamschDurch(){
  const btn=document.getElementById('ramschDurch');
  const isDurch=btn.classList.toggle('active');
  const ri=document.getElementById('ramschInput');
  if(isDurch){ ri.value='120'; ri.disabled=true; ri.style.opacity='0.5'; }
  else { ri.value=''; ri.disabled=false; ri.style.opacity=''; }
  document.getElementById('dJungfrau').style.display=isDurch?'none':'';
  document.getElementById('detailRamsch').style.display='';
  document.getElementById('detailNormal').style.display='none';
  if(isDurch && sign<0){ sign=1; const b=document.getElementById('signBtn'); b.textContent='+'; b.className='sign-btn positive'; }
  else if(!isDurch && sign>0){ sign=-1; const b=document.getElementById('signBtn'); b.textContent='−'; b.className='sign-btn negative'; }
  updateCalcResult(); updatePanelHeight();
}

// ===== CALC UI UPDATE =====
function updateCalcUI(){
  document.getElementById('factorVal').textContent  = calc.factor;
  document.getElementById('factorValG').textContent = calc.factor;
  setFarbe(calc.farbeIdx);
  updateCalcResult();
}

function updateCalcResult(){
  const val=getFinalValue(), abs=Math.abs(val), pre=sign>0?'+':'−';
  document.getElementById('calcResult').textContent = pre+abs;
  document.getElementById('calcResult').style.color = sign>0 ? 'var(--green)' : 'var(--red)';
  document.getElementById('calcFormula').textContent = getFormula();
  if(calc.type==='farbe') document.getElementById('baseInfo').textContent  = getFarbeVal()+'×'+calc.factor+'='+(getFarbeVal()*calc.factor);
  if(calc.type==='grand') document.getElementById('grandInfo').textContent = '24×'+calc.factor+'='+(24*calc.factor);
  if(calc.type==='rgh')   document.getElementById('rghInfo').textContent   = '24×'+calc.factor+'='+(24*calc.factor);
  updateSummaryBar(); updateHint();
  updatePanelHeight();
}

// ===== SUMMARY BAR & HINT =====
function updateSummaryBar(){
  if(hasOpenRound() && !panelOpen){
    const r=state.rounds[openRoundIdx];
    const sp=document.getElementById('sumPlayers');
    const names=r.players.map(i=>state.names[i]||('S'+(i+1))).join(' + ');
    sp.innerHTML=`<span>${names}</span>`;
    document.getElementById('sumType').textContent='✏️ '+labelFromKey(r);
    const sv=document.getElementById('sumVal');
    sv.textContent=''; sv.className='sum-val';
    return;
  }
  const names=selectedPlayers.length>0 ? selectedPlayers.map(i=>state.names[i]).join(' + ') : null;
  const sp=document.getElementById('sumPlayers');
  sp.innerHTML=names ? `<span>${names}</span>` : (panelOpen?'':t('oeffnen'));
  document.getElementById('sumType').textContent=getShortLabel();
  const val=getFinalValue(), abs=Math.abs(val), pre=sign>0?'+':'−';
  const sv=document.getElementById('sumVal');
  sv.textContent=pre+abs; sv.className='sum-val '+(sign>0?'pos':'neg');
}

function updateHint(){
  const hint=document.getElementById('hint');
  if(editRoundIdx>=0){
    hint.innerHTML=`<span style="color:#4a9eff">✏️ ${t('editieren')} #${editRoundIdx+1}</span> · <span style="cursor:pointer;color:var(--muted)" onclick="cancelEditRound();resetPanel();renderAll()">${t('abbrechenEdit')} ✕</span>`;
    return;
  }
  const inStage2=document.getElementById('stage2').style.display!=='none';
  if(inStage2){
    const r=hasOpenRound() ? state.rounds[openRoundIdx] : null;
    const names=r ? r.players.map(i=>state.names[i]||('S'+(i+1))).join(' + ') : selectedPlayers.map(i=>state.names[i]||('S'+(i+1))).join(' + ');
    hint.innerHTML=`<span>${names}</span> ${t('bekommtPunkte')} · ${t('detailsEintragen')}`;
    return;
  }
  const aussetzer=state.has4 ? getAussetzer() : -1;
  const ausName=aussetzer>=0 ? (state.names[aussetzer]||('Spieler '+(aussetzer+1))) : '';
  if(selectedPlayers.length===0){
    if(state.has4 && aussetzer>=0){
      hint.innerHTML=`<span style="color:var(--muted)">${ausName} ↪ ${t('aussetzt')}</span> · ${t('spielerAuswaehlen')}`;
    } else {
      hint.innerHTML=t('spielerAuswaehlen');
    }
  } else {
    const names=selectedPlayers.map(i=>state.names[i]||('Spieler '+(i+1))).join(' + ');
    let h=`<span>${names}</span> ${t('bekommtPunkte')}`;
    if(state.has4 && aussetzer>=0) h+=` · <span style="color:var(--muted)">${ausName} ↪ ${t('aussetzt')}</span>`;
    hint.innerHTML=h;
  }
}

// ===== SPIELER-BUTTONS =====
function togglePlayer(i){
  const idx=selectedPlayers.indexOf(i);
  if(idx===-1) selectedPlayers.push(i); else selectedPlayers.splice(idx,1);
  updatePlayerBtns(); updateCalcResult();
}

function updatePlayerBtns(){
  const n=state.has4 ? 4 : 3;
  const aussetzer=state.has4 ? getAussetzer() : -1;
  const isLeer=calc.type==='leer';
  const isEditMode=editRoundIdx>=0;
  document.getElementById('playerGrid').classList.toggle('four', state.has4);
  for(let i=0;i<4;i++){
    const btn=document.getElementById('pbtn'+i);
    const show=i<n;
    btn.style.display=show?'':'none';
    if(!show) continue;
    const isAussetzer=(i===aussetzer);
    btn.classList.toggle('selected', selectedPlayers.includes(i));
    btn.disabled=isAussetzer||isLeer;
    btn.style.opacity=(isAussetzer||isLeer)?'0.35':'';
    document.getElementById('pbtn'+i+'name').textContent=state.names[i]||('Spieler '+(i+1));
    const v=state.totals[i]||0;
    const pts=document.getElementById('pbtn'+i+'pts');
    pts.textContent=v+' '+t('punkte');
    pts.style.color=v>0?'var(--green)':v<0?'var(--red)':'';
  }
  document.getElementById('signBtn').disabled=isLeer;
  document.getElementById('signBtn').style.opacity=isLeer?'0.35':'';
  const noType=calc.type==='';
  const addBtn=document.getElementById('addBtn');
  const vBtn=document.getElementById('vormerkenBtn');
  const inStage2=document.getElementById('stage2').style.display!=='none';
  if(isEditMode){
    const isDirectSave=calc.type==='ramsch'||calc.type==='leer';
    if(isDirectSave){
      addBtn.style.display=''; vBtn.style.display='none';
      const ready=calc.type==='leer'||selectedPlayers.length>0;
      addBtn.disabled=!ready; addBtn.style.opacity=ready?'':'0.35';
    } else if(inStage2){
      addBtn.style.display=''; vBtn.style.display='none';
      const ready=calc.type!==''&&(selectedPlayers.length>0||calc.type==='leer');
      addBtn.disabled=!ready; addBtn.style.opacity=ready?'':'0.35';
    } else {
      addBtn.style.display='none'; addBtn.disabled=true;
      const canVormerken=calc.type!==''&&selectedPlayers.length>0;
      vBtn.style.display=canVormerken?'':'none';
      vBtn.disabled=!canVormerken; vBtn.style.opacity=canVormerken?'':'0.35';
      vBtn.textContent=t('weiter')||'Weiter ›';
    }
  } else if(inStage2){
    addBtn.style.display='';
    const openR=hasOpenRound() ? state.rounds[openRoundIdx] : null;
    const hasPlayer=openR&&(openR.noPlayer||openR.players.length>0);
    addBtn.disabled=noType||!hasPlayer;
    addBtn.style.opacity=addBtn.disabled?'0.35':'';
    vBtn.style.display='none';
  } else {
    // Stage 1: Leer und Ramsch direkt eintragbar, alles andere über Vormerken
    const isRamschDirect = calc.type==='ramsch';
    if(isLeer || isRamschDirect){
      addBtn.style.display='';
      const canAdd = isLeer || selectedPlayers.length>0;
      addBtn.disabled=!canAdd; addBtn.style.opacity=canAdd?'':'0.35';
      vBtn.style.display='none';
    } else {
      addBtn.style.display='none'; addBtn.disabled=true;
      const canVormerken=calc.type!==''&&selectedPlayers.length>0;
      vBtn.style.display=canVormerken?'':'none';
      vBtn.disabled=!canVormerken; vBtn.style.opacity=canVormerken?'':'0.35';
    }
  }
  updateHint();
}

// ===== ZWEISTUFIGE EINGABE =====
function buildSummaryText(){
  const parts=[];
  const r=hasOpenRound() ? state.rounds[openRoundIdx] : null;
  const playerIdxs=r ? r.players : selectedPlayers;
  const names=playerIdxs.map(i=>state.names[i]||('S'+(i+1))).join(', ');
  if(names) parts.push(names);
  const tk=r ? r.typeKey : getTypeKey();
  const lbl=r ? labelFromKey(r) : getShortLabel();
  parts.push(labelFromKey({typeKey:tk, label:lbl}));
  const isNull=tk&&tk.startsWith('null:');
  if(!isNull){
    if(calc.ouvert)          parts.push(t('ouvert'));
    else if(calc.schwarzA)   parts.push(t('schwarzA'));
    else if(calc.schneiderA) parts.push(t('schneiderA'));
    else if(calc.hand)       parts.push(t('hand'));
    if(calc.spitzeA)         parts.push(t('spitzeA')||'Spitze');
  }
  return parts.join(' · ');
}

function showStage2(restoreStage2){
  document.getElementById('stage1').style.display='none';
  document.getElementById('stage2').style.display='';
  document.getElementById('stage2summaryText').textContent=buildSummaryText();
  const isFarbeGrand=calc.type==='farbe'||calc.type==='grand'||calc.type==='rgh';
  const isRamsch=calc.type==='ramsch';
  const isRGH=calc.type==='rgh';
  const isBockRunde=typeof currentQueueType==='function' && currentQueueType()==='bock';

  // Buben + Erreicht nur bei Farbe/Grand/RGH
  document.getElementById('stage2Buben').style.display=isFarbeGrand?'':'none';
  document.getElementById('stage2Erreicht').style.display=isFarbeGrand?'':'none';

  // Faktor-Stepper
  document.getElementById('calcFarbe').style.display=(calc.type==='farbe')?'':'none';
  document.getElementById('calcGrand').style.display=(calc.type==='grand')?'':'none';
  document.getElementById('calcRGH').style.display=isRGH?'':'none';

  // Ramsch läuft in Stage 1 – in Stage 2 nicht anzeigen
  const crEl=document.getElementById('calcRamsch');
  const drEl=document.getElementById('detailRamsch');
  if(crEl) crEl.style.display='none';
  if(drEl) drEl.style.display='none';

  // Verdoppelungen: bei Farbe/Grand/Null/RGH – nicht bei Ramsch (der ist in Stage 1)
  const showNormal=calc.type!==''&&calc.type!=='leer'&&calc.type!=='ramsch';
  document.getElementById('detailNormal').style.display=showNormal?'':'none';

  // Kontra/Re bei RGH und Ramsch ausblenden; Bock bei RGH ausblenden
  document.getElementById('dKontra').style.display=(isRGH||isRamsch)?'none':'';
  document.getElementById('dRe').style.display=(isRGH||isRamsch)?'none':'';
  document.getElementById('dBock').style.display=isRGH?'none':'';

  if(restoreStage2){
    // ── Edit-Modus: gespeicherte Stage-2-Werte aus calc ins DOM übertragen ──
    // Erst alle zurücksetzen, dann selektiv wiederherstellen
    ['dSchneider','dSchwarz','dSpitze','dKontra','dRe','dBock','dVerloren'].forEach(id=>{
      const el=document.getElementById(id); if(el) el.classList.remove('active');
    });
    if(isFarbeGrand){
      const sA=calc.schneiderA, swA=calc.schwarzA;
      // Ansage-implizierte Werte
      if(sA||swA){ calc.schneider=true; }
      if(swA){ calc.schwarz=true; }
      // Schneider/Schwarz-Button ausblenden wenn durch Ansage schon impliziert
      document.getElementById('dSchneider').style.display=sA?'none':'';
      document.getElementById('dSchwarz').style.display=swA?'none':'';
      if(calc.spitzeA){ calc.spitze=true; document.getElementById('dSpitze').style.display='none'; }
      if(swA) document.getElementById('stage2Erreicht').style.display='none';
      // Buttons aktivieren nach gespeichertem Zustand
      if(calc.schneider) document.getElementById('dSchneider').classList.add('active');
      if(calc.schwarz)   document.getElementById('dSchwarz').classList.add('active');
      if(calc.spitze)    document.getElementById('dSpitze').classList.add('active');
    }
    if(calc.kontra)   { const el=document.getElementById('dKontra'); if(el) el.classList.add('active'); }
    if(calc.re)       { const el=document.getElementById('dRe');     if(el) el.classList.add('active'); }
    if(calc.bock)     { const el=document.getElementById('dBock');   if(el) el.classList.add('active'); }
    if(calc.verloren) {
      const el=document.getElementById('dVerloren'); if(el) el.classList.add('active');
      // sign aus savedCalc (bereits durch startEditRound gesetzt)
    }
  } else {
    // ── Normale Stage 1→2 Transition: alles zurücksetzen ──
    ['dSchneider','dSchwarz','dSpitze','dKontra','dRe','dBock','dVerloren'].forEach(id=>{
      const el=document.getElementById(id);
      if(el){ el.classList.remove('active'); el.style.display=''; }
    });
    // dSpitzeA (Stage-1-Button) ebenfalls explizit syncen – schützt vor dirty State
    const dSpitzeAEl=document.getElementById('dSpitzeA');
    if(dSpitzeAEl) dSpitzeAEl.classList.toggle('active', !!calc.spitzeA);

    calc.schneider=false; calc.schwarz=false; calc.spitze=false;
    calc.kontra=false; calc.re=false; calc.bock=false; calc.verloren=false;

    // Bock-Vorbelegung aus Queue (alle Typen außer RGH)
    if(!isRGH && isBockRunde){
      calc.bock=true;
      const bEl=document.getElementById('dBock');
      if(bEl) bEl.classList.add('active');
    }

    if(isFarbeGrand){
      const sA=calc.schneiderA, swA=calc.schwarzA;
      if(sA||swA){ calc.schneider=true; document.getElementById('dSchneider').classList.add('active'); }
      if(swA){ calc.schwarz=true; document.getElementById('dSchwarz').classList.add('active'); }
      document.getElementById('dSchneider').style.display=sA?'none':'';
      document.getElementById('dSchwarz').style.display=swA?'none':'';
      if(calc.spitzeA){
        calc.spitze=true;
        document.getElementById('dSpitze').classList.add('active');
        document.getElementById('dSpitze').style.display='none';
      }
      if(swA) document.getElementById('stage2Erreicht').style.display='none';
    }
  }

  refreshJackRow();
  syncFactor(); updateCalcResult(); updatePanelHeight();
}

function backToStage1(){
  if(editRoundIdx>=0){
    document.getElementById('stage2').style.display='none';
    document.getElementById('stage1').style.display='';
    updatePlayerBtns(); updatePanelHeight();
    return;
  }
  if(!hasOpenRound()) return;
  const r=state.rounds[openRoundIdx];
  const sc=r.savedCalc||{};
  calc={type:sc.type||'', farbeIdx:sc.farbeIdx||0, factor:sc.factor||2,
    nullVal:sc.nullVal||23, jackCount:sc.jackCount||1, jackDir:sc.jackDir||'mit',
    hand:sc.hand||false, schneider:false, schneiderA:sc.schneiderA||false,
    schwarz:false, schwarzA:sc.schwarzA||false, ouvert:sc.ouvert||false,
    spitze:false, spitzeA:sc.spitzeA||false,
    kontra:false, re:false, bock:false, jungfrau:sc.jungfrau||false,
    geschoben:sc.geschoben||0, verloren:false};
  selectedPlayers=[...r.players];
  document.getElementById('stage2').style.display='none';
  document.getElementById('stage1').style.display='';
  const suitType=sc.type==='farbe' ? ['karo','herz','pik','kreuz'][sc.farbeIdx||0] : sc.type;
  setType(suitType||'');
  updateAnsagenUI();
  updatePlayerBtns(); updateCalcUI(); updatePanelHeight();
}

function vormerken(){
  if(editRoundIdx>=0){
    showStage2(true);  // Edit: Stage-2-Werte aus calc beibehalten
    document.getElementById('addBtn').textContent=t('speichern');
    document.getElementById('addBtn').classList.add('edit-mode');
    document.getElementById('addBtn').style.display='';
    document.getElementById('addBtn').disabled=false;
    document.getElementById('addBtn').style.opacity='';
    document.getElementById('vormerkenBtn').style.display='none';
    updatePanelHeight();
    return;
  }
  const isRamschGH=calc.type==='rgh';
  const isLeer=calc.type==='leer';
  const aussetzer=state.has4 ? getAussetzer() : -1;
  const n=state.has4 ? 4 : 3;
  const typeKey=getTypeKey();
  const savedCalc={
    type:calc.type, farbeIdx:calc.farbeIdx, nullVal:calc.nullVal,
    nullHand:calc.nullHand||false, nullOuvert:calc.nullOuvert||false, nullRevol:calc.nullRevol||false,
    hand:calc.hand, schneider:calc.schneider, schneiderA:calc.schneiderA,
    schwarz:calc.schwarz, schwarzA:calc.schwarzA, ouvert:calc.ouvert,
    spitzeA:calc.spitzeA||false, geschoben:calc.geschoben, jungfrau:calc.jungfrau,
    jackCount:calc.jackCount, jackDir:calc.jackDir, factor:calc.factor
  };
  if(hasOpenRound()){
    const r=state.rounds[openRoundIdx];
    r.players=isLeer?[]:[...selectedPlayers];
    r.label=getShortLabel(); r.typeKey=typeKey;
    r.noPlayer=isLeer||selectedPlayers.length===0;
    r.isRamschGH=isRamschGH; r.savedCalc=savedCalc;
  } else {
    const newTotals=[...state.totals];
    while(newTotals.length<n) newTotals.push(0);
    const round={
      players:isLeer?[]:[...selectedPlayers],
      value:null, label:getShortLabel(), typeKey,
      noPlayer:isLeer||selectedPlayers.length===0,
      isRamschGH, aussetzer, totals:[...newTotals], open:true, savedCalc,
      queueBefore:[...state.queue]
    };
    openRoundIdx=state.rounds.length;
    state.rounds.push(round);
  }
  save();
  const sc2=state.rounds[openRoundIdx].savedCalc;
  selectedPlayers=[]; sign=1;
  calc={type:sc2.type, farbeIdx:sc2.farbeIdx, factor:sc2.factor, nullVal:sc2.nullVal,
    nullHand:sc2.nullHand||false, nullOuvert:sc2.nullOuvert||false, nullRevol:sc2.nullRevol||false,
    jackCount:1, jackDir:'mit', hand:sc2.hand, schneider:false, schneiderA:sc2.schneiderA,
    schwarz:false, schwarzA:sc2.schwarzA, ouvert:sc2.ouvert,
    spitze:false, spitzeA:false, kontra:false, re:false, bock:false,
    jungfrau:sc2.jungfrau, geschoben:sc2.geschoben, verloren:false};
  const suitType=sc2.type==='farbe' ? ['karo','herz','pik','kreuz'][sc2.farbeIdx] : sc2.type;
  panelOpen=true;
  document.getElementById('inputPanel').classList.add('open');
  renderAll();
  setType(suitType);
  refreshJackRow(); buildNullBtns();
  showStage2();
  updateCalcUI(); updatePlayerBtns(); updatePanelHeight();
  if(typeof updateQueueUI==='function') updateQueueUI();
}

function openRoundForEdit(idx){
  const r=state.rounds[idx];
  if(!r||!r.open) return;
  openRoundIdx=idx;
  const sc=r.savedCalc;
  calc={type:sc.type, farbeIdx:sc.farbeIdx, factor:sc.factor, nullVal:sc.nullVal,
    nullHand:sc.nullHand||false, nullOuvert:sc.nullOuvert||false, nullRevol:sc.nullRevol||false,
    jackCount:sc.jackCount||1, jackDir:sc.jackDir||'mit',
    hand:sc.hand, schneider:sc.schneider||false, schneiderA:sc.schneiderA,
    schwarz:sc.schwarz||false, schwarzA:sc.schwarzA, ouvert:sc.ouvert,
    spitzeA:sc.spitzeA||false,
    kontra:false, re:false, bock:false,
    jungfrau:sc.jungfrau, geschoben:sc.geschoben, verloren:false};
  selectedPlayers=[...r.players];
  sign=1; panelOpen=true;
  document.getElementById('inputPanel').classList.add('open');
  const suitType2=sc.type==='farbe' ? ['karo','herz','pik','kreuz'][sc.farbeIdx] : sc.type;
  setType(suitType2);
  refreshJackRow(); buildNullBtns();
  showStage2();
  updateCalcUI(); updatePlayerBtns(); updatePanelHeight();
}

// ===== RENDER =====
function renderAll(){
  updateHeaders(); renderTable(); updatePlayerBtns();
  document.getElementById('undoBtn').style.display=state.rounds.length>0?'flex':'none';
  if(openRoundIdx<0 && editRoundIdx<0){
    document.getElementById('stage1').style.display='';
    document.getElementById('stage2').style.display='none';
  }
  applyTranslations();
}

function setView(v){
  tableView=v;
  document.querySelectorAll('.view-tab').forEach(b=>b.classList.toggle('active', b.id==='tab-'+v));
  renderTable();
}

function updateHeaders(){
  const n=state.has4?4:3;
  const aussetzer=getAussetzer();
  for(let i=0;i<4;i++){
    const th=document.getElementById('th'+i);
    const show=i<n;
    th.style.display=show?'':'none';
    if(show&&!th.querySelector('.th-edit')){
      const name=state.names[i]||('Spieler '+(i+1));
      if(state.has4&&i===aussetzer){
        th.innerHTML=name+'<span class="th-aussetzer-badge">↪ '+t('aussetzt')+'</span>';
      } else {
        th.textContent=name;
      }
    }
    if(show) document.getElementById('pbtn'+i+'name').textContent=state.names[i]||('Spieler '+(i+1));
    document.getElementById('pbtn'+i).style.display=show?'':'none';
  }
  const setup=document.getElementById('player4Setup');
  const queueActive=state.queue&&state.queue.length>0;
  if(state.rounds.length===0&&!queueActive){
    if(!state.has4){
      setup.innerHTML=`<button onclick="add4thPlayer()" style="background:rgba(232,176,75,.15);border:1px dashed var(--accent);color:var(--accent);border-radius:8px;padding:8px 16px;font-family:'Source Code Pro',monospace;font-size:12px;cursor:pointer">+ ${t('vierterSpieler')}</button>`;
    } else {
      setup.innerHTML=`<button onclick="remove4thPlayer()" style="background:rgba(200,75,49,.1);border:1px dashed var(--accent2);color:var(--accent2);border-radius:8px;padding:8px 16px;font-family:'Source Code Pro',monospace;font-size:12px;cursor:pointer">✕ ${t('vierterSpielerLoeschen')}</button>`;
    }
  } else { setup.innerHTML=''; }
  initColDrag();
}

function add4thPlayer(){ state.has4=true; if(!state.names[3]) state.names[3]='Spieler 4'; if(state.totals.length<4) state.totals.push(0); save(); renderAll(); }
function remove4thPlayer(){ state.has4=false; save(); renderAll(); }

function renderTable(){
  const tbody=document.getElementById('tbody'), tfoot=document.getElementById('tfoot');
  const table=document.getElementById('scoreTable'), empty=document.getElementById('emptyState');
  const n=state.has4?4:3;
  const sepEvery=state.has4?4:3;
  document.getElementById('th3').style.display=state.has4?'':'none';
  table.style.display='table';
  const hasTabs=state.rounds.length>0;
  document.getElementById('viewTabs').style.display=hasTabs?'flex':'none';
  document.getElementById('tableWrap').classList.toggle('no-tabs',!hasTabs);
  const hasQueue=state.queue&&state.queue.length>0;
  if(state.rounds.length===0&&!hasQueue){
    empty.style.display='block';tbody.innerHTML='';tfoot.innerHTML='';return;
  }
  empty.style.display='none'; tbody.innerHTML='';
  // Wenn nur Queue, kein tfoot
  if(state.rounds.length===0&&hasQueue){
    state.queue.forEach((slot,qi)=>{
      const isBock=slot.type==='bock';
      const ghost=document.createElement('tr');
      ghost.className='ghost-row '+(isBock?'ghost-bock':'ghost-ramsch');
      let gc=`<td style="color:var(--muted);font-size:9px">${qi+1}</td>`;
      for(let i=0;i<n;i++) gc+=`<td><span style="color:var(--border)">·</span></td>`;
      gc+=`<td></td><td><span class="game-type-tag">${isBock?'🔔':'💀'}</span></td>`;
      ghost.innerHTML=gc; tbody.appendChild(ghost);
    });
    tfoot.innerHTML='';
    return;
  }
  let regCount=0;
  const runSF=new Array(n).fill(0), runBL=new Array(n).fill(0);
  state.rounds.forEach((r,idx)=>{
    if(!r.isRamschGH){
      if(regCount>0&&regCount%sepEvery===0){
        const sep=document.createElement('tr');sep.className='round-sep';
        sep.innerHTML=`<td colspan="${n+3}"></td>`;tbody.appendChild(sep);
      }
      regCount++;
    }
    const tr=document.createElement('tr');
    if(r.isRamschGH) tr.style.opacity='0.75';
    if(r.open){
      tr.classList.add('open-round'); tr.style.cursor='pointer';
      tr.title='Tippen zum Nachtragen'; tr.onclick=()=>openRoundForEdit(idx);
    } else if(!r.open&&r.value!==null&&r.value!==undefined){
      tr.classList.add('editable');
      if(editRoundIdx===idx) tr.classList.add('editing');
      addLongPress(tr,()=>startEditRound(idx));
    }
    let cells=`<td>${idx+1}</td>`;
    for(let i=0;i<n;i++){
      const isAussetzer=r.aussetzer===i;
      if(tableView==='std'){
        if(r.open===true)           cells+=`<td><span style="color:var(--border)">·</span></td>`;
        else if(isAussetzer)        cells+=`<td class="aussetzer-cell"><span style="font-size:9px;color:var(--muted)">—</span></td>`;
        else if(r.players.includes(i)){ const v=r.totals[i]||0,cls=v>0?'pos':v<0?'neg':'zero'; cells+=`<td><span class="score-val ${cls}">${v}</span></td>`; }
        else                        cells+=`<td><span style="color:var(--border)">·</span></td>`;
      } else if(tableView==='sf'){
        const d=sfDeltaForRound(r,i,n); runSF[i]+=d;
        const prevTotal=idx>0?(state.rounds[idx-1].totals[i]||0):0;
        const gameChanged=(r.totals[i]||0)!==prevTotal;
        if(d===0&&!gameChanged) cells+=`<td><span style="color:var(--border)">·</span></td>`;
        else { const v=(r.totals[i]||0)+runSF[i],cls=v>0?'pos':v<0?'neg':'zero'; cells+=`<td><span class="score-val ${cls}">${v}</span></td>`; }
      } else {
        const d=blDeltaForRound(r,i,n); runBL[i]+=d;
        if(d===0) cells+=`<td><span style="color:var(--border)">·</span></td>`;
        else { const v=runBL[i]; cells+=`<td><span class="score-val" style="color:var(--text)">${Math.abs(v)}</span></td>`; }
      }
    }
    const vc=r.value>0?'pos':r.value<0?'neg':'zero';
    const vs=r.open===true?'✏️':(r.noPlayer?'—':(r.value===0?'±0':r.value));
    cells+=`<td><span class="game-val ${r.open===true?'':r.noPlayer?'':vc}">${vs}</span></td>`;
    const labelStr=r.isRamschGH?'🃏 RGH':labelFromKeyShort(r);
    const suitIdx=['♦','♥','♠','♣'].findIndex(s=>labelStr.startsWith(s));
    const tagCls=suitIdx>=0?FARBEN_CLS[suitIdx]:'';
    const bockBadge=r.wasBock?'<span class="bock-badge">🔔</span>':'';
    cells+=`<td><span class="game-type-tag ${tagCls}">${labelStr}</span>${bockBadge}</td>`;
    tr.innerHTML=cells; tbody.appendChild(tr);
  });

  // Ghost rows für Queue
  const totalReal=state.rounds.length;
  state.queue.forEach((slot,qi)=>{
    const isBock=slot.type==='bock';
    const ghost=document.createElement('tr');
    ghost.className='ghost-row '+(isBock?'ghost-bock':'ghost-ramsch');
    let gc=`<td style="color:var(--muted);font-size:9px">${totalReal+qi+1}</td>`;
    for(let i=0;i<n;i++) gc+=`<td><span style="color:var(--border)">·</span></td>`;
    gc+=`<td></td><td><span class="game-type-tag">${isBock?'🔔':'💀'}</span></td>`;
    ghost.innerHTML=gc; tbody.appendChild(ghost);
  });

  tfoot.innerHTML='';
  const tr=document.createElement('tr');
  if(tableView!=='std') tr.classList.add('dimmed');
  let cells='<td>Σ</td>';
  for(let i=0;i<n;i++){const v=state.totals[i]||0,cls=v>0?'pos':v<0?'neg':'zero';cells+=`<td><span class="score-val ${cls}">${v}</span></td>`;}
  cells+='<td></td><td></td>'; tr.innerHTML=cells; tfoot.appendChild(tr);

  const sfTotals=computeSF();
  const trSF=document.createElement('tr');
  trSF.className='sf-row'+(tableView!=='sf'?' dimmed':'');
  let sfCells=`<td>${t('sf')}</td>`;
  for(let i=0;i<n;i++){
    const base=state.totals[i]||0, delta=sfTotals[i]||0, v=base+delta;
    const cls=v>0?'pos':v<0?'neg':'zero';
    const dsign=delta>=0?'':'-';
    sfCells+=`<td><span class="score-val ${cls}" style="font-size:12px">${v}</span><br><span style="font-size:8px;color:var(--muted)">${dsign}${Math.abs(delta)}</span></td>`;
  }
  sfCells+='<td></td><td></td>'; trSF.innerHTML=sfCells; tfoot.appendChild(trSF);

  const blTotals=computeBL();
  const trBL=document.createElement('tr');
  trBL.className='bl-row'+(tableView!=='bl'?' dimmed':'');
  let blCells='<td>BL</td>';
  for(let i=0;i<n;i++){const v=blTotals[i]||0; blCells+=`<td><span class="score-val" style="font-size:12px;color:var(--text)">${Math.abs(v)}</span></td>`;}
  blCells+='<td></td><td></td>'; trBL.innerHTML=blCells; tfoot.appendChild(trBL);

  if(moneySettings.rate>0){
    const trM=document.createElement('tr'); trM.className='money-row';
    const c=moneySettings.currency;
    let decimals;
    if(c==='Ct'){ decimals=0; } else { const s=moneySettings.rate.toString(); const dot=s.indexOf('.'); decimals=dot>=0?s.length-dot-1:0; }
    let mCells=`<td>${c}</td>`;
    for(let i=0;i<n;i++){
      let diff=0;
      for(let j=0;j<n;j++) if(j!==i) diff+=(state.totals[i]||0)-(state.totals[j]||0);
      const raw=(diff*moneySettings.rate).toFixed(decimals);
      const display=c==='$'?c+raw:raw+'\u202f'+c;
      const cls=diff>0?'pos':diff<0?'neg':'zero';
      mCells+=`<td><span class="score-val ${cls}" style="font-size:11px">${display}</span></td>`;
    }
    mCells+='<td></td><td></td>'; trM.innerHTML=mCells; tfoot.appendChild(trM);
  }
  setTimeout(()=>{ const w=document.getElementById('tableWrap'); w.scrollTop=w.scrollHeight; }, 60);
}

// ===== LONG PRESS =====
function handleTableWrapClick(e){
  if(editRoundIdx<0) return;
  cancelEditRound(); resetPanel(); renderAll();
}

function addLongPress(el, cb){
  let timer=null, moved=false, isTouchDevice=false;
  el.addEventListener('contextmenu', e=>{ e.preventDefault(); e.stopPropagation(); return false; });
  el.addEventListener('touchstart', e=>{ isTouchDevice=true; moved=false; timer=setTimeout(()=>{ if(!moved) cb(); }, 500); }, {passive:true});
  el.addEventListener('touchmove',  ()=>{ moved=true; if(timer){clearTimeout(timer);timer=null;} }, {passive:true});
  el.addEventListener('touchend',   ()=>{ if(timer){clearTimeout(timer);timer=null;} });
  el.addEventListener('touchcancel',()=>{ if(timer){clearTimeout(timer);timer=null;} });
  el.addEventListener('mousedown', e=>{ if(isTouchDevice||e.button!==0) return; moved=false; timer=setTimeout(()=>{ if(!moved) cb(); }, 500); });
  el.addEventListener('mousemove', ()=>{ moved=true; if(timer){clearTimeout(timer);timer=null;} });
  el.addEventListener('mouseup',   ()=>{ if(timer){clearTimeout(timer);timer=null;} });
  el.addEventListener('mouseleave',()=>{ if(timer){clearTimeout(timer);timer=null;} });
  el.addEventListener('dblclick',  e=>{ if(isTouchDevice) return; e.stopPropagation(); cb(); });
}

// ===== EDIT ROUND =====
function recomputeAllTotals(){
  const n=state.has4?4:3;
  let running=new Array(n).fill(0);
  state.rounds.forEach(r=>{
    if(r.open||r.noPlayer||r.value===null||r.value===undefined){ r.totals=[...running]; return; }
    r.players.forEach(i=>{ running[i]+=r.value; });
    r.totals=[...running];
  });
  state.totals=[...running];
}

function startEditRound(idx){
  if(editRoundIdx>=0) cancelEditRound();
  if(hasOpenRound()) return;
  const r=state.rounds[idx];
  if(!r||r.open) return;
  editRoundIdx=idx;
  const sc=r.savedCalc||{};
  calc={
    type:sc.type||'', farbeIdx:sc.farbeIdx||0, factor:sc.factor||2,
    nullVal:sc.nullVal||23,
    nullHand:sc.nullHand||false, nullOuvert:sc.nullOuvert||false, nullRevol:sc.nullRevol||false,
    jackCount:sc.jackCount||1, jackDir:sc.jackDir||'mit',
    hand:sc.hand||false, schneider:sc.schneider||false, schneiderA:sc.schneiderA||false,
    schwarz:sc.schwarz||false, schwarzA:sc.schwarzA||false, ouvert:sc.ouvert||false,
    spitze:sc.spitze||false, spitzeA:sc.spitzeA||false,
    kontra:sc.kontra||false, re:sc.re||false, bock:sc.bock||false,
    jungfrau:sc.jungfrau||false, geschoben:sc.geschoben||0, verloren:sc.verloren||false
  };
  selectedPlayers=[...(r.players||[])];
  sign=(r.value!==null&&r.value<0)?-1:1;
  panelOpen=true;
  document.getElementById('inputPanel').classList.add('open');
  const suitType=sc.type==='farbe'?['karo','herz','pik','kreuz'][sc.farbeIdx||0]:(sc.type||'');
  renderAll();
  const isRGHRound=r.isRamschGH, isRamschRound=r.wasRamsch;
  document.querySelectorAll('.type-btn').forEach(b=>{
    const tp=b.dataset.type;
    const blockedRGH=(isRGHRound&&tp!=='rgh')||(!isRGHRound&&tp==='rgh');
    const blockedRamsch=isRamschRound&&tp!=='ramsch'&&tp!=='rgh';
    b.disabled=blockedRGH||blockedRamsch;
    b.style.opacity=(blockedRGH||blockedRamsch)?'0.25':'';
  });
  setType(suitType);

  if(sc.type==='ramsch'){
    const ri=document.getElementById('ramschInput');
    if(ri){
      // Basiswert rekonstruieren: Gesamtwert durch alle Ramsch-Multiplikatoren dividieren
      let absVal=Math.abs(r.value);
      let m=Math.pow(2, sc.geschoben||0);
      if(sc.jungfrau) m*=2;
      if(sc.kontra)   m*=2;
      if(sc.re)       m*=2;
      if(sc.bock)     m*=2;
      if(sc.verloren) m*=2;
      const base=m>0?Math.round(absVal/m):absVal;
      ri.value=base||'';
    }
    // Ramsch-Durch wiederherstellen
    if(isDurchActive()){
      const ri2=document.getElementById('ramschInput');
      if(ri2){ ri2.value='120'; ri2.disabled=true; ri2.style.opacity='0.5'; }
    }
    // Geschoben-Stepper und Pips aktualisieren
    document.getElementById('geschobenVal').textContent=sc.geschoben||0;
    renderGeschobenPips();
    // Jungfrau-Button aktivieren
    const djBtn=document.getElementById('dJungfrau');
    if(djBtn) djBtn.classList.toggle('active', !!(sc.jungfrau));
    // Kontra/Re/Bock bei Ramsch (Stage-1-Buttons)
    const dBockR=document.getElementById('dBockRamsch');
    if(dBockR) dBockR.classList.toggle('active', !!(sc.bock));
  }

  refreshJackRow(); buildNullBtns();

  // Edit öffnet immer direkt in Stage 2 (mit wiederhergestellten Werten)
  // Ausnahme: Ramsch und Leer bleiben in Stage 1
  const isDirectStage1=sc.type==='ramsch'||sc.type==='leer';
  if(isDirectStage1){
    document.getElementById('stage1').style.display='';
    document.getElementById('stage2').style.display='none';
  } else {
    showStage2(true);  // true = Stage-2-Werte aus calc wiederherstellen
  }

  updateAnsagenUI();
  document.getElementById('addBtn').textContent=t('speichern');
  document.getElementById('addBtn').classList.add('edit-mode');
  document.getElementById('addBtn').style.display='';
  document.getElementById('addBtn').disabled=false;
  document.getElementById('addBtn').style.opacity='';
  document.getElementById('vormerkenBtn').style.display='none';
  updateCalcUI(); updatePlayerBtns(); updateAnsagenUI(); updatePanelHeight();
  renderTable();
}

function cancelEditRound(){
  editRoundIdx=-1;
  document.getElementById('addBtn').textContent=t('eintragen');
  document.getElementById('addBtn').classList.remove('edit-mode');
  document.querySelectorAll('.type-btn').forEach(b=>{ b.disabled=false; b.style.opacity=''; });
  renderTable();
}

function saveEditRound(){
  if(editRoundIdx<0) return;
  const idx=editRoundIdx;
  const r=state.rounds[idx];
  const isLeer=calc.type==='leer';
  const isRamschGH=calc.type==='rgh';
  r.players=isLeer?[]:[...selectedPlayers];
  r.noPlayer=isLeer||selectedPlayers.length===0;
  r.value=isLeer?0:(selectedPlayers.length>0?getFinalValue():0);
  r.label=getShortLabel()||r.label;
  r.typeKey=getTypeKey();
  r.isRamschGH=isRamschGH;
  r.savedCalc={
    type:calc.type, farbeIdx:calc.farbeIdx, nullVal:calc.nullVal,
    nullHand:calc.nullHand||false, nullOuvert:calc.nullOuvert||false, nullRevol:calc.nullRevol||false,
    hand:calc.hand, schneider:calc.schneider, schneiderA:calc.schneiderA,
    schwarz:calc.schwarz, schwarzA:calc.schwarzA, ouvert:calc.ouvert,
    spitze:calc.spitze, spitzeA:calc.spitzeA, kontra:calc.kontra, re:calc.re, bock:calc.bock,
    geschoben:calc.geschoben, jungfrau:calc.jungfrau,
    jackCount:calc.jackCount, jackDir:calc.jackDir, factor:calc.factor, verloren:calc.verloren
  };
  recomputeAllTotals();
  editRoundIdx=-1;
  document.querySelectorAll('.type-btn').forEach(b=>{ b.disabled=false; b.style.opacity=''; });
  save();
  resetPanel();
  document.getElementById('addBtn').textContent=t('eintragen');
  document.getElementById('addBtn').classList.remove('edit-mode');
  renderAll();
}

// ===== NAME EDIT =====
function editName(i){
  const th=document.getElementById('th'+i);
  if(th.querySelector('.th-edit')) return;
  const cur=state.names[i];
  th.innerHTML=`<input class="th-edit" id="th-edit-${i}" value="${cur}" maxlength="12">`;
  const inp=document.getElementById('th-edit-'+i);
  inp.focus(); inp.select();
  let committed=false;
  function commit(){
    if(committed) return; committed=true;
    const val=inp.value.trim()||('Spieler '+(i+1));
    state.names[i]=val; save();
    th.textContent=val;
    updatePlayerBtns();
  }
  inp.addEventListener('blur', commit);
  inp.addEventListener('keydown', e=>{
    if(e.key==='Enter'){ e.preventDefault(); inp.blur(); }
    if(e.key==='Escape'){ committed=true; th.textContent=cur; }
  });
}

// ===== COLUMN DRAG & DROP =====
let colDragState = null;

function initColDrag(){
  for(let i = 0; i < 4; i++){
    const th = document.getElementById('th'+i);
    if(!th || th.dataset.dragInit) continue;
    th.dataset.dragInit = '1';
    th.addEventListener('contextmenu', e => e.preventDefault());
    _bindColDrag(th, i);
  }
}

function _bindColDrag(th, idx){
  let timer = null, isTouchEvt = false;

  th.addEventListener('touchstart', e => {
    isTouchEvt = true;
    const startX = e.touches[0].clientX, startY = e.touches[0].clientY;
    function onMove(ev){
      const dx = ev.touches[0].clientX - startX, dy = ev.touches[0].clientY - startY;
      if(Math.abs(dx) > 8 || Math.abs(dy) > 8){ clearTimeout(timer); timer = null; th.removeEventListener('touchmove', onMove); }
    }
    th.addEventListener('touchmove', onMove, {passive:true});
    timer = setTimeout(() => {
      th.removeEventListener('touchmove', onMove);
      timer = null;
      _beginColDrag(idx, startX, startY);
    }, 480);
  }, {passive:true});

  th.addEventListener('touchend',    () => { if(timer){ clearTimeout(timer); timer = null; } });
  th.addEventListener('touchcancel', () => { if(timer){ clearTimeout(timer); timer = null; } });

  // Mouse (Desktop)
  th.addEventListener('mousedown', e => {
    if(isTouchEvt || e.button !== 0) return;
    timer = setTimeout(() => {
      timer = null;
      _beginColDrag(idx, e.clientX, e.clientY);
      const onMM = e2 => _updateColDrag(e2.clientX, e2.clientY);
      const onMU = ()  => {
        _endColDrag();
        document.removeEventListener('mousemove', onMM);
        document.removeEventListener('mouseup',   onMU);
      };
      document.addEventListener('mousemove', onMM);
      document.addEventListener('mouseup',   onMU);
    }, 480);
  });
  th.addEventListener('mouseup',    () => { if(timer){ clearTimeout(timer); timer = null; } });
  th.addEventListener('mouseleave', () => { if(timer){ clearTimeout(timer); timer = null; } });
}

function _beginColDrag(idx, x, y){
  colDragState = { from: idx, to: idx };
  document.getElementById('th'+idx).classList.add('col-drag-source');
  try{ if(navigator.vibrate) navigator.vibrate(40); }catch(e){}
  const ghost = document.createElement('div');
  ghost.id = 'colDragGhost';
  ghost.className = 'col-drag-ghost';
  ghost.textContent = state.names[idx] || ('Spieler '+(idx+1));
  document.body.appendChild(ghost);
  _moveGhost(x, y);
  document.addEventListener('touchmove',   _onDragMove,   {passive: false});
  document.addEventListener('touchend',    _onDragEnd,    {passive: true});
  document.addEventListener('touchcancel', _onDragEnd,    {passive: true});
}

function _onDragMove(e){
  e.preventDefault();
  _updateColDrag(e.touches[0].clientX, e.touches[0].clientY);
}
function _onDragEnd(){
  document.removeEventListener('touchmove',   _onDragMove);
  document.removeEventListener('touchend',    _onDragEnd);
  document.removeEventListener('touchcancel', _onDragEnd);
  _endColDrag();
}

function _moveGhost(x, y){
  const g = document.getElementById('colDragGhost');
  if(g){ g.style.left = x+'px'; g.style.top = y+'px'; }
}

function _updateColDrag(x, y){
  if(!colDragState) return;
  _moveGhost(x, y);
  const ghost = document.getElementById('colDragGhost');
  if(ghost) ghost.style.pointerEvents = 'none';
  const el = document.elementFromPoint(x, y);
  if(ghost) ghost.style.pointerEvents = '';
  const n = state.has4 ? 4 : 3;
  let newTo = colDragState.to;
  for(let i = 0; i < n; i++){
    const th = document.getElementById('th'+i);
    if(th && (th === el || th.contains(el))){ newTo = i; break; }
  }
  if(newTo !== colDragState.to){
    document.querySelectorAll('.col-drag-target').forEach(e => e.classList.remove('col-drag-target'));
    if(newTo !== colDragState.from) document.getElementById('th'+newTo).classList.add('col-drag-target');
    colDragState.to = newTo;
  }
}

function _endColDrag(){
  if(!colDragState) return;
  const { from, to } = colDragState;
  colDragState = null;
  document.querySelectorAll('.col-drag-source,.col-drag-target').forEach(e => {
    e.classList.remove('col-drag-source','col-drag-target');
  });
  const ghost = document.getElementById('colDragGhost');
  if(ghost) ghost.remove();
  if(from !== to) swapPlayers(from, to);
}
