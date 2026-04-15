# Úkoly – PWA Todo App

## Struktura projektu

```
todo-pwa/
├── index.html      # Shell: <head>, fonty, meta tagy, HTML struktura (127 řádků)
├── app.css         # Všechny styly: CSS proměnné, témata, komponenty (181 řádků)
├── app.js          # Veškerá logika: data, render, swipe, PTR, animace (221 řádků)
├── sw.js           # Service Worker: cache (ukoly-1.7.1), offline, CHECK_UPDATE zprávy
├── manifest.json   # PWA manifest: název, ikony, shortcuts
├── CLAUDE.md       # Tento soubor
├── icons/
│   ├── icon-192.png
│   └── icon-512.png
└── worker/
    ├── worker.js       # Cloudflare Worker: OAuth proxy pro Google Drive
    └── wrangler.toml   # Konfigurace Wrangler (KV binding, vars)
```

## Datový model

Úkoly jsou uloženy v `localStorage('tasks')` jako JSON pole objektů:
```js
{
  id: "1234567890",      // Date.now().toString()
  text: "Název úkolu",
  detail: "",            // Volitelný detail/poznámka
  done: false,
  due: "2025-04-01",     // ISO datum nebo null
  priority: "mid",       // "low" | "mid" | "high"
  created: 1234567890    // timestamp
}
```

Denní výběr je v `localStorage('daily')`:
```js
{
  date: "2025-03-26",    // TODAY string (ISO)
  top3: ["id1","id2","id3"],  // max 3 ID
  no1: "id1"             // ID úkolu číslo jedna
}
```

## Klíčové funkce v app.js

| Funkce | Co dělá |
|--------|---------|
| `render()` | Volá renderDaily() + renderTasks() |
| `renderDaily()` | No.1 karta + top3-card řádky + section divider |
| `renderTasks()` | Seznam ostatních úkolů + initSwipe() + initDrag() |
| `initSwipe()` | Swipe-left-to-delete na každém .task-wrap |
| `openEdit(id)` | Otevře edit sheet, readonly trick proti autofocusu |
| `saveEdit()` | Uloží změny z edit sheetu |
| `deleteFromEdit()` | Smaže úkol přímo z edit sheetu |
| `doDelete(id)` | Fyzické smazání + cleanup daily |
| `toggleWithAnim(el, id)` | Odškrtnutí + animace (3 úrovně) |
| `animateCompletion(el, id)` | Canvas burst + ripple podle úrovně |
| `openGuide()` | Otevře denního průvodce (2 kroky) |
| `confirmGuide()` | Uloží daily výběr |
| `addTask()` | Přidá nový úkol z formuláře |
| `priorityScore(t)` | Skóre pro řazení v průvodci (priorita + blízkost termínu) |
| `openMenu()` / `closeMenu()` | Otevře/zavře nastavení sheet |
| `applyTheme(t)` | Přepne téma, aktualizuje `#theme-icon` a meta tag |
| `renderMarkdown(s)` | Renderuje detail jako markdown (tučné, kurzíva, přeškrtnuté, ul, ol) |
| `inlineMarkdown(s)` | Inline transformace: `**`, `*`, `_`, `~~` → HTML tagy |

## UI layout

### Hlavička
`Úkoly` logo | stats (přesunuto do patičky) | `⋯` menu tlačítko

### Formulář pro přidání úkolu
- Textarea + ADD button
- Jeden řádek: `.date-wrap` (📅 + input[type=date]) | `.meta-input` (priorita) | `.detail-toggle` (+ detail chip)
- Skrytá textarea `#detail-input` (zobrazí se po kliknutí na + detail)

### Denní sekce (renderDaily)
1. `.no1-card` – zlatá, výrazná, badge „No. 1", kolečko pro odškrtnutí
2. `.top3-card` × 2 – full-width, šedé, číslo + text + kolečko (méně výrazné)
3. `.section-divider` – „Ostatní úkoly"

### Patička
`Smazat hotové` | `X zbývá` (stats)

### Menu sheet (`#menu-modal`, otevře se přes `⋯`)
Google Drive | Téma | Záloha | Obnovit | Notifikace | `v1.5.0`

## Témata (světlé/tmavé)

Přepínač v menu sheetu, uloženo v `localStorage('theme')`.  
Respektuje systémové `prefers-color-scheme` jako výchozí.  
CSS proměnné v `app.css` – sekce `:root, [data-theme="dark"]` a `[data-theme="light"]`.  
`applyTheme()` aktualizuje `#theme-icon` span (nikoliv `#theme-toggle` – ten neexistuje).

## Pull-to-refresh

- Touchstart/move/end listenery přímo na `#task-list` (ne document)
- Práh: 65px vertikálního tahu při `scrollTop === 0`
- Posílá SW zprávu `CHECK_UPDATE`, SW odpovídá `UPDATE_READY` / `UP_TO_DATE` / `OFFLINE`
- Při `UPDATE_READY` → `location.reload()` po 1s
- PTR element: `#ptr-wrap` > `#ptr-pill` (fixed position, slideDown animace)

## Swipe-to-delete

- Struktura: `.task-wrap[data-id]` > `.swipe-bg` + `.task[id="task-row-X"]`
- Swipe doleva víc než 80px → slide out + `doDelete(id)`
- Horizontální osa: pokud `|dx| > |dy|` → cancel (aby neinferoval se scrollem)
- Inicializuje se v `initSwipe()` volaném po každém `renderTasks()`

