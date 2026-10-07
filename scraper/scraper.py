#!/usr/bin/env python3
"""KammForce Phase 1 - data pipeline.

Async-scrapes public motorcycle spec pages (aiohttp + BeautifulSoup), refines the
Center of Gravity height from the press photo with OpenCV (wheelbase as the
ruler + 2D Gaussian engine-density mask + image moments), falls back to a
heuristic estimate when vision fails, and writes the YAML "database":

    public/data/_index.yaml
    public/data/motorcycles/{make}.yaml

Usage:
    python scraper/scraper.py --targets scraper/targets.yaml --output public/data
"""
from __future__ import annotations

import argparse
import asyncio
import logging
import re
from dataclasses import asdict, dataclass
from enum import Enum
from pathlib import Path
from typing import Any, Optional
from urllib import robotparser
from urllib.parse import urljoin, urlparse

import aiohttp
import cv2
import numpy as np
import yaml
from bs4 import BeautifulSoup

log = logging.getLogger("kammforce.scraper")

USER_AGENT = "KammForceBot/1.0 (+https://github.com/FranekJemiolo/kammforce)"
MAX_IMAGE_BYTES = 10 * 1024 * 1024
WORK_WIDTH_PX = 1000  # images are resized to this width before CV (scale-free: we use ratios)


# --------------------------------------------------------------------------- #
# Data model (matches public/data/motorcycles/{make}.yaml in the context doc)
# --------------------------------------------------------------------------- #
@dataclass
class Motorcycle:
    id: str
    name: str
    year: int
    wheelbase_mm: Optional[int] = None
    rake_deg: Optional[float] = None
    trail_mm: Optional[int] = None
    cog_height_mm: Optional[int] = None
    mass_kg: Optional[int] = None
    max_mech_lean_deg: Optional[int] = None
    compatible_front_tires: Optional[list[str]] = None
    compatible_rear_tires: Optional[list[str]] = None
    cog_source: Optional[str] = None  # "image" | "heuristic" (provenance, ignored by the app)


class EngineType(str, Enum):
    V_TWIN = "v_twin"
    BOXER = "boxer"
    PARALLEL_TWIN = "parallel_twin"
    INLINE_4 = "inline_4"
    SINGLE = "single"


# --------------------------------------------------------------------------- #
# Parsing helpers
# --------------------------------------------------------------------------- #
NUMERIC_RE = re.compile(r"(\d+(?:\.\d+)?)")


def extract_number(text: str, *, is_float: bool = False) -> Optional[float | int]:
    """First number in `text`; strips thousands separators ('1,405 mm' -> 1405)."""
    if not text:
        return None
    m = NUMERIC_RE.search(text.replace(",", ""))
    if not m:
        return None
    val = float(m.group(1))
    return val if is_float else int(round(val))


def extract_length_mm(text: str) -> Optional[int]:
    """Length in mm. Handles 'mm', 'cm' and inches ('55.3 in' / '55.3"')."""
    n = extract_number(text, is_float=True)
    if n is None:
        return None
    t = text.lower()
    if "mm" in t:
        return int(round(n))
    if "cm" in t:
        return int(round(n * 10))
    if re.search(r'\bin\b|inch|"', t):
        return int(round(n * 25.4))
    return int(round(n))


def extract_mass_kg(text: str) -> Optional[int]:
    n = extract_number(text, is_float=True)
    if n is None:
        return None
    t = text.lower()
    if "lb" in t and "kg" not in t:
        n *= 0.45359237
    return int(round(n))


def detect_engine_type(text: str) -> Optional[EngineType]:
    t = text.lower()
    if re.search(r"boxer|flat[- ]twin|opposed", t):
        return EngineType.BOXER
    if re.search(r"\bv[- ]?twin\b|\bv2\b|\d+\s*°\s*v", t):
        return EngineType.V_TWIN
    if re.search(r"parallel[- ]twin|inline[- ]twin|crossplane|\b2[- ]cylinder", t):
        return EngineType.PARALLEL_TWIN
    if re.search(r"inline[- ]?(4|four)|in-line four|\b4[- ]cylinder|\binline 4\b", t):
        return EngineType.INLINE_4
    if re.search(r"\bsingle\b|1[- ]cylinder|one[- ]cylinder", t):
        return EngineType.SINGLE
    return None


