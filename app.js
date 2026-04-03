const TIMEOUT_MS = 28000;

const searchBtn      = document.getElementById('search-btn');
const streetInput    = document.getElementById('street-input');
const resultsDiv     = document.getElementById('results');
const statsBar       = document.getElementById('stats-bar');
const resultsWrapper = document.getElementById('results-wrapper');
const mapPanel       = document.getElementById('map-panel');

// ── Autocomplete state ────────────────────────────────────────────────────────
let selectedCity = '';   // set when user picks an autocomplete suggestion or chip
let selectedLat  = null;
let selectedLon  = null;
let acTimer      = null;

const acDropdown = document.getElementById('ac-dropdown');

async function fetchACSuggestions(q) {
  try {
    const res  = await fetch(`/api/autocomplete?q=${encodeURIComponent(q)}`);
    return await res.json();
  } catch { return []; }
}

function renderACDropdown(suggestions) {
  if (!suggestions.length) { acDropdown.hidden = true; return; }
  acDropdown.innerHTML = suggestions.map((s, i) => `
    <div class="ac-item" data-idx="${i}">
      <span class="ac-main">${escHtml(s.main)}</span>
      <span class="ac-sub">${escHtml(s.sub)}</span>
    </div>`).join('');
  acDropdown.querySelectorAll('.ac-item').forEach((el, i) => {
    el.addEventListener('mousedown', e => { e.preventDefault(); selectAC(suggestions[i]); });
  });
  acDropdown.hidden = false;
}

async function selectAC(s) {
  streetInput.value = s.display;
  selectedCity      = s.sub || s.display; // sub = "Jersey City, NJ"
  acDropdown.hidden = true;

  // Geocode in background to get lat/lon for weather
  try {
    const res  = await fetch(`/api/geocode?place_id=${encodeURIComponent(s.place_id)}`);
    const geo  = await res.json();
    if (geo.lat && geo.lon) {
      selectedCity = geo.city || selectedCity;
      selectedLat  = geo.lat;
      selectedLon  = geo.lon;
      if (typeof fetchWeather === 'function') fetchWeather(geo.lat, geo.lon, selectedCity);
    }
  } catch { /* weather update optional */ }
}

streetInput.addEventListener('input', () => {
  clearTimeout(acTimer);
  const q = streetInput.value.trim();
  if (q.length < 3) { acDropdown.hidden = true; return; }
  acTimer = setTimeout(async () => renderACDropdown(await fetchACSuggestions(q)), 200);
});

streetInput.addEventListener('blur',  () => setTimeout(() => { acDropdown.hidden = true; }, 150));
streetInput.addEventListener('focus', () => { if (streetInput.value.trim().length >= 3) streetInput.dispatchEvent(new Event('input')); });

// ── Tab state ─────────────────────────────────────────────────────────────────
let allSpots  = [];
let activeTab = 'all';

const TAB_TYPES = {
  all:    null,
  free:   ['FREE_STREET'],
  paid:   ['PAID_STREET', 'PAID_LOT'],
  garage: ['GARAGE'],
};

const TYPE_META = {
  FREE_STREET:  { label: 'Free Street',  color: '#30D158', icon: '🅿️' },
  PAID_STREET:  { label: 'Paid Street',  color: '#FF9F0A', icon: '🪙' },
  PAID_LOT:     { label: 'Paid Lot',     color: '#FF6B00', icon: '🅿️' },
  GARAGE:       { label: 'Garage',       color: '#0A84FF', icon: '🏢' },
};

// ── Map state ─────────────────────────────────────────────────────────────────
let parkingMap  = null;
let mapMarkers  = [];

function initMap() {
  mapPanel.hidden = false;
  resultsWrapper.classList.add('has-map');
  if (parkingMap) return;
  parkingMap = L.map('map', { zoomControl: true, attributionControl: true });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(parkingMap);
}