## Animace dokončení (3 úrovně)

| Úroveň | Podmínka | Efekt |
|--------|----------|-------|
| `normal` | Běžný úkol | Zelené ripple + 18 částic |
| `top3` | V daily.top3 | Dvojité ripple + 40 částic |
| `no1` | Je daily.no1 | Zlatý burst + 80 částic + flash obrazovky |

## Edit sheet – autofocus prevence

`openEdit()` nastaví `readonly` na textarey před otevřením sheetu.  
Po 320ms (animace sheetu) odstraní `readonly` – pole jsou tappable ale klávesnice nevyskočí automaticky.

## Hosting

Stačí **statický hosting** (Netlify, Vercel, GitHub Pages).  
PWA vyžaduje HTTPS nebo localhost pro SW a notifikace.  
Při deployi aktualizuj verzi na **dvou místech** (semver):
- `sw.js`: `const CACHE = 'ukoly-X.Y.Z'`
- `app.js`: `var APP_VERSION = 'X.Y.Z'` (zobrazuje se v menu nastavení)

## Cloudflare Worker – Google Drive OAuth proxy

Worker běží na `https://ukoly-auth.icx-cz.workers.dev` a obstarává OAuth tok místo frontend JS.

### Endpointy
| Endpoint | Co dělá |
|----------|---------|
| `POST /auth` | Vymění PKCE `code` za session (uloží refresh token do KV) |
| `POST /refresh` | Vrátí nový access token pomocí `session_id` |
| `POST /logout` | Smaže session a refresh token z KV |

### Proměnné a secrets
- `wrangler.toml`: `GOOGLE_CLIENT_ID`, `ALLOWED_ORIGIN`, KV binding `TOKENS`
- secret: `GOOGLE_CLIENT_SECRET` (nastaven přes `wrangler secret put GOOGLE_CLIENT_SECRET`)

### Wrangler příkazy
```bash
cd worker
wrangler kv namespace create TOKENS   # vytvoří KV (id doplnit do wrangler.toml)
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler deploy
wrangler tail                          # live logy
```

### Známé gotchy
- Wrangler v3+: `wrangler kv namespace create` (mezera, ne `kv:namespace`)
- OAuth scope musí obsahovat `openid` jinak `/userinfo` vrátí 401 (`Invalid Credentials`)
- PKCE verifier ukládat do `localStorage`, ne `sessionStorage` – při OAuth redirectu se může otevřít nový kontext (PWA standalone) kde `sessionStorage` není dostupná
- Google Cloud Console → Authorized redirect URIs musí mít přesně `https://todo.icx.cz/` (s lomítkem)
- Po prvním deployi Wrangler interaktivně zaregistruje `workers.dev` subdoménu

## Denní focus – implementované funkce

| Funkce | Popis |
|--------|-------|
| Auto-průvodce | Při prvním otevření dne (daily stale + ≥2 aktivní úkoly) se průvodce otevře automaticky po 600ms. Viz `INIT` sekce – `last-guide-prompt` v localStorage brání opakování. |
| Carry-over No.1 | `openGuide()` detekuje včerejší nedokončené `daily.no1` a zobrazí ho první v seznamu se zvýrazněním (třída `.carry-over`, ikona ↩, label „včera ned.") |
| Streak | `streakData` v `localStorage('no1-streak')` – `{count, lastDate}`. Aktualizuje se v `toggleWithAnim` při splnění `daily.no1`. Zobrazuje se jako `.streak-badge` v hlavičce denní sekce od count ≥ 2. Platnost se ověřuje při startu – resets pokud lastDate < yesterday. |

## Navrhovaná vylepšení (zbývají)

4. **„Co dál?" po splnění No.1** – toast po odškrtnutí No.1 s nabídkou nastavení nové jedničky
5. **Přenos Top3 do průvodce** – včerejší nevyřešené top3 jako první kandidáti
6. **Termíny v průvodci** – datum splatnosti viditelné při výběru (již implementováno v `guide-task-meta`)
7. **Rychlé přidání z notifikace** – shortcut v manifestu (action: add) pro přímé otevření formuláře

## Časté chyby při úpravách

- Při přidání nového souboru ho přidej i do `ASSETS` v `sw.js`
- Při každé změně app souborů zvedni verzi na dvou místech: `sw.js` + `APP_VERSION` v `app.js`
- `initSwipe()` se musí volat po každém re-renderu (volá ho `renderTasks()`)
- `daily.top3` může obsahovat ID smazaných úkolů – vždy filtruj `.filter(Boolean)`
- `toggleWithAnim(el, id)` – `el` je přímo button element (ne null), aby animace fungovaly
- Téma se ovládá přes `applyTheme()`, ne přímou manipulací s `#theme-toggle` (ten neexistuje)
- `#menu-version` se plní z `APP_VERSION` v app.js – neupravovat v HTML
- `renderMarkdown()` nejprve escapuje HTML přes `escHtml()`, pak teprve aplikuje markdown – tento pořadí je klíčové pro XSS bezpečnost; nikdy neobrátit
- Markdown se renderuje jen v **zobrazení** detailu (`.task-detail`), textarea v edit sheetu zobrazuje surový text
