# Website veröffentlichen (GitHub Pages)

Kostenlos und ohne Zahlungsmethode. Voraussetzung: Das Repository ist
**öffentlich**. Mit GitHub Free gibt es Pages nur für öffentliche Repos; für
diese Website ist das kein Nachteil, denn sie ist ohnehin für jeden mit dem
Link sichtbar. Im Repo liegen nur der Code und `data/sammlung.json`, nie deine
Sicherung.

## Einmalig einrichten

1. **Repository anlegen** (GitHub Desktop): *File → Add Local Repository…* →
   diesen Ordner (`Entertainment-Web`) wählen → bei „This directory does not
   appear to be a Git repository" auf **create a repository here** →
   *Create Repository*. Danach alle Dateien committen („Erste Version").
2. **Veröffentlichen**: *Publish repository* → Name z. B. `Entertainment-Web`
   → Häkchen **„Keep this code private" entfernen** → *Publish Repository*.
3. **Pages einschalten** auf github.com: dein Repo → *Settings* → *Pages* →
   unter „Build and deployment" bei *Source* **Deploy from a branch** → Branch
   **main**, Ordner **/ (root)** → *Save*.
4. Nach ein, zwei Minuten steht oben auf derselben Seite die Adresse, z. B.
   `https://<dein-github-name>.github.io/Entertainment-Web/`.

Die Website ist dann noch leer („Hier sind noch keine Titel veröffentlicht").

## Erste Daten

1. Im Dashboard: Einstellungen → Daten → **Sicherung speichern**.
2. `https://<dein-github-name>.github.io/Entertainment-Web/werkzeug.html`
   öffnen, Sicherung wählen, Häkchen prüfen, **sammlung.json speichern**.
3. Die Datei nach `data/sammlung.json` kopieren (ersetzen), committen,
   **Push origin**. Nach ein, zwei Minuten ist die Sammlung online.

Das Werkzeug funktioniert nur über die Website-Adresse (oder einen lokalen
Webserver), nicht per Doppelklick auf die Datei: Browser laden
JavaScript-Module nicht direkt von der Festplatte.

## Gut zu wissen

- **Neuer Stand** = Schritte 1–3 aus „Erste Daten". Der Browser lädt die
  Datendatei bei jedem Besuch neu, Besucher sehen also sofort den neuen Stand.
- **Git-Verlauf**: Jede veröffentlichte Version von `sammlung.json` bleibt im
  öffentlichen Verlauf abrufbar. Was nicht öffentlich sein soll (z. B.
  Notizen), also gar nicht erst anhaken.
- **Andere Anbieter** (Cloudflare Pages, Netlify) gehen genauso: einfach den
  Ordner bzw. das Repo als statische Seite veröffentlichen, ohne Build-Befehl.
- **Eigener Name in der Adresse** (z. B. `filme.example.de`) ist möglich, wenn
  du eine Domain besitzt: Settings → Pages → *Custom domain*.