function updateMap(spots) {
  const spotsWithCoords = spots.filter(s => s.lat && s.lng);
  if (spotsWithCoords.length === 0) return;

  initMap();
  document.getElementById('map-spot-count').textContent =
    spotsWithCoords.length + ' spot' + (spotsWithCoords.length !== 1 ? 's' : '');

  // Clear old markers
  mapMarkers.forEach(m => parkingMap.removeLayer(m));
  mapMarkers = [];

  const STATUS_MAP_COLOR = {
    'FREE':            '#30D158',
    'LIMITED':         '#FFD60A',
    'PERMIT REQUIRED': '#FF453A',
    'PAID':            '#0A84FF',
  };

  const bounds = [];

  spotsWithCoords.forEach((s, i) => {
    const color = (TYPE_META[s.type] || {}).color || STATUS_MAP_COLOR[s.status] || '#5D9B7C';
    const num   = i + 1;

    const icon = L.divIcon({
      className: '',
      html: `<div style="
        position:relative;width:34px;height:34px;
        background:${color};
        border:2.5px solid white;
        border-radius:50% 50% 50% 0;
        transform:rotate(-45deg);
        box-shadow:0 3px 10px rgba(0,0,0,.28);
        display:flex;align-items:center;justify-content:center;
      "><span style="
        transform:rotate(45deg);
        font-family:'Inter',sans-serif;
        font-size:12px;font-weight:700;
        color:white;line-height:1;
      ">${num}</span></div>`,
      iconSize:    [34, 34],
      iconAnchor:  [17, 34],
      popupAnchor: [0, -38],
    });

    const popup = `
      <div style="padding:14px 16px;font-family:'Inter',sans-serif;min-width:200px;">
        <div style="font-size:0.68rem;font-weight:600;color:rgba(29,29,31,.35);letter-spacing:1.2px;text-transform:uppercase;margin-bottom:5px;">Spot ${num}</div>
        <div style="font-size:0.93rem;font-weight:600;color:#1d1d1f;line-height:1.35;margin-bottom:4px;">${escHtml(s.address)}</div>
        <div style="font-size:0.78rem;color:rgba(29,29,31,.5);margin-bottom:8px;">${escHtml(s.side)}</div>
        ${s.landmark ? `<div style="font-size:0.75rem;color:rgba(29,29,31,.35);font-style:italic;margin-bottom:8px;">📌 ${escHtml(s.landmark)}</div>` : ''}
        <span style="display:inline-block;background:${color}22;color:${color};font-size:0.65rem;font-weight:600;padding:3px 10px;border-radius:20px;letter-spacing:0.4px;">${escHtml(s.status)}</span>
        ${s.distance_from_search ? `<div style="font-size:0.73rem;color:rgba(29,29,31,.35);margin-top:8px;">📍 ${escHtml(s.distance_from_search)}</div>` : ''}
      </div>`;

    const marker = L.marker([s.lat, s.lng], { icon })
      .bindPopup(popup, { maxWidth: 260 })
      .addTo(parkingMap);

    mapMarkers.push(marker);
    bounds.push([s.lat, s.lng]);
  });

  if (bounds.length > 0) {
    parkingMap.fitBounds(bounds, { padding: [48, 48], maxZoom: 16 });
  }

  // Invalidate size after panel becomes visible
  setTimeout(() => parkingMap.invalidateSize(), 50);
}

const LOADING_MSGS = [
  'Scanning streets…',
  'Checking permit zones…',
  'Finding free spots…',
  'Almost there…',
];

let loadingTimer = null;

// ── Loading state: animated parking meter ────────────────────────────────────
function showSkeletons() {
  clearInterval(loadingTimer);
  let idx = 0;
  resultsDiv.innerHTML = `
    <div class="loading-state">
      <div class="meter-light"></div>
      <div class="meter-head">
        <div class="meter-screen">
          <div class="meter-fill-bar"></div>
          <span class="meter-p">P</span>
        </div>
        <div class="meter-coin-slot"></div>
      </div>
      <div class="meter-neck"></div>
      <div class="meter-pole"></div>
      <p id="loading-msg" class="loading-msg">${LOADING_MSGS[0]}</p>
    </div>`;

  loadingTimer = setInterval(() => {
    idx = (idx + 1) % LOADING_MSGS.length;
    const el = document.getElementById('loading-msg');
    if (el) {
      el.style.animation = 'none';
      void el.offsetHeight;
      el.style.animation = '';
      el.textContent = LOADING_MSGS[idx];
    }
  }, 1700);
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
function renderTabs(spots) {
  const counts = {
    all:    spots.length,
    free:   spots.filter(s => TAB_TYPES.free.includes(s.type)).length,
    paid:   spots.filter(s => TAB_TYPES.paid.includes(s.type)).length,
    garage: spots.filter(s => TAB_TYPES.garage.includes(s.type)).length,
  };

  const tabsEl = document.getElementById('results-tabs');
  tabsEl.innerHTML = ['all','free','paid','garage'].map(t => `
    <button class="tab-btn ${activeTab === t ? 'active' : ''}" data-tab="${t}">
      ${{ all:'All', free:'Free', paid:'Paid', garage:'Garages' }[t]}
      <span class="tab-count">${counts[t]}</span>
    </button>`).join('');

  tabsEl.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activeTab = btn.dataset.tab;
      renderTabs(allSpots);
      renderCards(allSpots);
    });
  });
}

