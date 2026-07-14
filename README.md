# SRC/LRC/UBI/+UBI Funkzeugnis Trainer

Eine PWA (Progressive Web App) zum Lernen der Fragenkataloge für die
deutschen Seefunk-/Binnenschifffahrtsfunk-Zeugnisse:

- **SRC** – Short Range Certificate (Beschränkt Gültiges Funkbetriebszeugnis)
- **LRC** – Long Range Certificate (Allgemeines Funkbetriebszeugnis)
- **UBI** – UKW-Sprechfunkzeugnis für den Binnenschifffahrtsfunk
- **+UBI** – Ergänzungsprüfung SRC/LRC/ROC/GOC/UBZ → UBI

Live unter <https://ecivona.github.io/src-trainer/>

## Funktionsumfang

### Übungsmodus
- Alle 386 Fragen aus den amtlichen Fragenkatalogen (SRC 180, LRC 76, UBI 130,
  davon 79 auch Teil der +UBI-Ergänzungsprüfung), gruppiert nach Kategorien.
- Die 4 Antwortoptionen werden bei jeder Anzeige neu gemischt.
- Streak-Zähler pro Frage: 2× in Folge richtig → „sicher" (grün), 1× richtig
  → „halb" (amber), falsch/„Weiß nicht" → zurück auf 0.
- Direktstart einer Lernrunde per Antippen einer Kategorie, oder Mehrfachauswahl
  über Checkboxen kombiniert mit „nur unsichere Fragen"/„alle Fragen".
- Auto-Advance zur nächsten Frage nach 1 Sekunde bei richtiger Antwort;
  Zurück-/Weiter-Navigation frei möglich, auch nachträglich.
- 386 handgeschriebene Erklärungen zu allen Fragen.

### Prüfungsmodus
- Umschalter „Üben ↔ Prüfen" auf dem Auswahl-Bildschirm.
- Die 48 offiziellen Prüfbögen (je 12 für SRC/LRC/UBI/+UBI) als Liste, mit
  Fortschrittsbalken und Markierung der Mindestpunktzahl zum Bestehen.
- Prüfungssimulation mit Timer, freier Navigation, änderbaren Antworten bis
  zur Abgabe, und Auswertungsscreen (bestanden/nicht bestanden, Fragenliste
  zum Aufklappen mit richtiger/falscher Antwort und Erklärung).
- Bestandene Prüfbögen werden in der Liste grün markiert.

| Zeugnis | Fragen/Bogen | Zeit  | Bestehen        |
|---------|-------------:|------:|-----------------|
| SRC     | 24           | 30 min| 19 richtig (max. 5 Fehler) |
| LRC     | 14           | 20 min| 11 richtig (max. 3 Fehler) |
| UBI     | 22           | 60 min| 17 richtig (max. 5 Fehler) |
| +UBI    | 10           | 30 min|  8 richtig (max. 2 Fehler) |

### Bedienung
- Wischen (Touch oder Maus) zum Blättern zwischen Fragen, im Übungs- wie im
  Prüfungsmodus, sowie zum Wechseln zwischen den Zertifikat-Tabs.
- Streichen über die SRC/LRC/UBI/+UBI-Buttons wählt den Tab schon live beim
  Drüberfahren.
- Fortschritt wird in `localStorage` gespeichert (inkl. Migration von einer
  älteren, rein numerischen ID-Struktur).
- Als PWA installierbar (Manifest + Service Worker für Offline-Nutzung).

## Technik

Reines HTML/CSS/JS, kein Framework.

| Datei | Inhalt |
|---|---|
| `index.html` | Grundgerüst, bindet die Scripts ein |
| `data.js` | Alle 386 Fragen (`CATEGORIES`, `QUESTIONS`) |
| `exams.js` | Die 48 Prüfbögen (`EXAM_META`, `EXAMS`) |
| `explanations.js` | Erklärungstexte je Frage |
| `app.js` | Gesamte Anwendungslogik |
| `style.css` | Styling |
| `sw.js` / `manifest.json` | PWA-Konfiguration |

### Fragen-ID-Format

Jede Frage hat eine lesbare, stabile ID im Format `"CERT-NNN"`, z. B.
`"SRC-042"`, `"LRC-003"`, `"UBI-045"` – entspricht 1:1 der Original-
Katalognummer aus dem jeweiligen amtlichen Fragenkatalog. +UBI-Fragen sind
ganz normale UBI-Fragen (keine eigene Nummerierung, da es keinen separaten
offiziellen +UBI-Fragenkatalog gibt – nur Prüfbögen, deren Fragen aus dem
UBI-Katalog stammen).

```js
{ id: "UBI-045", cat: 'UBI_I', n: 45,
  q: 'Fragetext', o: ['Korrekte Antwort', 'Falsch 1', 'Falsch 2', 'Falsch 3'] }
```

`o[0]` muss immer die korrekte Antwort sein – die App mischt die Reihenfolge
bei der Anzeige selbst. `e: 1` kennzeichnet die 79 UBI-Fragen, die auch Teil
der +UBI-Ergänzungsprüfung sind.

