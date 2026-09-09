# FHNW ImageEditor

Bildeditor für Studierende der FHNW – läuft vollständig im Browser und spricht
**GPT Image 2.5 (Sunburst)** über die [fal.ai](https://fal.ai) Queue-API an.

**Live:** https://nephlonor.github.io/FHNW-ImageEdit/

## Nutzung

1. Oben im Feld **API:** den eigenen fal.ai API-Key eintragen
   ([Key erstellen](https://fal.ai/dashboard/keys)). Nach dem Bestätigen rutscht
   das Feld nach unten und ist eingeklappt; über *ändern* / *löschen* bleibt es
   erreichbar.
2. Modus wählen:
   * **Edit** – ein oder mehrere Bilder hochladen, Änderung im Prompt
     beschreiben. Das erste Bild ist das Basisbild, weitere dienen als Referenz.
     Ohne hochgeladenes Bild wird aus dem Prompt allein ein neues Bild erzeugt
     (Text-to-Image).
   * **Inpaint** – Basisbild laden, den zu ändernden Bereich mit dem Pinsel
     markieren, Änderung im Prompt beschreiben.
3. **Generieren** – mehrere Generierungen laufen parallel, jede erscheint als
   eigene Karte mit Status, Abbruch-Möglichkeit und Aktionen.

Beim Wechsel **Edit → Inpaint** wird das erste Bild zum Basisbild, beim Wechsel
**Inpaint → Edit** wandert das Basisbild als erstes Referenzbild zurück. Hin und
zurück bleibt die gemalte Maske erhalten.

## Wie das Inpaint arbeitet

Wie im Referenz-Projekt [NanoBanana](https://nephlonor.github.io/NanoBanana/):

1. An die API gehen zwei Bilder – das unveränderte Original und eine Kopie, in
   der die markierte Fläche deckend rot übermalt ist. Ein Wrapper-Prompt erklärt
   dem Modell, dass Rot die Bearbeitungszone ist und alles andere unverändert
   bleiben muss. Der `mask_url`-Parameter wird bewusst nicht benutzt.
2. Das Ergebnis wird anschliessend **immer** im Browser über die weiche
   Maskenkante mit dem Original zusammengesetzt. Ausserhalb der Markierung ist
   das Ergebnis damit pixelgenau das Original – unabhängig davon, was das Modell
   zurückgibt. Zusammengesetzt wird über die verlustfreie Bildquelle, nicht über
   die für die API komprimierte Fassung.

Der Regler **Kante** zeigt die Weichheit direkt in der Vorschau über dem
Basisbild – was man sieht, ist die Kante, mit der zusammengesetzt wird.

## Maske nachträglich anpassen

Jedes fertige Inpaint behält die Rohausgabe des Modells und lässt sich ohne neue
Generierung – und damit ohne Kosten – weiter justieren:

* **Kante** auf der Ergebniskarte – setzt live mit anderer Kantenweichheit neu
  zusammen.
* **Maske im Editor öffnen** – legt Basisbild, Maske und Kantenwert zurück in
  den Editor.
* **Aus Editor übernehmen** – nimmt die dort überarbeitete Maske und setzt das
  gespeicherte Ergebnis damit neu zusammen.

Aus dem Verlauf führt **Maske anpassen** denselben Weg. Die dafür nötigen Daten
werden für die 12 neuesten Einträge aufbewahrt.

## Format

* **Festes Seitenverhältnis** – von 1:3 bis 3:1 (1:3, 9:21, 1:2, 9:16, 2:3, 3:4,
  4:5, 1:1, 5:4, 4:3, 3:2, 16:9, 2:1, 21:9, 3:1). Die längere Kante beträgt je
  nach Schalter **2K** (2048 px) oder **4K** (4096 px).
* Sobald ein Bild dazukommt, wird das passendste Seitenverhältnis **automatisch
  gewählt** – auch über AUTO hinweg. Damit steht die Auflösung fest, statt vom
  Modell zu kommen. Massgebend ist immer das erste Bild; weitere Bilder ändern
  die Wahl nicht, und eine Wahl von Hand bleibt bestehen, bis ein neues erstes
  Bild dazukommt.
* **AUTO** überlässt Format und Auflösung dem Modell (`image_size: "auto"`).
  Weiterhin wählbar, aber nicht mehr die Vorgabe, sobald ein Bild da ist.
* **Transparenter Hintergrund** sendet `background: "transparent"`.
* Im Inpaint-Modus entfallen diese Optionen: die Ausgabe folgt dem Basisbild,
  und das Zusammensetzen legt das Original hinter das Ergebnis.

Ohne Eingabebild geht die Anfrage an
`openai/gpt-image-2.5/sunburst/text-to-image` statt an `…/edit`. Dort gibt es
kein AUTO, weil nichts abzuleiten ist – es gilt dann **3:2**. Die Grenzen dieses
Endpunkts sind enger (Kanten in 16er-Schritten, max. 3840 px, 0,65–8,3
Megapixel), die gewählte Grösse wird darauf eingepasst: 4K bedeutet hier je nach
Seitenverhältnis bis zu 3840 px lange Kante, ein Quadrat höchstens 2880 × 2880.

## Qualität

Der Regler unter dem Format hat vier Stufen – angeschrieben sind nur die beiden
Enden, jede Stufe ist ein Punkt. Standard ist die unterste; die Wahl bleibt im
Browser gespeichert und gilt für Edit, Inpaint und Text-to-Image.

| Punkt | 1 | 2 | 3 | 4 |
|---|---|---|---|---|
| Beschriftung | low | – | – | high |
| an die API | `low` | `medium` | `high` | `xhigh` |

Die API-Stufe `max` ist bewusst nicht dabei: sie bringt gegenüber `xhigh` keinen
sichtbaren Gewinn mehr, kostet aber weiter. Deshalb heisst das obere Ende der
Skala schlicht *high*, obwohl `xhigh` gesendet wird.

Die Stufe geht als `quality` an die API und bestimmt Detailgrad, Dauer und
Kosten – höhere Stufen verbrauchen deutlich mehr Bild-Tokens.

## Verlauf

Ergebnisse landen mit Vorschaubild, Prompt und Zeitstempel in einem lokalen
IndexedDB-Verlauf (max. 60 Einträge). Ein Tippen auf den Prompt kopiert ihn in
die Zwischenablage. Von dort lassen sie sich als neues
Quellbild übernehmen, im Inpaint-Editor weiterbearbeiten oder – bei
Inpaint-Ergebnissen – über *Maske anpassen* neu zusammensetzen. Zum Speichern
das Vorschaubild antippen und im Grossbild per Rechtsklick bzw. langem Tippen
sichern.

Eine fertige Ergebniskarte lässt sich über **Fertig** oben rechts schliessen –
das Bild bleibt im Verlauf.

## Technik

* Statische Seite ohne Build-Schritt: `index.html`, `styles.css`, `app.js`.
  `styles.css` und `app.js` werden mit einem `?v=`-Kürzel eingebunden, damit
  nach einem Deploy niemand versehentlich noch die alte Fassung im Browser hat.
  Das Kürzel wird bei einer Änderung an diesen Dateien hochgezählt.
* Keine externen Abhängigkeiten, keine Analytics, kein Backend.
* Der API-Key wird ausschliesslich im `localStorage` des Browsers abgelegt und
  nur an `queue.fal.run` gesendet. Jede Person nutzt ihr eigenes Kontingent.
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
