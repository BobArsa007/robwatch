// ═══════════════════════════════════════════════════
// RobWatch — Simulasi Rob & Penurunan Tanah Semarang-Demak
// ═══════════════════════════════════════════════════

// ---- CONFIG ----
const CONFIG = {
  center: [-6.87, 110.48],
  zoom: 11,
  minYear: 2025,
  maxYear: 2050,
  dataBasePath: 'data',
  playIntervalMs: 700,
};

// Effective flood level lookup — MHWS + SLR contribution by scenario (matches Colab pipeline constants)
const MHWS = 0.6;
const SLR_RATES = { ssp245: 0.0037, ssp585: 0.0070 }; // m/year

// ---- STATE ----
let state = {
  year: CONFIG.minYear,
  scenario: 'ssp245',
  playing: false,
  playTimer: null,
};

let map;
let floodedLayer = null;
let atRiskLayer = null;
let statsCache = { ssp245: null, ssp585: null }; // loaded from CSV-derived JSON
let geojsonCache = {}; // key: `${scenario}_${layer}_${year}` -> geojson data

// ---- MAP INIT ----
function initMap() {
  map = L.map('map', {
    center: CONFIG.center,
    zoom: CONFIG.zoom,
    zoomControl: false,
    attributionControl: true,
  });

  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri',
    maxZoom: 18,
  }).addTo(map);

  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 18,
    opacity: 0.75,
  }).addTo(map);

  L.control.zoom({ position: 'topright' }).addTo(map);
  L.control.scale({ position: 'bottomleft', imperial: false }).addTo(map);
}

// ---- DATA LOADING ----
async function fetchGeoJSON(scenarioFolder, layerName, year) {
  const cacheKey = `${scenarioFolder}_${layerName}_${year}`;
  if (geojsonCache[cacheKey]) return geojsonCache[cacheKey];

  const path = `${CONFIG.dataBasePath}/${scenarioFolder}_dual/${layerName}_${year}.geojson`;
  try {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    geojsonCache[cacheKey] = data;
    return data;
  } catch (err) {
    console.warn(`Could not load ${path}:`, err.message);
    return null;
  }
}

async function loadStats(scenario) {
  if (statsCache[scenario]) return statsCache[scenario];
  // Stats are derived from the CSV pipeline output, converted to JSON at build time.
  // Falls back to null (readout will show geometry-derived estimate instead) if not present.
  try {
    const res = await fetch(`${CONFIG.dataBasePath}/stats_${scenario}.json`);
    if (!res.ok) throw new Error('no stats file');
    const data = await res.json();
    statsCache[scenario] = data;
    return data;
  } catch (err) {
    return null;
  }
}

// ---- LAYER STYLING ----
function floodedStyle() {
  return {
    color: '#3480bd',
    weight: 1,
    fillColor: '#4a9eda',
    fillOpacity: 0.65,
  };
}
function atRiskStyle() {
  return {
    color: '#c98826',
    weight: 0.8,
    fillColor: '#e8a33d',
    fillOpacity: 0.38,
  };
}

function popupFor(layerLabel) {
  return function (feature, layer) {
    layer.bindPopup(
      `<div style="min-width:140px;">
        <div style="font-family:'IBM Plex Mono',monospace;font-size:10px;color:#e8a33d;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.06em;">${layerLabel}</div>
        <div style="font-family:'IBM Plex Mono',monospace;font-size:11px;color:#eae6da;">Tahun: ${feature.properties.year ?? '—'}</div>
      </div>`
    );
  };
}