def make_bike_id(make: str, model: str, year: int) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", model.lower()).strip("_")
    return f"{re.sub(r'[^a-z0-9]', '', make.lower())[:3]}_{slug}_{year}"


def parse_spec_table(
    html: str, target: dict[str, Any], table_selector: str
) -> tuple[Motorcycle, Optional[EngineType], BeautifulSoup]:
    soup = BeautifulSoup(html, "html.parser")
    bike = Motorcycle(
        id=make_bike_id(target["make"], target["name"], target["year"]),
        name=target["name"],
        year=int(target["year"]),
    )
    engine: Optional[EngineType] = None
    if target.get("engine_type"):
        engine = EngineType(target["engine_type"])

    table = soup.select_one(table_selector)
    if table is None:
        log.warning("No spec table (%s) for %s", table_selector, bike.id)
        return bike, engine, soup

    for row in table.find_all("tr"):
        cols = row.find_all(["th", "td"])
        if len(cols) < 2:
            continue
        label = cols[0].get_text(" ", strip=True).lower()
        value = cols[1].get_text(" ", strip=True)

        if "wheelbase" in label:
            bike.wheelbase_mm = extract_length_mm(value)
        elif "rake" in label or "caster" in label:
            bike.rake_deg = extract_number(value, is_float=True)
        elif "trail" in label:
            bike.trail_mm = extract_length_mm(value)
        elif any(k in label for k in ("wet weight", "curb weight", "kerb weight", "mass", "weight")):
            if bike.mass_kg is None:  # first (wet/curb) match wins
                bike.mass_kg = extract_mass_kg(value)
        elif "lean" in label:
            bike.max_mech_lean_deg = extract_number(value)
        elif "engine" in label and engine is None:
            engine = detect_engine_type(value)

    sanitize(bike)
    return bike, engine, soup


def sanitize(b: Motorcycle) -> None:
    """Drop values outside physically plausible motorcycle ranges (bad parses)."""
    bounds = {
        "wheelbase_mm": (1000, 2200),
        "rake_deg": (15.0, 40.0),
        "trail_mm": (30, 200),
        "mass_kg": (60, 500),
        "max_mech_lean_deg": (20, 75),
    }
    for field, (lo, hi) in bounds.items():
        v = getattr(b, field)
        if v is not None and not (lo <= v <= hi):
            log.warning("%s: %s=%s out of range [%s, %s]; dropped", b.id, field, v, lo, hi)
            setattr(b, field, None)


# --------------------------------------------------------------------------- #
# CoG - heuristic fallback
# --------------------------------------------------------------------------- #
_BASE_RATIOS = {
    EngineType.V_TWIN: 0.42,
    EngineType.BOXER: 0.45,
    EngineType.PARALLEL_TWIN: 0.48,
    EngineType.INLINE_4: 0.50,
    EngineType.SINGLE: 0.53,
}


def estimate_cog_height(
    wheelbase_mm: Optional[int], mass_kg: Optional[int], engine_type: Optional[EngineType]
) -> Optional[int]:
    """Wheelbase-ratio heuristic with a mild mass correction (see context doc)."""
    if not wheelbase_mm or not mass_kg:
        return None
    ratio = _BASE_RATIOS.get(engine_type, 0.48)
    ratio -= ((mass_kg - 200) / 50.0) * 0.01
    ratio = max(0.40, min(0.60, ratio))
    return int(wheelbase_mm * ratio)


# --------------------------------------------------------------------------- #
# CoG - OpenCV pipeline
# --------------------------------------------------------------------------- #
Circle = tuple[int, int, int]  # (x, y, r)


