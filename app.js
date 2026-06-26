'use strict';

/* ---------- Persistenz ---------- */
const STORAGE_KEY = 'src_trainer_progress_v2';

function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) { return {}; }
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

function statsFor(catKeys) {
  const qs = questionsForCats(catKeys);
  const mastered = qs.filter(q => !isUnsicher(q.id)).length;
  return { total: qs.length, mastered, unsicher: qs.length - mastered };
}

/* ---------- App State ---------- */
const state = {
  screen: 'select',       // 'select' | 'quiz' | 'summary'
  certFilter: 'SRC',      // 'SRC' | 'LRC' | 'UBI' | 'ALL'
  selectedCats: certCats('SRC'),
  filterMode: 'unsicher', // 'unsicher' | 'alle'
  queue: [],
  currentIndex: 0,
  currentShuffledOptions: [],
  currentCorrectText: '',
  selectedWrongText: null,
  answered: false,
  sessionResults: { correct: 0, wrong: 0, dontknow: 0 },
};

/* ---------- Render-Dispatcher ---------- */
const root = document.getElementById('app');
function render() {
  if (state.screen === 'select') renderSelect();
  else if (state.screen === 'quiz') renderQuiz();
  else if (state.screen === 'summary') renderSummary();
}

/* ---------- SELECT ---------- */
function renderSelect() {
  const srcCats = certCats('SRC');
  const lrcCats = certCats('LRC');
  const ubiCats = certCats('UBI');
  const srcStats = statsFor(srcCats);
  const lrcStats = statsFor(lrcCats);
  const ubiStats = statsFor(ubiCats);
  const allStats = statsFor([...srcCats, ...lrcCats, ...ubiCats]);

  function catRows(cats) {
    return cats.map(key => {
      const cat = CATEGORIES[key];
      const s = statsFor([key]);
      const checked = state.selectedCats.includes(key) ? 'checked' : '';
      const pct = s.total ? Math.round(s.mastered / s.total * 100) : 0;
      return `
        <label class="cat-row">
          <input type="checkbox" data-cat="${key}" ${checked} />
          <span class="cat-title">${escapeHtml(cat.title)}</span>
          <span class="cat-meta">${s.mastered}/${s.total}</span>
          <span class="cat-bar"><span class="cat-bar-fill" style="width:${pct}%"></span></span>
        </label>`;
    }).join('');
  }

  const selStats = statsFor(state.selectedCats);
  const poolCount = state.filterMode === 'unsicher' ? selStats.unsicher : selStats.total;

  root.innerHTML = `
    <header class="header">
      <h1>Funkzeugnis Trainer</h1>
      <p class="sub">Gesamt: ${allStats.mastered}/${allStats.total} sicher &nbsp;·&nbsp;
        SRC ${srcStats.mastered}/${srcStats.total} &nbsp;·&nbsp;
        LRC ${lrcStats.mastered}/${lrcStats.total} &nbsp;·&nbsp;
        UBI ${ubiStats.mastered}/${ubiStats.total}</p>
    </header>

    <section class="panel">
      <h2>Zertifikat</h2>
      <div class="cert-tabs">
        <button class="cert-tab ${state.certFilter==='SRC'?'active':''}" data-cert="SRC">SRC</button>
        <button class="cert-tab ${state.certFilter==='LRC'?'active':''}" data-cert="LRC">LRC</button>
        <button class="cert-tab ${state.certFilter==='UBI'?'active':''}" data-cert="UBI">UBI</button>
        <button class="cert-tab ${state.certFilter==='ALL'?'active':''}" data-cert="ALL">Alle</button>
      </div>
    </section>

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
    </section>
  `;

  // Zertifikat-Tabs
  root.querySelectorAll('.cert-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      state.certFilter = btn.getAttribute('data-cert');
      if (state.certFilter === 'SRC') state.selectedCats = certCats('SRC');
      else if (state.certFilter === 'LRC') state.selectedCats = certCats('LRC');
      else if (state.certFilter === 'UBI') state.selectedCats = certCats('UBI');
      else state.selectedCats = [...certCats('SRC'), ...certCats('LRC'), ...certCats('UBI')];
      render();
    });
  });

  // Kategorie-Checkboxen
  root.querySelectorAll('input[data-cat]').forEach(cb => {
    cb.addEventListener('change', e => {
      const key = e.target.getAttribute('data-cat');
      if (e.target.checked) {
        if (!state.selectedCats.includes(key)) state.selectedCats.push(key);
      } else {
        state.selectedCats = state.selectedCats.filter(k => k !== key);
      }
      render();
    });
  });

  // Filter-Modus
  root.querySelectorAll('input[name="filterMode"]').forEach(r => {
    r.addEventListener('change', e => { state.filterMode = e.target.value; render(); });
  });

  // Alle / Keine
  document.getElementById('selAll').addEventListener('click', () => {
    const visible = state.certFilter === 'SRC' ? certCats('SRC')
                  : state.certFilter === 'LRC' ? certCats('LRC')
                  : state.certFilter === 'UBI' ? certCats('UBI')
                  : [...certCats('SRC'), ...certCats('LRC'), ...certCats('UBI')];
    state.selectedCats = visible;
    render();
  });
  document.getElementById('selNone').addEventListener('click', () => {
    state.selectedCats = []; render();
  });

  document.getElementById('startBtn').addEventListener('click', startSession);
  document.getElementById('resetBtn').addEventListener('click', () => {
    if (confirm('Wirklich den gesamten Lernfortschritt löschen?')) {
      resetAllProgress(); render();
    }
  });
}

