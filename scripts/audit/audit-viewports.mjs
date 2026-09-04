#!/usr/bin/env node
/**
 * Responsive viewport audit for the iPhone logical-width matrix (issue #104).
 *
 * Boots a dev-mode build of the app through `vite preview`, then walks the
 * target matrix at 9 portrait widths (375 → 440 CSS px) across the main
 * route, the rainfall-map swiper slide (HK + Vancouver), the settings
 * dropdown, and the offline/cache banner state — asserting no page-level
 * horizontal overflow, no unexpected console errors, and no overlapping
 * interactive controls, and capturing screenshots for visual review.
 *
 * Everything the app fetches (Open-Meteo, HKO, Carto basemap, GeoMet WMS,
 * the HKO nowcast CSV) is stubbed from recorded fixtures so the run is
 * deterministic and fully offline. See scripts/audit/fixtures/README.md.
 *
 * Usage:
 *   node scripts/audit/audit-viewports.mjs            # full matrix, builds if needed
 *   node scripts/audit/audit-viewports.mjs --build    # force a fresh dev build
 *   node scripts/audit/audit-viewports.mjs --no-build # reuse existing dist/
 *   node scripts/audit/audit-viewports.mjs --state hk-main,sf-main
 *   node scripts/audit/audit-viewports.mjs --width 375,393,440
 *   node scripts/audit/audit-viewports.mjs --shots-only   # skip overflow assertions
 *
 * Exit code is non-zero when any assertion fails.
 */
import { createRequire } from "node:module";
import { spawn, spawnSync } from "node:child_process";
import { deflateSync } from "node:zlib";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const SHOT_DIR = join(dirname(fileURLToPath(import.meta.url)), "shots");

const PORT = Number(process.env.AUDIT_PORT || 4173);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const CI = !!process.env.CI;

/* ── Target matrix (CSS px logical sizes, portrait) ──────────────────
 * Width clusters: narrow 375 · standard 390–402 · large 428–440.
 * Rows: issue #104's six source rows + 402×874 (iPhone 16 Pro, current
 * hardware, issue open question) + 375×812 (notched tall-narrow: X / 11
 * Pro / 12–13 mini, issue open question). */
const WIDTHS = [
  { w: 375, h: 667, label: "375x667-se" },
  { w: 375, h: 812, label: "375x812-x" },
  { w: 390, h: 844, label: "390x844-base" },
  { w: 393, h: 852, label: "393x852-pro" },
  { w: 402, h: 874, label: "402x874-16pro" },
  { w: 428, h: 926, label: "428x926-plus-old" },
  { w: 430, h: 932, label: "430x932-plus" },
  { w: 440, h: 956, label: "440x956-pro-max" },
];

const CITIES = {
  // Hong Kong — HKO + OM merge, 3 swiper slides (HK rainfall map), PRD box.
  hk: { name: "Hong Kong", latitude: 22.32, longitude: 114.17, country: "HK", admin1: "" },
  // Vancouver — in the MSC rainfall region, 3 slides (MSC map).
  van: { name: "Vancouver", latitude: 49.25, longitude: -123.12, country: "CA", admin1: "BC" },
  // San Francisco — non-region control, 2 slides, OM-only.
  sf: { name: "San Francisco", latitude: 37.77, longitude: -122.42, country: "US", admin1: "California" },
};

/* City key per state — used to seed localStorage before the app boots. */
const STATE_CITY = {
  "hk-main": "hk", "hk-map": "hk", "hk-settings": "hk", "hk-alerts": "hk", "hk-cache-banner": "hk",
  "van-main": "van", "van-map": "van",
  "sf-main": "sf", "sf-cache-banner": "sf",
};

/* STATES × city mapping. Each state is a page-load script that returns
 * nothing; the caller measures + screenshots after it resolves. */
