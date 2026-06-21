'use strict';

/* ---------- Persistenz ---------- */
const STORAGE_KEY = 'src_trainer_progress_v1';

function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.error('Fortschritt konnte nicht geladen werden', e);
    return {};
  }
}

function saveProgress(progress) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch (e) {
    console.error('Fortschritt konnte nicht gespeichert werden', e);
  }
}

let progress = loadProgress();

// Eintrag pro Frage: { streak: number }  -- "sicher gewusst" ab streak >= 2
function getEntry(id) {
  return progress[id] || { streak: 0 };
}

function isUnsicher(id) {
  return getEntry(id).streak < 2;
}

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

/* ---------- Hilfsfunktionen ---------- */
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function categoryOf(id) {
  return QUESTIONS.find(q => q.id === id)?.cat;
}

function questionsInCategories(catKeys) {
  return QUESTIONS.filter(q => catKeys.includes(q.cat));
}

function stats(catKeys) {
  const qs = questionsInCategories(catKeys);
  const total = qs.length;
  const mastered = qs.filter(q => !isUnsicher(q.id)).length;
  return { total, mastered, unsicher: total - mastered };
}

/* ---------- App State ---------- */
const state = {
  screen: 'select', // 'select' | 'quiz' | 'summary'
  selectedCats: Object.keys(CATEGORIES),
  filterMode: 'unsicher', // 'unsicher' | 'alle'
  queue: [],
  currentIndex: 0,
  currentShuffledOptions: [],
  currentCorrectText: '',
  answered: false,
  sessionResults: { correct: 0, wrong: 0, dontknow: 0, seen: 0 },
};

/* ---------- Rendering ---------- */
const root = document.getElementById('app');

function render() {
  if (state.screen === 'select') renderSelect();
  else if (state.screen === 'quiz') renderQuiz();
  else if (state.screen === 'summary') renderSummary();
}

function renderSelect() {
  const catKeys = Object.keys(CATEGORIES);
  const overall = stats(catKeys);

  const rows = catKeys.map(key => {
    const cat = CATEGORIES[key];
    const s = stats([key]);
    const checked = state.selectedCats.includes(key) ? 'checked' : '';
    const pct = s.total ? Math.round((s.mastered / s.total) * 100) : 0;
    return `
      <label class="cat-row">
        <input type="checkbox" data-cat="${key}" ${checked} />
        <span class="cat-title">${cat.title}</span>
        <span class="cat-meta">${s.mastered}/${s.total} sicher</span>
        <span class="cat-bar"><span class="cat-bar-fill" style="width:${pct}%"></span></span>
      </label>`;
  }).join('');

  const selStats = stats(state.selectedCats);
  const poolCount = state.filterMode === 'unsicher' ? selStats.unsicher : selStats.total;

  root.innerHTML = `
    <header class="header">
      <h1>SRC Funkzeugnis – Fragentrainer</h1>
      <p class="sub">Gesamtfortschritt: ${overall.mastered} / ${overall.total} Fragen sicher gewusst</p>
    </header>

    <section class="panel">
      <h2>Kategorien</h2>
      <div class="cat-list">${rows}</div>
      <div class="cat-actions">
        <button id="selAll" class="btn-link">Alle auswählen</button>
        <button id="selNone" class="btn-link">Keine auswählen</button>
      </div>
    </section>

    <section class="panel">
      <h2>Fragenauswahl</h2>
      <div class="filter-toggle">
        <label class="radio-row">
          <input type="radio" name="filterMode" value="unsicher" ${state.filterMode === 'unsicher' ? 'checked' : ''}/>
          Nur unsichere Fragen (noch nicht 2x in Folge richtig)
        </label>
        <label class="radio-row">
          <input type="radio" name="filterMode" value="alle" ${state.filterMode === 'alle' ? 'checked' : ''}/>
          Alle Fragen der Auswahl
        </label>
      </div>
      <p class="pool-info">${poolCount} Frage${poolCount === 1 ? '' : 'n'} in dieser Runde</p>
    </section>

    <section class="panel actions">
      <button id="startBtn" class="btn-primary" ${poolCount === 0 ? 'disabled' : ''}>Lernrunde starten</button>
      <button id="resetBtn" class="btn-danger-link">Gesamten Fortschritt zurücksetzen</button>
    </section>
  `;

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

  root.querySelectorAll('input[name="filterMode"]').forEach(r => {
    r.addEventListener('change', e => {
      state.filterMode = e.target.value;
      render();
    });
  });

  document.getElementById('selAll').addEventListener('click', () => {
    state.selectedCats = Object.keys(CATEGORIES);
    render();
  });
  document.getElementById('selNone').addEventListener('click', () => {
    state.selectedCats = [];
    render();
  });

  document.getElementById('startBtn').addEventListener('click', startSession);

  document.getElementById('resetBtn').addEventListener('click', () => {
    if (confirm('Wirklich den gesamten Lernfortschritt löschen? Das kann nicht rückgängig gemacht werden.')) {
      resetAllProgress();
      render();
    }
  });
}

