'use strict';

// Bei jeder Änderung an app.js/data.js/exams.js/explanations.js/catalog_versions.js/sw.js
// zusammen mit der CACHE_NAME-Version in sw.js erhöhen (siehe README) — beide Werte sollten
// synchron bleiben, damit die Info-Anzeige in der App zum tatsächlich ausgelieferten Stand passt.
const APP_VERSION = 'v23';

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

/* ---------- Katalog-Versionen (z.B. UBI 2018 vs. 2026) ---------- */
const CATALOG_VERSION_KEY = 'src_trainer_catalog_version_v1';

// Welche Version gilt gerade automatisch (noch keine explizite User-Wahl)? Die mit dem
// jüngsten validFrom-Datum, das nicht in der Zukunft liegt — z.B. UBI 2018 bis 30.9.2026,
// automatisch 2026 ab dem 1.10.2026. Ohne validFrom-Angabe zählt eine Version als "immer gültig".
function computeAutoVersion(cert) {
  const cfg = CATALOG_VERSIONS[cert];
  const now = new Date();
  let chosen = cfg.default;
  let chosenDate = null;
  for (const v of cfg.versions) {
    const raw = cfg.validFrom && cfg.validFrom[v];
    const d = raw ? new Date(raw) : new Date(0);
    if (d <= now && (chosenDate === null || d > chosenDate)) { chosen = v; chosenDate = d; }
  }
  return chosen;
}

function loadCatalogVersion() {
  let saved = {};
  try {
    const raw = localStorage.getItem(CATALOG_VERSION_KEY);
    if (raw) saved = JSON.parse(raw);
  } catch (e) { /* ignorieren, dann bleibt saved leer */ }

  const result = {};
  for (const cert of Object.keys(CATALOG_VERSIONS)) {
    // Explizite User-Wahl hat Vorrang; ohne sie automatisch die aktuell gültige Version —
    // wird bei jedem Laden neu berechnet, damit z.B. am 1.10.2026 ohne Zutun umgeschaltet wird.
    result[cert] = saved[cert] || computeAutoVersion(cert);
  }
  return result;
}
function saveCatalogVersion(v) {
  try { localStorage.setItem(CATALOG_VERSION_KEY, JSON.stringify(v)); } catch (e) {}
}

