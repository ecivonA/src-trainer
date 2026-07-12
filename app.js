'use strict';

/* ---------- Persistenz ---------- */
const STORAGE_KEY_OLD = 'src_trainer_progress_v2'; // numerische IDs (bis v13)
const STORAGE_KEY = 'src_trainer_progress_v3';     // String-IDs ("SRC-042" usw., ab v14)

// Rechnet eine alte numerische ID in die neue String-ID um (gleiche Formel wie beim
// einmaligen Umbau von data.js/explanations.js). Gibt null zurück, falls kein gültiges
// altes Format (z.B. wenn schon migriert wurde).
function migrateOldId(oldIdRaw) {
  const oldId = Number(oldIdRaw);
  if (!Number.isInteger(oldId)) return null;
  if (oldId >= 1 && oldId <= 180) return 'SRC-' + String(oldId).padStart(3, '0');
  if (oldId >= 1001 && oldId <= 1076) return 'LRC-' + String(oldId - 1000).padStart(3, '0');
  if (oldId >= 1077 && oldId <= 1206) return 'UBI-' + String(oldId - 1076).padStart(3, '0');
  return null;
}

function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* fällt durch auf Migration */ }

  // Kein neuer Fortschritt vorhanden — versuchen, alten (numerische IDs) zu übernehmen.
  try {
    const oldRaw = localStorage.getItem(STORAGE_KEY_OLD);
    if (!oldRaw) return {};
    const oldProgress = JSON.parse(oldRaw);
    const migrated = {};
    for (const [oldId, entry] of Object.entries(oldProgress)) {
      const newId = migrateOldId(oldId);
      if (newId) migrated[newId] = entry;
    }
    saveProgress(migrated); // gleich unter dem neuen Key sichern, damit's nur einmal passiert
    return migrated;
  } catch (e) {
    return {};
  }
}

function saveProgress(p) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch (e) {}
}

let progress = loadProgress();

function getEntry(id) { return progress[id] || { streak: 0 }; }
function isUnsicher(id) { return getEntry(id).streak < 2; }

function markCorrect(id) {
  const e = getEntry(id);
  e.streak = Math.min(e.streak + 1, 2);
  progress[id] = e;
  saveProgress(progress);
}

function markWrongOrUnknown(id) {
  progress[id] = { streak: 0 };
  saveProgress(progress);
}

function resetAllProgress() {
  progress = {};
  saveProgress(progress);
  examResults = {};
  saveExamResults(examResults);
}

/* ---------- Prüfungsmodus: Ergebnis-Speicher ---------- */
const EXAM_RESULTS_KEY = 'src_trainer_exam_results_v1';
const EXAM_GROUP_LABEL = { SRC: 'SRC', LRC: 'LRC', UBI: 'UBI', UBI_ERG: '+UBI' };

