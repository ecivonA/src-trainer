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

  document.getElementById('startBtn').addEventListener('click', () => startSession());
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

function attachSwipeHandlers(el) {
  if (!el) return;

  let startX = 0, startY = 0, curX = 0, curY = 0, dragging = false, pointerId = null;

  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    dragging = true;
    startX = curX = e.clientX;
    startY = curY = e.clientY;
    pointerId = e.pointerId;
    try { el.setPointerCapture(pointerId); } catch (_) {}
    el.style.transition = 'none';
  });

  el.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    curX = e.clientX;
    curY = e.clientY;
    const dy = curY - startY;
    if (Math.abs(dy) > SWIPE_RESTRAINT) return; // eher vertikales Scrollen, nicht mitziehen
    let dx = curX - startX;
    const wantsForward = dx < 0;
    const allowed = wantsForward ? state.answered : state.currentIndex > 0;
    if (!allowed) dx *= 0.28; // Gummiband-Effekt, wenn Richtung gerade nicht gültig ist
    el.style.transform = `translateX(${dx}px)`;
  });

  function endDrag(e) {
    if (!dragging) return;
    dragging = false;
    if (pointerId != null) { try { el.releasePointerCapture(pointerId); } catch (_) {} }

    const dx = curX - startX;
    const dy = curY - startY;
    const forward = dx < 0;
    const allowed = forward ? state.answered : state.currentIndex > 0;
    const valid = allowed && Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dy) < SWIPE_RESTRAINT;

    if (!valid) {
      el.style.transition = `transform ${SWIPE_SNAPBACK_MS}ms ease-out`;
      el.style.transform = 'translateX(0)';
      return;
    }

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

    runSlideTransition(el, forward);
  }

  el.addEventListener('pointerup', endDrag);
  el.addEventListener('pointercancel', endDrag);
}

// Bewegt das alte und das neue Fragen-Panel GLEICHZEITIG um dieselbe Strecke in dieselbe
// Richtung (wie ein Filmstreifen) – dadurch berühren sich beide Panels durchgehend und es
// entsteht keine sichtbare Lücke zum Hintergrund, egal wie lang der Übergang dauert.
function runSlideTransition(oldPanel, forward) {
  const viewport = oldPanel.parentElement;
  if (!viewport) { forward ? nextQuestion() : prevQuestion(); return; }

  // Höhe kurz fixieren: solange beide Panels absolut positioniert übereinanderliegen,
  // würde der Viewport sonst kollabieren (kein normaler Fluss-Inhalt mehr vorhanden).
  viewport.style.height = oldPanel.offsetHeight + 'px';
  viewport.style.position = 'relative';
  viewport.style.overflow = 'hidden';

  // Zustand fortschalten und neuen Inhalt bauen — ohne kompletten Re-Render, damit wir das
  // alte Panel noch für die Animation zur Verfügung haben.
  if (forward) state.currentIndex++; else state.currentIndex--;
  loadCurrentQuestion();

  const newPanel = document.createElement('div');
  newPanel.className = 'quiz-swipe-area';
  newPanel.innerHTML = renderQuestionPanelInner();

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
  document.getElementById('againBtn').addEventListener('click', () => startSession());
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
