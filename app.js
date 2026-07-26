// ═══════════════════════════════════════════════════
// RobWatch — Simulasi Rob & Penurunan Tanah Semarang-Demak
// ═══════════════════════════════════════════════════

const CONFIG = {
  center: [-6.90, 110.50],
  zoom: 12,
  minYear: 2025,
  maxYear: 2050,
  dataBasePath: 'data',
  playIntervalMs: 700,
};

const MHWS = 0.6;
const SLR_RATES = { ssp245: 0.0037, ssp585: 0.0070 };

let state = {
  year: CONFIG.minYear,
  scenario: 'ssp245',
  playing: false,
  playTimer: null,
  showFlooded: true,
  showAtRisk: true,
};

let map;
let floodedLayer = null;
let atRiskLayer = null;
let statsCache = { ssp245: null, ssp585: null };
let geojsonCache = {};

// ---- MAP INIT ----
function initMap() {
  map = L.map('map', {
    center: CONFIG.center,
    zoom: CONFIG.zoom,
    zoomControl: true,
    attributionControl: true,
  });

  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri',
    maxZoom: 18,
  }).addTo(map);

  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 18,
    opacity: 0.7,
  }).addTo(map);

  L.control.scale({ position: 'bottomleft', imperial: false }).addTo(map);

  map.on('mousemove', (e) => {
    const el = document.getElementById('mouseCoords');
    if (el) el.textContent = `${e.latlng.lat.toFixed(4)}°S, ${e.latlng.lng.toFixed(4)}°E`;
  });
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
  return { color: '#3480bd', weight: 1, fillColor: '#4a9eda', fillOpacity: 0.65 };
}
function atRiskStyle() {
  return { color: '#c98826', weight: 0.8, fillColor: '#e8a33d', fillOpacity: 0.38 };
}

function popupFor(layerLabel) {
  return function (feature, layer) {
    layer.bindPopup(
      `<div style="min-width:120px;">
        <div style="font-family:'IBM Plex Mono',monospace;font-size:9.5px;color:#e8a33d;margin-bottom:3px;text-transform:uppercase;letter-spacing:0.06em;">${layerLabel}</div>
        <div style="font-family:'IBM Plex Mono',monospace;font-size:11px;">Tahun ${feature.properties.year ?? '—'}</div>
      </div>`
    );
  };
}

// ---- RENDER ----
async function renderMapForState() {
  const { scenario, year } = state;

  const [floodedData, atRiskData] = await Promise.all([
    fetchGeoJSON(scenario, 'flooded', year),
    fetchGeoJSON(scenario, 'atrisk', year),
  ]);

  if (floodedLayer) { map.removeLayer(floodedLayer); floodedLayer = null; }
  if (atRiskLayer) { map.removeLayer(atRiskLayer); atRiskLayer = null; }

  if (atRiskData && state.showAtRisk) {
    atRiskLayer = L.geoJSON(atRiskData, { style: atRiskStyle, onEachFeature: popupFor('Berisiko') }).addTo(map);
  }
  if (floodedData && state.showFlooded) {
    floodedLayer = L.geoJSON(floodedData, { style: floodedStyle, onEachFeature: popupFor('Rob Aktif') }).addTo(map);
  }
}

// ---- READOUT ----
function computeEffectiveLevel(year, scenario) {
  const yearsElapsed = year - CONFIG.minYear;
  const slr = SLR_RATES[scenario] * yearsElapsed;
  const maxSubsidenceM = 0.15 * yearsElapsed; // headline max-rate (Sayung) figure
  return MHWS + slr + maxSubsidenceM;
}

async function updateReadout() {
  const { year, scenario } = state;

  document.getElementById('roYear').textContent = year;
  document.getElementById('roLevel').innerHTML = `${computeEffectiveLevel(year, scenario).toFixed(2)}<span class="readout-unit">m</span>`;

  const stats = await loadStats(scenario);
  if (stats) {
    const row = stats.find(r => r.year === year);
    if (row) {
      document.getElementById('roFlooded').innerHTML = `${row.flooded_km2.toFixed(2)}<span class="readout-unit">km²</span>`;
      document.getElementById('roRisk').innerHTML = `${row.atrisk_km2.toFixed(2)}<span class="readout-unit">km²</span>`;
      return;
    }
  }
  document.getElementById('roFlooded').innerHTML = `—<span class="readout-unit">km²</span>`;
  document.getElementById('roRisk').innerHTML = `—<span class="readout-unit">km²</span>`;
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
  document.getElementById('optSSP245').classList.toggle('active', scenario === 'ssp245');
  document.getElementById('optSSP585').classList.toggle('active', scenario === 'ssp585');
  renderMapForState();
  updateReadout();
}

function togglePlay() {
  state.playing = !state.playing;
  const icon = document.getElementById('playIcon');
  if (state.playing) {
    icon.innerHTML = '<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>';
    state.playTimer = setInterval(() => {
      let next = state.year + 1;
      if (next > CONFIG.maxYear) next = CONFIG.minYear;
      setYear(next);
    }, CONFIG.playIntervalMs);
  } else {
    icon.innerHTML = '<path d="M8 5v14l11-7z"/>';
    clearInterval(state.playTimer);
  }
}

function toggleLayer(layerKey, checked) {
  if (layerKey === 'flooded') state.showFlooded = checked;
  if (layerKey === 'atrisk') state.showAtRisk = checked;
  renderMapForState();
}

// ---- TECH PANEL ----
function openTechPanel() {
  document.getElementById('techOverlay').classList.add('open');
  document.getElementById('techToggle').classList.add('active');
}
function closeTechPanel() {
  document.getElementById('techOverlay').classList.remove('open');
  document.getElementById('techToggle').classList.remove('active');
}

// ---- PORTFOLIO LINK ----
// Update this to the actual deployed URL of the main portfolio site.
function wirePortfolioLink() {
  document.getElementById('portfolioLink').href = 'https://bobarsa007.github.io/';
}

// ---- INIT ----
function init() {
  initMap();
  wirePortfolioLink();

  document.getElementById('yearSlider').addEventListener('input', (e) => setYear(parseInt(e.target.value, 10)));
  document.getElementById('playBtn').addEventListener('click', togglePlay);
  document.getElementById('optSSP245').addEventListener('click', () => setScenario('ssp245'));
  document.getElementById('optSSP585').addEventListener('click', () => setScenario('ssp585'));
  document.getElementById('toggleFlooded').addEventListener('change', (e) => toggleLayer('flooded', e.target.checked));
  document.getElementById('toggleAtRisk').addEventListener('change', (e) => toggleLayer('atrisk', e.target.checked));

  document.getElementById('techToggle').addEventListener('click', openTechPanel);
  document.getElementById('techClose').addEventListener('click', closeTechPanel);
  document.getElementById('techOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'techOverlay') closeTechPanel();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeTechPanel();
  });

  renderMapForState();
  updateReadout();
}

document.addEventListener('DOMContentLoaded', init);
