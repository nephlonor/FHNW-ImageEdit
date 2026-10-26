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
zurück bleibt die gemalte Maske erhalten, und ein 4K-Bild bleibt 4K.

**Als Quelle** (Verlauf) bzw. **Als Quellbild übernehmen** (Ergebniskarte) macht
im Edit-Modus das Bild zum ersten Bild, im Inpaint-Modus fügt es eine weitere
Referenz hinzu – das Basisbild bleibt.

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
   die für die API komprimierte Fassung, und zwar in der **Auflösung des
   Basisbilds bis 4K** (4096 px Kante): ein 4K-Bild bleibt 4K und ausserhalb der
   Maske pixelgenau. Gemalt und an die API geschickt wird in Arbeitsgrösse
   (max. 2048 px); das Modellergebnis wird für den bearbeiteten Bereich auf die
   volle Grösse gebracht. Nano Banana liefert diesen Bereich bei einem
   Ergebnis über 2K direkt in 4K. Die Zeichenflächen werden direkt nach dem
   Zusammensetzen freigegeben.

Der Regler **Kante** (0–10, Standard 10) zeigt die Weichheit direkt in der
Vorschau über dem Basisbild – was man sieht, ist die Kante, mit der
zusammengesetzt wird. Einträge aus der Zeit, als der Regler bis 40 ging, werden
beim Öffnen auf 10 begrenzt.

Die weiche Kante ist eine Gausskurve, in jedem Browser gleich berechnet: drei
Box-Weichzeichnungen je Richtung auf dem Alphakanal, in einem verkleinerten
Arbeitsbild, das danach glatt hochskaliert wird. Die Grösse des Arbeitsbilds
richtet sich nach der Kante – je weicher, desto kleiner, weil eine breite Kante
keine feinen Details hat. Am Bildrand gilt der Randwert, eine bis an den Rand
gemalte Maske bleibt dort also voll deckend. Früher lief das über
`canvas.filter`, das Safari nicht unterstützt; dort entstand eine pixelige
Treppe.

## Maske nachträglich anpassen

Jedes fertige Inpaint behält die Rohausgabe des Modells und lässt sich ohne neue
Generierung – und damit ohne Kosten – weiter justieren:

* **Kante** auf der Ergebniskarte – setzt live mit anderer Kantenweichheit neu
  zusammen.
* **Maske bearbeiten** – öffnet das fertige, bereits zusammengesetzte Bild in
  einem eigenen Fenster mit denselben Werkzeugen wie der Editor (Pinsel,
  Radierer, Zurück, Leeren, Pinselgrösse, Kante). Solange gemalt oder radiert
  wird, ist die bestehende Maske sichtbar und lässt sich ergänzen; beim
  Loslassen wird sofort neu zusammengesetzt. Darunter **Herunterladen** (das
  aktuelle Ergebnis in voller Auflösung) und **Fertig**, das die Änderung auf
  die Ergebniskarte und in den Verlauf übernimmt (auch mit Esc). Die Vorschau im
  Fenster rechnet in Bildschirmgrösse, Fertig und Herunterladen in voller
  Auflösung.

Aus dem Verlauf öffnet **Maske bearbeiten** dasselbe Fenster. Steht die
zugehörige Ergebniskarte noch auf der Seite, wird sie mit aktualisiert. Die dafür
nötigen Daten werden für die 12 neuesten Einträge aufbewahrt.

## Modell

Oben lässt sich zwischen **GPT Image** und **Nano Banana 2.1** umschalten
(`google/nano-banana-2.1/edit` bzw. `google/nano-banana-2.1` ohne Eingabebild).
Bei Nano Banana gilt: nur 2K und 4K, `safety_tolerance` fest auf 6 (am wenigsten
streng), kein Qualitätsregler, kein transparenter Hintergrund. Die Formatliste
passt sich an (z. B. 1:8, 1:4, 4:1, 8:1 statt 1:3, 9:21, 1:2, 2:1, 3:1). Inpaint
funktioniert mit beiden Modellen gleich.