function renderCards(spots) {
  const types = TAB_TYPES[activeTab];
  const visible = types ? spots.filter(s => types.includes(s.type)) : spots;

  if (visible.length === 0) {
    resultsDiv.innerHTML = `<div class="msg"><div class="msg-icon">ℹ️</div><p>No ${activeTab === 'all' ? '' : activeTab + ' '}parking found in this area.</p></div>`;
    updateMap(spots); // keep full map
    return;
  }

  resultsDiv.innerHTML = visible.map((s, i) => {
    const meta  = TYPE_META[s.type] || TYPE_META['FREE_STREET'];
    const color = meta.color;
    const num   = String(i + 1).padStart(2, '0');
    const isPaid = s.type !== 'FREE_STREET';
    return `
      <div class="parking-card" style="--status-color:${color};--delay:${i * 0.08}s">
        <div class="spot-number">${num}</div>
        <div class="card-body">
          <div class="card-header-row">
            <h3 class="card-address">${escHtml(s.address)}${s.side ? ` <span class="card-side">(${escHtml(s.side)})</span>` : ''}</h3>
            <span class="status-badge" style="background:${color}22;color:${color}">${meta.icon} ${escHtml(meta.label)}</span>
          </div>
          ${isPaid ? `<div class="cost-badge">💰 ${escHtml(s.avg_cost)}</div>` : ''}
          ${s.landmark ? `<p class="card-landmark">📌 ${escHtml(s.landmark)}</p>` : ''}
          ${s.lat && s.lng ? `<img class="card-streetview" src="/api/streetview?lat=${s.lat}&lng=${s.lng}&heading=${s.heading ?? 0}" alt="Street view" loading="lazy" onerror="this.parentElement.querySelector('.sv-disclaimer')?.remove();this.style.display='none'"><p class="sv-disclaimer">📷 Approximate street view — always verify on arrival</p>` : ''}
          <div class="card-details">
            ${s.time_limit   ? `<span class="detail-item">🕐 ${escHtml(s.time_limit)}</span>` : ''}
            ${s.sweeping_schedule && s.sweeping_schedule !== 'None' ? `<span class="detail-item">🧹 ${escHtml(s.sweeping_schedule)}</span>` : ''}
            ${s.permit_required ? `<span class="detail-item">🔑 ${escHtml(s.permit_zone)} permit</span>` : ''}
            ${s.overnight_parking ? `<span class="detail-item">🌙 ${escHtml(s.overnight_parking)}</span>` : ''}
            ${s.distance_from_search ? `<span class="detail-item">📍 ${escHtml(s.distance_from_search)}</span>` : ''}
            ${s.notes ? `<span class="detail-item">ℹ️ ${escHtml(s.notes)}</span>` : ''}
          </div>
          ${!isPaid ? `
          <div class="card-report" data-spot-id="${escHtml(s.address)}">
            <div class="report-status"></div>
            <div class="report-actions">
              <button class="report-btn report-free"  data-status="FREE">✅ Still Free</button>
              <button class="report-btn report-taken" data-status="TAKEN">❌ It's Taken</button>
            </div>
          </div>` : ''}
        </div>
      </div>`;
  }).join('');

  updateMap(spots);

  document.querySelectorAll('.card-report').forEach(el => {
    const spotId = el.dataset.spotId;
    fetchSpotStatus(spotId, el.querySelector('.report-status'));
    el.querySelectorAll('.report-btn').forEach(btn => {
      btn.addEventListener('click', () => handleReport(spotId, btn.dataset.status, el));
    });
  });
}

// ── Render parking cards ──────────────────────────────────────────────────────
function renderResults(parsed, street) {
  clearInterval(loadingTimer);

  const spots = parsed.spots;
  if (!Array.isArray(spots) || spots.length === 0) {
    showMessage('No parking spots found. Try a different location.');
    return;
  }

  allSpots  = spots;
  activeTab = 'all';

  document.getElementById('stat-count').textContent  = spots.length;
  document.getElementById('stat-street').textContent = parsed.street || street;
  document.getElementById('stat-city').textContent   = parsed.neighborhood || selectedCity;
  document.getElementById('stat-time').textContent   = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  statsBar.hidden = false;

  // Show tabs and render
  document.getElementById('results-tabs-outer').hidden = false;
  renderTabs(spots);
  renderCards(spots);
}

// ── Crowdsourced report helpers ───────────────────────────────────────────────
async function fetchSpotStatus(spotId, statusEl) {
  try {
    const r = await fetch(`/api/status?spot_id=${encodeURIComponent(spotId)}`);
    const data = await r.json();
    if (data.status) renderStatusBadge(statusEl, data.status, data.minutes_ago);
  } catch {}
}

function renderStatusBadge(statusEl, status, minutesAgo) {
  const isFree  = status === 'FREE';
  const color   = isFree ? '#30D158' : '#FF453A';
  const icon    = isFree ? '✅' : '❌';
  const label   = isFree ? 'Reported free' : 'Reported taken';
  const timeStr = minutesAgo < 1 ? 'just now' : `${minutesAgo} min ago`;
  statusEl.innerHTML = `
    <span class="report-status-badge" style="color:${color};background:${color}12;border-color:${color}40">
      ${icon} ${label} · ${timeStr}
    </span>`;
}

