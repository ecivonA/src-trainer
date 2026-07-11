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
  screen: 'select',       // 'select' | 'quiz' | 'summary'
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
  const ergStats = statsForErgaenzung();
  const allStats = statsFor([...srcCats, ...lrcCats, ...ubiCats]);

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

  const selStats = state.certFilter === '+UBI' ? statsForErgaenzung() : statsFor(state.selectedCats);
  const poolCount = state.filterMode === 'unsicher' ? selStats.unsicher : selStats.total;

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
      <h2>Zertifikat</h2>
      <div class="cert-tabs">
        <button class="cert-tab ${state.certFilter==='SRC'?'active':''}" data-cert="SRC">SRC</button>
        <button class="cert-tab ${state.certFilter==='LRC'?'active':''}" data-cert="LRC">LRC</button>
        <button class="cert-tab ${state.certFilter==='UBI'?'active':''}" data-cert="UBI">UBI</button>
        <button class="cert-tab ${state.certFilter==='+UBI'?'active':''}" data-cert="+UBI">+UBI</button>
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
    </section>
  `;

  // Zertifikat-Tabs
  root.querySelectorAll('.cert-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      state.certFilter = btn.getAttribute('data-cert');
      if (state.certFilter === 'SRC') state.selectedCats = certCats('SRC');
      else if (state.certFilter === 'LRC') state.selectedCats = certCats('LRC');
      else if (state.certFilter === 'UBI') state.selectedCats = certCats('UBI');
      else if (state.certFilter === '+UBI') state.selectedCats = certCats('UBI');
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

  // Schnellstart per Klick auf Kategorie-Titel
  root.querySelectorAll('.cat-title-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-quickstart');
      startSession(key);
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
                  : (state.certFilter === 'UBI' || state.certFilter === '+UBI') ? certCats('UBI')
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
function startSession(catOverride) {
  // catOverride: optional single category key for quick-start
  if (catOverride) {
    state.selectedCats = [catOverride];
  }
  let pool = questionsForCats(state.selectedCats);
  if (state.certFilter === '+UBI') pool = pool.filter(q => q.e === 1);
  if (state.filterMode === 'unsicher') pool = pool.filter(q => isUnsicher(q.id));
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

/* ---------- Swipe-Navigation (Touch + Maus) ---------- */
function attachSwipeHandlers(el) {
  if (!el) return;
  const THRESHOLD = 55;   // min. horizontale Strecke in px
  const RESTRAINT = 90;   // max. erlaubte vertikale Abweichung in px
  let startX = 0, startY = 0, tracking = false;

  el.addEventListener('pointerdown', (e) => {
    // nur linke Maustaste / Touch / Stift
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    tracking = true;
    startX = e.clientX;
    startY = e.clientY;
  });

  el.addEventListener('pointerup', (e) => {
    if (!tracking) return;
    tracking = false;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (Math.abs(dx) < THRESHOLD || Math.abs(dy) > RESTRAINT) return;

    if (dx < 0) {
      // nach links wischen = vorwärts (nur wenn beantwortet, entspricht "Weiter"/"Runde beenden")
      if (state.answered) {
        if (state.autoAdvanceTimer) clearTimeout(state.autoAdvanceTimer);
        nextQuestion();
      }
    } else {
      // nach rechts wischen = zurück
      if (state.currentIndex > 0) {
        if (state.autoAdvanceTimer) clearTimeout(state.autoAdvanceTimer);
        prevQuestion();
      }
    }
  });

  el.addEventListener('pointercancel', () => { tracking = false; });
}

/* ---------- QUIZ ---------- */
function renderQuiz() {
  if (state.autoAdvanceTimer) { clearTimeout(state.autoAdvanceTimer); state.autoAdvanceTimer = null; }

  const id = state.queue[state.currentIndex];
  const q = QUESTIONS.find(x => x.id === id);
  const total = state.queue.length;
  const pos = state.currentIndex + 1;
  const certLabel = CATEGORIES[q.cat].cert;
  const catTitle = CATEGORIES[q.cat].title;
  const isLast = state.currentIndex + 1 >= total;
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

  // "Weiß nicht" als eigene rote Markierung zeigen, wenn sie die gegebene Antwort war
  const dontKnowMarkerHtml = wasDontKnow
    ? `<div class="option wrong dontknow-marker">Weiß nicht <span class="dontknow-tag">(gewählt)</span></div>`
    : '';

  // Erklärung ausblenden, solange eine korrekt beantwortete Frage gerade live auto-weiterspringt
  // (in 1 Sekunde nicht lesbar). Beim Zurückblättern (nicht mehr "freshlyAnswered") wird sie gezeigt.
  const explanation = (typeof EXPLANATIONS !== 'undefined') ? (EXPLANATIONS[q.id] || null) : null;
  const hideBecauseAutoAdvancing = state.freshlyAnswered && given && given.correct;
  const explHtml = state.answered && explanation && !hideBecauseAutoAdvancing
    ? `<section class="panel explanation-panel">
        <p class="explanation-label">💡 Warum ist das richtig?</p>
        <p class="explanation-text">${escapeHtml(explanation)}</p>
       </section>`
    : '';

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

    <div id="quizSwipeArea" class="quiz-swipe-area">
      <section class="panel question-panel">
        <p class="question-id">Frage ${q.id} &middot; ${escapeHtml(catTitle)}</p>
        <h2 class="question-text">${escapeHtml(q.q)}</h2>
        <div class="options">${optHtml}${dontKnowMarkerHtml}</div>
      </section>

      ${explHtml}
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

  attachSwipeHandlers(document.getElementById('quizSwipeArea'));

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