// "nurDiff"/"2026neu": pro Zertifikat, nur im Übungsmodus relevant (im Prüfmodus ignoriert,
// da die Prüfbögen immer den vollen, offiziellen Fragenmix zeigen sollen).
const ONLY_NEW_CONTENT_KEY = 'src_trainer_only_new_v1';
function loadOnlyNewContent() {
  try {
    const raw = localStorage.getItem(ONLY_NEW_CONTENT_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) { return {}; }
}
function saveOnlyNewContent(v) {
  try { localStorage.setItem(ONLY_NEW_CONTENT_KEY, JSON.stringify(v)); } catch (e) {}
}
function onlyNewActiveFor(cert) { return !!(state.onlyNewContent && state.onlyNewContent[cert]); }
// Für den Übungspool: Fragen eines Zertifikats mit aktivem "nurDiff" auf die inhaltlich neuen
// beschränken: läuft pro Frage über deren EIGENES Zertifikat, damit das auch im "Alle"-Tab
// (gemischte Kategorien mehrerer Zertifikate) je Frage korrekt greift.
function applyOnlyNewFilter(qs) {
  return qs.filter(q => !onlyNewActiveFor(certOfId(q.id)) || isNewContentId(q.id));
}

// Zuletzt gewählter Zertifikat-Tab + Üben/Prüfen-Modus: übersteht Neustart bzw. versehentliches
// Aktualisieren (z.B. Pull-to-refresh). Wird bei jedem Aufruf von renderSelect() aktuell gehalten,
// nicht bei jeder einzelnen internen mode-Änderung (Prüfungsablauf etc.) — so landet immer genau
// das gespeichert, was gerade tatsächlich auf dem Auswahlbildschirm zu sehen ist/war.
const SELECT_SCREEN_KEY = 'src_trainer_select_screen_v1';
function loadSelectScreenPrefs() {
  try {
    const raw = localStorage.getItem(SELECT_SCREEN_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) { return {}; }
}
function saveSelectScreenPrefs() {
  try {
    localStorage.setItem(SELECT_SCREEN_KEY, JSON.stringify({ certFilter: state.certFilter, mode: state.mode }));
  } catch (e) {}
}

function certOfId(id) { return id.split('-')[0]; }

function activeVersion(cert) {
  const cfg = CATALOG_VERSIONS[cert];
  if (!cfg) return null;
  return (state.catalogVersion && state.catalogVersion[cert]) || cfg.default;
}

// Ist `id` unter der gerade aktiven Version dieses Zertifikats eine inhaltlich neue Frage?
// (identisches Konzept für: "NEU"-Badge auf der Frage, nurDiff-Filter, isolierter Fortschritt)
function isNewContentId(id) {
  const cert = certOfId(id);
  const cfg = CATALOG_VERSIONS[cert];
  if (!cfg) return false;
  const v = activeVersion(cert);
  if (v === cfg.default) return false; // "neu" ergibt nur relativ zur Basisversion einen Sinn
  const list = cfg.newContentIds && cfg.newContentIds[v];
  return !!(list && list.includes(id));
}

// Liefert Frage/Antworten in der aktuell aktiven Version (Basisobjekt bleibt bei Standardversion
// unverändert). Zeigt bei einer Nicht-Standardversion IMMER den dortigen Wortlaut, nicht nur bei
// inhaltlich neuen Fragen — auch reine Umformulierungen sollen sichtbar sein.
function resolveQuestion(q) {
  const cert = certOfId(q.id);
  const cfg = CATALOG_VERSIONS[cert];
  if (!cfg) return q;
  const v = activeVersion(cert);
  const ov = cfg.overrides && cfg.overrides[v] && cfg.overrides[v][q.id];
  return ov ? { ...q, q: ov.q, o: ov.o } : q;
}

// Interner Speicher-Key für den Fortschritt: inhaltlich neue Fragen (s.o.) bekommen unter ihrer
// jeweiligen Version einen eigenen, dauerhaft getrennten Fortschritt ("UBI-045@2026" intern) —
// inhaltsgleiche/nur umformulierte Fragen teilen sich weiterhin denselben Fortschritt wie bisher.
// Wichtig: diese Notation ist rein intern für localStorage, nirgends in der UI sichtbar/angezeigt.
function progressKeyFor(id) {
  return isNewContentId(id) ? `${id}@${activeVersion(certOfId(id))}` : id;
}

// Kleine Badges für die Frage-Kopfzeile: aktueller Versionsstand (sobald >1 Version existiert)
// und "NEU" (nur wenn die Frage unter der aktiven Version inhaltlich neu ist).
function versionBadgesHtml(id) {
  const cert = certOfId(id);
  const cfg = CATALOG_VERSIONS[cert];
  if (!cfg || cfg.versions.length < 2) return '';
  const v = activeVersion(cert);
  let html = ` <span class="version-badge">${escapeHtml(cfg.labels[v] || v)}</span>`;
  if (isNewContentId(id)) html += ` <span class="version-badge version-badge-new">NEU</span>`;
  return html;
}

function getEntry(id) { return progress[progressKeyFor(id)] || { streak: 0 }; }
function isUnsicher(id) { return getEntry(id).streak < 2; }

function markCorrect(id) {
  const key = progressKeyFor(id);
  const e = progress[key] || { streak: 0 };
  e.streak = Math.min(e.streak + 1, 2);
  progress[key] = e;
  saveProgress(progress);
}

function markWrongOrUnknown(id) {
  progress[progressKeyFor(id)] = { streak: 0 };
  saveProgress(progress);
}

function resetAllProgress() {
  progress = {};
  saveProgress(progress);
  examResults = {};
  saveExamResults(examResults);
  bookmarks = {};
  saveBookmarks(bookmarks);
}

/* ---------- Merker (Bookmarks) ---------- */
const BOOKMARKS_KEY = 'src_trainer_bookmarks_v1';

function loadBookmarks() {
  try {
    const raw = localStorage.getItem(BOOKMARKS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) { return {}; }
}
function saveBookmarks(b) {
  try { localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(b)); } catch (e) {}
}
let bookmarks = loadBookmarks(); // { [id]: true }

function isBookmarked(id) { return !!bookmarks[id]; }

function toggleBookmark(id) {
  if (bookmarks[id]) delete bookmarks[id];
  else bookmarks[id] = true;
  saveBookmarks(bookmarks);
}

// Gemerkte Fragen-IDs für ein Zertifikat (bzw. alle certKeys zusammen), in Katalog-Reihenfolge
function bookmarkedIdsForCats(catKeys) {
  const idsInOrder = QUESTIONS.filter(q => catKeys.includes(q.cat)).map(q => q.id);
  return idsInOrder.filter(id => bookmarks[id]);
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
  const out = [];
  const seen = new Set();
  for (const key of catKeys) {
    let matched;
    if (key === 'BOOKMARKS_UBI_ERG') {
      matched = QUESTIONS.filter(q => q.e === 1 && bookmarks[q.id]);
    } else if (key.startsWith('BOOKMARKS_')) {
      const cert = key.slice('BOOKMARKS_'.length);
      matched = QUESTIONS.filter(q => CATEGORIES[q.cat].cert === cert && bookmarks[q.id]);
    } else {
      matched = QUESTIONS.filter(q => q.cat === key);
    }
    for (const q of matched) { if (!seen.has(q.id)) { seen.add(q.id); out.push(q); } }
  }
  return out;
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
const CERT_TAB_ORDER = ['SRC', 'LRC', 'UBI', '+UBI', 'ALL'];
const _savedSelectScreen = loadSelectScreenPrefs();
const state = {
  screen: 'select',       // 'select' | 'quiz' | 'summary' | 'examSummary' | 'bookmarksOverview'
  bookmarksOverviewCert: null, // 'SRC' | 'LRC' | 'UBI' | 'UBI_ERG' — welche Gemerkt-Liste gerade offen ist
  mode: _savedSelectScreen.mode === 'exam' ? 'exam' : 'practice', // 'practice' | 'exam' — zuletzt gewählt, persistiert
  certFilter: CERT_TAB_ORDER.includes(_savedSelectScreen.certFilter) ? _savedSelectScreen.certFilter : 'SRC', // zuletzt gewählt, persistiert
  catalogVersion: loadCatalogVersion(), // { SRC: '2018', LRC: '2018', UBI: '2018' } — persistiert
  onlyNewContent: loadOnlyNewContent(), // { UBI: true, ... } — "nurDiff"/"2026neu", persistiert
  _suppressTabClick: false, // wird nach einem Long-Press auf einen Cert-Tab kurz gesetzt
  selectedCats: selectedCatsForCertFilter(CERT_TAB_ORDER.includes(_savedSelectScreen.certFilter) ? _savedSelectScreen.certFilter : 'SRC'),
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
  else if (state.screen === 'bookmarksOverview') renderBookmarksOverview();
  else if (state.screen === 'info') renderInfo();
}

/* ---------- SELECT ---------- */

// Welches Katalog-Zertifikat steckt hinter einem Tab? (+UBI teilt sich Katalog/Version mit UBI;
// "ALL" hat keine einzelne Version, dort also kein Umschalter.)
function certTabUnderlyingCert(tabKey) {
  if (tabKey === 'SRC' || tabKey === 'LRC' || tabKey === 'UBI') return tabKey;
  if (tabKey === '+UBI') return 'UBI';
  return null;
}

// Kleines Label im Tab-Button selbst, z.B. "2018", "2026" oder "2026neu" — sobald es zu
// diesem Zertifikat mehr als eine Version gibt, damit immer klar ist, welche gerade aktiv ist.
function certTabVersionLabel(tabKey) {
  const cert = certTabUnderlyingCert(tabKey);
  const cfg = cert && CATALOG_VERSIONS[cert];
  if (!cfg || cfg.versions.length < 2) return '';
  const v = activeVersion(cert);
  const base = cfg.labels[v] || v;
  // "neu"-Zusatz nur im Übungsmodus zeigen — nurDiff gilt im Prüfmodus nicht, auch wenn die
  // Einstellung im Hintergrund für den nächsten Übungsbesuch erhalten bleibt.
  const showNeu = state.mode === 'practice' && onlyNewActiveFor(cert);
  return `<span class="cert-tab-version">${escapeHtml(showNeu ? base + 'neu' : base)}</span>`;
}

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
      let qs = ergOnly ? allQs.filter(q => q.e === 1) : allQs;
      qs = applyOnlyNewFilter(qs); // bei aktivem "2026neu" nur die inhaltlich neuen Fragen zählen
      if (qs.length === 0) return ''; // z.B. Kategorie ohne inhaltlich neue Fragen bei aktivem "2026neu"
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
      const resultKey = examResultKeyFor(group, bogen.n);
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

  function bookmarkRow(certOrErg) {
    const ids = certOrErg === 'UBI_ERG'
      ? QUESTIONS.filter(q => q.e === 1 && bookmarks[q.id]).map(q => q.id)
      : QUESTIONS.filter(q => CATEGORIES[q.cat].cert === certOrErg && bookmarks[q.id]).map(q => q.id);
    if (ids.length === 0) return ''; // Rubrik erscheint erst, sobald mindestens 1 Frage gemerkt ist
    // Statistik-Badge/Checkbox-Pool wie bei den Themen-Kategorien um "2026neu" reduzieren — die
    // Merk-Übersicht selbst (Titel-Klick) bleibt bewusst ungefiltert, das ist deine kuratierte Liste.
    const poolIds = applyOnlyNewFilter(ids.map(id => ({ id }))).map(x => x.id);
    if (poolIds.length === 0) return '';
    const virtualKey = certOrErg === 'UBI_ERG' ? 'BOOKMARKS_UBI_ERG' : `BOOKMARKS_${certOrErg}`;
    const mastered = poolIds.filter(id => !isUnsicher(id)).length;
    const half = poolIds.filter(id => getEntry(id).streak === 1).length;
    const pctMastered = Math.round(mastered / poolIds.length * 100);
    const pctSeen = Math.round((mastered + half) / poolIds.length * 100);
    const checked = state.selectedCats.includes(virtualKey) ? 'checked' : '';
    return `
      <div class="cat-row">
        <label class="cat-check-wrap" title="Auswählen">
          <input type="checkbox" data-cat="${virtualKey}" ${checked} />
          <span class="cat-check-box"></span>
        </label>
        <button class="cat-title-btn" data-bookmarks-overview="${certOrErg}">
          <span class="cat-title">★ Gemerkt</span>
          <span class="cat-meta">${mastered}/${poolIds.length}</span>
          <span class="cat-bar">
            <span class="cat-bar-half" style="width:${pctSeen}%"></span>
            <span class="cat-bar-fill" style="width:${pctMastered}%"></span>
          </span>
        </button>
      </div>`;
  }

  const selStats = state.certFilter === '+UBI' ? statsForErgaenzung() : statsFor(state.selectedCats);
  const poolCount = buildPracticePool().length;
  const onlyNewHintCert = certTabUnderlyingCert(state.certFilter);
  const onlyNewHint = (onlyNewHintCert && onlyNewActiveFor(onlyNewHintCert))
    ? `<p class="pool-info" style="color:var(--muted);font-weight:400;">nur die neuen ${escapeHtml(CATALOG_VERSIONS[onlyNewHintCert].labels[activeVersion(onlyNewHintCert)])}er Fragen (lange auf „${escapeHtml(state.certFilter)}" drücken zum Ändern)</p>`
    : '';

  if (state.mode === 'practice') {
    return `
    <section class="panel">
      <h2>Kategorien</h2>
      ${(state.certFilter === 'SRC' || state.certFilter === 'ALL') ? `
        ${state.certFilter === 'ALL' ? '<p class="cert-label cert-src">SRC</p>' : ''}
        <div class="cat-list">${bookmarkRow('SRC')}${catRows(srcCats)}</div>` : ''}
      ${(state.certFilter === 'LRC' || state.certFilter === 'ALL') ? `
        ${state.certFilter === 'ALL' ? '<p class="cert-label cert-lrc">LRC</p>' : ''}
        <div class="cat-list">${bookmarkRow('LRC')}${catRows(lrcCats)}</div>` : ''}
      ${(state.certFilter === 'UBI' || state.certFilter === 'ALL') ? `
        ${state.certFilter === 'ALL' ? '<p class="cert-label cert-ubi">UBI</p>' : ''}
        <div class="cat-list">${bookmarkRow('UBI')}${catRows(ubiCats)}</div>` : ''}
      ${state.certFilter === '+UBI' ? `
        <p class="erg-hint">Ergänzungsprüfung SRC→UBI: 79 Fragen aus dem UBI-Katalog.<br>Fortschritt wird mit dem UBI-Tab geteilt.</p>
        <div class="cat-list">${bookmarkRow('UBI_ERG')}${catRows(ubiCats, true)}</div>` : ''}
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
      ${onlyNewHint}
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

  // "Gemerkt"-Titel: öffnet die Übersicht statt direkt eine Übungsrunde zu starten
  root.querySelectorAll('.cat-title-btn[data-bookmarks-overview]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.bookmarksOverviewCert = btn.getAttribute('data-bookmarks-overview');
      state.screen = 'bookmarksOverview';
      render();
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
    showConfirmDialog(
      'Wirklich den gesamten Lernfortschritt löschen (inkl. Prüfungsergebnisse)?',
      () => { resetAllProgress(); render(); },
      { confirmLabel: 'Löschen', cancelLabel: 'Abbrechen', danger: true }
    );
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

let _versionDropdownOutsideHandler = null;

function closeVersionDropdown() {
  const dd = document.getElementById('versionDropdown');
  if (dd) dd.remove();
  if (_versionDropdownOutsideHandler) {
    document.removeEventListener('click', _versionDropdownOutsideHandler);
    _versionDropdownOutsideHandler = null;
  }
}

function showVersionMenu(cert, anchorBtn) {
  const cfg = CATALOG_VERSIONS[cert];
  if (!cfg || cfg.versions.length < 2) return;

  closeVersionDropdown(); // ggf. bereits offenes Dropdown (anderer Tab) zuerst schließen

  const currentV = activeVersion(cert);
  const currentOnlyNew = onlyNewActiveFor(cert);

  let optsHtml = '';
  for (const v of cfg.versions) {
    const label = cfg.labels[v] || v;
    const isDefault = v === cfg.default;
    const active = v === currentV && !currentOnlyNew;
    optsHtml += `<button class="version-dd-option ${active ? 'version-dd-option-active' : ''}" data-version="${v}" data-only-new="0">${escapeHtml(label)}</button>`;
    // "…neu"-Variante (nurDiff) nur für Nicht-Standardversionen und nur im Übungsmodus
    if (!isDefault && state.mode === 'practice') {
      const activeNeu = v === currentV && currentOnlyNew;
      optsHtml += `<button class="version-dd-option ${activeNeu ? 'version-dd-option-active' : ''}" data-version="${v}" data-only-new="1">${escapeHtml(label + 'neu')}</button>`;
    }
  }

  const dd = document.createElement('div');
  dd.id = 'versionDropdown';
  dd.className = 'version-dropdown';
  dd.innerHTML = optsHtml;

  // Direkt unter dem gedrückten Tab verankern (kein Overlay/Dialog, bleibt "flach").
  const barEl = anchorBtn.closest('.cert-tabs');
  barEl.style.position = 'relative';
  barEl.appendChild(dd);
  dd.style.left = anchorBtn.offsetLeft + 'px';
  dd.style.top = (anchorBtn.offsetTop + anchorBtn.offsetHeight + 6) + 'px';

  dd.querySelectorAll('.version-dd-option').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      state.catalogVersion[cert] = btn.getAttribute('data-version');
      saveCatalogVersion(state.catalogVersion);
      state.onlyNewContent[cert] = btn.getAttribute('data-only-new') === '1';
      saveOnlyNewContent(state.onlyNewContent);
      closeVersionDropdown();
      render();
    });
  });

  // Klick irgendwo außerhalb schließt das Dropdown wieder. Das Mouseup/Click-Ereignis, das den
  // Long-Press selbst beendet (Ziel = derselbe Tab-Button), wird dabei einmalig ignoriert — sonst
  // klappt das Dropdown am Desktop sofort wieder zu, sobald man die Maustaste loslässt.
  let ignoreAnchorClick = true;
  setTimeout(() => {
    function onOutside(e) {
      // anchorBtn.contains(...) statt striktem ===, da der Tab-Button jetzt verschachteltes HTML
      // enthält (z.B. das Versions-Label als <span>) — e.target beim Loslassen kann dieses Kind-
      // element sein, nicht der Button selbst.
      if (anchorBtn.contains(e.target) && ignoreAnchorClick) { ignoreAnchorClick = false; return; }
      if (!dd.contains(e.target)) {
        document.removeEventListener('click', onOutside);
        closeVersionDropdown();
      }
    }
    _versionDropdownOutsideHandler = onOutside;
    document.addEventListener('click', onOutside);
  }, 0);
}

// Langes Drücken (Touch oder Maus) auf einen Zertifikat-Tab öffnet den Versions-Umschalter,
// ohne den normalen Klick (Tab wechseln) bzw. das Streich-Umschalten zu stören.
function attachCertTabLongPress(barEl) {
  if (!barEl) return;
  let timer = null;
  let startX = 0, startY = 0;

  barEl.querySelectorAll('.cert-tab').forEach(btn => {
    const cert = certTabUnderlyingCert(btn.getAttribute('data-cert'));
    if (!cert || !CATALOG_VERSIONS[cert] || CATALOG_VERSIONS[cert].versions.length < 2) return;

    const cancelTimer = () => { if (timer) { clearTimeout(timer); timer = null; } };

    btn.addEventListener('pointerdown', (e) => {
      startX = e.clientX; startY = e.clientY;
      cancelTimer();
      timer = setTimeout(() => {
        timer = null;
        state._suppressTabClick = true; // der anschließende click-Event soll nicht den Tab wechseln
        showVersionMenu(cert, btn);
      }, 500);
    });
    btn.addEventListener('pointermove', (e) => {
      if (Math.abs(e.clientX - startX) > 8 || Math.abs(e.clientY - startY) > 8) cancelTimer();
    });
    btn.addEventListener('pointerup', cancelTimer);
    btn.addEventListener('pointercancel', cancelTimer);
    btn.addEventListener('pointerleave', cancelTimer);
  });
}

function renderSelect() {
  saveSelectScreenPrefs(); // hält "zuletzt gewählter Tab/Modus" aktuell, übersteht Neustart/Pull-to-refresh
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
        <button class="cert-tab ${state.certFilter==='SRC'?'active':''}" data-cert="SRC">SRC${certTabVersionLabel('SRC')}</button>
        <button class="cert-tab ${state.certFilter==='LRC'?'active':''}" data-cert="LRC">LRC${certTabVersionLabel('LRC')}</button>
        <button class="cert-tab ${state.certFilter==='UBI'?'active':''}" data-cert="UBI">UBI${certTabVersionLabel('UBI')}</button>
        <button class="cert-tab ${state.certFilter==='+UBI'?'active':''}" data-cert="+UBI">+UBI${certTabVersionLabel('+UBI')}</button>
        <button class="cert-tab ${state.certFilter==='ALL'?'active':''}" data-cert="ALL">Alle</button>
      </div>
    </section>

    <div id="certSwipeViewport" class="quiz-swipe-viewport">
      <div id="certSwipeArea" class="quiz-swipe-area">${certContentHtml()}</div>
    </div>

    <p class="app-info-link"><button id="infoBtn" class="btn-link">ℹ️ Info &amp; Über die App · ${APP_VERSION}</button></p>
  `;

  // Zertifikat-Tabs: normaler Klick wählt direkt
  root.querySelectorAll('.cert-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      if (state._suppressTabClick) { state._suppressTabClick = false; return; }
      applyCertFilter(btn.getAttribute('data-cert'));
    });
  });
  // ...und Streichen über die Tab-Leiste wählt schon live beim Drüberfahren (Maus oder Finger)
  attachCertTabDragPreview(document.getElementById('certTabsBar'));
  // ...und langes Drücken öffnet den Versions-Umschalter (2018/2026/2026neu), aktuell nur UBI/+UBI
  attachCertTabLongPress(document.getElementById('certTabsBar'));

  document.getElementById('infoBtn').addEventListener('click', () => {
    state.screen = 'info';
    render();
  });

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
// Prüfergebnis-Speicher-Key: Bögen ohne inhaltlich neue Fragen bleiben versionsübergreifend
// geteilt (Bogen-Zusammenstellung ändert sich ja nachweislich nicht), enthält ein Bogen aber
// mindestens eine inhaltlich neue Frage, bekommt er unter der Nicht-Standardversion ein eigenes,
// getrenntes Ergebnis — sonst würde ein unter 2018 bestandener Bogen fälschlich auch für 2026
// als "erledigt" gelten, obwohl der Inhalt teils ein anderer ist.
function examResultKeyFor(group, n) {
  const cert = group === 'UBI_ERG' ? 'UBI' : group;
  const cfg = CATALOG_VERSIONS[cert];
  const base = `${group}-${n}`;
  if (!cfg || cfg.versions.length < 2) return base;
  const v = activeVersion(cert);
  if (v === cfg.default) return base;
  const bogen = EXAMS[group].find(b => b.n === n);
  const hasNewContent = bogen && bogen.qs.some(id => isNewContentId(id));
  return hasNewContent ? `${base}@${v}` : base;
}

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
    const q = resolveQuestion(QUESTIONS.find(x => x.id === id));
    const given = state.examAnswers[id] ?? null;
    const isCorrect = given === q.o[0];
    if (isCorrect) { correctCount++; markCorrect(id); } else { markWrongOrUnknown(id); }
    return { id, given, correctText: q.o[0], isCorrect };
  });

  const wrongCount = ids.length - correctCount;
  const passed = wrongCount <= meta.maxWrong;
  const elapsedSec = Math.min(meta.time * 60, Math.round((Date.now() - state.examStartedAt) / 1000));

  examResults[examResultKeyFor(group, n)] = {
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
  const q = resolveQuestion(QUESTIONS.find(x => x.id === id));
  if (!state.examShuffled[id]) state.examShuffled[id] = shuffle(q.o);
  const opts = state.examShuffled[id];
  const given = state.examAnswers[id];

  const optHtml = opts.map((opt, i) => {
    const selected = given === opt ? ' selected' : '';
    return `<button class="option exam-option${selected}" data-idx="${i}">${escapeHtml(opt)}</button>`;
  }).join('');

  return `
      <section class="panel question-panel">
        <p class="question-id">
          ${displayNumber(q)}${versionBadgesHtml(id)}
          <button class="bm-star ${isBookmarked(id) ? 'bm-star-active' : ''}" data-bookmark-id="${id}" title="Merken">★</button>
        </p>
        <h2 class="question-text">${escapeHtml(q.q)}</h2>
        <div class="options">${optHtml}</div>
      </section>`;
}