async function handleReport(spotId, status, cardReportEl) {
  const btns = cardReportEl.querySelectorAll('.report-btn');
  btns.forEach(b => b.disabled = true);
  try {
    await fetch('/api/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spot_id: spotId, status })
    });
    renderStatusBadge(cardReportEl.querySelector('.report-status'), status, 0);
  } catch {
    btns.forEach(b => b.disabled = false);
  }
}

function showMessage(text, isError = false) {
  clearInterval(loadingTimer);
  resultsDiv.innerHTML = `
    <div class="msg ${isError ? 'error' : ''}">
      <div class="msg-icon">${isError ? '⚠️' : 'ℹ️'}</div>
      <p>${escHtml(text)}</p>
    </div>`;
}

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Search ────────────────────────────────────────────────────────────────────
async function searchParking() {
  const fullAddress = streetInput.value.trim();
  if (!fullAddress) { streetInput.focus(); return; }

  // Derive city: prefer autocomplete selection, fall back to parsing the typed address
  let city   = selectedCity;
  let street = fullAddress;
  if (!city) {
    const parts = fullAddress.split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
      street = parts[0];
      city   = parts.slice(1).join(', ');
    } else {
      showMessage('Please select an address from the suggestions or include a city (e.g. "175 2nd St, Jersey City, NJ").', true);
      return;
    }
  } else {
    // Strip city from display string for the street portion
    const comma = fullAddress.indexOf(',');
    if (comma > 0) street = fullAddress.slice(0, comma).trim();
  }

  showSkeletons();
  searchBtn.disabled = true;
  statsBar.hidden = true;
  document.getElementById('results-tabs-outer').hidden = true;

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('TIMEOUT')), TIMEOUT_MS)
  );

  try {
    const response = await Promise.race([
      fetch('/api/parking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          city,
          street,
          day:  new Date().toLocaleDateString('en-US', { weekday: 'long' }),
          time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
        })
      }),
      timeoutPromise,
    ]);

    if (!response.ok) {
      const errText = await response.text();
      console.error('API error:', response.status, errText);
      throw new Error(errText || 'API failed: ' + response.status);
    }

    const data = await response.json();
    console.log('API response:', data);
    if (data.error) throw new Error(data.error);
    renderResults(data, street);
  } catch (err) {
    console.error('Full error:', err);
    if (err.message === 'TIMEOUT') {
      showMessage('The search is taking too long. Please try again.', true);
    } else {
      showMessage(err.message || 'Something went wrong. Please try again.', true);
    }
  } finally {
    searchBtn.disabled = false;
  }
}

// ── Event listeners ───────────────────────────────────────────────────────────
searchBtn.addEventListener('click', searchParking);
streetInput.addEventListener('keydown', e => { if (e.key === 'Enter') { acDropdown.hidden = true; searchParking(); } });

document.querySelectorAll('.chip').forEach(chip => {
  chip.addEventListener('click', () => {
    selectedCity = chip.dataset.city;
    streetInput.value = '';
    streetInput.placeholder = `Address in ${chip.dataset.city}…`;
    streetInput.focus();
  });
});

// ── Current location ──────────────────────────────────────────────────────────
const locationBtn = document.getElementById('location-btn');

locationBtn.addEventListener('click', () => {
  if (!navigator.geolocation) {
    showMessage('Geolocation is not supported by your browser.', true);
    return;
  }

  locationBtn.disabled = true;
  locationBtn.textContent = '⏳ Locating…';

  navigator.geolocation.getCurrentPosition(
    async ({ coords }) => {
      const { latitude: lat, longitude: lng } = coords;
      try {
        const r = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
          { headers: { 'Accept-Language': 'en' } }
        );
        const data = await r.json();
        const city    = [a.city || a.town || a.village || a.county, a.state].filter(Boolean).join(', ');
        const houseNo = a.house_number ? a.house_number + ' ' : '';
        const street  = houseNo + (a.road || a.pedestrian || a.footway || '');

        selectedCity      = city;
        selectedLat       = lat;
        selectedLon       = lng;
        streetInput.value = [street, city].filter(Boolean).join(', ');
        if (typeof fetchWeather === 'function') fetchWeather(lat, lng, city);
      } catch {
        streetInput.value = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      }

      locationBtn.textContent = '📍 My Location';
      locationBtn.disabled = false;
      searchParking();
    },
    () => {
      locationBtn.textContent = '📍 My Location';
      locationBtn.disabled = false;
      showMessage('Location access denied. Please enter your address manually.', true);
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
});