const STATES = {
  "hk-main": async (ctx) => ctx.go(CITIES.hk, { slides: 3 }),
  "van-main": async (ctx) => ctx.go(CITIES.van, { slides: 3 }),
  "sf-main": async (ctx) => ctx.go(CITIES.sf, { slides: 2 }),
  "hk-map": async (ctx) => { await ctx.go(CITIES.hk, { slides: 3 }); await ctx.slideTo(2); },
  "van-map": async (ctx) => { await ctx.go(CITIES.van, { slides: 3 }); await ctx.slideTo(2); },
  "hk-settings": async (ctx) => { await ctx.go(CITIES.hk, { slides: 3 }); await ctx.openSettings(); },
  "hk-alerts": async (ctx) => { await ctx.go(CITIES.hk, { slides: 3 }); await ctx.addDevWarnings(); },
  "hk-cache-banner": async (ctx) => { await ctx.primeThenGoOffline(CITIES.hk); },
  "sf-cache-banner": async (ctx) => { await ctx.primeThenGoOffline(CITIES.sf); },
};

/* ── Fixtures / stubs ─────────────────────────────────────────────── */
const FIXTURES = {
  "om-hong-kong.json": JSON.parse(readFileSync(join(FIXTURE_DIR, "om-hong-kong.json"), "utf8")),
  "om-vancouver.json": JSON.parse(readFileSync(join(FIXTURE_DIR, "om-vancouver.json"), "utf8")),
  "om-san-francisco.json": JSON.parse(readFileSync(join(FIXTURE_DIR, "om-san-francisco.json"), "utf8")),
  "hko-fnd-en.json": JSON.parse(readFileSync(join(FIXTURE_DIR, "hko-fnd-en.json"), "utf8")),
  "hko-rhrread-en.json": JSON.parse(readFileSync(join(FIXTURE_DIR, "hko-rhrread-en.json"), "utf8")),
  "hko-warnsum-en.json": JSON.parse(readFileSync(join(FIXTURE_DIR, "hko-warnsum-en.json"), "utf8")),
};

/** Shift every unixtime field in an Open-Meteo fixture so the recorded
 *  payload behaves like a live snapshot (hero trend + sun strip + charts
 *  all anchor on "now"). */
function shiftOmFixture(fixture) {
  const nowSec = Math.floor(Date.now() / 1000);
  const delta = nowSec - fixture.current.time;
  if (!delta) return fixture;
  const shifted = JSON.parse(JSON.stringify(fixture));
  const shift = (v) => (typeof v === "number" ? v + delta : v);
  shifted.current.time = shift(shifted.current.time);
  for (const key of ["time", "sunrise", "sunset"]) {
    const arr = shifted.daily?.[key];
    if (Array.isArray(arr)) shifted.daily[key] = arr.map(shift);
  }
  if (Array.isArray(shifted.hourly?.time)) shifted.hourly.time = shifted.hourly.time.map(shift);
  return shifted;
}

const OM_CITY_KEYS = [
  { lat: 22.32, lon: 114.17, key: "om-hong-kong.json" },
  { lat: 49.25, lon: -123.12, key: "om-vancouver.json" },
  { lat: 37.77, lon: -122.42, key: "om-san-francisco.json" },
];

function pickOmFixture(lat, lon) {
  let best = OM_CITY_KEYS[0];
  let bestDist = Infinity;
  for (const c of OM_CITY_KEYS) {
    const d = Math.abs(c.lat - lat) + Math.abs(c.lon - lon);
    if (d < bestDist) { bestDist = d; best = c; }
  }
  return FIXTURES[best.key];
}

/* A flat 256×256 light-grey PNG served for every map tile (Carto basemap,
 * GeoMet WMS). Generated once — PNG requires a real CRC. */
