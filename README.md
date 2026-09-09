# FHNW ImageEditor

Bildeditor für Studierende der FHNW – läuft vollständig im Browser und spricht
**GPT Image 2.5 (Sunburst)** über die [fal.ai](https://fal.ai) Queue-API an.

**Live:** https://nephlonor.github.io/FHNW-ImageEdit/

## Nutzung

1. Seite öffnen und oben im Feld **API:** den eigenen fal.ai API-Key eintragen
   ([Key erstellen](https://fal.ai/dashboard/keys)). Nach dem Bestätigen rutscht
   das Feld nach unten und ist eingeklappt; über *ändern* / *löschen* bleibt es
   erreichbar.
2. Modus wählen:
   * **Edit** – ein oder mehrere Bilder hochladen und die Änderung im Prompt
     beschreiben. Das erste Bild ist das Basisbild, weitere dienen als Referenz.
   * **Inpaint** – Basisbild laden, den zu ändernden Bereich mit dem Pinsel
     markieren und die Änderung beschreiben. Die Maske wird als `mask_url` an
     die API übergeben; standardmässig wird das Ergebnis anschliessend im
     Browser über die weiche Maskenkante mit dem Original zusammengesetzt,
     damit alles ausserhalb der Markierung pixelgenau erhalten bleibt.
3. **Generieren** – mehrere Generierungen laufen parallel, jede erscheint als
   eigene Karte mit Status, Abbruch-Möglichkeit und Aktionen.

## Format

* **AUTO** (Standard) – Format und Auflösung werden vom Eingabebild übernommen
  (`image_size: "auto"`).
* **Festes Seitenverhältnis** – von 1:3 bis 3:1 (1:3, 9:21, 1:2, 9:16, 2:3, 3:4,
  4:5, 1:1, 5:4, 4:3, 3:2, 16:9, 2:1, 21:9, 3:1). Die längere Kante beträgt je
  nach Schalter **2K** (2048 px) oder **4K** (4096 px).
* Im Inpaint-Modus richtet sich die Ausgabe zwingend nach dem Basisbild, damit
  Maske und Ergebnis deckungsgleich sind.

## Verlauf

Ergebnisse landen mit Vorschaubild, Prompt und Zeitstempel in einem lokalen
IndexedDB-Verlauf (max. 60 Einträge). Von dort lassen sie sich herunterladen,
als neues Quellbild übernehmen oder direkt im Inpaint-Editor weiterbearbeiten.

## Technik

* Statische Seite ohne Build-Schritt: `index.html`, `styles.css`, `app.js`.
* Keine externen Abhängigkeiten, keine Analytics, kein Backend.
* Der API-Key wird ausschliesslich im `localStorage` des Browsers abgelegt und
  nur an `queue.fal.run` gesendet. Jede Person nutzt also ihr eigenes Kontingent.
* Eingabebilder werden vor dem Versand auf max. 2048 px lange Kante skaliert und
  als Data-URI übertragen.
* Deployment über GitHub Actions (`.github/workflows/pages.yml`) auf GitHub Pages.

## Lokal starten

```bash
python3 -m http.server 8000
# http://localhost:8000
```

## Logo

Das FHNW-Logo stammt von [fhnw.ch](https://www.fhnw.ch/logo/fhnw-logo-de.svg)
und liegt unter `assets/`. Es gehört der Fachhochschule Nordwestschweiz.
