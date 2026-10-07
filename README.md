# KammForce

Offline-first, serverless PWA for motorcycle grip and lean-limit calculations
(toroidal tire roll equation + Pacejka '94 with camber thrust).

- **Hosting:** GitHub Pages (static, no backend)
- **Database:** `@sqlite.org/sqlite-wasm` + OPFS inside a Web Worker, hydrated from YAML in `public/data/`
- **Cross-origin isolation:** custom service worker (`src/sw.ts`) adds COOP/COEP headers (GitHub Pages can't)
- **Data pipeline:** `scraper/scraper.py` (aiohttp + BeautifulSoup + OpenCV CoG), run weekly by `.github/workflows/scraper.yml`

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