function loadExamResults() {
  try {
    const raw = localStorage.getItem(EXAM_RESULTS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) { return {}; }
}
function saveExamResults(r) {
  try { localStorage.setItem(EXAM_RESULTS_KEY, JSON.stringify(r)); } catch (e) {}
}
let examResults = loadExamResults();

function examGroupsForFilter(certFilter) {
  if (certFilter === 'SRC') return ['SRC'];
  if (certFilter === 'LRC') return ['LRC'];
  if (certFilter === 'UBI') return ['UBI'];
  if (certFilter === '+UBI') return ['UBI_ERG'];
  return ['SRC', 'LRC', 'UBI', 'UBI_ERG'];
}

/* ---------- Hilfs ---------- */
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function questionsForCats(catKeys) {
  return QUESTIONS.filter(q => catKeys.includes(q.cat));
}

function certCats(cert) {
  return Object.keys(CATEGORIES).filter(k => CATEGORIES[k].cert === cert);
}

function questionsForErgaenzung() {
  return QUESTIONS.filter(q => q.e === 1);
}

function statsForErgaenzung() {
  const qs = questionsForErgaenzung();
  const mastered = qs.filter(q => !isUnsicher(q.id)).length;
  const half = qs.filter(q => getEntry(q.id).streak === 1).length;
  return { total: qs.length, mastered, half, unsicher: qs.length - mastered };
}

function statsFor(catKeys) {
  const qs = questionsForCats(catKeys);
  const mastered = qs.filter(q => !isUnsicher(q.id)).length;
  const half = qs.filter(q => getEntry(q.id).streak === 1).length;
  return { total: qs.length, mastered, half, unsicher: qs.length - mastered };
}

/* ---------- App State ---------- */
const state = {
  screen: 'select',       // 'select' | 'quiz' | 'summary' | 'examSummary'
  mode: 'practice',       // 'practice' | 'exam'
  certFilter: 'SRC',      // 'SRC' | 'LRC' | 'UBI' | '+UBI' | 'ALL'
  selectedCats: certCats('SRC'),
  filterMode: 'unsicher', // 'unsicher' | 'alle'
  queue: [],
  currentIndex: 0,
  currentShuffledOptions: [],
  currentCorrectText: '',
  selectedWrongText: null,
  answered: false,
  sessionResults: { correct: 0, wrong: 0, dontknow: 0 },
  givenAnswers: {},      // id → { text, correct, shuffled } — für Review-Modus
  frontier: 0,           // höchster bisher erreichter Index
  autoAdvanceTimer: null,
  freshlyAnswered: false, // true = Antwort gerade eben live gegeben (noch nicht via Zurück/Weiter navigiert)

  // Prüfungsmodus
  examGroup: null,        // 'SRC' | 'LRC' | 'UBI' | 'UBI_ERG'
  examBogenN: null,
  examAnswers: {},         // id -> gewählter Text (frei änderbar, keine Auswertung bis Abgabe)
  examShuffled: {},        // id -> gemischte Optionen (pro Frage einmal gemischt, bleibt stabil beim Blättern)
  examTimeLimitSec: 0,
  examStartedAt: 0,
  examTimerInterval: null,
  examResult: null,        // nach Abgabe: {group, n, passed, correct, wrong, total, timedOut, elapsedSec, perQuestion}
  examExpanded: new Set(), // welche Fragen in der Auswertung aufgeklappt sind
};

/* ---------- Render-Dispatcher ---------- */
const root = document.getElementById('app');
function render() {
  if (state.screen === 'select') renderSelect();
  else if (state.screen === 'quiz') { if (state.mode === 'exam') renderExamQuiz(); else renderQuiz(); }
  else if (state.screen === 'summary') renderSummary();
  else if (state.screen === 'examSummary') renderExamSummary();
}

/* ---------- SELECT ---------- */
const CERT_TAB_ORDER = ['SRC', 'LRC', 'UBI', '+UBI', 'ALL'];

function selectedCatsForCertFilter(filter) {
  if (filter === 'SRC') return certCats('SRC');
  if (filter === 'LRC') return certCats('LRC');
  if (filter === 'UBI' || filter === '+UBI') return certCats('UBI');
  return [...certCats('SRC'), ...certCats('LRC'), ...certCats('UBI')];
}

function certContentHtml() {
  const srcCats = certCats('SRC');
  const lrcCats = certCats('LRC');
  const ubiCats = certCats('UBI');

  function catRows(cats, ergOnly = false) {
    return cats.map(key => {
      const cat = CATEGORIES[key];
      const allQs = QUESTIONS.filter(q => q.cat === key);
      const qs = ergOnly ? allQs.filter(q => q.e === 1) : allQs;
      if (ergOnly && qs.length === 0) return '';
      const mastered = qs.filter(q => !isUnsicher(q.id)).length;
      const half = qs.filter(q => getEntry(q.id).streak === 1).length;
      const s = { total: qs.length, mastered, half };
      const checked = state.selectedCats.includes(key) ? 'checked' : '';
      const pctMastered = s.total ? Math.round(s.mastered / s.total * 100) : 0;
      const pctSeen     = s.total ? Math.round((s.mastered + s.half) / s.total * 100) : 0;
      return `
        <div class="cat-row">
          <label class="cat-check-wrap" title="Auswählen">
            <input type="checkbox" data-cat="${key}" ${checked} />
            <span class="cat-check-box"></span>
          </label>
          <button class="cat-title-btn" data-quickstart="${key}">
            <span class="cat-title">${escapeHtml(cat.title)}</span>
            <span class="cat-meta">${s.mastered}/${s.total}</span>
            <span class="cat-bar">
              <span class="cat-bar-half" style="width:${pctSeen}%"></span>
              <span class="cat-bar-fill" style="width:${pctMastered}%"></span>
            </span>
          </button>
        </div>`;
    }).join('');
  }

  function examBogenRows(group) {
    const meta = EXAM_META[group];
    const passNeeded = meta.count - meta.maxWrong; // Mindestanzahl richtiger Antworten
    const tickPct = Math.round(passNeeded / meta.count * 100);
    return EXAMS[group].map(bogen => {
      const qs = bogen.qs;
      const mastered = qs.filter(id => !isUnsicher(id)).length;
      const half = qs.filter(id => getEntry(id).streak === 1).length;
      const pctMastered = Math.round(mastered / qs.length * 100);
      const pctSeen = Math.round((mastered + half) / qs.length * 100);
      const resultKey = `${group}-${bogen.n}`;
      const result = examResults[resultKey];
      const passedClass = result && result.passed ? 'exam-row-passed' : '';
      return `
        <button class="cat-title-btn exam-bogen-row ${passedClass}" data-exam-group="${group}" data-exam-n="${bogen.n}">
          <span class="cat-title">Prüfbogen ${bogen.n}${result ? (result.passed ? ' ✓' : ' ✗') : ''}</span>
          <span class="cat-meta">${mastered}/${qs.length}</span>
          <span class="cat-bar">
            <span class="cat-bar-half" style="width:${pctSeen}%"></span>
            <span class="cat-bar-fill" style="width:${pctMastered}%"></span>
            <span class="cat-bar-tick" style="left:${tickPct}%" title="Mindestens ${passNeeded}/${qs.length} richtig zum Bestehen"></span>
          </span>
        </button>`;
    }).join('');
  }

  const selStats = state.certFilter === '+UBI' ? statsForErgaenzung() : statsFor(state.selectedCats);
  const poolCount = state.filterMode === 'unsicher' ? selStats.unsicher : selStats.total;

  if (state.mode === 'practice') {
    return `
    <section class="panel">
      <h2>Kategorien</h2>
      ${(state.certFilter === 'SRC' || state.certFilter === 'ALL') ? `
        ${state.certFilter === 'ALL' ? '<p class="cert-label cert-src">SRC</p>' : ''}
        <div class="cat-list">${catRows(srcCats)}</div>` : ''}
      ${(state.certFilter === 'LRC' || state.certFilter === 'ALL') ? `
        ${state.certFilter === 'ALL' ? '<p class="cert-label cert-lrc">LRC</p>' : ''}
        <div class="cat-list">${catRows(lrcCats)}</div>` : ''}
      ${(state.certFilter === 'UBI' || state.certFilter === 'ALL') ? `
        ${state.certFilter === 'ALL' ? '<p class="cert-label cert-ubi">UBI</p>' : ''}
        <div class="cat-list">${catRows(ubiCats)}</div>` : ''}
      ${state.certFilter === '+UBI' ? `
        <p class="erg-hint">Ergänzungsprüfung SRC→UBI: 79 Fragen aus dem UBI-Katalog.<br>Fortschritt wird mit dem UBI-Tab geteilt.</p>
        <div class="cat-list">${catRows(ubiCats, true)}</div>` : ''}
      <div class="cat-actions">
        <button id="selAll" class="btn-link">Alle auswählen</button>
        <button id="selNone" class="btn-link">Keine</button>
      </div>
    </section>

    <section class="panel">
      <h2>Fragenauswahl</h2>
      <div class="filter-toggle">
        <label class="radio-row">
          <input type="radio" name="filterMode" value="unsicher" ${state.filterMode==='unsicher'?'checked':''} />
          Nur unsichere Fragen (noch nicht 2× richtig)
        </label>
        <label class="radio-row">
          <input type="radio" name="filterMode" value="alle" ${state.filterMode==='alle'?'checked':''} />
          Alle Fragen der Auswahl
        </label>
      </div>
      <p class="pool-info">${poolCount} Frage${poolCount===1?'':'n'} in dieser Runde</p>
    </section>

    <section class="panel actions">
      <button id="startBtn" class="btn-primary" ${poolCount===0?'disabled':''}>Lernrunde starten</button>
      <button id="resetBtn" class="btn-danger-link">Gesamten Fortschritt zurücksetzen</button>
    </section>`;
  }

  return `
    <section class="panel">
      <h2>Prüfbögen</h2>
      ${examGroupsForFilter(state.certFilter).map(group => `
        ${state.certFilter === 'ALL' ? `<p class="cert-label cert-${EXAM_GROUP_LABEL[group].toLowerCase().replace('+','')}">${EXAM_GROUP_LABEL[group]}</p>` : ''}
        <div class="cat-list">${examBogenRows(group)}</div>
      `).join('')}
    </section>

    <section class="panel actions">
      <button id="resetBtn" class="btn-danger-link">Gesamten Fortschritt zurücksetzen</button>
    </section>`;
}

function bindCertContentListeners() {
  // Kategorie-Checkboxen
  root.querySelectorAll('input[data-cat]').forEach(cb => {
    cb.addEventListener('change', e => {
      const key = e.target.getAttribute('data-cat');
      if (e.target.checked) {
        if (!state.selectedCats.includes(key)) state.selectedCats.push(key);
      } else {
        state.selectedCats = state.selectedCats.filter(k => k !== key);
      }
      updateCertContentInPlace();
    });
  });

  // Schnellstart per Klick auf Kategorie-Titel (nicht die Prüfbogen-Zeilen, die haben kein data-quickstart)
  root.querySelectorAll('.cat-title-btn[data-quickstart]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-quickstart');
      startSession(key);
    });
  });

  // Prüfbogen-Zeilen (Prüfungsmodus): Klick startet direkt die Prüfungssimulation
  root.querySelectorAll('.exam-bogen-row').forEach(btn => {
    btn.addEventListener('click', () => {
      const group = btn.getAttribute('data-exam-group');
      const n = parseInt(btn.getAttribute('data-exam-n'), 10);
      startExam(group, n);
    });
  });

  // Filter-Modus
  root.querySelectorAll('input[name="filterMode"]').forEach(r => {
    r.addEventListener('change', e => { state.filterMode = e.target.value; updateCertContentInPlace(); });
  });

  // Alle / Keine
  document.getElementById('selAll')?.addEventListener('click', () => {
    state.selectedCats = selectedCatsForCertFilter(state.certFilter === '+UBI' ? 'UBI' : state.certFilter);
    updateCertContentInPlace();
  });
  document.getElementById('selNone')?.addEventListener('click', () => {
    state.selectedCats = []; updateCertContentInPlace();
  });

  document.getElementById('startBtn')?.addEventListener('click', () => startSession());
  document.getElementById('resetBtn')?.addEventListener('click', () => {
    if (confirm('Wirklich den gesamten Lernfortschritt löschen (inkl. Prüfungsergebnisse)?')) {
      resetAllProgress(); render();
    }
  });
}