### Prüfbogen-Format (`exams.js`)

```js
const EXAM_META = { SRC: { time: 30, maxWrong: 5, count: 24 }, ... };
const EXAMS = {
  SRC: [ { n: 1, qs: ["SRC-001", "SRC-005", "SRC-022", ...] }, ... ],
  LRC: [...], UBI: [...], UBI_ERG: [...],
};
```

Zeit und Fehlergrenze gelten einheitlich pro Zertifikat (`EXAM_META`) und
werden nicht pro Bogen wiederholt, um Inkonsistenzen bei künftigen
Änderungen zu vermeiden. `qs` referenziert direkt die Frage-IDs im
Katalognummer-Format – dadurch lässt sich jeder Bogen unmittelbar gegen die
Original-Verkehrsblatt-Seite gegenlesen, ohne Lookup-Tabelle.

## Lokal testen

Da die App `fetch`/Service-Worker nutzt, am besten über einen lokalen Server
öffnen statt die `index.html` direkt per `file://` zu laden:

```bash
cd src-trainer
python3 -m http.server 8000
# dann im Browser: http://localhost:8000
```

## Deployment auf GitHub Pages

1. Repo auf GitHub anlegen (oder bestehendes nutzen) und diesen Ordnerinhalt
   ins Repo-Root (oder einen Unterordner wie `docs/`) pushen.
2. Im Repo unter **Settings → Pages**:
   - Source: "Deploy from a branch"
   - Branch: `main` (oder dein Branch), Ordner `/ (root)` bzw. `/docs`
3. Nach ein paar Minuten ist die App unter
   `https://<username>.github.io/<repo>/` erreichbar.
4. Auf dem Smartphone die URL öffnen und über "Zum Startbildschirm
   hinzufügen" (iOS Safari) bzw. das Installations-Banner (Android Chrome)
   installieren.
5. Nach jeder Änderung an `app.js`/`data.js`/`exams.js`/`explanations.js`/
   `sw.js` die `CACHE_NAME`-Version in `sw.js` erhöhen, sonst liefert der
   Service Worker Nutzer:innen weiterhin die alte, gecachte Version aus.

Alle Pfade in `manifest.json` und `sw.js` sind relativ gehalten, daher
funktioniert das Deployment sowohl im Repo-Root als auch in einem
Unterordner (z. B. Project Pages unter `/reponame/`).

## Quellen & Lizenzhinweis

Der komplette Fragenkatalog (SRC, LRC, UBI) wurde direkt aus den amtlichen
Verkehrsblatt-Bekanntmachungen übernommen, nicht aus einer Abschrift Dritter:

- **SRC/LRC**: Basis-Fragenkatalog aus VkBl. 2009 Nr. 145, geändert durch
  VkBl. 2010 Nr. 85 und VkBl. 2018 Nr. 109 (spätere Änderung hat Vorrang).
- **UBI**: Basis-Fragenkatalog aus VkBl. 2011 Nr. 117, geändert durch
  VkBl. 2018 Nr. 102.
- Die **Prüfbogen-Zusammenstellungen** (welche Katalognummern zu welchem der
  12 Prüfbögen je Zeugnis gehören, sowie Bearbeitungszeit und Bestehens-
  Kriterien) stammen ebenfalls aus den genannten bzw. weiteren Verkehrsblatt-
  Ausgaben (u. a. Heft 15/2011 und Heft 17/2011 für die Prüfbogen-Zusammen-
  stellungen selbst).
- Mehrere dieser Verkehrsblatt-Ausgaben wurden über eine Anfrage auf
  [FragDenStaat.de](https://fragdenstaat.de/) öffentlich zugänglich gemacht.
- Alle drei Kataloge, die zeitlich aufeinanderfolgenden Änderungen und die
  Prüfbogen-Zusammenstellungen wurden strukturiert geparst und automatisiert
  gegen den vorherigen App-Stand abgeglichen (Diff-Analyse), um Übertragungs-
  fehler auszuschließen. Eine bewusste Ausnahme: SRC-030/SRC-035 nennen im
  amtlichen Text noch „Wasser- und Schifffahrtsamt/-verwaltung"; die App
  verwendet die zwischenzeitlich aktuellere Bezeichnung „Wasserstraßen- und
  Schifffahrtsamt/-verwaltung".
- Amtliche Bekanntmachungen wie diese Fragenkataloge sind nach § 5 UrhG
  nicht urheberrechtlich geschützt.
- Für die private Nutzung zum Lernen vorgesehen, keine Gewähr auf
  Vollständigkeit oder Aktualität. Zum 1. Oktober 2025 tritt ein neuer,
  inhaltlich überarbeiteter UBI-Fragenkatalog in Kraft (noch nicht in dieser
  App enthalten). Bei Widersprüchen zur aktuell gültigen amtlichen
  Prüfungsordnung gilt selbstverständlich immer Letztere.
