# SRC Funkzeugnis Trainer

Eine kleine PWA zum Lernen des Fragenkatalogs für das Beschränkt Gültige
Funkbetriebszeugnis (Short Range Certificate, SRC), Stand 10/2018.

## Funktionsweise

- Alle 180 Fragen aus dem amtlichen Fragenkatalog sind in `data.js` hinterlegt,
  gruppiert in die 7 Kategorien (I–VII).
- Die 4 Antwortoptionen werden bei jeder Anzeige neu gemischt.
- Für jede Frage wird ein "Streak"-Zähler geführt:
  - Richtige Antwort → Zähler +1 (maximal 2)
  - Falsche Antwort oder "Weiß nicht" → Zähler auf 0
  - Eine Frage gilt als **sicher gewusst**, sobald der Zähler 2 erreicht
    (also 2x in Folge richtig seit dem letzten Fehler/"Weiß nicht").
- Auf dem Auswahl-Bildschirm lassen sich Kategorien einzeln an-/abwählen und
  zwischen "nur unsichere Fragen" und "alle Fragen der Auswahl" umschalten.
- Der Fortschritt wird in `localStorage` gespeichert und bleibt erhalten,
  solange Browser-Daten nicht gelöscht werden.
- Als PWA installierbar (Manifest + Service Worker für Offline-Nutzung).

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

Alle Pfade in `manifest.json` und `sw.js` sind relativ gehalten, daher
funktioniert das Deployment sowohl im Repo-Root als auch in einem
Unterordner (z. B. Project Pages unter `/reponame/`).

## Fragen aktualisieren / erweitern

Einfach `data.js` anpassen. Format pro Frage:

```js
{ id: 1, cat: 'I', q: 'Fragetext', o: ['Korrekte Antwort', 'Falsch 1', 'Falsch 2', 'Falsch 3'] }
```

Wichtig: `o[0]` muss immer die korrekte Antwort sein – die App mischt die
Reihenfolge bei der Anzeige selbst.

## Lizenzhinweis

Der Fragenkatalog stammt von der Wasserstraßen- und Schifffahrtsverwaltung
des Bundes (WSV) / FVT Koblenz, Stand 10/2018. Für die private Nutzung zum
Lernen vorgesehen.
