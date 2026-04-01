# Úkoly

Minimalistická PWA todo aplikace s denním průvodcem, offline podporou a synchronizací přes Google Drive.

## Funkce

- **Denní focus** – průvodce každé ráno vybere 2–3 prioritní úkoly a jeden hlavní (No. 1)
- **Google Drive sync** – úkoly se zálohovají do vlastního Drive přes OAuth2 + PKCE
- **Offline first** – Service Worker cachuje celou aplikaci, funguje bez připojení
- **Swipe-to-delete** – přejetím doleva na mobilním zařízení
- **Drag & drop** – přeřazení pořadí úkolů tažením
- **Animace dokončení** – 3 úrovně efektů podle důležitosti úkolu (ripple, canvas burst, zlatý flash)
- **Světlé/tmavé téma** – automaticky dle systémového nastavení, manuálně přepínatelné
- **Notifikace** – připomenutí termínů
- **Záloha/obnova** – export a import úkolů jako JSON

## Tech stack

- Vanilla JS + CSS (žádné frameworky, žádné build steps)
- Service Worker (PWA, offline, pull-to-refresh aktualizace)
- Cloudflare Worker – OAuth2 proxy pro Google Drive (PKCE, KV store pro refresh tokeny)
- Google Drive API – `appDataFolder` pro ukládání dat

## Struktura repozitáře

```
├── index.html       # HTML shell
├── app.css          # Všechny styly (CSS proměnné, témata)
├── app.js           # Veškerá logika aplikace
├── sw.js            # Service Worker
├── manifest.json    # PWA manifest
├── icons/           # Ikony 192×192 a 512×512
└── worker/
    ├── worker.js    # Cloudflare Worker (OAuth proxy)
    └── wrangler.toml
```

## Nasazení

### 1. Statický frontend

Nahraj soubory (`index.html`, `app.js`, `app.css`, `sw.js`, `manifest.json`, `icons/`) na libovolný statický hosting s HTTPS – např. Netlify, Vercel nebo GitHub Pages.

### 2. Google OAuth app

1. Vytvoř projekt v [Google Cloud Console](https://console.cloud.google.com/)
2. Povol **Google Drive API**
3. Vytvoř OAuth 2.0 klienta (Web application)
4. Přidej Authorized redirect URI: `https://tvoje-domena.cz/`
5. Zkopíruj **Client ID** do `app.js` (`GOOGLE_CLIENT_ID`) a **Client Secret** pro Worker

### 3. Cloudflare Worker

```bash
cd worker

# Vytvoř KV namespace pro refresh tokeny
wrangler kv namespace create TOKENS
# zkopíruj ID do wrangler.toml

# Nastav secrets
wrangler secret put GOOGLE_CLIENT_SECRET

# Deploy
wrangler deploy
```

Do `app.js` doplň URL nasazeného Workeru (`WORKER_URL`).

### 4. Aktualizace verze cache

Při každém deployi zvedni verzi na dvou místech:
- `sw.js`: `const CACHE = 'ukoly-X.Y.Z'`
- `app.js`: `var APP_VERSION = 'X.Y.Z'`

## Lokální vývoj

```bash
# Bez buildu – stačí otevřít v prohlížeči přes localhost
npx serve .

# Worker lokálně
cd worker && wrangler dev
```

Service Worker vyžaduje HTTPS nebo `localhost`. Na `localhost` funguje plně včetně SW.

## Datový model

Úkoly jsou uloženy v `localStorage('tasks')`:

```js
{
  id: "1234567890",     // Date.now().toString()
  text: "Název úkolu",
  detail: "",           // volitelná poznámka
  done: false,
  due: "2025-04-01",    // ISO datum nebo null
  priority: "mid",      // "low" | "mid" | "high"
  created: 1234567890   // timestamp
}
```

Denní výběr v `localStorage('daily')`:

```js
{
  date: "2025-04-01",
  top3: ["id1", "id2", "id3"],
  no1: "id1"
}
```

## Licence

MIT
