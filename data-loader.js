'use strict';

/**
 * data-loader.js
 *
 * Lädt die Frage-/Prüfbogen-/Erklärungs-/Katalogversions-Daten per fetch() aus den
 * JSON-Dateien (statt wie bisher per <script src="data.js"> etc.) und macht sie als
 * globale Variablen CATEGORIES/QUESTIONS/EXAM_META/EXAMS/EXPLANATIONS/CATALOG_VERSIONS
 * verfügbar - unter genau den Namen, die app.js überall erwartet.
 *
 * WICHTIG: app.js greift schon beim reinen Ausführen (nicht erst bei Bedienung durch
 * die Nutzerin) synchron auf diese Variablen zu (z.B. `const state = {... loadCatalogVersion()}`).
 * Deshalb wird app.js hier bewusst erst NACH erfolgreichem Laden der Daten per
 * <script> in die Seite eingehängt, statt es (wie bisher) direkt fix in index.html
 * zu verlinken.
 */
(function () {
  const root = document.getElementById('app');

  const FILES = [
    { key: 'data', url: 'data.json' },
    { key: 'catalog_versions', url: 'catalog_versions.json' },
    { key: 'exams', url: 'exams.json' },
    { key: 'explanations', url: 'explanations.json' },
  ];

  function showError(message) {
    if (!root) return;
    root.innerHTML =
      '<div style="padding:2rem 1rem;text-align:center;">' +
      '<p><strong>Fragendaten konnten nicht geladen werden.</strong></p>' +
      '<p style="color:var(--muted,#888);">' + message + '</p>' +
      '<p><button id="dataLoaderRetryBtn" style="padding:.6em 1.2em;">Erneut versuchen</button></p>' +
      '</div>';
    const btn = document.getElementById('dataLoaderRetryBtn');
    if (btn) btn.addEventListener('click', () => window.location.reload());
  }

  function loadAppScript() {
    const script = document.createElement('script');
    script.src = 'app.js';
    script.onerror = () => showError('app.js konnte nicht geladen werden.');
    document.body.appendChild(script);
  }

  Promise.all(
    FILES.map(f =>
      fetch(f.url).then(res => {
        if (!res.ok) throw new Error(f.url + ': HTTP ' + res.status);
        return res.json();
      }).then(json => ({ key: f.key, json }))
    )
  )
    .then(results => {
      const byKey = {};
      for (const r of results) byKey[r.key] = r.json;

      // Globale Variablen setzen - exakt die Namen, die app.js als bare identifiers
      // referenziert (CATEGORIES, QUESTIONS, ...). Eine Zuweisung an `window.X` macht
      // `X` als globalen Bezeichner in jedem danach geladenen <script> verfügbar.
      window.CATEGORIES = byKey.data.CATEGORIES;
      window.QUESTIONS = byKey.data.QUESTIONS;
      window.CATALOG_VERSIONS = byKey.catalog_versions.CATALOG_VERSIONS;
      window.EXAM_META = byKey.exams.EXAM_META;
      window.EXAMS = byKey.exams.EXAMS;
      window.EXPLANATIONS = byKey.explanations.EXPLANATIONS;

      loadAppScript();
    })
    .catch(err => {
      console.error('Fehler beim Laden der Fragendaten:', err);
      showError('Bitte Internetverbindung prüfen und Seite neu laden. (' + err.message + ')');
    });
})();