// Aktualisiert nur den Inhalt unterhalb der Zertifikat-Tabs (Kategorien/Prüfbögen), ohne die
// Tab-Leiste selbst neu aufzubauen — wichtig, damit eine laufende Streich-Geste über die Tabs
// (siehe attachCertTabDragPreview) nicht durch einen kompletten Re-Render unterbrochen wird.
function updateCertContentInPlace() {
  const area = document.getElementById('certSwipeArea');
  if (!area) { render(); return; }
  area.innerHTML = certContentHtml();
  bindCertContentListeners();
}

function updateCertTabsActiveUI() {
  root.querySelectorAll('.cert-tab').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-cert') === state.certFilter);
  });
}

function applyCertFilter(newFilter) {
  if (state.certFilter === newFilter) return;
  state.certFilter = newFilter;
  state.selectedCats = selectedCatsForCertFilter(newFilter);
  updateCertTabsActiveUI();
  updateCertContentInPlace();
}

// Streichen über die Zertifikat-Buttons selbst: die Auswahl folgt live dem Finger/der Maus,
// wechselt also schon beim Drüberstreichen um, nicht erst beim Loslassen.
function attachCertTabDragPreview(barEl) {
  if (!barEl) return;
  let dragging = false;

  barEl.addEventListener('pointerdown', () => { dragging = true; });

  barEl.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const atPoint = document.elementFromPoint(e.clientX, e.clientY);
    const tabBtn = atPoint ? atPoint.closest('.cert-tab') : null;
    if (tabBtn) applyCertFilter(tabBtn.getAttribute('data-cert'));
  });

  function endDrag() { dragging = false; }
  barEl.addEventListener('pointerup', endDrag);
  barEl.addEventListener('pointercancel', endDrag);
  barEl.addEventListener('pointerleave', endDrag);
}

