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
  return { color: '#0ea5e9', weight: 1, fillColor: '#38bdf8', fillOpacity: 0.55 };
}
function atRiskStyle() {
  return { color: '#d97706', weight: 0.8, fillColor: '#f59e0b', fillOpacity: 0.32 };

}

function popupFor(layerLabel) {
  return function (feature, layer) {
    layer.bindPopup(
      `<div style="min-width:140px;">
        <div style="font-family:'JetBrains Mono',monospace;font-size:9px;color:#f59e0b;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.08em;">${layerLabel}</div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:12px;color:#f1f5f9;">Tahun ${feature.properties.year ?? '—'}</div>
      </div>`
    );
  };
}

// ---- UI FEEDBACK ----
let loadingTimer = null;
function setMapLoading(isLoading) {
  const el = document.getElementById('mapLoading');
  if (!el) return;
  clearTimeout(loadingTimer);
  if (isLoading) {
    loadingTimer = setTimeout(() => el.classList.add('show'), 120);
  } else {
    el.classList.remove('show');
  }
}

let toastTimer = null;
function showDataToast(message) {
  const el = document.getElementById('dataToast');
  const textEl = document.getElementById('dataToastText');
  if (!el || !textEl) return;
  textEl.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}
function hideDataToast() {
  const el = document.getElementById('dataToast');
  if (el) el.classList.remove('show');
  clearTimeout(toastTimer);
}

function updateSliderFill() {
  const slider = document.getElementById('yearSlider');
  const fill = document.getElementById('sliderFill');
  if (!slider || !fill) return;
  const min = parseInt(slider.min, 10);
  const max = parseInt(slider.max, 10);
  const pct = ((parseInt(slider.value, 10) - min) / (max - min)) * 100;
  fill.style.width = `${pct}%`;
}

// ---- SPARKLINE ----
function updateSparkline(stats, currentYear) {
  const sparkValue = document.getElementById('sparkValue');
  const sparkLine = document.getElementById('sparkLine');
  const sparkArea = document.getElementById('sparkArea');
  const sparkDot = document.getElementById('sparkDot');
  if (!stats || !sparkLine) return;

  const data = stats.map(s => s.flooded_km2);
  const maxVal = Math.max(...data, 0.01);
  const minVal = Math.min(...data);
  const range = maxVal - minVal || 1;

  const w = 200, h = 50, pad = 4;
  const points = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (w - pad * 2);
    const y = h - pad - ((v - minVal) / range) * (h - pad * 2);
    return [x, y];
  });

  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  sparkLine.setAttribute('d', d);

  const areaD = `${d} L ${points[points.length-1][0].toFixed(1)} ${h} L ${points[0][0].toFixed(1)} ${h} Z`;
  sparkArea.setAttribute('d', areaD);

  const idx = stats.findIndex(s => s.year === currentYear);
  if (idx >= 0 && points[idx]) {
    sparkDot.setAttribute('cx', points[idx][0].toFixed(1));
    sparkDot.setAttribute('cy', points[idx][1].toFixed(1));
    sparkDot.style.opacity = 1;
  } else {
    sparkDot.style.opacity = 0;
  }

  const row = stats.find(s => s.year === currentYear);
  if (row && sparkValue) {
    sparkValue.innerHTML = `${row.flooded_km2.toFixed(2)}<span class="sparkline-unit">km²</span>`;
  }
}

// ---- RENDER ----
async function renderMapForState() {
  const { scenario, year } = state;
  setMapLoading(true);

  const [floodedData, atRiskData] = await Promise.all([
    fetchGeoJSON(scenario, 'flooded', year),
    fetchGeoJSON(scenario, 'atrisk', year),
  ]);

  setMapLoading(false);

  if (floodedLayer) { map.removeLayer(floodedLayer); floodedLayer = null; }
  if (atRiskLayer) { map.removeLayer(atRiskLayer); atRiskLayer = null; }

  if (atRiskData && state.showAtRisk) {
    atRiskLayer = L.geoJSON(atRiskData, { style: atRiskStyle, onEachFeature: popupFor('Berisiko') }).addTo(map);
  }
  if (floodedData && state.showFlooded) {
    floodedLayer = L.geoJSON(floodedData, { style: floodedStyle, onEachFeature: popupFor('Rob Aktif') }).addTo(map);
  }

  if (!floodedData && !atRiskData) {
    showDataToast(`Data belum tersedia untuk tahun ${year}`);
  } else {
    hideDataToast();
  }
}

// ---- READOUT ----
function computeEffectiveLevel(year, scenario) {
  const yearsElapsed = year - CONFIG.minYear;
  const slr = SLR_RATES[scenario] * yearsElapsed;
  const maxSubsidenceM = 0.15 * yearsElapsed;
  return MHWS + slr + maxSubsidenceM;
}

function flashValue(el) {
  if (!el) return;
  el.classList.remove('updating');
  void el.offsetWidth;
  el.classList.add('updating');
}

async function updateReadout() {
  const { year, scenario } = state;

  const roYear = document.getElementById('roYear');
  const roLevel = document.getElementById('roLevel');
  const roFlooded = document.getElementById('roFlooded');
  const roRisk = document.getElementById('roRisk');

  roYear.textContent = year;
  roLevel.innerHTML = `${computeEffectiveLevel(year, scenario).toFixed(2)}<span class="readout-unit">m</span>`;
  [roYear, roLevel].forEach(flashValue);

  const stats = await loadStats(scenario);
  if (stats) {
    const row = stats.find(r => r.year === year);
    if (row) {
      roFlooded.innerHTML = `${row.flooded_km2.toFixed(2)}<span class="readout-unit">km²</span>`;
      roRisk.innerHTML = `${row.atrisk_km2.toFixed(2)}<span class="readout-unit">km²</span>`;
      [roFlooded, roRisk].forEach(flashValue);
      updateSparkline(stats, year);
      return;
    }
  }
  roFlooded.innerHTML = `—<span class="readout-unit">km²</span>`;
  roRisk.innerHTML = `—<span class="readout-unit">km²</span>`;
}

// ---- CONTROLS ----
function setYear(year) {
  state.year = Math.max(CONFIG.minYear, Math.min(CONFIG.maxYear, year));
  document.getElementById('yearSlider').value = state.year;
  updateSliderFill();
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
  const btn = document.getElementById('playBtn');
  if (state.playing) {
    icon.innerHTML = '<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>';
    btn.classList.add('playing');
    btn.setAttribute('aria-label', 'Jeda animasi');
    state.playTimer = setInterval(() => {
      let next = state.year + 1;
      if (next > CONFIG.maxYear) next = CONFIG.minYear;
      setYear(next);
    }, CONFIG.playIntervalMs);
  } else {
    icon.innerHTML = '<path d="M8 5v14l11-7z"/>';
    btn.classList.remove('playing');
    btn.setAttribute('aria-label', 'Putar animasi');
    clearInterval(state.playTimer);
  }
}

function toggleLayer(layerKey, checked) {
  if (layerKey === 'flooded') {
    state.showFlooded = checked;
    document.getElementById('layerFlooded').classList.toggle('active', checked);
  }
  if (layerKey === 'atrisk') {
    state.showAtRisk = checked;
    document.getElementById('layerAtRisk').classList.toggle('active', checked);
  }
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

  // New layer toggle wiring
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

  updateSliderFill();
  renderMapForState();
  updateReadout();
}

document.addEventListener('DOMContentLoaded', init);
