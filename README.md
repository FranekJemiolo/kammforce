# KammForce

Offline-first, serverless PWA for motorcycle grip and lean-limit calculations
(toroidal tire roll equation + Pacejka '94 with camber thrust).

- **Hosting:** GitHub Pages (static, no backend)
- **Database:** `@sqlite.org/sqlite-wasm` + OPFS inside a Web Worker, hydrated from YAML in `public/data/`
- **Cross-origin isolation:** custom service worker (`src/sw.ts`) adds COOP/COEP headers (GitHub Pages can't)
- **Data pipeline:** `scraper/scraper.py` (aiohttp + BeautifulSoup + OpenCV CoG), run weekly by `.github/workflows/scraper.yml`

**Live:** https://franekjemiolo.github.io/kammforce/

## Screenshots

<p align="center">
  <img src="docs/screenshots/desktop.png" alt="KammForce desktop: system status and motorcycle database" width="720" />
  <img src="docs/screenshots/mobile.png" alt="KammForce on mobile" width="220" />
</p>

Regenerate them after UI changes (builds the app, serves it, captures with Playwright):

```bash
npx playwright install chromium   # first time only
npm run screenshots
```

## Development

```bash
npm ci
npm run dev        # dev server sends COOP/COEP headers itself
npm run build      # typecheck + production build

pip install -r scraper/requirements.txt
python scraper/scraper.py --targets scraper/targets.yaml --output public/data
```

## Roadmap

1. ✅ Data pipeline (scraper, CoG vision, YAML, Actions)
2. ✅ Vite PWA, Wasm SQLite/OPFS, YAML hydration, garage storage
3. ⏳ Physics engine (Newton-Raphson toroidal solver, Pacejka '94, hang-off kinematics)
4. ⏳ UI (garage, calculator, scrape/slide warnings, Kamm circle)