function renderSelect() {
  const srcCats = certCats('SRC');
  const lrcCats = certCats('LRC');
  const ubiCats = certCats('UBI');
  const srcStats = statsFor(srcCats);
  const lrcStats = statsFor(lrcCats);
  const ubiStats = statsFor(ubiCats);
  const ergStats = statsForErgaenzung();
  const allStats = statsFor([...srcCats, ...lrcCats, ...ubiCats]);

  root.innerHTML = `
    <header class="header">
      <h1>Funkzeugnis Trainer</h1>
      <p class="sub">Gesamt: ${allStats.mastered}/${allStats.total} sicher &nbsp;·&nbsp;
        SRC ${srcStats.mastered}/${srcStats.total} &nbsp;·&nbsp;
        LRC ${lrcStats.mastered}/${lrcStats.total} &nbsp;·&nbsp;
        UBI ${ubiStats.mastered}/${ubiStats.total} &nbsp;·&nbsp;
        +UBI ${ergStats.mastered}/${ergStats.total}</p>
    </header>

    <section class="panel">
      <div class="mode-toggle">
        <button class="mode-toggle-btn ${state.mode==='practice'?'active':''}" data-mode="practice">Üben</button>
        <button class="mode-toggle-btn ${state.mode==='exam'?'active':''}" data-mode="exam">Prüfen</button>
      </div>
    </section>

    <section class="panel">
      <h2>Zertifikat</h2>
      <div class="cert-tabs" id="certTabsBar">
        <button class="cert-tab ${state.certFilter==='SRC'?'active':''}" data-cert="SRC">SRC</button>
        <button class="cert-tab ${state.certFilter==='LRC'?'active':''}" data-cert="LRC">LRC</button>
        <button class="cert-tab ${state.certFilter==='UBI'?'active':''}" data-cert="UBI">UBI</button>
        <button class="cert-tab ${state.certFilter==='+UBI'?'active':''}" data-cert="+UBI">+UBI</button>
        <button class="cert-tab ${state.certFilter==='ALL'?'active':''}" data-cert="ALL">Alle</button>
      </div>
    </section>

    <div id="certSwipeViewport" class="quiz-swipe-viewport">
      <div id="certSwipeArea" class="quiz-swipe-area">${certContentHtml()}</div>
    </div>
  `;

  // Zertifikat-Tabs: normaler Klick wählt direkt
  root.querySelectorAll('.cert-tab').forEach(btn => {
    btn.addEventListener('click', () => applyCertFilter(btn.getAttribute('data-cert')));
  });
  // ...und Streichen über die Tab-Leiste wählt schon live beim Drüberfahren (Maus oder Finger)
  attachCertTabDragPreview(document.getElementById('certTabsBar'));

  bindCertContentListeners();

  // Wischen über den Inhalt wechselt zum nächsten/vorherigen Zertifikat-Tab
  attachSwipeHandlers(document.getElementById('certSwipeArea'), {
    canForward: () => CERT_TAB_ORDER.indexOf(state.certFilter) < CERT_TAB_ORDER.length - 1,
    canBackward: () => CERT_TAB_ORDER.indexOf(state.certFilter) > 0,
    onValidSwipe: (forward, el) => {
      runSlideTransition(el, forward, 'quiz-swipe-area', () => {
        const idx = CERT_TAB_ORDER.indexOf(state.certFilter);
        state.certFilter = CERT_TAB_ORDER[idx + (forward ? 1 : -1)];
        state.selectedCats = selectedCatsForCertFilter(state.certFilter);
        updateCertTabsActiveUI();
      }, certContentHtml);
    },
  });

  // Üben/Prüfen-Umschalter
  root.querySelectorAll('.mode-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.mode = btn.getAttribute('data-mode');
      render();
    });
  });
}

/* ---------- Prüfungssimulation ---------- */
function startExam(group, n) {
  const bogen = EXAMS[group].find(b => b.n === n);
  if (!bogen) return;
  const meta = EXAM_META[group];

  state.mode = 'exam';
  state.examGroup = group;
  state.examBogenN = n;
  state.queue = bogen.qs.slice(); // Original-Reihenfolge des Prüfbogens, nicht gemischt
  state.currentIndex = 0;
  state.examAnswers = {};
  state.examShuffled = {};
  state.examResult = null;
  state.examExpanded = new Set();
  state.examTimeLimitSec = meta.time * 60;
  state.examStartedAt = Date.now();
  state.screen = 'quiz';

  if (state.examTimerInterval) clearInterval(state.examTimerInterval);
  state.examTimerInterval = setInterval(tickExamTimer, 1000);

  render();
}

function tickExamTimer() {
  const remaining = state.examTimeLimitSec - Math.floor((Date.now() - state.examStartedAt) / 1000);
  if (remaining <= 0) {
    clearInterval(state.examTimerInterval);
    state.examTimerInterval = null;
    submitExam(true);
    return;
  }
  const el = document.getElementById('examTimerDisplay');
  if (el) el.textContent = formatExamTime(remaining);
}