GPT-Image-Anfragen schicken `enable_safety_checker: false` mit. fal lockert die
Inhaltsprüfung damit nur für freigeschaltete Konten („Authorized callers may set
false to request relaxed screening“); bei allen anderen wird normal geprüft. Lehnt
fal den Parameter für ein Konto beim Absenden ab, geht die Anfrage einmal ohne
ihn neu raus, und er bleibt für den Rest der Sitzung weg – die App funktioniert
also so oder so. Eine Ablehnung durch die Inhaltsprüfung selbst löst keinen
zweiten Versuch aus.

Lehnt die Inhaltsprüfung ab, steht auf der Karte, was beanstandet wurde und wer
geprüft hat, z. B. „Vom Inhaltsfilter abgelehnt (Prompt) – sexual · geprüft von
der Moderation des Modells“. Grundlage ist fals Fehlerantwort
`content_policy_violation`: `categories` nennt die Kategorien, und
`model_moderated` darin heisst, dass die Moderation des Modells selbst (OpenAI
bzw. Google) abgelehnt hat – sonst war es fals eigener Filter.

Lehnt die Inhaltsprüfung einen GPT-Auftrag ab, bietet die Karte **Mit Nano Banana
2.1 versuchen** an: derselbe Auftrag – Prompt, Bilder, Maske, Grösse – geht mit
Nano Banana (`safety_tolerance` 6) neu raus und ersetzt die Fehlerkarte. Ein
Format, das Nano Banana nicht kennt (z. B. 2:1), wird zum nächstliegenden
(16:9); AUTO ohne Eingabebild bleibt wie bei GPT 3:2. Der Modell-Schalter oben
bleibt, wie er ist.

## Format

* **Festes Seitenverhältnis** – von 1:3 bis 3:1 (1:3, 9:21, 1:2, 9:16, 2:3, 3:4,
  4:5, 1:1, 5:4, 4:3, 3:2, 16:9, 2:1, 21:9, 3:1). Die längere Kante beträgt je
  nach Schalter **2K** (2048 px) oder **4K** (4096 px) – bei GPT Image
  eingepasst in dessen Grenzen (siehe unten).
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
kein AUTO, weil nichts abzuleiten ist – es gilt dann **3:2**.

GPT Image nimmt nur Grössen innerhalb dieser Grenzen an: Kanten in
16er-Schritten, max. 3840 px, 0,65–8,3 Megapixel, höchstens 3:1. Dokumentiert
sind sie nur beim Text-to-Image-Endpunkt, sie gelten aber auch für Edit – ein
grösserer Wunsch wie 4096 × 4096 wird dort still ignoriert, und das Modell
liefert dann nur rund 3 MP (weniger als bei 2K). Die gewählte Grösse wird daher
bei Edit und Text-to-Image auf diese Grenzen eingepasst: 4K bedeutet je nach
Seitenverhältnis bis zu 3840 px lange Kante, ein Quadrat höchstens 2880 × 2880
(8,3 MP); 2K bleibt unverändert (z. B. 2048 × 2048 oder 2048 × 1152).

## Qualität

Der Regler unter dem Format hat vier Stufen – angeschrieben sind nur die beiden
Enden, jede Stufe ist ein Punkt. Standard ist die unterste; die Wahl bleibt im
Browser gespeichert und gilt für Edit, Inpaint und Text-to-Image.

| Punkt | 1 | 2 | 3 | 4 |
|---|---|---|---|---|
| am Regler | low | – | – | high |
| auf Job-Karte und im Verlauf | low | medium | high | high+ |
| an die API | `low` | `medium` | `high` | `xhigh` |