function makeTilePng() {
  const crc32 = (buf) => {
    let c = ~0;
    for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
    return ~c >>> 0;
  };
  const pngChunk = (type, data) => {
    const t = Buffer.from(type, "ascii");
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
    return Buffer.concat([len, t, data, crc]);
  };
  const W = 256, H = 256;
  const raw = Buffer.alloc(H * (1 + W * 4));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 4)] = 0;
    for (let x = 0; x < W; x++) {
      const o = y * (1 + W * 4) + 1 + x * 4;
      raw[o] = 0xe8; raw[o + 1] = 0xec; raw[o + 2] = 0xf1; raw[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

/** A tiny but structurally valid HKO nowcast CSV (5-col, comma-separated):
 *  updateTime,endTime,lat,lon,value per row. Two forecast steps around the
 *  HK center so the step timeline + legend render like a real payload. */
function syntheticNowcastCsv() {
  const fmt = (t) => {
    const d = new Date(t);
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}`;
  };
  const base = Date.now();
  const now = fmt(base);
  const plus = fmt(base + 15 * 60_000);
  const lines = ["updateTime,endTime,latitude,longitude,rainfall(mm)"];
  let value = 12;
  for (const [endTime, dt] of [[now, 0], [plus, 1]]) {
    for (let i = -2; i <= 2; i++) {
      for (let j = -2; j <= 2; j++) {
        if (i === 0 && j === 0) continue;
        lines.push(`${now},${endTime},${(22.32 + i * 0.02).toFixed(3)},${(114.17 + j * 0.021).toFixed(3)},${((value + dt * 3) % 25 + 1).toFixed(1)}`);
      }
    }
  }
  lines.push(`${now},${plus},22.32,114.17,${(5 + (base % 7)).toFixed(1)}`);
  return lines.join("\n");
}

/* ── Process plumbing ─────────────────────────────────────────────── */
function buildDev() {
  console.log("[audit] building dev-mode bundle (vite build --mode development)…");
  const res = spawnSync("pnpm", ["exec", "vite", "build", "--mode", "development"], {
    cwd: ROOT, stdio: "inherit", shell: process.platform === "win32",
    // NODE_ENV=development keeps import.meta.env.DEV true so the app's
    // dev-only warning simulator (window.__devWarnings) is compiled in —
    // the hk-alerts state drives it. `vite build --mode development` alone
    // leaves NODE_ENV=production, which strips the simulator.
    env: { ...process.env, NODE_ENV: "development" },
  });
  if (res.status !== 0) {
    console.error("[audit] build failed");
    process.exit(1);
  }
}

function startPreview() {
  const child = spawn("pnpm", ["exec", "vite", "preview", "--mode", "development", "--port", String(PORT), "--strictPort", "--host", "127.0.0.1"], {
    cwd: ROOT, stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (d) => { stderr += d; });
  return { child, url: BASE_URL };
}

async function waitForServer(url, timeoutMs = 60_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`preview server did not start at ${url}`);
}

/* ── Playwright orchestration ─────────────────────────────────────── */
async function loadPlaywright() {
  try {
    return require("playwright-core");
  } catch {
    console.error("[audit] playwright-core is not installed. Run: pnpm add -D playwright-core (dev-only)");
    process.exit(1);
  }
}

function args() {
  const a = { states: new Set(Object.keys(STATES)), widths: new Set(WIDTHS.map((w) => w.label)), build: true, shotsOnly: false };
  const list = process.argv.slice(2);
  for (let i = 0; i < list.length; i++) {
    const v = list[i];
    if (v === "--no-build") a.build = false;
    else if (v === "--build") a.build = true;
    else if (v === "--shots-only") a.shotsOnly = true;
    else if (v === "--state") a.states = new Set(list[++i].split(","));
    else if (v === "--width") {
      const want = new Set(list[++i].split(","));
      a.widths = new Set(WIDTHS.filter((w) => want.has(String(w.w)) || want.has(w.label)).map((w) => w.label));
    }
  }
  return a;
}

/** Report row accumulator shared across the run. */
const results = [];

class RunContext {
  constructor({ browser, width, state, city, serverUrl, stubs, shotsDir }) {
    this.browser = browser;
    this.width = width;
    this.state = state;
    this.setCity(city);
    this.serverUrl = serverUrl;
    this.stubs = stubs;
    this.shotsDir = shotsDir;
    this.page = null;
    this.blockApi = false;
    this.blockHkoOnly = false;
    this.errors = [];
  }

  async init() {
    const ctx = await this.browser.newContext({
      viewport: { width: this.width.w, height: this.width.h },
      deviceScaleFactor: 1,
      locale: "en-US",
      colorScheme: "light",
      serviceWorkers: "block",
    });
    await ctx.route("**/*", (route) => this.handleRoute(route));
    this.page = await ctx.newPage();
    this.page.on("pageerror", (err) => this.errors.push(`pageerror: ${err.message}`));
    this.page.on("console", (msg) => {
      if (msg.type() !== "error") return;
      const text = msg.text();
      // DevTools logs every failed/aborted resource load this way even when
      // the app handles the failure (HKO warningInfo, offline stubs). Keep
      // the error list for real JS exceptions, not resource noise.
      if (text.startsWith("Failed to load resource")) return;
      // cache-banner states deliberately block every API: the app's own
      // logFailure() lines are the expected outcome of the simulation.
      if (this.state.endsWith("-cache-banner") && text.includes("Failed to fetch")) return;
      this.errors.push(`console.error: ${text.slice(0, 300)}`);
    });
    if (process.env.AUDIT_DEBUG) {
      this.page.on("requestfailed", (r) => console.log("[dbg-err]", r.url().slice(0, 110), r.failure()?.errorText));
      this.page.on("response", (r) => { if (r.status() >= 400) console.log("[dbg-http]", r.status(), r.url().slice(0, 110)); });
    }
    // Seed deterministic app state before any app module runs. Runs on every
    // navigation (incl. reload), so guard the localStorage wipe with a
    // sessionStorage flag — the cache-banner flow reloads the page and must
    // keep the last-known snapshot + query cache it primed.
    await this.page.addInitScript(({ city, lang }) => {
      const seeded = (() => {
        try { return sessionStorage.getItem("__audit_seeded"); } catch { return "1"; }
      })();
      if (!seeded) {
        localStorage.clear();
        try { sessionStorage.setItem("__audit_seeded", "1"); } catch { /* ignore */ }
      }
      const seed = (k, v) => localStorage.setItem(k, JSON.stringify(v));
      seed("weather-language", lang);
      seed("theme-mode", "light");
      seed("weather-units", "metric");
      seed("weather-default-city", city);
      seed("weather-recent-cities", [city]);
      // Headless Chrome denies geolocation anyway; force the rejection so a
      // permissive platform default can never swap the seeded city.
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition = (_ok, err) =>
          err && err({ code: 1, message: "denied for audit" });
      }
    }, { city: this.city(), lang: process.env.AUDIT_LANG || "en" });
    // Persist this context for later pages in banner flows.
    this.ctx = ctx;
    return ctx;
  }

  city() {
    return { name: this.cityName, latitude: this.cityLat, longitude: this.cityLon, country: this.cityCountry, admin1: this.cityAdmin1 };
  }

  setCity(c) {
    this.cityName = c.name; this.cityLat = c.latitude; this.cityLon = c.longitude;
    this.cityCountry = c.country; this.cityAdmin1 = c.admin1 ?? "";
  }

  /** Route stub for every request the page makes. */
  async handleRoute(route) {
    const url = route.request().url();
    const u = new URL(url);
    const { pathname, searchParams } = u;
    try {
      // App shell assets always served by preview.
      if (u.origin === this.serverUrl) {
        if (pathname.endsWith("/sw.js")) {
          // No service worker in the audit preview: keep the app from
          // registering one (its fetch cache would fight the route stubs).
          return route.fulfill({ status: 204, body: "" });
        }
        if (pathname.endsWith("/registerSW.js")) {
          // Empty module body → no SW registration, no console noise.
          return route.fulfill({ status: 204, contentType: "text/javascript", body: "" });
        }
        if (pathname.startsWith("/_vercel/")) {
          // @vercel/analytics + @vercel/speed-insights probe an endpoint that
          // only exists on Vercel; a local preview 404s (harmless, noisy).
          return route.fulfill({ status: 204, body: "" });
        }
        if (pathname.startsWith("/__audit-tile/")) {
          return route.fulfill({ status: 200, contentType: "image/png", body: this.stubs.tile });
        }
        if (pathname.startsWith("/hko-data/")) {
          if (this.blockApi) return route.abort();
          return route.fulfill({ status: 200, contentType: "text/csv", body: this.stubs.csv });
        }
        return route.continue();
      }
      // Open-Meteo forecast — replay a recorded fixture shifted to "now".
      if (u.hostname === "api.open-meteo.com" && pathname === "/v1/forecast") {
        if (this.blockApi) return route.abort();
        const lat = Number(searchParams.get("latitude"));
        const lon = Number(searchParams.get("longitude"));
        const fixture = shiftOmFixture(pickOmFixture(lat, lon));
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fixture) });
      }
      if (u.hostname === "geocoding-api.open-meteo.com") {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ results: [] }) });
      }
      if (u.hostname === "nominatim.openstreetmap.org") {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });
      }
      // HKO open data.
      if (u.hostname === "data.weather.gov.hk" && pathname === "/weatherAPI/opendata/weather.php") {
        if (this.blockApi) return route.abort();
        if (this.blockHkoOnly) return route.abort();
        const dt = searchParams.get("dataType");
        const lang = searchParams.get("lang");
        const map = {
          fnd: "hko-fnd-en.json", rhrread: "hko-rhrread-en.json", warnsum: "hko-warnsum-en.json",
        };
        const file = map[dt];
        if (!file) {
          // warningInfo detail lookup with no active warnings → empty details.
          return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ details: [] }) });
        }
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(FIXTURES[file]) });
      }
      // Map tiles: Carto basemap + GeoMet WMS + MSC probe → flat grey tile.
      if (u.hostname.endsWith("cartocdn.com") || u.hostname === "geo.weather.gc.ca") {
        // style.json requests get a minimal raster style pointing at our tile stub.
        if (pathname.endsWith("style.json") || u.hostname === "geo.weather.gc.ca") {
          if (u.hostname === "geo.weather.gc.ca") {
            return route.fulfill({ status: 200, contentType: "image/png", body: this.stubs.tile });
          }
          const style = {
            version: 8,
            sources: {
              audit: {
                type: "raster",
                tiles: [`${this.serverUrl}/__audit-tile/{z}/{x}/{y}.png`],
                tileSize: 256,
                attribution: "OSM &copy; CARTO (audit stub)",
              },
            },
            layers: [{ id: "audit-basemap", type: "raster", source: "audit" }],
          };
          return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(style) });
        }
        return route.fulfill({ status: 200, contentType: "image/png", body: this.stubs.tile });
      }
      return route.continue();
    } catch (err) {
      console.error("[audit] route handler error for", url, err);
      return route.abort();
    }
  }

  /** Go to "/" and wait for weather + the expected number of slides. */
  async go(city, { slides }) {
    this.setCity(city);
    const page = this.page;
    if (process.env.AUDIT_DEBUG) console.log("[dbg]", this.state, "goto");
    await page.goto(this.serverUrl + "/", { waitUntil: "domcontentloaded" });
    if (process.env.AUDIT_DEBUG) console.log("[dbg]", this.state, "goto-done");
    await page.waitForSelector('[data-testid="temp-summary"]', { timeout: 25_000 });
    if (process.env.AUDIT_DEBUG) console.log("[dbg]", this.state, "temp-summary");
    await page.waitForFunction(
      (n) => document.querySelectorAll(".swiper-slide").length >= n,
      slides, { timeout: 15_000 },
    );
    if (process.env.AUDIT_DEBUG) console.log("[dbg]", this.state, "slides-ready");
    // Let entrance animations finish before measuring layout.
    await page.waitForTimeout(1200);
  }

  async slideTo(index) {
    const page = this.page;
    // Bullets render inline; click the nth bullet to activate that slide.
    const bullets = page.locator("#swiper-mobile-deck-pagination .swiper-pagination-bullet");
    await bullets.nth(index).click({ timeout: 10_000 });
    await page.waitForFunction(
      (i) => document.querySelectorAll(".swiper-slide")[i]?.classList.contains("swiper-slide-active"),
      index, { timeout: 10_000 },
    );
    await page.waitForTimeout(2500); // let lazy map chunk + CSV + tiles settle
  }

  async openSettings() {
    const page = this.page;
    await page.getByRole("button", { name: /settings/i }).first().click({ timeout: 10_000 });
    await page.waitForSelector('[role="menu"]', { timeout: 10_000 });
    await page.waitForTimeout(400);
  }

  async addDevWarnings() {
    const page = this.page;
    await page.evaluate(() => {
      const w = window.__devWarnings;
      if (!w) throw new Error("__devWarnings unavailable (not a dev-mode build?)");
      w.add("WTS");
      w.add("TC8SE");
    });
    await page.waitForSelector('button[title="WTS"], [aria-label*="Standby"]', { timeout: 10_000 });
    // Wait out the toast slide-in + pulse animations so overlap scanning
    // measures settled layout, not mid-transition frames.
    await page.waitForTimeout(2200);
  }

  /** Offline/cache banner: load successfully first (which writes the
   *  last-known localStorage snapshot), then reload with every API blocked.
   *  The snapshot seeds React Query as always-stale initialData; the failed
   *  background fetch leaves query.error set with data still present, which
   *  `useWeatherWithProgress` augments to fallbackSource:'cache' → the red
   *  offline banner renders (weather data visible underneath). */
  async primeThenGoOffline(city) {
    this.setCity(city);
    const page = this.page;
    this.blockApi = false;
    await page.goto(this.serverUrl + "/", { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-testid="temp-summary"]', { timeout: 25_000 });
    // Snapshot is written synchronously on fetch success; give it a beat.
    await page.waitForTimeout(800);
    this.blockApi = true;
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-testid="banner-cache"]', { timeout: 25_000 });
    await page.waitForTimeout(800);
  }

  /** Measure page-level + per-card horizontal overflow. */
  async measure() {
    return this.page.evaluate(() => {
      const doc = document.documentElement;
      const body = document.body;
      const iw = window.innerWidth;
      const activeSlide = document.querySelector(".swiper-slide-active");
      const card = activeSlide?.querySelector(".editorial-card, .glass-card");
      const activeRect = activeSlide ? activeSlide.getBoundingClientRect() : null;
      const out = {
        innerWidth: iw,
        innerHeight: window.innerHeight,
        docScrollWidth: doc.scrollWidth,
        bodyScrollWidth: body.scrollWidth,
        docScrollHeight: doc.scrollHeight,
        bodyScrollHeight: body.scrollHeight,
        docOverflowX: getComputedStyle(doc).overflowX,
        bodyOverflowX: getComputedStyle(body).overflowX,
        cardScrollWidth: card ? card.scrollWidth : 0,
        cardClientWidth: card ? card.clientWidth : 0,
        cardRectRight: card ? Math.round(card.getBoundingClientRect().right) : 0,
        slideRectRight: activeRect ? Math.round(activeRect.right) : 0,
        hero: null,
        offenders: [],
      };
      // Hero numeral clip check: the temp h1 must not be wider than its
      // overflow-hidden wrapper (silent clipping would escape the offender
      // scan because the wrapper hides the overflow).
      const h1 = document.querySelector(".swiper-slide-active h1");
      if (h1) {
        const wrap = h1.parentElement;
        const cs = getComputedStyle(h1);
        out.hero = {
          fontSize: cs.fontSize,
          h1Scroll: h1.scrollWidth,
          wrapClient: wrap ? wrap.clientWidth : 0,
          clip: h1.scrollWidth > (wrap ? wrap.clientWidth : 0) + 1,
        };
      }
      // Element-level: visible boxes whose right edge extends past the
      // viewport AND are not clipped/scrollable by a closer ancestor.
      // Content inside a scrollable (overflow-x:auto) rail or an
      // overflow-hidden container is intentionally constrained; only
      // elements that can push the page itself wider are offenders.
      for (const el of document.querySelectorAll("body *")) {
        if (el.closest(".swiper-slide:not(.swiper-slide-active)")) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) continue;
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden") continue;
        const right = Math.round(rect.right);
        if (right > iw + 1) {
          let constrained = false;
          for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
            const pr = p.getBoundingClientRect();
            const pcs = getComputedStyle(p);
            const clipsX = pcs.overflowX === "hidden" || pcs.overflowX === "auto" || pcs.overflowX === "scroll";
            if (clipsX && Math.round(pr.right) <= iw + 1) { constrained = true; break; }
            if (Math.round(pr.right) > iw + 1 && clipsX) break; // scroll rail wider than viewport = real overflow
          }
          if (constrained) continue;
          out.offenders.push({
            sel: el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + (el.className && typeof el.className === "string" ? "." + el.className.split(/\s+/).slice(0, 3).join(".") : ""),
            right, iw,
            text: (el.textContent || "").trim().slice(0, 60),
          });
        }
      }
      // Clip check: active card content wider than the card itself.
      if (card) {
        const inner = card.querySelector(".flex-1, main, div");
        out.cardOverflow = card.scrollWidth - card.clientWidth;
      }
      return out;
    });
  }

  /** Overlap scan for interactive controls on the current page. */
  async overlaps() {
    return this.page.evaluate(() => {
      const sel = [
        "button", "a[href]", "input", "select", "[role=button]", "[role=radio]",
        "[role=menuitem]", ".swiper-pagination-bullet", ".maplibregl-ctrl button",
        "[data-radix-popper-content-wrapper] button",
      ].join(",");
      const els = [...document.querySelectorAll(sel)];
      const rects = [];
      for (const el of els) {
        const r = el.getBoundingClientRect();
        if (r.width < 4 || r.height < 4) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === "hidden" || cs.display === "none") continue;
        if (el.closest(".swiper-slide:not(.swiper-slide-active)")) continue;
        // Skip screen-reader-only (visually hidden) controls.
        if (el.closest(".sr-only")) continue;
        rects.push({ el, r });
      }
      const hits = [];
      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          const a = rects[i], b = rects[j];
          if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
          const x = Math.max(0, Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left));
          const y = Math.max(0, Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top));
          if (x > 1 && y > 1) {
            const label = (el) =>
              el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent.trim().slice(0, 24);
            hits.push({ a: label(a.el), b: label(b.el), x: Math.round(x), y: Math.round(y) });
          }
        }
      }
      return hits.slice(0, 40);
    });
  }

  async shot(name) {
    await this.page.screenshot({ path: join(this.shotsDir, `${name}.png`) });
  }

  async close() {
    await this.ctx?.close();
  }
}

/* ── Runner ───────────────────────────────────────────────────────── */
async function main() {
  const opts = args();
  const playwright = await loadPlaywright();
  const tile = makeTilePng();
  const csv = syntheticNowcastCsv();
  mkdirSync(SHOT_DIR, { recursive: true });

  const buildNow = opts.build || !existsSync(join(ROOT, "dist", "index.html"));
  if (buildNow) buildDev();

  const preview = startPreview();
  await waitForServer(BASE_URL);

  let browser;
  try {
    browser = await playwright.chromium.launch();
  } catch (err) {
    console.error("[audit] failed to launch Chromium:", err.message);
    console.error("[audit] browsers are not installed for this playwright-core version.");
    console.error("[audit] install them once with: pnpm exec playwright-core install chromium  (or use an already-cached browser path)");
    preview.child.kill();
    process.exit(2);
  }

  const stubs = { tile, csv };
  const widths = WIDTHS.filter((w) => opts.widths.has(w.label));
  const states = Object.keys(STATES).filter((s) => opts.states.has(s));

  console.log(`[audit] matrix: ${widths.length} widths × ${states.length} states`);
  for (const w of widths) {
    for (const state of states) {
      const ctx = new RunContext({ browser, width: w, state, city: CITIES[STATE_CITY[state]], serverUrl: BASE_URL, stubs, shotsDir: SHOT_DIR });
      const row = { state, width: `${w.w}x${w.h}`, ok: true, notes: [] };
      results.push(row);
      try {
        await ctx.init();
        await STATES[state](ctx);
        const m = await ctx.measure();
        const docOk = m.docScrollWidth <= m.innerWidth + 1 && m.bodyScrollWidth <= m.innerWidth + 1;
        if (!opts.shotsOnly && !docOk) {
          row.ok = false;
          row.notes.push(`overflow doc=${m.docScrollWidth} body=${m.bodyScrollWidth} iw=${m.innerWidth}`);
        }
        const offenders = m.offenders.filter((o) => o.right > o.iw + 1);
        if (offenders.length && !opts.shotsOnly) {
          row.ok = false;
          row.notes.push(`elements past viewport: ${offenders.map((o) => `${o.sel}@${o.right}`).join(", ")}`);
        }
        const cardOverflow = m.cardScrollWidth - m.cardClientWidth;
        if (cardOverflow > 0 && !opts.shotsOnly) {
          row.notes.push(`active-card inner overflow ${cardOverflow}px (clipped)`);
        }
        // Vertical: the deck scrolls inside its card; the page itself must not.
        const vScroll = Math.max(m.docScrollHeight, m.bodyScrollHeight);
        if (!opts.shotsOnly && vScroll > m.innerHeight + 1) {
          row.notes.push(`page scrolls vertically (${vScroll} > ${m.innerHeight})`);
        }
        // Hero numerals clipped by the overflow-hidden wrapper.
        if (!opts.shotsOnly && m.hero?.clip) {
          row.notes.push(`hero numeral clipped (${m.hero.h1Scroll} > ${m.hero.wrapClient}px at ${m.hero.fontSize})`);
        }
        const ov = await ctx.overlaps();
        if (ov.length && !opts.shotsOnly) {
          row.notes.push(`overlap: ${ov.map((o) => `[${o.a}]×[${o.b}]`).slice(0, 6).join(" ")}${ov.length > 6 ? ` +${ov.length - 6} more` : ""}`);
        }
        if (ctx.errors.length) {
          row.notes.push(ctx.errors.slice(0, 3).join(" | "));
        }
        await ctx.shot(`${state}@${w.w}x${w.h}`);
        const flag = opts.shotsOnly || row.ok ? "ok  " : "FAIL";
        const extra = row.notes.length ? ` — ${row.notes.slice(0, 2).join(" | ")}` : "";
        console.log(`[audit] ${flag} ${state.padEnd(15)} ${String(w.w).padStart(3)}x${w.h}${extra}`);
      } catch (err) {
        row.ok = false;
        row.notes.push(`exception: ${err.message}`);
        console.log(`[audit] FAIL ${state.padEnd(15)} ${String(w.w).padStart(3)}x${w.h} — ${err.message}`);
      } finally {
        await ctx.close();
      }
    }
  }

  await browser.close();
  preview.child.kill();

  const failures = results.filter((r) => !r.ok);
  writeFileSync(join(SHOT_DIR, "results.json"), JSON.stringify(results, null, 2));
  console.log(`\n[audit] ${results.length - failures.length}/${results.length} checks passed; screenshots in scripts/audit/shots/`);
  if (CI || failures.length) {
    if (failures.length) {
      console.log("\nFailed checks:");
      for (const f of failures) console.log(`  - ${f.state} @ ${f.width}: ${f.notes.join(" | ")}`);
    }
    process.exitCode = failures.length ? 1 : 0;
  }
}

main().catch((err) => {
  console.error("[audit] fatal:", err);
  process.exitCode = 1;
});