function renderExamQuiz() {
  const group = state.examGroup;
  const id = state.queue[state.currentIndex];
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
    <div class="exam-seg-bar" id="examSegBar">
      ${state.queue.map((qid, i) => {
        const answered = state.examAnswers[qid] !== undefined;
        const cls = i === state.currentIndex ? 'exam-seg-current' : (answered ? 'exam-seg-answered' : '');
        return `<button class="exam-seg ${cls}" data-jump-idx="${i}" aria-label="Frage ${i + 1}"></button>`;
      }).join('')}
    </div>

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

  root.querySelector('.bm-star')?.addEventListener('click', () => {
    toggleBookmark(id);
    render();
  });

  root.querySelectorAll('.exam-seg').forEach(btn => {
    btn.addEventListener('click', () => {
      state.currentIndex = +btn.getAttribute('data-jump-idx');
      render();
    });
  });
  attachExamSegDrag(document.getElementById('examSegBar'));

  document.getElementById('examPrevBtn')?.addEventListener('click', () => {
    state.currentIndex--; render();
  });
  document.getElementById('examNextBtn')?.addEventListener('click', () => {
    state.currentIndex++; render();
  });
  document.getElementById('examSubmitBtn')?.addEventListener('click', () => confirmSubmitExam());
  document.getElementById('examSubmitEarlyBtn').addEventListener('click', () => confirmSubmitExam());
  document.getElementById('examExitBtn').addEventListener('click', () => {
    showConfirmDialog(
      'Prüfung wirklich abbrechen? Der Fortschritt in dieser Prüfungssimulation geht verloren.',
      () => {
        if (state.examTimerInterval) { clearInterval(state.examTimerInterval); state.examTimerInterval = null; }
        state.mode = 'exam';
        state.screen = 'select';
        render();
      },
      { confirmLabel: 'Prüfung abbrechen', cancelLabel: 'Weitermachen', danger: true }
    );
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

// Leichtgewichtiges Update während des Streichens über die Segmentleiste: die Segment-Buttons
// selbst werden NICHT neu aufgebaut (nur ihre Klassen aktualisiert) — sonst zerstört das volle
// render() mitten in der Touch-Geste genau das Element, an dem Android die Touch-Erfassung hängen
// hat, und die Wisch-Geste bricht ab (analog zum bestehenden Cert-Tab-Streich-Muster). Der Rest
// der Seite (Fragetext, Zähler, Zurück/Weiter-Buttons) darf frei neu aufgebaut werden, da die
// laufende Geste nur an der Segmentleiste selbst hängt.
function updateExamAfterDragJump() {
  const bar = document.getElementById('examSegBar');
  if (bar) {
    bar.querySelectorAll('.exam-seg').forEach(btn => {
      const idx = +btn.getAttribute('data-jump-idx');
      const answered = state.examAnswers[state.queue[idx]] !== undefined;
      btn.className = 'exam-seg' + (idx === state.currentIndex ? ' exam-seg-current' : (answered ? ' exam-seg-answered' : ''));
    });
  }

  const progressText = root.querySelector('.progress-text');
  if (progressText) progressText.textContent = `${state.currentIndex + 1} / ${state.queue.length}`;

  const swipeArea = document.getElementById('examSwipeArea');
  if (swipeArea) swipeArea.innerHTML = renderExamQuestionPanelInner();

  const actionsSection = root.querySelector('.quiz-actions');
  if (actionsSection) {
    const isLast = state.currentIndex + 1 >= state.queue.length;
    actionsSection.innerHTML = `
      ${state.currentIndex > 0 ? `<button id="examPrevBtn" class="btn-secondary action-back">← Zurück</button>` : ''}
      ${isLast
        ? `<button id="examSubmitBtn" class="btn-primary action-main">Prüfung abgeben</button>`
        : `<button id="examNextBtn" class="btn-primary action-main">Weiter →</button>`}
    `;
  }

  bindExamOptionListeners();
  const id = state.queue[state.currentIndex];
  root.querySelector('.bm-star')?.addEventListener('click', () => { toggleBookmark(id); render(); });
  document.getElementById('examPrevBtn')?.addEventListener('click', () => { state.currentIndex--; render(); });
  document.getElementById('examNextBtn')?.addEventListener('click', () => { state.currentIndex++; render(); });
  document.getElementById('examSubmitBtn')?.addEventListener('click', () => confirmSubmitExam());
}

// Streichen über die Segmentleiste springt live zur jeweiligen Frage — analog zum
// Zertifikat-Tab-Streichen. Bewusst ohne Wisch-Übergang pro Zwischenschritt (sähe bei
// schnellem Streichen über viele Segmente ruckelig aus), stattdessen sofortiges Umschalten.
function attachExamSegDrag(barEl) {
  if (!barEl) return;
  let dragging = false;

  barEl.addEventListener('pointerdown', (e) => {
    dragging = true;
    // Pointer Capture: die Leiste ist nur 8-13px hoch, ohne das hier würde jede kleine
    // vertikale Abweichung (nach oben/unten aus der schmalen Leiste raus) die Geste sofort
    // beenden. Mit Capture bleiben pointermove/pointerup auch außerhalb zuverlässig an der
    // Leiste "angedockt", bis losgelassen wird.
    try { barEl.setPointerCapture(e.pointerId); } catch (err) { /* nicht unterstützt: kein Beinbruch */ }
  });

  // Position wie bei einem Schieberegler aus der X-Koordinate relativ zur Leiste berechnen —
  // die Y-Position ist dabei egal, man muss also nicht exakt auf der schmalen Segment-Linie
  // bleiben (das vorherige elementFromPoint-basierte Hit-Testing brauchte Pixel-genaues Treffen
  // der 8-13px hohen Leiste und riss bei jeder kleinen vertikalen Mausbewegung ab).
  barEl.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const total = state.queue.length;
    if (!total) return;
    const rect = barEl.getBoundingClientRect();
    if (!rect.width) return;
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const idx = Math.min(total - 1, Math.floor(ratio * total));
    if (idx !== state.currentIndex) { state.currentIndex = idx; updateExamAfterDragJump(); }
  });

  function endDrag(e) {
    dragging = false;
    try { barEl.releasePointerCapture(e.pointerId); } catch (err) { /* ignorieren */ }
  }
  barEl.addEventListener('pointerup', endDrag);
  barEl.addEventListener('pointercancel', endDrag);
  // Mit aktivem Pointer Capture feuert pointerleave beim reinen Verlassen der Leiste nicht mehr
  // fälschlich als Geste-Ende — als zusätzliches Sicherheitsnetz bleibt es dennoch registriert.
  barEl.addEventListener('pointerleave', (e) => { if (!barEl.hasPointerCapture || !barEl.hasPointerCapture(e.pointerId)) endDrag(e); });
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
  showConfirmDialog(msg, () => submitExam(false), { confirmLabel: 'Abgeben', cancelLabel: 'Weitermachen' });
}

// Startet eine normale Übungsrunde, aber mit einer festen Warteschlange (unshuffled,
// Katalog-Reihenfolge) aus genau den gemerkten Fragen — beginnend bei startIndex.
// So kann man von der Übersicht aus gezielt zu einer bestimmten Frage springen und
// trotzdem ganz normal weiter vor/zurück blättern.
function startBookmarksPractice(certOrErg, startIndex) {
  const ids = certOrErg === 'UBI_ERG'
    ? QUESTIONS.filter(q => q.e === 1 && bookmarks[q.id]).map(q => q.id)
    : QUESTIONS.filter(q => CATEGORIES[q.cat].cert === certOrErg && bookmarks[q.id]).map(q => q.id);
  if (ids.length === 0) return;

  // Eigener Modus 'bookmarks': wie Üben, aber freies Blättern (auch unbeantwortet vorwärts),
  // kein Auto-Advance, Erklärung immer sofort sichtbar, Zurück-Link führt zur Merk-Übersicht.
  state.mode = 'bookmarks';
  state.queue = ids;
  state.currentIndex = Math.max(0, Math.min(startIndex, ids.length - 1));
  state.frontier = state.queue.length - 1; // alle Fragen sind hier von Anfang an frei erreichbar
  state.sessionResults = { correct: 0, wrong: 0, dontknow: 0 };
  state.givenAnswers = {};
  state.screen = 'quiz';
  loadCurrentQuestion();
  render();
}

function buildPracticePool() {
  let pool = questionsForCats(state.selectedCats);
  if (state.certFilter === '+UBI') pool = pool.filter(q => q.e === 1);
  pool = applyOnlyNewFilter(pool);
  if (state.filterMode === 'unsicher') pool = pool.filter(q => isUnsicher(q.id));
  return pool;
}

function startSession(catOverride) {
  // catOverride: optional single category key for quick-start
  if (catOverride) {
    state.selectedCats = [catOverride];
  }
  const pool = buildPracticePool();

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
  const q = resolveQuestion(QUESTIONS.find(x => x.id === id));
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

/* ---------- Bestätigungs-Dialog (Ersatz für natives confirm()) ---------- */
// showConfirmDialog(nachricht, onBestaetigt, { confirmLabel, cancelLabel, danger })
// onBestaetigt wird nur aufgerufen, wenn der Nutzer den Bestätigen-Button antippt.
function showConfirmDialog(message, onConfirmed, opts = {}) {
  const { confirmLabel = 'OK', cancelLabel = 'Abbrechen', danger = false } = opts;

  let overlay = document.getElementById('confirmOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'confirmOverlay';
    overlay.className = 'confirm-overlay';
    document.body.appendChild(overlay);
  }

  overlay.innerHTML = `
    <div class="confirm-box">
      <p class="confirm-message">${escapeHtml(message)}</p>
      <div class="confirm-actions">
        <button id="confirmCancelBtn" class="btn-secondary">${escapeHtml(cancelLabel)}</button>
        <button id="confirmOkBtn" class="${danger ? 'btn-danger' : 'btn-primary'}">${escapeHtml(confirmLabel)}</button>
      </div>
    </div>
  `;

  // Reflow erzwingen, damit die Einblende-Transition sauber greift, auch wenn der Dialog
  // gerade erst neu ins DOM eingehängt wurde.
  void overlay.offsetWidth;
  overlay.classList.add('confirm-overlay-show');

  function close() { overlay.classList.remove('confirm-overlay-show'); }

  document.getElementById('confirmCancelBtn').addEventListener('click', close);
  document.getElementById('confirmOkBtn').addEventListener('click', () => {
    close();
    onConfirmed();
  });
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
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
  const q = resolveQuestion(QUESTIONS.find(x => x.id === id));
  const total = state.queue.length;
  const catTitle = CATEGORIES[q.cat].title;
  const given = state.givenAnswers[id];
  const wasDontKnow = state.answered && given && given.text === null;
  const badgesHtml = versionBadgesHtml(id);

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
  const hideBecauseAutoAdvancing = state.mode !== 'bookmarks' && state.freshlyAnswered && given && given.correct;
  const explHtml = state.answered && explanation && !hideBecauseAutoAdvancing
    ? `<section class="panel explanation-panel">
        <p class="explanation-label">💡 Warum ist das richtig?</p>
        <p class="explanation-text">${escapeHtml(explanation)}</p>
       </section>`
    : '';

  return `
      <section class="panel question-panel">
        <p class="question-id">
          ${displayNumber(q)} &middot; ${escapeHtml(catTitle)}${badgesHtml}
          <button class="bm-star ${isBookmarked(id) ? 'bm-star-active' : ''}" data-bookmark-id="${id}" title="Merken">★</button>
        </p>
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

  const bm = state.mode === 'bookmarks';
  const canGoBack = state.currentIndex > 0;
  const canGoForward = state.currentIndex + 1 < total;
  const backBtnHtml = canGoBack
    ? `<button id="prevBtn" class="btn-secondary action-back">← Zurück</button>` : '';

  let mainBtnHtml;
  if (bm) {
    // Merkliste: freies Vor-/Zurückblättern, unabhängig vom Beantwortungsstatus, kein Rundenende
    mainBtnHtml = canGoForward
      ? `<button id="nextBtn" class="btn-primary action-main">Weiter →</button>` : '';
  } else if (!state.answered) {
    mainBtnHtml = `<button id="dontKnowBtn" class="btn-secondary action-main">Weiß nicht</button>`;
  } else {
    mainBtnHtml = `<button id="nextBtn" class="btn-primary action-main">${isLast ? 'Runde beenden' : 'Weiter →'}</button>`;
  }
  const actionHtml = backBtnHtml + mainBtnHtml;

  root.innerHTML = `
    <header class="header quiz-header">
      <button id="exitBtn" class="btn-link">${bm ? '&larr; Gemerkt' : '&larr; Auswahl'}</button>
      <span class="cert-badge cert-${certLabel.toLowerCase()}">${certLabel}</span>
      <p class="progress-text">${pos} / ${total}</p>
    </header>
    <div class="progress-bar"><div class="progress-bar-fill" style="width:${pos/total*100}%"></div></div>

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
    if (bm) { state.mode = 'practice'; state.screen = 'bookmarksOverview'; }
    else { state.screen = 'select'; }
    render();
  });

  root.querySelector('.bm-star')?.addEventListener('click', () => {
    toggleBookmark(id);
    render();
  });

  attachSwipeHandlers(document.getElementById('quizSwipeArea'), {
    canForward: () => bm ? canGoForward : state.answered,
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
    if (!bm) document.getElementById('dontKnowBtn').addEventListener('click', dontKnow);
  }
  // Weiter-Button: bei normalem Üben nur nach Beantwortung vorhanden (s.o.), im
  // Merkliste-Modus unabhängig davon — daher hier unabhängig vom answered-Zweig binden.
  document.getElementById('nextBtn')?.addEventListener('click', () => {
    if (state.autoAdvanceTimer) clearTimeout(state.autoAdvanceTimer);
    nextQuestion();
  });
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
  // Auto-advance after 1s only on correct answer — nicht im freien Merkliste-Modus
  if (isCorrect && state.mode !== 'bookmarks') {
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
    const q = resolveQuestion(QUESTIONS.find(x => x.id === pq.id));
    const icon = pq.isCorrect ? '<span class="exam-check-ok">✔</span>' : '<span class="exam-check-bad">✘</span>';
    const expanded = state.examExpanded.has(pq.id);
    const explanation = (typeof EXPLANATIONS !== 'undefined') ? (EXPLANATIONS[pq.id] || null) : null;
    const teaser = q.q.length > 60 ? q.q.slice(0, 60).trim() + '…' : q.q;

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
          <span class="bm-row-teaser">${escapeHtml(teaser)}</span>
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

/* ---------- Gemerkt-Übersicht ---------- */
function renderBookmarksOverview() {
  const certOrErg = state.bookmarksOverviewCert;
  const label = certOrErg === 'UBI_ERG' ? '+UBI' : certOrErg;
  const ids = certOrErg === 'UBI_ERG'
    ? QUESTIONS.filter(q => q.e === 1 && bookmarks[q.id]).map(q => q.id)
    : QUESTIONS.filter(q => CATEGORIES[q.cat].cert === certOrErg && bookmarks[q.id]).map(q => q.id);

  const rows = ids.map((id, idx) => {
    const q = resolveQuestion(QUESTIONS.find(x => x.id === id));
    const teaser = q.q.length > 70 ? q.q.slice(0, 70).trim() + '…' : q.q;
    const mastered = !isUnsicher(id);
    return `
      <div class="bm-row">
        <button class="bm-row-main" data-jump-idx="${idx}">
          <span class="bm-row-num${mastered ? ' bm-row-num-ok' : ''}">${displayNumber(q)}</span>
          <span class="bm-row-teaser">${escapeHtml(teaser)}</span>${versionBadgesHtml(id)}
        </button>
        <button class="bm-row-star" data-unmark-id="${id}" title="Merker entfernen">★</button>
      </div>`;
  }).join('');

  root.innerHTML = `
    <header class="header">
      <button id="bmBackBtn" class="btn-link">&larr; Auswahl</button>
      <h1>★ Gemerkt · ${label}</h1>
      <p class="sub">${ids.length} Frage${ids.length===1?'':'n'}</p>
    </header>
    <section class="panel">
      ${ids.length > 0 ? `<div class="bm-list">${rows}</div>` : `<p class="pool-info">Noch keine Fragen gemerkt. Tippe im Quiz auf den Stern bei einer Frage, um sie hier zu sammeln.</p>`}
    </section>
  `;

  document.getElementById('bmBackBtn').addEventListener('click', () => {
    state.mode = 'practice';
    state.screen = 'select'; render();
  });
  root.querySelectorAll('.bm-row-main').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.getAttribute('data-jump-idx'), 10);
      startBookmarksPractice(certOrErg, idx);
    });
  });
  root.querySelectorAll('.bm-row-star').forEach(btn => {
    btn.addEventListener('click', () => {
      toggleBookmark(btn.getAttribute('data-unmark-id'));
      render(); // Liste neu aufbauen, entfernte Frage verschwindet direkt
    });
  });
}