def build_silhouette_mask(img: np.ndarray) -> np.ndarray:
    """uint8 0/255 mask of the bike. Uses the alpha channel when present
    (cut-out PNGs), otherwise assumes a near-white studio background."""
    if img.ndim == 3 and img.shape[2] == 4:
        mask = np.where(img[:, :, 3] > 16, 255, 0).astype(np.uint8)
    else:
        gray = img if img.ndim == 2 else cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        _, mask = cv2.threshold(gray, 240, 255, cv2.THRESH_BINARY_INV)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    return cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)


def detect_axles(gray: np.ndarray) -> tuple[Circle, Circle]:
    """Find (rear, front) wheel circles via Hough; rear = left-most of the best pair."""
    h, w = gray.shape
    blurred = cv2.GaussianBlur(gray, (9, 9), 2)
    raw = cv2.HoughCircles(
        blurred,
        cv2.HOUGH_GRADIENT,
        dp=1.2,
        minDist=int(w * 0.15),
        param1=100,
        param2=40,
        minRadius=int(w * 0.07),
        maxRadius=int(w * 0.17),
    )
    if raw is None:
        raise ValueError("no wheel candidates found")
    cands: list[Circle] = [tuple(int(v) for v in c) for c in np.round(raw[0])]  # type: ignore[misc]

    # Best pair: similar radius, similar height, and clearly separated horizontally.
    best: Optional[tuple[float, Circle, Circle]] = None
    for i, a in enumerate(cands[:8]):  # Hough returns candidates sorted by votes
        for b in cands[i + 1 : 8]:
            r_avg = (a[2] + b[2]) / 2
            dx = abs(a[0] - b[0])
            if abs(a[2] - b[2]) > 0.15 * r_avg or abs(a[1] - b[1]) > 0.15 * r_avg or dx < 3 * r_avg:
                continue
            score = dx  # prefer the widest valid pair (avoids picking two rim details)
            if best is None or score > best[0]:
                best = (score, a, b)
    if best is None:
        raise ValueError("no consistent wheel pair found")
    _, a, b = best
    rear, front = sorted((a, b), key=lambda c: c[0])
    return rear, front


def apply_engine_density_mask(mask: np.ndarray, rear: Circle, front: Circle) -> np.ndarray:
    """W(x,y) = 1 + A*exp(-((x-cx)^2/2sx^2 + (y-cy)^2/2sy^2)), applied to the silhouette."""
    h, w = mask.shape
    cx = (front[0] + rear[0]) / 2
    axle_y = (front[1] + rear[1]) / 2
    cy = axle_y - h * 0.1  # image Y grows downward -> engine sits slightly above the axle line

    wheelbase_px = abs(front[0] - rear[0])
    sigma_x = wheelbase_px * 0.25
    sigma_y = wheelbase_px * 0.20
    peak_added_weight = 3.0  # engine centre = 4x the base mass

    Y, X = np.ogrid[:h, :w]
    dist_sq = (X - cx) ** 2 / (2 * sigma_x**2) + (Y - cy) ** 2 / (2 * sigma_y**2)
    weight_map = 1.0 + peak_added_weight * np.exp(-dist_sq)
    return (mask.astype(np.float32) / 255.0) * weight_map.astype(np.float32)


def estimate_cog_from_image(img: np.ndarray, known_wheelbase_mm: int) -> int:
    """CoG height above ground in mm. Raises ValueError if the image is unusable."""
    if img is None or img.size == 0:
        raise ValueError("empty image")
    scale = WORK_WIDTH_PX / img.shape[1]
    img = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)

    mask = build_silhouette_mask(img)
    if cv2.countNonZero(mask) < 0.02 * mask.size:
        raise ValueError("silhouette mask is nearly empty")

    gray = img if img.ndim == 2 else cv2.cvtColor(img[:, :, :3], cv2.COLOR_BGR2GRAY)
    rear, front = detect_axles(gray)

    pixel_wheelbase = front[0] - rear[0]
    mm_per_px = known_wheelbase_mm / pixel_wheelbase

    weighted = apply_engine_density_mask(mask, rear, front)
    m = cv2.moments(weighted)
    if m["m00"] <= 0:
        raise ValueError("zero mass in weighted mask")
    cy = m["m01"] / m["m00"]

    # Ground = bottom of the tires (mean of both, tolerates slight photo tilt).
    ground_y = ((rear[1] + rear[2]) + (front[1] + front[2])) / 2
    cog_mm = int(round((ground_y - cy) * mm_per_px))

    if not (0.25 * known_wheelbase_mm <= cog_mm <= 0.75 * known_wheelbase_mm):
        raise ValueError(f"implausible CoG {cog_mm} mm for wheelbase {known_wheelbase_mm} mm")
    return cog_mm