function formatExamTime(totalSeconds) {
  const s = Math.max(0, totalSeconds);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function submitExam(timedOut) {
  if (state.examTimerInterval) { clearInterval(state.examTimerInterval); state.examTimerInterval = null; }

  const group = state.examGroup;
  const n = state.examBogenN;
  const meta = EXAM_META[group];
  const ids = state.queue;

  let correctCount = 0;
  const perQuestion = ids.map(id => {
    const q = QUESTIONS.find(x => x.id === id);
    const given = state.examAnswers[id] ?? null;
    const isCorrect = given === q.o[0];
    if (isCorrect) { correctCount++; markCorrect(id); } else { markWrongOrUnknown(id); }
    return { id, given, correctText: q.o[0], isCorrect };
  });

  const wrongCount = ids.length - correctCount;
  const passed = wrongCount <= meta.maxWrong;
  const elapsedSec = Math.min(meta.time * 60, Math.round((Date.now() - state.examStartedAt) / 1000));

  examResults[`${group}-${n}`] = {
    passed, correct: correctCount, wrong: wrongCount, at: new Date().toISOString(),
  };
  saveExamResults(examResults);

  state.examResult = { group, n, passed, correct: correctCount, wrong: wrongCount, total: ids.length, timedOut, elapsedSec, perQuestion };
  state.screen = 'examSummary';
  render();
}


/* ---------- Prüfungs-Quiz-Screen ---------- */
function renderExamQuestionPanelInner() {
  const id = state.queue[state.currentIndex];
  const q = QUESTIONS.find(x => x.id === id);
  if (!state.examShuffled[id]) state.examShuffled[id] = shuffle(q.o);
  const opts = state.examShuffled[id];
  const given = state.examAnswers[id];

  const optHtml = opts.map((opt, i) => {
    const selected = given === opt ? ' selected' : '';
    return `<button class="option exam-option${selected}" data-idx="${i}">${escapeHtml(opt)}</button>`;
  }).join('');

  return `
      <section class="panel question-panel">
        <p class="question-id">${displayNumber(q)}</p>
        <h2 class="question-text">${escapeHtml(q.q)}</h2>
        <div class="options">${optHtml}</div>
      </section>`;
}

function renderExamQuiz() {
  const group = state.examGroup;
  const total = state.queue.length;
  const pos = state.currentIndex + 1;
  const isLast = pos >= total;
  const label = EXAM_GROUP_LABEL[group];

  const remaining = state.examTimeLimitSec - Math.floor((Date.now() - state.examStartedAt) / 1000);

  root.innerHTML = `
    <header class="header quiz-header">
      <button id="examExitBtn" class="btn-link">&larr; Auswahl</button>
      <span class="cert-badge cert-${label.toLowerCase().replace('+','')}">${label} · Bogen ${state.examBogenN}</span>
      <p class="progress-text">${pos} / ${total}</p>
    </header>
    <div class="progress-bar"><div class="progress-bar-fill" style="width:${(pos-1)/total*100}%"></div></div>

    <div class="exam-timer-row">
      <span class="exam-timer">⏱ <span id="examTimerDisplay">${formatExamTime(remaining)}</span></span>
      <button id="examSubmitEarlyBtn" class="btn-link">Prüfung jetzt abgeben</button>
    </div>

    <div id="examSwipeViewport" class="quiz-swipe-viewport">
      <div id="examSwipeArea" class="quiz-swipe-area">${renderExamQuestionPanelInner()}</div>
    </div>

    <section class="panel actions quiz-actions">
      ${state.currentIndex > 0 ? `<button id="examPrevBtn" class="btn-secondary action-back">← Zurück</button>` : ''}
      ${isLast
        ? `<button id="examSubmitBtn" class="btn-primary action-main">Prüfung abgeben</button>`
        : `<button id="examNextBtn" class="btn-primary action-main">Weiter →</button>`}
    </section>
  `;

  bindExamOptionListeners();

  document.getElementById('examPrevBtn')?.addEventListener('click', () => {
    state.currentIndex--; render();
  });
  document.getElementById('examNextBtn')?.addEventListener('click', () => {
    state.currentIndex++; render();
  });
  document.getElementById('examSubmitBtn')?.addEventListener('click', () => confirmSubmitExam());
  document.getElementById('examSubmitEarlyBtn').addEventListener('click', () => confirmSubmitExam());
  document.getElementById('examExitBtn').addEventListener('click', () => {
    if (confirm('Prüfung wirklich abbrechen? Der Fortschritt in dieser Prüfungssimulation geht verloren.')) {
      if (state.examTimerInterval) { clearInterval(state.examTimerInterval); state.examTimerInterval = null; }
      state.mode = 'practice';
      state.screen = 'select';
      render();
    }
  });

  attachSwipeHandlers(document.getElementById('examSwipeArea'), {
    canForward: () => state.currentIndex + 1 < state.queue.length,
    canBackward: () => state.currentIndex > 0,
    onValidSwipe: (forward, el) => {
      runSlideTransition(el, forward, 'quiz-swipe-area', () => {
        if (forward) state.currentIndex++; else state.currentIndex--;
      }, renderExamQuestionPanelInner);
    },
  });
}

function bindExamOptionListeners() {
  const id = state.queue[state.currentIndex];
  const opts = state.examShuffled[id];
  root.querySelectorAll('.exam-option').forEach(btn => {
    btn.addEventListener('click', () => {
      state.examAnswers[id] = opts[+btn.getAttribute('data-idx')];
      render();
    });
  });
}

function confirmSubmitExam() {
  const answeredCount = state.queue.filter(qid => state.examAnswers[qid] !== undefined).length;
  const unanswered = state.queue.length - answeredCount;
  const msg = unanswered > 0
    ? `${unanswered} Frage${unanswered===1?'':'n'} noch unbeantwortet. Trotzdem abgeben?`
    : 'Prüfung jetzt abgeben?';
  if (confirm(msg)) submitExam(false);
}

function startSession(catOverride) {
  // catOverride: optional single category key for quick-start
  if (catOverride) {
    state.selectedCats = [catOverride];
  }
  let pool = questionsForCats(state.selectedCats);
  if (state.certFilter === '+UBI') pool = pool.filter(q => q.e === 1);
  if (state.filterMode === 'unsicher') pool = pool.filter(q => isUnsicher(q.id));

  if (pool.length === 0) {
    showToast(
      state.filterMode === 'unsicher'
        ? 'Schon alles sicher gelernt – hier gibt’s aktuell nichts zu üben 🎉'
        : 'Keine Fragen in dieser Auswahl'
    );
    return;
  }

  state.queue = shuffle(pool).map(q => q.id);
  state.currentIndex = 0;
  state.frontier = 0;
  state.sessionResults = { correct: 0, wrong: 0, dontknow: 0 };
  state.givenAnswers = {};
  state.screen = 'quiz';
  loadCurrentQuestion();
  render();
}

function loadCurrentQuestion() {
  const id = state.queue[state.currentIndex];
  const q = QUESTIONS.find(x => x.id === id);
  const given = state.givenAnswers[id];
  if (given) {
    // Reviewing an already-answered question — restore saved shuffle
    state.currentShuffledOptions = given.shuffled;
    state.currentCorrectText = q.o[0];
    state.selectedWrongText = (given.correct || given.text === null) ? null : given.text;
    state.answered = true;
    state.freshlyAnswered = false; // via Navigation erreicht, kein Auto-Advance/Timing mehr relevant
  } else {
    // Fresh question at the frontier
    state.currentCorrectText = q.o[0];
    state.currentShuffledOptions = shuffle(q.o);
    state.answered = false;
    state.selectedWrongText = null;
    state.freshlyAnswered = false;
  }
}

/* ---------- Toast (kurze Rückmeldung) ---------- */
let toastTimer = null;
function showToast(message) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.remove('toast-show'); // reflow erzwingen, falls Toast schon sichtbar war
  void el.offsetWidth;
  el.classList.add('toast-show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.classList.remove('toast-show'); }, 2200);
}

/* ---------- Swipe-Navigation mit Drag-Follow + synchronem Slide-Übergang ---------- */
const SWIPE_THRESHOLD = 55;    // min. horizontale Strecke in px, die als Wisch zählt
const SWIPE_RESTRAINT = 90;    // max. erlaubte vertikale Abweichung in px
const SWIPE_SLIDE_MS = 220;    // Dauer des synchronen Übergangs (alt raus + neu rein gleichzeitig)
const SWIPE_SNAPBACK_MS = 150;

// Generischer horizontaler Wisch-Handler mit Drag-Follow + Totzone (siehe DEAD_ZONE).
// config:
//   canForward()/canBackward(): ob in die jeweilige Richtung gerade navigiert werden darf
//   onValidSwipe(forward, el): wird bei erfolgreichem Wisch aufgerufen, übernimmt die Animation/den Übergang
function attachSwipeHandlers(el, config) {
  if (!el) return;

  const DEAD_ZONE = 8; // px Bewegung, bevor wir es als echten Wisch werten und den Pointer einfangen
  let startX = 0, startY = 0, curX = 0, curY = 0, tracking = false, capturing = false, pointerId = null;

  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    tracking = true;
    capturing = false;
    startX = curX = e.clientX;
    startY = curY = e.clientY;
    pointerId = e.pointerId;
    // WICHTIG: hier noch KEIN setPointerCapture — sonst verliert ein einfacher Klick auf einen
    // Options-Button sein click-Event (siehe Totzone unten).
  });

  el.addEventListener('pointermove', (e) => {
    if (!tracking) return;
    curX = e.clientX;
    curY = e.clientY;

    if (!capturing) {
      // Erst bei echter Bewegung außerhalb der Totzone als Wisch werten und Pointer einfangen.
      if (Math.abs(curX - startX) < DEAD_ZONE && Math.abs(curY - startY) < DEAD_ZONE) return;
      capturing = true;
      try { el.setPointerCapture(pointerId); } catch (_) {}
      el.style.transition = 'none';
    }

    const dy = curY - startY;
    if (Math.abs(dy) > SWIPE_RESTRAINT) return; // eher vertikales Scrollen, nicht mitziehen
    let dx = curX - startX;
    const wantsForward = dx < 0;
    const allowed = wantsForward ? config.canForward() : config.canBackward();
    if (!allowed) dx *= 0.28; // Gummiband-Effekt, wenn Richtung gerade nicht gültig ist
    el.style.transform = `translateX(${dx}px)`;
  });

  function endDrag() {
    if (!tracking) return;
    tracking = false;

    if (!capturing) return; // war nur ein Klick/Tap, kein Wisch — nichts zu tun, Klick lief normal durch

    if (pointerId != null) { try { el.releasePointerCapture(pointerId); } catch (_) {} }

    const dx = curX - startX;
    const dy = curY - startY;
    const forward = dx < 0;
    const allowed = forward ? config.canForward() : config.canBackward();
    const valid = allowed && Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dy) < SWIPE_RESTRAINT;

    if (!valid) {
      el.style.transition = `transform ${SWIPE_SNAPBACK_MS}ms ease-out`;
      el.style.transform = 'translateX(0)';
      return;
    }

    config.onValidSwipe(forward, el);
  }

  el.addEventListener('pointerup', endDrag);
  el.addEventListener('pointercancel', endDrag);
}