/* ---------- SESSION ---------- */
function startSession() {
  let pool = questionsForCats(state.selectedCats);
  if (state.filterMode === 'unsicher') pool = pool.filter(q => isUnsicher(q.id));
  state.queue = shuffle(pool).map(q => q.id);
  state.currentIndex = 0;
  state.sessionResults = { correct: 0, wrong: 0, dontknow: 0 };
  state.screen = 'quiz';
  loadCurrentQuestion();
  render();
}

function loadCurrentQuestion() {
  const id = state.queue[state.currentIndex];
  const q = QUESTIONS.find(x => x.id === id);
  state.currentCorrectText = q.o[0];
  state.currentShuffledOptions = shuffle(q.o);
  state.answered = false;
  state.selectedWrongText = null;
}

/* ---------- QUIZ ---------- */
function renderQuiz() {
  const id = state.queue[state.currentIndex];
  const q = QUESTIONS.find(x => x.id === id);
  const total = state.queue.length;
  const pos = state.currentIndex + 1;
  const certLabel = CATEGORIES[q.cat].cert;
  const catTitle = CATEGORIES[q.cat].title;

  const optHtml = state.currentShuffledOptions.map((opt, i) => {
    let cls = 'option';
    if (state.answered) {
      if (opt === state.currentCorrectText) cls += ' correct';
      else if (opt === state.selectedWrongText) cls += ' wrong';
      else cls += ' disabled';
    }
    return `<button class="${cls}" data-idx="${i}" ${state.answered?'disabled':''}>${escapeHtml(opt)}</button>`;
  }).join('');

  root.innerHTML = `
    <header class="header quiz-header">
      <button id="backBtn" class="btn-link">&larr; Auswahl</button>
      <span class="cert-badge cert-${certLabel.toLowerCase()}">${certLabel}</span>
      <p class="progress-text">${pos} / ${total}</p>
    </header>
    <div class="progress-bar"><div class="progress-bar-fill" style="width:${(pos-1)/total*100}%"></div></div>

    <section class="panel question-panel">
      <p class="question-id">Frage ${q.id} &middot; ${escapeHtml(catTitle)}</p>
      <h2 class="question-text">${escapeHtml(q.q)}</h2>
      <div class="options">${optHtml}</div>
    </section>

    <section class="panel actions quiz-actions">
      ${!state.answered
        ? `<button id="dontKnowBtn" class="btn-secondary">Weiß nicht</button>`
        : `<button id="nextBtn" class="btn-primary">${pos < total ? 'Weiter →' : 'Runde beenden'}</button>`}
    </section>

    <section class="panel session-stats">
      <span class="stat-correct">✔ ${state.sessionResults.correct}</span>
      <span class="stat-wrong">✘ ${state.sessionResults.wrong}</span>
      <span class="stat-dk">? ${state.sessionResults.dontknow}</span>
    </section>
  `;

  document.getElementById('backBtn').addEventListener('click', () => {
    state.screen = 'select'; render();
  });

  if (!state.answered) {
    root.querySelectorAll('.option').forEach(btn => {
      btn.addEventListener('click', () => {
        answer(state.currentShuffledOptions[+btn.getAttribute('data-idx')]);
      });
    });
    document.getElementById('dontKnowBtn').addEventListener('click', dontKnow);
  } else {
    document.getElementById('nextBtn').addEventListener('click', nextQuestion);
  }
}

function answer(text) {
  const id = state.queue[state.currentIndex];
  state.answered = true;
  if (text === state.currentCorrectText) {
    state.selectedWrongText = null;
    state.sessionResults.correct++;
    markCorrect(id);
  } else {
    state.selectedWrongText = text;
    state.sessionResults.wrong++;
    markWrongOrUnknown(id);
  }
  render();
}

function dontKnow() {
  const id = state.queue[state.currentIndex];
  state.answered = true;
  state.selectedWrongText = null;
  state.sessionResults.dontknow++;
  markWrongOrUnknown(id);
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
  document.getElementById('againBtn').addEventListener('click', startSession);
  document.getElementById('toSelectBtn').addEventListener('click', () => {
    state.screen = 'select'; render();
  });
}

/* ---------- Start ---------- */
render();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