# --------------------------------------------------------------------------- #
# Networking
# --------------------------------------------------------------------------- #
class Fetcher:
    def __init__(self, session: aiohttp.ClientSession, concurrency: int, delay_s: float):
        self.session = session
        self.sem = asyncio.Semaphore(concurrency)
        self.delay_s = delay_s
        self._robots: dict[str, Optional[robotparser.RobotFileParser]] = {}

    async def _allowed(self, url: str) -> bool:
        p = urlparse(url)
        origin = f"{p.scheme}://{p.netloc}"
        if origin not in self._robots:
            rp = robotparser.RobotFileParser()
            try:
                async with self.session.get(f"{origin}/robots.txt", timeout=aiohttp.ClientTimeout(total=15)) as r:
                    if r.status == 200:
                        rp.parse((await r.text()).splitlines())
                        self._robots[origin] = rp
                    else:
                        self._robots[origin] = None  # no robots.txt -> allowed
            except Exception:  # network error: be conservative
                log.warning("robots.txt unreachable for %s; skipping site", origin)
                self._robots[origin] = rp
                rp.disallow_all = True
        rp = self._robots[origin]
        return True if rp is None else rp.can_fetch(USER_AGENT, url)

    async def _get(self, url: str, *, binary: bool) -> str | bytes:
        if not await self._allowed(url):
            raise PermissionError(f"blocked by robots.txt: {url}")
        async with self.sem:
            await asyncio.sleep(self.delay_s)
            async with self.session.get(url, timeout=aiohttp.ClientTimeout(total=30)) as r:
                r.raise_for_status()
                if not binary:
                    return await r.text()
                if (r.content_length or 0) > MAX_IMAGE_BYTES:
                    raise ValueError("image too large")
                data = await r.content.read(MAX_IMAGE_BYTES + 1)
                if len(data) > MAX_IMAGE_BYTES:
                    raise ValueError("image too large")
                return data

    async def html(self, url: str) -> str:
        return await self._get(url, binary=False)  # type: ignore[return-value]

    async def image(self, url: str) -> np.ndarray:
        data = await self._get(url, binary=True)
        # IMREAD_UNCHANGED keeps the alpha channel of cut-out PNGs.
        img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_UNCHANGED)  # type: ignore[arg-type]
        if img is None:
            raise ValueError("could not decode image")
        return img


# --------------------------------------------------------------------------- #
# Per-bike pipeline
# --------------------------------------------------------------------------- #
async def process_target(target: dict[str, Any], cfg: dict[str, Any], fetcher: Fetcher) -> Motorcycle:
    html = await fetcher.html(target["url"])
    bike, engine, soup = parse_spec_table(html, target, cfg["table_selector"])

    if not bike.wheelbase_mm:
        log.warning("%s: no wheelbase, cannot estimate CoG", bike.id)
        return bike

    img_tag = soup.select_one(cfg["image_selector"])
    src = (img_tag.get("src") or img_tag.get("data-src")) if img_tag else None
    if src:
        try:
            img = await fetcher.image(urljoin(target["url"], src))
            # CV is CPU-bound: keep the event loop free.
            bike.cog_height_mm = await asyncio.to_thread(estimate_cog_from_image, img, bike.wheelbase_mm)
            bike.cog_source = "image"
            return bike
        except Exception as e:  # noqa: BLE001 - any CV/network failure -> heuristic
            log.warning("%s: image CoG failed (%s); using heuristic", bike.id, e)

    bike.cog_height_mm = estimate_cog_height(bike.wheelbase_mm, bike.mass_kg, engine)
    if bike.cog_height_mm:
        bike.cog_source = "heuristic"
    return bike