Die API-Stufe `max` ist bewusst nicht dabei: sie bringt gegenüber `xhigh` keinen
sichtbaren Gewinn mehr, kostet aber weiter. Deshalb heisst das obere Ende der
Skala schlicht *high*, obwohl `xhigh` gesendet wird – als Marke auf der Karte
steht dort *high+*, damit es sich von der Stufe darunter unterscheidet.

Die Stufe geht als `quality` an die API und bestimmt Detailgrad, Dauer und
Kosten – höhere Stufen verbrauchen deutlich mehr Bild-Tokens. Jede Generierung
trägt die verwendete Stufe ab Start in der Kopfzeile der Job-Karte und später
im Verlaufseintrag.

## Verlauf

Ergebnisse landen mit Vorschaubild, Prompt und Zeitstempel in einem lokalen
IndexedDB-Verlauf (max. 60 Einträge). Ein Tippen auf den Prompt kopiert ihn in
die Zwischenablage. Von dort lassen sie sich als neues
Quellbild übernehmen, im Inpaint-Editor weiterbearbeiten oder – bei
Inpaint-Ergebnissen – über *Maske bearbeiten* neu zusammensetzen. Zum Speichern
das Vorschaubild antippen und im Grossbild per Rechtsklick bzw. langem Tippen
sichern.

Eine fertige Ergebniskarte lässt sich über **Fertig** oben rechts schliessen –
das Bild bleibt im Verlauf.

### Speicheraufteilung

Der Verlauf liegt in drei Stores, damit die Liste nie die Bilder selbst lädt:

| Store | Inhalt | gelesen |
|---|---|---|
| `entries` | Prompt, Zeit, Modus, Stufe, Vorschaubild (≈ 20–40 KB) | beim Zeichnen der Liste |
| `images` | das Ergebnisbild | beim Antippen, *Als Quelle*, *Inpaint* |
| `tunes` | Basisbild, Maske, Rohergebnis fürs Nachjustieren | bei *Maske bearbeiten* |

Früher lag alles in einem Datensatz, und jedes Neuzeichnen der Liste hat den
ganzen Verlauf samt aller Bilder in den Speicher geholt – nach jedem fertigen
Job zweimal hintereinander. Bei einem gut gefüllten Verlauf waren das mehrere
hundert MB; auf Mobilgeräten hat der Browser den Tab dabei neu geladen und alle
laufenden Jobs verloren. Einträge aus der alten Form werden beim ersten Laden
einzeln übernommen.

## Technik

* Statische Seite ohne Build-Schritt: `index.html`, `styles.css`, `app.js`.
  `styles.css` und `app.js` werden mit einem `?v=`-Kürzel eingebunden, damit
  nach einem Deploy niemand versehentlich noch die alte Fassung im Browser hat.
  Das Kürzel wird bei einer Änderung an diesen Dateien hochgezählt.
* Keine externen Abhängigkeiten, keine Analytics, kein Backend.
* Der API-Key wird ausschliesslich im `localStorage` des Browsers abgelegt und
  nur an `queue.fal.run` gesendet. Jede Person nutzt ihr eigenes Kontingent.
* Eingabebilder werden vor dem Versand auf max. 2048 px lange Kante skaliert und
  als Data-URI übertragen – egal, ob hochgeladen, aus einem Ergebnis übernommen
  oder beim Moduswechsel weitergereicht. Ohne Transparenz als JPEG, mit
  Transparenz als PNG (sonst bekäme eine freigestellte Figur schwarzen Grund).
  Ein 4K-Ergebnis als PNG hat sonst schnell 15–20 MB und sprengt die Anfrage.
* Deployment über GitHub Actions (`.github/workflows/pages.yml`) auf GitHub Pages.

## Lokal starten

```bash
python3 -m http.server 8000
# http://localhost:8000
```

## Logo

Das FHNW-Logo stammt von [fhnw.ch](https://www.fhnw.ch/logo/fhnw-logo-de.svg)
und liegt unter `assets/`. Es gehört der Fachhochschule Nordwestschweiz.