// Bewegt das alte und das neue Panel GLEICHZEITIG um dieselbe Strecke in dieselbe Richtung
// (wie ein Filmstreifen) – dadurch berühren sich beide Panels durchgehend und es entsteht
// keine sichtbare Lücke zum Hintergrund, egal wie lang der Übergang dauert.
// panelClass: CSS-Klasse für das neue Panel (gleich wie das alte)
// advanceFn: schaltet den Zustand weiter (z.B. currentIndex++/-- + Fragen laden) — OHNE render()
// buildInnerFn: liefert das innerHTML für das neue Panel, nachdem advanceFn gelaufen ist
function runSlideTransition(oldPanel, forward, panelClass, advanceFn, buildInnerFn) {
  const viewport = oldPanel.parentElement;
  if (!viewport) { advanceFn(); render(); return; }

  // Höhe kurz fixieren: solange beide Panels absolut positioniert übereinanderliegen,
  // würde der Viewport sonst kollabieren (kein normaler Fluss-Inhalt mehr vorhanden).
  viewport.style.height = oldPanel.offsetHeight + 'px';
  viewport.style.position = 'relative';
  viewport.style.overflow = 'hidden';

  // Zustand fortschalten und neuen Inhalt bauen — ohne kompletten Re-Render, damit wir das
  // alte Panel noch für die Animation zur Verfügung haben.
  advanceFn();

  const newPanel = document.createElement('div');
  newPanel.className = panelClass;
  newPanel.innerHTML = buildInnerFn();

  Object.assign(oldPanel.style, { position: 'absolute', top: '0', left: '0', width: '100%', margin: '0' });
  Object.assign(newPanel.style, {
    position: 'absolute', top: '0', left: '0', width: '100%', margin: '0',
    transition: 'none', transform: `translateX(${forward ? 100 : -100}%)`,
  });
  viewport.appendChild(newPanel);

  void newPanel.offsetWidth; // Reflow erzwingen, damit der Startzustand nicht mit animiert wird

  requestAnimationFrame(() => {
    const t = `transform ${SWIPE_SLIDE_MS}ms cubic-bezier(0.22, 0.61, 0.36, 1)`;
    oldPanel.style.transition = t;
    newPanel.style.transition = t;
    oldPanel.style.transform = `translateX(${forward ? -100 : 100}%)`;
    newPanel.style.transform = 'translateX(0)';
  });

  setTimeout(() => {
    viewport.style.height = '';
    render(); // sauberer, vollständiger Re-Render ersetzt die Übergangs-Panels nahtlos
  }, SWIPE_SLIDE_MS + 20);
}


/* ---------- Anzeige-Nummer ---------- */
// Die ID ist jetzt selbst schon im Anzeigeformat ("SRC-042" usw.), kein Umrechnen mehr nötig.
function displayNumber(q) {
  return q.id;
}