function startSession() {
  let pool = questionsInCategories(state.selectedCats);
  if (state.filterMode === 'unsicher') {
    pool = pool.filter(q => isUnsicher(q.id));
  }
  state.queue = shuffle(pool).map(q => q.id);
  state.currentIndex = 0;
  state.sessionResults = { correct: 0, wrong: 0, dontknow: 0, seen: 0 };
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
}

function renderQuiz() {
  const id = state.queue[state.currentIndex];
  const q = QUESTIONS.find(x => x.id === id);
  const total = state.queue.length;
  const pos = state.currentIndex + 1;
  const cat = CATEGORIES[q.cat].title;

  const optionsHtml = state.currentShuffledOptions.map((opt, i) => {
    let cls = 'option';
    if (state.answered) {
      if (opt === state.currentCorrectText) cls += ' correct';
      else if (opt === state.selectedWrongText) cls += ' wrong';
      else cls += ' disabled';
    }
    return `<button class="${cls}" data-opt-index="${i}" ${state.answered ? 'disabled' : ''}>${escapeHtml(opt)}</button>`;
  }).join('');

  root.innerHTML = `
    <header class="header quiz-header">
      <button id="backBtn" class="btn-link">&larr; Zur Auswahl</button>
      <p class="progress-text">Frage ${pos} / ${total} &middot; ${cat}</p>
      <div class="progress-bar"><div class="progress-bar-fill" style="width:${(pos - 1) / total * 100}%"></div></div>
    </header>

    <section class="panel question-panel">
      <p class="question-id">Frage Nr. ${q.id}</p>
      <h2 class="question-text">${escapeHtml(q.q)}</h2>
      <div class="options">${optionsHtml}</div>
    </section>

    <section class="panel actions quiz-actions">
      ${!state.answered ? `<button id="dontKnowBtn" class="btn-secondary">Weiß nicht</button>` : ''}
      ${state.answered ? `<button id="nextBtn" class="btn-primary">${state.currentIndex + 1 < total ? 'Weiter' : 'Runde beenden'}</button>` : ''}
    </section>

    <section class="panel session-stats">
      <span>✔ ${state.sessionResults.correct}</span>
      <span>✘ ${state.sessionResults.wrong}</span>
      <span>? ${state.sessionResults.dontknow}</span>
    </section>
  `;

  document.getElementById('backBtn').addEventListener('click', () => {
    state.screen = 'select';
    render();
  });

  if (!state.answered) {
    root.querySelectorAll('.option').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-opt-index'), 10);
        answer(state.currentShuffledOptions[idx]);
      });
    });
    document.getElementById('dontKnowBtn').addEventListener('click', dontKnow);
  } else {
    document.getElementById('nextBtn').addEventListener('click', nextQuestion);
  }
}

function answer(selectedText) {
  const id = state.queue[state.currentIndex];
  state.answered = true;
  state.sessionResults.seen++;
  if (selectedText === state.currentCorrectText) {
    state.selectedWrongText = null;
    state.sessionResults.correct++;
    markCorrect(id);
  } else {
    state.selectedWrongText = selectedText;
    state.sessionResults.wrong++;
    markWrongOrUnknown(id);
  }
  render();
}

function dontKnow() {
  const id = state.queue[state.currentIndex];
  state.answered = true;
  state.selectedWrongText = null;
  state.sessionResults.seen++;
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

function renderSummary() {
  const r = state.sessionResults;
  root.innerHTML = `
    <header class="header">
      <h1>Runde beendet</h1>
    </header>
    <section class="panel summary-panel">
      <p class="summary-line">Beantwortet: <strong>${r.seen}</strong></p>
      <p class="summary-line correct">Richtig: <strong>${r.correct}</strong></p>
      <p class="summary-line wrong">Falsch: <strong>${r.wrong}</strong></p>
      <p class="summary-line dontknow">Weiß nicht: <strong>${r.dontknow}</strong></p>
    </section>
    <section class="panel actions">
      <button id="againBtn" class="btn-primary">Nochmal mit gleicher Auswahl</button>
      <button id="toSelectBtn" class="btn-secondary">Zurück zur Auswahl</button>
    </section>
  `;
  document.getElementById('againBtn').addEventListener('click', startSession);
  document.getElementById('toSelectBtn').addEventListener('click', () => {
    state.screen = 'select';
    render();
  });
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/* ---------- Start ---------- */
render();

/* ---------- Service Worker ---------- */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(err => {
      console.warn('Service Worker Registrierung fehlgeschlagen:', err);
    });
  });
}