# --------------------------------------------------------------------------- #
# YAML output
# --------------------------------------------------------------------------- #
def _clean(b: Motorcycle) -> dict[str, Any]:
    return {k: v for k, v in asdict(b).items() if v is not None}


def save_make_yaml(make: str, bikes: list[Motorcycle], out_dir: Path) -> bool:
    """Idempotent merge. New ids are appended; existing ids only get *missing* fields
    filled, so hand-curated values from earlier PRs are never overwritten."""
    mdir = out_dir / "motorcycles"
    mdir.mkdir(parents=True, exist_ok=True)
    path = mdir / f"{re.sub(r'[^a-z0-9]+', '_', make.lower()).strip('_')}.yaml"

    data: dict[str, Any] = {"brand": make, "models": []}
    if path.exists():
        existing = yaml.safe_load(path.read_text()) or {}
        data["models"] = existing.get("models", []) or []

    by_id = {m["id"]: m for m in data["models"]}
    for bike in bikes:
        new = _clean(bike)
        if bike.id in by_id:
            for k, v in new.items():
                by_id[bike.id].setdefault(k, v)
        else:
            data["models"].append(new)
            by_id[bike.id] = new
    data["models"].sort(key=lambda m: (m.get("year", 0), m["id"]))

    text = yaml.dump(data, default_flow_style=None, sort_keys=False, allow_unicode=True)
    if path.exists() and path.read_text() == text:
        return False
    path.write_text(text)
    return True


def write_index(out_dir: Path) -> None:
    """Lightweight `_index.yaml` (no physics specs) rebuilt from all make files."""
    brands = []
    for f in sorted((out_dir / "motorcycles").glob("*.yaml")):
        d = yaml.safe_load(f.read_text()) or {}
        brands.append(
            {
                "brand": d.get("brand", f.stem),
                "file": f"motorcycles/{f.name}",
                "models": [
                    {"id": m["id"], "name": m["name"], "year": m["year"]} for m in d.get("models", [])
                ],
            }
        )
    (out_dir / "_index.yaml").write_text(
        yaml.dump({"brands": brands}, default_flow_style=None, sort_keys=False, allow_unicode=True)
    )


# --------------------------------------------------------------------------- #
# Entrypoint
# --------------------------------------------------------------------------- #
async def run(targets_path: Path, out_dir: Path) -> None:
    conf = yaml.safe_load(targets_path.read_text()) or {}
    defaults = {
        "table_selector": "table.specs-table",
        "image_selector": "img.main-bike-photo",
        "max_concurrency": 5,
        "request_delay_s": 1.0,
        **(conf.get("defaults") or {}),
    }
    targets = conf.get("targets") or []

    async with aiohttp.ClientSession(headers={"User-Agent": USER_AGENT}) as session:
        fetcher = Fetcher(session, defaults["max_concurrency"], defaults["request_delay_s"])
        cfgs = [{**defaults, **{k: t[k] for k in ("table_selector", "image_selector") if k in t}} for t in targets]
        results = await asyncio.gather(
            *(process_target(t, c, fetcher) for t, c in zip(targets, cfgs)), return_exceptions=True
        )

    by_make: dict[str, list[Motorcycle]] = {}
    for t, res in zip(targets, results):
        if isinstance(res, BaseException):
            log.error("Failed %s %s: %s", t["make"], t["name"], res)
            continue
        by_make.setdefault(t["make"], []).append(res)

    changed = [make for make, bikes in by_make.items() if save_make_yaml(make, bikes, out_dir)]
    if (out_dir / "motorcycles").exists():
        write_index(out_dir)
    log.info("Scraped %d bikes; updated files for: %s", sum(map(len, by_make.values())), changed or "none")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--targets", type=Path, default=Path("scraper/targets.yaml"))
    ap.add_argument("--output", type=Path, default=Path("public/data"))
    args = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    asyncio.run(run(args.targets, args.output))


if __name__ == "__main__":
    main()