/* ---------- Info & Über die App ---------- */
function renderInfo() {
  root.innerHTML = `
    <header class="header">
      <button id="infoBackBtn" class="btn-link">&larr; Auswahl</button>
      <h1>Info &amp; Über die App</h1>
      <p class="sub">Funkzeugnis Trainer · ${APP_VERSION}</p>
    </header>

    <section class="panel">
      <h2>Was ist das</h2>
      <p class="info-text">
        Lerntrainer für die Fragenkataloge der deutschen Seefunk-/Binnenschifffahrtsfunk-Zeugnisse
        SRC, LRC, UBI und die Ergänzungsprüfung +UBI — alle 386 Fragen im amtlichen Wortlaut,
        Übungs- und Prüfungsmodus.
      </p>
    </section>

    <section class="panel">
      <h2>Funktionen</h2>
      <ul class="info-list">
        <li>Übungsmodus mit Streak-Fortschritt je Frage und handgeschriebenen Erklärungen</li>
        <li>Prüfungsmodus mit allen 48 offiziellen Prüfbögen, Timer und Auswertung</li>
        <li>Merker: einzelne Fragen markieren und gezielt wiederholen</li>
        <li>UBI: Umschalter zwischen dem Katalog 2018 und dem neuen Katalog ab 1.10.2026,
          inkl. „nur die neuen Fragen"-Filter</li>
        <li>Als PWA installierbar, funktioniert offline</li>
      </ul>
    </section>

    <section class="panel">
      <h2>Deine Daten</h2>
      <p class="info-text">
        Der gesamte Fortschritt (Streaks, Prüfungsergebnisse, Merkliste, gewählte Katalogversion)
        wird ausschließlich lokal auf diesem Gerät gespeichert (Browser-Speicher). Es gibt keinen
        Server, an den etwas übertragen wird.
      </p>
    </section>

    <section class="panel">
      <h2>Quellen &amp; Lizenzhinweis</h2>
      <p class="info-text">
        Die Fragenkataloge stammen direkt aus den amtlichen Verkehrsblatt-Bekanntmachungen
        (SRC/LRC: VkBl. 2009/145, geändert 2010/85 und 2018/109; UBI: VkBl. 2011/117, geändert
        2018/102; neuer UBI-Katalog ab 1.10.2026 aus dem entsprechenden Verkehrsblatt). Amtliche
        Bekanntmachungen wie diese sind nach § 5 UrhG nicht urheberrechtlich geschützt.
      </p>
      <p class="info-small">
        Für die private Nutzung zum Lernen vorgesehen, keine Gewähr auf Vollständigkeit oder
        Aktualität. Bei Widersprüchen zur aktuell gültigen amtlichen Prüfungsordnung gilt
        selbstverständlich immer Letztere.
      </p>
    </section>

    <section class="panel">
      <h2>Mehr</h2>
      <p class="info-text">
        Live unter <a href="https://ecivona.github.io/src-trainer/" class="btn-link" style="display:inline">ecivona.github.io/src-trainer</a>.
        Ausführlichere technische Doku im README des Projekts.
      </p>
    </section>
  `;

  document.getElementById('infoBackBtn').addEventListener('click', () => {
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