// ---- RENDER MAP FOR CURRENT STATE ----
async function renderMapForState() {
  const { scenario, year } = state;

  const [floodedData, atRiskData] = await Promise.all([
    fetchGeoJSON(scenario, 'flooded', year),
    fetchGeoJSON(scenario, 'atrisk', year),
  ]);

  if (floodedLayer) { map.removeLayer(floodedLayer); floodedLayer = null; }
  if (atRiskLayer) { map.removeLayer(atRiskLayer); atRiskLayer = null; }

  if (atRiskData) {
    atRiskLayer = L.geoJSON(atRiskData, {
      style: atRiskStyle,
      onEachFeature: popupFor('Lahan Berisiko'),
    }).addTo(map);
  }
  if (floodedData) {
    floodedLayer = L.geoJSON(floodedData, {
      style: floodedStyle,
      onEachFeature: popupFor('Rob Aktif'),
    }).addTo(map);
  }
}

// ---- READOUT / STATS ----
function computeEffectiveLevel(year, scenario) {
  const yearsElapsed = year - CONFIG.minYear;
  const slr = SLR_RATES[scenario] * yearsElapsed;
  // Displayed level uses the max subsidence rate (Sayung, 15cm/yr) as the headline "worst local" figure
  const maxSubsidenceM = 0.15 * yearsElapsed;
  return MHWS + slr + maxSubsidenceM;
}

async function updateReadout() {
  const { year, scenario } = state;

  document.getElementById('readoutYear').textContent = year;
  document.getElementById('readoutLevel').innerHTML = `${computeEffectiveLevel(year, scenario).toFixed(2)}<span class="gauge-unit">m</span>`;

  const stats = await loadStats(scenario);
  if (stats) {
    const row = stats.find(r => r.year === year);
    if (row) {
      document.getElementById('readoutFlooded').innerHTML = `${row.flooded_km2.toFixed(2)}<span class="gauge-unit">km²</span>`;
      document.getElementById('readoutRisk').innerHTML = `${row.atrisk_km2.toFixed(2)}<span class="gauge-unit">km²</span>`;
      return;
    }
  }
  // Fallback: compute area from currently loaded geojson layers directly (less precise, but always works)
  document.getElementById('readoutFlooded').innerHTML = `—<span class="gauge-unit">km²</span>`;
  document.getElementById('readoutRisk').innerHTML = `—<span class="gauge-unit">km²</span>`;
}

// ---- CONTROLS ----
function setYear(year) {
  state.year = Math.max(CONFIG.minYear, Math.min(CONFIG.maxYear, year));
  document.getElementById('yearSlider').value = state.year;
  renderMapForState();
  updateReadout();
}

function setScenario(scenario) {
  state.scenario = scenario;
  document.getElementById('btnSSP245').classList.toggle('active', scenario === 'ssp245');
  document.getElementById('btnSSP585').classList.toggle('active', scenario === 'ssp585');
  renderMapForState();
  updateReadout();
}

function togglePlay() {
  state.playing = !state.playing;
  const icon = document.getElementById('playIcon');

  if (state.playing) {
    icon.innerHTML = '<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>'; // pause icon
    state.playTimer = setInterval(() => {
      let next = state.year + 1;
      if (next > CONFIG.maxYear) next = CONFIG.minYear;
      setYear(next);
    }, CONFIG.playIntervalMs);
  } else {
    icon.innerHTML = '<path d="M8 5v14l11-7z"/>'; // play icon
    clearInterval(state.playTimer);
  }
}

// ---- PORTFOLIO BACK LINK ----
// Points back to the main portfolio site. Update this path to match actual deployment location.
function wirePortfolioLinks() {
  const portfolioURL = '../index.html';
  document.getElementById('portfolioBackLink').href = portfolioURL;
  document.getElementById('portfolioFooterLink').href = portfolioURL;
}

// ---- INIT ----
function init() {
  initMap();
  wirePortfolioLinks();

  document.getElementById('yearSlider').addEventListener('input', (e) => {
    setYear(parseInt(e.target.value, 10));
  });

  document.getElementById('playBtn').addEventListener('click', togglePlay);

  document.getElementById('btnSSP245').addEventListener('click', () => setScenario('ssp245'));
  document.getElementById('btnSSP585').addEventListener('click', () => setScenario('ssp585'));

  // Initial render
  renderMapForState();
  updateReadout();
}

document.addEventListener('DOMContentLoaded', init);