/* ---------- QUIZ ---------- */
function renderQuestionPanelInner() {
  const id = state.queue[state.currentIndex];
  const q = QUESTIONS.find(x => x.id === id);
  const total = state.queue.length;
  const catTitle = CATEGORIES[q.cat].title;
  const given = state.givenAnswers[id];
  const wasDontKnow = state.answered && given && given.text === null;

  const optHtml = state.currentShuffledOptions.map((opt, i) => {
    let cls = 'option';
    if (state.answered) {
      if (opt === state.currentCorrectText) cls += ' correct';
      else if (opt === state.selectedWrongText) cls += ' wrong';
      else cls += ' disabled';
    }
    return `<button class="${cls}" data-idx="${i}" ${state.answered ? 'disabled' : ''}>${escapeHtml(opt)}</button>`;
  }).join('');

  const dontKnowMarkerHtml = wasDontKnow
    ? `<div class="option wrong dontknow-marker">Weiß nicht <span class="dontknow-tag">(gewählt)</span></div>`
    : '';

  const explanation = (typeof EXPLANATIONS !== 'undefined') ? (EXPLANATIONS[q.id] || null) : null;
  const hideBecauseAutoAdvancing = state.freshlyAnswered && given && given.correct;
  const explHtml = state.answered && explanation && !hideBecauseAutoAdvancing
    ? `<section class="panel explanation-panel">
        <p class="explanation-label">💡 Warum ist das richtig?</p>
        <p class="explanation-text">${escapeHtml(explanation)}</p>
       </section>`
    : '';

  return `
      <section class="panel question-panel">
        <p class="question-id">${displayNumber(q)} &middot; ${escapeHtml(catTitle)}</p>
        <h2 class="question-text">${escapeHtml(q.q)}</h2>
        <div class="options">${optHtml}${dontKnowMarkerHtml}</div>
      </section>
      ${explHtml}`;
}

function renderQuiz() {
  if (state.autoAdvanceTimer) { clearTimeout(state.autoAdvanceTimer); state.autoAdvanceTimer = null; }

  const id = state.queue[state.currentIndex];
  const q = QUESTIONS.find(x => x.id === id);
  const total = state.queue.length;
  const pos = state.currentIndex + 1;
  const certLabel = CATEGORIES[q.cat].cert;
  const isLast = state.currentIndex + 1 >= total;

  const canGoBack = state.currentIndex > 0;
  const backBtnHtml = canGoBack
    ? `<button id="prevBtn" class="btn-secondary action-back">← Zurück</button>` : '';

  let mainBtnHtml;
  if (!state.answered) {
    mainBtnHtml = `<button id="dontKnowBtn" class="btn-secondary action-main">Weiß nicht</button>`;
  } else {
    mainBtnHtml = `<button id="nextBtn" class="btn-primary action-main">${isLast ? 'Runde beenden' : 'Weiter →'}</button>`;
  }
  const actionHtml = backBtnHtml + mainBtnHtml;

  root.innerHTML = `
    <header class="header quiz-header">
      <button id="exitBtn" class="btn-link">&larr; Auswahl</button>
      <span class="cert-badge cert-${certLabel.toLowerCase()}">${certLabel}</span>
      <p class="progress-text">${pos} / ${total}</p>
    </header>
    <div class="progress-bar"><div class="progress-bar-fill" style="width:${(pos-1)/total*100}%"></div></div>

    <div id="quizSwipeViewport" class="quiz-swipe-viewport">
      <div id="quizSwipeArea" class="quiz-swipe-area">${renderQuestionPanelInner()}</div>
    </div>

    <section class="panel actions quiz-actions">${actionHtml}</section>

    <section class="panel session-stats">
      <span class="stat-correct">✔ ${state.sessionResults.correct}</span>
      <span class="stat-wrong">✘ ${state.sessionResults.wrong}</span>
      <span class="stat-dk">? ${state.sessionResults.dontknow}</span>
    </section>
  `;

  document.getElementById('exitBtn').addEventListener('click', () => {
    if (state.autoAdvanceTimer) clearTimeout(state.autoAdvanceTimer);
    state.screen = 'select'; render();
  });

  attachSwipeHandlers(document.getElementById('quizSwipeArea'), {
    canForward: () => state.answered,
    canBackward: () => state.currentIndex > 0,
    onValidSwipe: (forward, el) => {
      if (state.autoAdvanceTimer) clearTimeout(state.autoAdvanceTimer);
      const isLastForward = forward && (state.currentIndex + 1 >= state.queue.length);
      if (isLastForward) {
        // Rundenende: die Auswertung ist ein komplett anderer Screen, dafür reicht ein einfacher Exit
        el.style.transition = `transform ${SWIPE_SLIDE_MS}ms ease-in, opacity ${SWIPE_SLIDE_MS}ms ease-in`;
        el.style.transform = 'translateX(-100%)';
        el.style.opacity = '0';
        setTimeout(() => nextQuestion(), SWIPE_SLIDE_MS);
        return;
      }
      runSlideTransition(el, forward, 'quiz-swipe-area', () => {
        if (forward) state.currentIndex++; else state.currentIndex--;
        loadCurrentQuestion();
      }, renderQuestionPanelInner);
    },
  });

  if (!state.answered) {
    root.querySelectorAll('.option').forEach(btn => {
      btn.addEventListener('click', () => {
        answer(state.currentShuffledOptions[+btn.getAttribute('data-idx')]);
      });
    });
    document.getElementById('dontKnowBtn').addEventListener('click', dontKnow);
  } else {
    document.getElementById('nextBtn')?.addEventListener('click', () => {
      if (state.autoAdvanceTimer) clearTimeout(state.autoAdvanceTimer);
      nextQuestion();
    });
  }
  // Zurück ist unabhängig vom Beantwortungs-Status verfügbar
  document.getElementById('prevBtn')?.addEventListener('click', () => {
    if (state.autoAdvanceTimer) clearTimeout(state.autoAdvanceTimer);
    prevQuestion();
  });
}

