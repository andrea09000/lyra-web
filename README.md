# Lyra Web

Copia web di Lyra, pensata per **telefono nel browser** (PWA) con **riproduzione in background**.

## Differenze rispetto all’app nativa (`aria/`)

| | App nativa | Webapp |
|---|---|---|
| Dati YouTube | Data API (+ fallback) | **Scraping InnerTube** (`youtubei.js`) via `server/scrape.mjs` |
| Player | `expo-audio` + YouTube embed | **HTML5 Audio** (stream) + embed di fallback |
| Background | OS audio session | Media Session + audio element (schermo spento) |
| Download offline | File sul device | Non disponibili |
| Installazione | App Store / APK | “Aggiungi a Home” dal browser |

## Avvio

```bash
cd aria-web
npm install
npm run web
```

Questo avvia insieme:
1. **Scrape API** su `http://0.0.0.0:8791` (ricerca / trending / stream)
2. **Webapp** su `http://localhost:8090`

Apri l’URL sul telefono (stessa rete Wi‑Fi). Lo scrape usa automaticamente lo stesso host (`http://IP:8791`).

### Installare come app a tutto schermo

Dal browser tab vedi ancora dominio e barre. Per nasconderle:

1. Apri il sito in Chrome (Android) o Safari (iOS)
2. **Installa app** / **Aggiungi a Home**
3. Chiudi il browser e apri **solo dall’icona Lyra**

Così parte in `fullscreen`: niente barra indirizzi sopra, niente tasti browser sotto.

## Background audio — note

- Il player usa solo **HTML5 Audio** (stream via proxy scrape), non l’iframe YouTube.
- Se il browser mette in pausa a schermo spento, Lyra **riprende da sola**.
- Controlli lock-screen / notification via **Media Session**.
- Su **Android**: funziona da Chrome; meglio “Installa app”.
- Su **iOS**: avvia il brano con un tap, poi spegni lo schermo; “Aggiungi a Home” migliora molto la stabilità.
- Tieni acceso `npm run scrape` mentre ascolti (il telefono legge l’audio da `:8791`).

## Config

Copia le stesse variabili di `aria/.env` (YouTube API key, Firebase opzionale).