function answer(text) {
  const id = state.queue[state.currentIndex];
  const isCorrect = text === state.currentCorrectText;
  state.answered = true;
  state.freshlyAnswered = true;
  state.selectedWrongText = isCorrect ? null : text;
  // Save answer + shuffle order for review
  state.givenAnswers[id] = { text, correct: isCorrect, shuffled: state.currentShuffledOptions };
  if (isCorrect) {
    state.sessionResults.correct++;
    markCorrect(id);
  } else {
    state.sessionResults.wrong++;
    markWrongOrUnknown(id);
  }
  // Advance frontier
  if (state.currentIndex === state.frontier) state.frontier = state.currentIndex + 1;
  render();
  // Auto-advance after 1s only on correct answer
  if (isCorrect) {
    state.autoAdvanceTimer = setTimeout(() => {
      state.autoAdvanceTimer = null;
      nextQuestion();
    }, 1000);
  }
}

function dontKnow() {
  const id = state.queue[state.currentIndex];
  state.answered = true;
  state.freshlyAnswered = true;
  state.selectedWrongText = null;
  state.sessionResults.dontknow++;
  markWrongOrUnknown(id);
  state.givenAnswers[id] = { text: null, correct: false, shuffled: state.currentShuffledOptions };
  if (state.currentIndex === state.frontier) state.frontier = state.currentIndex + 1;
  render();
}

function nextQuestion() {
  if (state.currentIndex + 1 < state.queue.length) {
    state.currentIndex++;
    loadCurrentQuestion();
    render();
  } else {
    state.screen = 'summary';
    render();
  }
}

function prevQuestion() {
  if (state.currentIndex > 0) {
    state.currentIndex--;
    loadCurrentQuestion();
    render();
  }
}

/* ---------- SUMMARY ---------- */
function renderSummary() {
  const r = state.sessionResults;
  const total = state.queue.length;
  root.innerHTML = `
    <header class="header"><h1>Runde beendet</h1></header>
    <section class="panel summary-panel">
      <p class="summary-line">Fragen: <strong>${total}</strong></p>
      <p class="summary-line correct">Richtig: <strong>${r.correct}</strong></p>
      <p class="summary-line wrong">Falsch: <strong>${r.wrong}</strong></p>
      <p class="summary-line dontknow">Weiß nicht: <strong>${r.dontknow}</strong></p>
    </section>
    <section class="panel actions">
      <button id="againBtn" class="btn-primary">Nochmal (gleiche Auswahl)</button>
      <button id="toSelectBtn" class="btn-secondary">Zurück zur Auswahl</button>
    </section>
  `;
  document.getElementById('againBtn').addEventListener('click', () => startSession());
  document.getElementById('toSelectBtn').addEventListener('click', () => {
    state.screen = 'select'; render();
  });
}

/* ---------- Prüfungs-Auswertung ---------- */
function renderExamSummary() {
  const r = state.examResult;
  const label = EXAM_GROUP_LABEL[r.group];
  const meta = EXAM_META[r.group];
  const passNeeded = meta.count - meta.maxWrong;

  const rows = r.perQuestion.map((pq, i) => {
    const q = QUESTIONS.find(x => x.id === pq.id);
    const icon = pq.isCorrect ? '<span class="exam-check-ok">✔</span>' : '<span class="exam-check-bad">✘</span>';
    const expanded = state.examExpanded.has(pq.id);
    const explanation = (typeof EXPLANATIONS !== 'undefined') ? (EXPLANATIONS[pq.id] || null) : null;

    const detailHtml = expanded ? `
      <div class="exam-result-detail">
        <p class="question-text">${escapeHtml(q.q)}</p>
        <div class="options">
          ${q.o.map(opt => {
            let cls = 'option disabled';
            if (opt === pq.correctText) cls += ' correct';
            else if (opt === pq.given) cls += ' wrong';
            return `<div class="${cls}">${escapeHtml(opt)}</div>`;
          }).join('')}
          ${pq.given === null ? `<div class="option wrong dontknow-marker">Nicht beantwortet</div>` : ''}
        </div>
        ${explanation ? `
          <section class="panel explanation-panel">
            <p class="explanation-label">💡 Warum ist das richtig?</p>
            <p class="explanation-text">${escapeHtml(explanation)}</p>
          </section>` : ''}
      </div>` : '';

    return `
      <div class="exam-result-row">
        <button class="exam-result-line ${pq.isCorrect ? 'exam-result-line-ok' : ''}" data-toggle-id="${pq.id}">
          ${icon} <span class="exam-result-num">${displayNumber(q)}</span>
        </button>
        ${detailHtml}
      </div>`;
  }).join('');

  root.innerHTML = `
    <header class="header">
      <h1>${r.passed ? '✅ Bestanden' : '❌ Nicht bestanden'}</h1>
      <p class="sub">${label} · Prüfbogen ${r.n}${r.timedOut ? ' · Zeit abgelaufen' : ''}</p>
    </header>
    <section class="panel summary-panel">
      <p class="summary-line correct">Richtig: <strong>${r.correct} / ${r.total}</strong> (mind. ${passNeeded} nötig)</p>
      <p class="summary-line wrong">Falsch: <strong>${r.wrong}</strong> (max. ${meta.maxWrong} erlaubt)</p>
      <p class="summary-line">Zeit: <strong>${formatExamTime(r.elapsedSec)}</strong> von ${meta.time}:00</p>
    </section>
    <section class="panel">
      <h2>Fragen im Detail</h2>
      <div class="exam-result-list">${rows}</div>
    </section>
    <section class="panel actions">
      <button id="examAgainBtn" class="btn-primary">Bogen wiederholen</button>
      <button id="examToSelectBtn" class="btn-secondary">Zurück zur Auswahl</button>
    </section>
  `;

  root.querySelectorAll('[data-toggle-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const qid = btn.getAttribute('data-toggle-id');
      if (state.examExpanded.has(qid)) state.examExpanded.delete(qid);
      else state.examExpanded.add(qid);
      render();
    });
  });
  document.getElementById('examAgainBtn').addEventListener('click', () => startExam(r.group, r.n));
  document.getElementById('examToSelectBtn').addEventListener('click', () => {
    state.mode = 'exam';
    state.screen = 'select';
    render();
  });
}

/* ---------- Start ---------- */
render();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
