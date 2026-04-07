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

// ── Google Maps JS API bootstrap ──────────────────────────────────────────────
window._gmapsReady = false;
window._initGooglePlaces = function () {
  window._acService  = new google.maps.places.AutocompleteService();
  window._geocoder   = new google.maps.Geocoder();
  window._gmapsReady = true;
};

(async () => {
  try {
    const res = await fetch('/api/config');
    const { mapsKey } = await res.json();
    if (!mapsKey) return;
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${mapsKey}&libraries=places&loading=async&callback=_initGooglePlaces`;
    document.head.appendChild(s);
  } catch { /* autocomplete unavailable */ }
})();

async function fetchACSuggestions(q) {
  if (!window._gmapsReady) return [];
  return new Promise(resolve => {
    window._acService.getPlacePredictions(
      { input: q, componentRestrictions: { country: 'us' }, types: ['address'] },
      (preds, status) => {
        if (status !== google.maps.places.PlacesServiceStatus.OK || !preds) { resolve([]); return; }
        resolve(preds.map(p => ({
          display:  p.description.replace(', USA', ''),
          main:     p.structured_formatting.main_text,
          sub:      (p.structured_formatting.secondary_text || '').replace(', USA', ''),
          place_id: p.place_id,
        })));
      }
    );
  });
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
  selectedCity      = s.sub || s.display;
  acDropdown.hidden = true;

  // Geocode via Maps JS API (already loaded, no extra network hop)
  if (!window._gmapsReady) return;
  try {
    window._geocoder.geocode({ placeId: s.place_id }, (results, status) => {
      if (status !== 'OK' || !results?.[0]) return;
      const r    = results[0];
      const lat  = r.geometry.location.lat();
      const lon  = r.geometry.location.lng();
      const get  = type => r.address_components.find(c => c.types.includes(type));
      const city = [
        get('locality')?.long_name || get('sublocality')?.long_name,
        get('administrative_area_level_1')?.short_name,
      ].filter(Boolean).join(', ');
      selectedCity = city || selectedCity;
      selectedLat  = lat;
      selectedLon  = lon;
      if (typeof fetchWeather === 'function') fetchWeather(lat, lon, selectedCity);
    });
  } catch { /* weather optional */ }
}

streetInput.addEventListener('input', () => {
  clearTimeout(acTimer);
  const q = streetInput.value.trim();
  if (q.length < 2) { acDropdown.hidden = true; return; }
  acTimer = setTimeout(async () => renderACDropdown(await fetchACSuggestions(q)), 100);
});

streetInput.addEventListener('blur',  () => setTimeout(() => { acDropdown.hidden = true; }, 150));
streetInput.addEventListener('focus', () => { if (streetInput.value.trim().length >= 3) streetInput.dispatchEvent(new Event('input')); });

// ── Tab state ─────────────────────────────────────────────────────────────────
let allSpots     = [];
let activeTab    = 'all';
let activeFeature = 'parking';

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
  L.tileLayer('https://{s}.basemaps.cartocdn.com/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/attributions">CARTO</a>',
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
        <div style="font-size:0.68rem;font-weight:600;color:rgba(10,10,20,.35);letter-spacing:1.2px;text-transform:uppercase;margin-bottom:5px;">Spot ${num}</div>
        <div style="font-size:0.93rem;font-weight:700;color:rgba(10,10,20,.88);line-height:1.35;margin-bottom:4px;">${escHtml(s.address)}</div>
        <div style="font-size:0.78rem;color:rgba(10,10,20,.50);margin-bottom:8px;">${escHtml(s.side)}</div>
        ${s.landmark ? `<div style="font-size:0.75rem;color:rgba(10,10,20,.35);font-style:italic;margin-bottom:8px;">📌 ${escHtml(s.landmark)}</div>` : ''}
        <span style="display:inline-block;background:${color}18;color:${color};font-size:0.65rem;font-weight:600;padding:3px 10px;border-radius:20px;letter-spacing:0.4px;">${escHtml(s.status)}</span>
        ${s.distance_from_search ? `<div style="font-size:0.73rem;color:rgba(10,10,20,.35);margin-top:8px;">📍 ${escHtml(s.distance_from_search)}</div>` : ''}
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

const NEARBY_LOADING_MSGS = {
  food:          ['Finding restaurants…', 'Checking menus…', 'Almost there…'],
  bars:          ['Finding bars & pubs…', 'Checking nearby…', 'Almost there…'],
  coffee:   ['Finding coffee shops…', 'Checking nearby…', 'Almost there…'],
  gym:      ['Finding gyms…', 'Checking fitness centres…', 'Almost there…'],
  shopping:      ['Finding shops…', 'Checking malls & stores…', 'Almost there…'],
  entertainment: ['Finding entertainment…', 'Checking theatres & venues…', 'Almost there…'],
};

let loadingTimer = null;

// ── Loading state: animated parking meter ────────────────────────────────────
function showSkeletons(feature) {
  clearInterval(loadingTimer);
  let idx = 0;
  const msgs = (feature && NEARBY_LOADING_MSGS[feature]) || LOADING_MSGS;
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
      <p id="loading-msg" class="loading-msg">${msgs[0]}</p>
    </div>`;

  loadingTimer = setInterval(() => {
    idx = (idx + 1) % msgs.length;
    const el = document.getElementById('loading-msg');
    if (el) {
      el.style.animation = 'none';
      void el.offsetHeight;
      el.style.animation = '';
      el.textContent = msgs[idx];
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
            <div>
              <h3 class="card-address">${escHtml(s.address)}${s.side ? ` <span class="card-side">(${escHtml(s.side)})</span>` : ''}</h3>
              ${s.landmark ? `<p class="card-landmark">🏢 ${escHtml(s.landmark)}</p>` : ''}
            </div>
            <span class="status-badge" style="background:${color}22;color:${color}">${meta.icon} ${escHtml(meta.label)}</span>
          </div>
          <div class="card-type-banner" style="background:${color}0d;border-color:${color}22">
            <span class="ctb-icon">${meta.icon}</span>
            <span class="ctb-label">${escHtml(meta.label)}</span>
            ${s.here_avail ? `<span class="ctb-realtime ${s.here_avail_count === 0 ? 'ctb-full' : s.here_avail_count <= 10 ? 'ctb-low' : 'ctb-open'}">${s.here_avail_count === 0 ? '🔴' : s.here_avail_count <= 10 ? '🟡' : '🟢'} ${escHtml(s.here_avail)}</span>` : s.avg_cost && isPaid ? `<span class="ctb-cost">💰 ${escHtml(s.avg_cost)}</span>` : ''}
          </div>
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
          <a class="gmaps-btn" href="${googleMapsUrl(s.lat, s.lng, s.address)}" target="_blank" rel="noopener">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>
            Open in Google Maps
          </a>
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
    showMessage('No parking spots found within 4 blocks. Try a different address.');
    return;
  }

  allSpots  = spots;
  activeTab = 'all';

  document.getElementById('stat-count').textContent  = spots.length;
  document.getElementById('stat-street').textContent = parsed.street || street;
  document.getElementById('stat-city').textContent   = parsed.neighborhood || selectedCity;
  document.getElementById('stat-time').textContent   = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  statsBar.hidden = false;

  // Show radius notice
  let radiusBanner = document.getElementById('radius-banner');
  if (!radiusBanner) {
    radiusBanner = document.createElement('div');
    radiusBanner.id = 'radius-banner';
    radiusBanner.style.cssText = `
      position:relative;z-index:10;width:100%;max-width:820px;margin:0 auto 10px;
      padding:0 20px;box-sizing:border-box;
    `;
    document.getElementById('results-tabs-outer').insertAdjacentElement('afterend', radiusBanner);
  }
  const src = parsed.source;
  const srcBadge = src === 'here'
    ? `<span style="margin-left:auto;font-size:.68rem;padding:2px 8px;border-radius:100px;background:rgba(37,99,235,.12);border:1px solid rgba(37,99,235,.25);color:#2563EB;">🔴 Live HERE data</span>`
    : `<span style="margin-left:auto;font-size:.68rem;padding:2px 8px;border-radius:100px;background:rgba(52,211,153,.12);border:1px solid rgba(52,211,153,.25);color:#34D399;">🗺️ Live OSM data</span>`;

  if (parsed.radiusExpanded) {
    radiusBanner.innerHTML = `<div style="
      display:flex;align-items:center;gap:10px;padding:10px 18px;
      background:rgba(251,191,36,.08);border:1px solid rgba(251,191,36,.22);
      border-radius:14px;font-size:.78rem;font-weight:600;color:#FBBF24;
    ">⚠️ Fewer than 3 spots within 2 blocks — expanded search to 4 blocks.${srcBadge}</div>`;
  } else {
    radiusBanner.innerHTML = `<div style="
      display:flex;align-items:center;gap:10px;padding:10px 18px;
      background:rgba(52,211,153,.06);border:1px solid rgba(52,211,153,.18);
      border-radius:14px;font-size:.78rem;font-weight:600;color:#34D399;
    ">✅ Showing parking within 2 blocks.${srcBadge}</div>`;
  }

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

// Build a Google Maps directions URL — origin = searched address, dest = spot
// Always prefer address strings over raw coordinates so Maps shows names, not "Dropped Pin"
function googleMapsUrl(lat, lng, address) {
  const typedAddress = streetInput.value.trim();
  const origin = typedAddress
    ? encodeURIComponent(typedAddress)
    : (selectedLat && selectedLon ? `${selectedLat},${selectedLon}` : '');
  const dest = address
    ? encodeURIComponent(address)
    : (lat && lng ? `${lat},${lng}` : '');
  return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}&travelmode=driving`;
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
  const rb = document.getElementById('radius-banner');
  if (rb) rb.innerHTML = '';

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
          lat:  selectedLat,
          lng:  selectedLon,
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
    // Capture geocoded coordinates so feature tiles can use them
    if (data.searchLat && data.searchLng) {
      selectedLat = data.searchLat;
      selectedLon = data.searchLng;
    }
    // Reset to parking tile when a fresh search runs
    activeFeature = 'parking';
    document.querySelectorAll('.feature-tile').forEach(t => {
      t.classList.toggle('active', t.dataset.feature === 'parking');
    });
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
        // Prefer Google Geocoder (already loaded, works in Instagram browser)
        // Fall back to Nominatim if Maps JS API not ready yet
        let city = '', street = '';

        if (window._gmapsReady && window._geocoder) {
          await new Promise(resolve => {
            window._geocoder.geocode({ location: { lat, lng } }, (results, status) => {
              if (status === 'OK' && results?.[0]) {
                const get = type => results[0].address_components.find(c => c.types.includes(type));
                street = [get('street_number')?.long_name, get('route')?.long_name].filter(Boolean).join(' ');
                city   = [get('locality')?.long_name || get('sublocality')?.long_name, get('administrative_area_level_1')?.short_name].filter(Boolean).join(', ');
              }
              resolve();
            });
          });
        }

        // Nominatim fallback
        if (!city) {
          const r    = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`, { headers: { 'Accept-Language': 'en' } });
          const data = await r.json();
          const a    = data.address || {};
          street = [(a.house_number || ''), (a.road || a.pedestrian || a.footway || '')].filter(Boolean).join(' ');
          city   = [a.city || a.town || a.village || a.county, a.state].filter(Boolean).join(', ');
        }

        if (!city) throw new Error('Could not determine location');

        selectedCity = city;
        selectedLat  = lat;
        selectedLon  = lng;
        streetInput.value = [street, city].filter(Boolean).join(', ');
        if (typeof fetchWeather === 'function') fetchWeather(lat, lng, city);
      } catch {
        showMessage('Could not find your address. Please type it manually.', true);
        locationBtn.textContent = '📍 Use My Current Location';
        locationBtn.disabled = false;
        return;
      }

      locationBtn.textContent = '📍 My Location ✓';
      locationBtn.disabled = false;
      // Do NOT auto-search — user must click Search explicitly
    },
    () => {
      locationBtn.textContent = '📍 Use My Current Location';
      locationBtn.disabled = false;
      showMessage('Location access denied. Please enter your address manually.', true);
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
});

// ── Feature Tiles ─────────────────────────────────────────────────────────────

const FEATURE_CONFIG = {
  parking:  { label: 'Parking',  icon: '🅿️' },
  food:     { label: 'Food',     icon: '🍔' },
  bars:     { label: 'Bars',     icon: '🍺' },
  coffee:   { label: 'Coffee',   icon: '☕' },
  gym:      { label: 'Gym',      icon: '💪' },
  shopping:      { label: 'Shopping',      icon: '🛒' },
  entertainment: { label: 'Entertainment', icon: '🎬' },
};

function haversineMiFE(lat1, lon1, lat2, lon2) {
  const R = 3958.8, toR = d => d * Math.PI / 180;
  const dLat = toR(lat2 - lat1), dLon = toR(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLon/2)**2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

function formatDistFE(mi) {
  return mi < 0.1 ? `${Math.round(mi * 5280)} ft` : `${mi.toFixed(2)} mi`;
}

function hideRadiusBanner() {
  const rb = document.getElementById('radius-banner');
  if (rb) rb.innerHTML = '';
}

function renderNearbyResults(elements, feature, searchLat, searchLng, meta = {}) {
  const cfg   = FEATURE_CONFIG[feature];
  const items = elements
    .map(el => {
      const lat = el.lat ?? el.center?.lat;
      const lon = el.lon ?? el.center?.lon;
      if (!lat || !lon) return null;
      const tags = el.tags || {};
      const name = tags.name || tags.brand || tags['name:en'] || '';
      if (!name) return null;
      const dist        = haversineMiFE(searchLat, searchLng, lat, lon);
      const addr        = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ')
                       || tags['addr:full'] || '';
      const openStatus  = tags.open_status  || '';   // 'Open now' | 'Closed now' | ''
      const todayHours  = tags.today_hours  || '';   // e.g. '9:00 AM – 10:00 PM'
      const rating      = tags.rating       || '';
      const cuisine     = tags.cuisine      || '';
      return { name, dist, addr, openStatus, todayHours, rating, cuisine, lat, lon };
    })
    .filter(Boolean)
    .sort((a, b) => a.dist - b.dist)
    .filter((item, i, arr) => i === 0 || !(item.name === arr[i-1].name && Math.abs(item.dist - arr[i-1].dist) < 0.01))
    .slice(0, 15);

  if (items.length === 0) {
    showMessage(`No ${cfg.label} found nearby. OSM data may be incomplete for this area — try a different address.`);
    return;
  }

  // Update stats bar with nearby-friendly text
  statsBar.hidden = false;
  const countEl = document.getElementById('stat-count');
  countEl.textContent = items.length;
  // Temporarily patch the " spots found" label text
  const statCountParent = countEl.parentElement;
  if (statCountParent) statCountParent.innerHTML = `<span class="stat-dot"></span><strong id="stat-count">${items.length}</strong>&nbsp;${cfg.label.toLowerCase()} found`;
  document.getElementById('stat-street').textContent = streetInput.value.split(',')[0] || '–';
  document.getElementById('stat-city').textContent   = selectedCity || '–';
  document.getElementById('stat-time').textContent   = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  document.getElementById('results-tabs-outer').hidden = true;
  hideRadiusBanner();

  // Show expansion notice if radius was widened to find results
  if (meta.expanded && meta.radiusLabel) {
    let rb = document.getElementById('radius-banner');
    if (!rb) {
      rb = document.createElement('div');
      rb.id = 'radius-banner';
      rb.style.cssText = 'position:relative;z-index:10;width:100%;max-width:820px;margin:0 auto 10px;padding:0 20px;box-sizing:border-box;';
      document.getElementById('results-tabs-outer').insertAdjacentElement('afterend', rb);
    }
    rb.innerHTML = `<div style="display:flex;align-items:center;gap:10px;padding:10px 18px;background:rgba(37,99,235,.06);border:1px solid rgba(37,99,235,.18);border-radius:14px;font-size:.78rem;font-weight:600;color:#2563EB;">
      🔍 No results nearby — expanded search to <strong style="margin:0 3px">${meta.radiusLabel}</strong> · Nearest shown first
    </div>`;
  }

  resultsDiv.innerHTML = items.map((item, i) => {
    const num         = String(i + 1).padStart(2, '0');
    const isOpen      = item.openStatus === 'Open now';
    const isClosed    = item.openStatus === 'Closed now';
    const statusColor = isOpen ? '#16A34A' : isClosed ? '#DC2626' : '';
    const statusBg    = isOpen ? 'rgba(22,163,74,.10)' : isClosed ? 'rgba(220,38,38,.10)' : '';

    const openBadgeHtml = item.openStatus
      ? `<span class="status-badge" style="background:${statusBg};color:${statusColor};margin-left:auto">
           ${isOpen ? '🟢' : '🔴'} ${item.openStatus}
         </span>`
      : '';

    const hoursHtml = item.todayHours
      ? `<span class="detail-item">🕐 Today: ${escHtml(item.todayHours)}</span>`
      : '';

    const ratingHtml = item.rating
      ? `<span class="detail-item" style="color:#D97706;font-weight:600">${escHtml(item.rating)}</span>`
      : '';

    const cuisineHtml = item.cuisine && !item.todayHours
      ? `<span class="detail-item">ℹ️ ${escHtml(item.cuisine.slice(0, 30))}</span>`
      : '';

    return `
      <div class="parking-card nearby-card" style="--status-color:#2563EB;--delay:${i * 0.06}s">
        <div class="spot-number">${num}</div>
        <div class="card-body">
          <div class="card-header-row">
            <div style="flex:1;min-width:0">
              <h3 class="card-address">${escHtml(item.name)}</h3>
              <p class="card-landmark">📍 ${item.addr ? escHtml(item.addr) : formatDistFE(item.dist) + ' away'}</p>
            </div>
            ${openBadgeHtml || `<span class="status-badge" style="background:rgba(37,99,235,.10);color:#2563EB">${cfg.icon} ${cfg.label}</span>`}
          </div>
          <div class="card-details">
            <span class="detail-item">🗺️ ${formatDistFE(item.dist)}</span>
            ${hoursHtml}
            ${ratingHtml}
            ${cuisineHtml}
          </div>
          <a class="gmaps-btn" href="${googleMapsUrl(item.lat, item.lon, item.addr || item.name)}" target="_blank" rel="noopener">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>
            Open in Google Maps
          </a>
        </div>
      </div>`;
  }).join('');

  if (typeof updateMapNearby === 'function') updateMapNearby(items, cfg);
}

async function loadFeature(feature) {
  if (!selectedLat || !selectedLon) {
    showMessage('Enter an address and click Search first, then choose a category.', true);
    return;
  }

  activeFeature = feature;

  document.querySelectorAll('.feature-tile').forEach(t => {
    t.classList.toggle('active', t.dataset.feature === feature);
  });

  if (feature === 'parking') {
    hideRadiusBanner();
    if (allSpots.length > 0) {
      renderCards(allSpots);
      statsBar.hidden = false;
      document.getElementById('results-tabs-outer').hidden = false;
      // restore parking stat label
      const countEl = document.getElementById('stat-count');
      if (countEl?.parentElement) {
        countEl.parentElement.innerHTML = `<span class="stat-dot"></span><strong id="stat-count">${allSpots.length}</strong>&nbsp;spots found`;
      }
    } else {
      searchParking();
    }
    return;
  }

  showSkeletons(feature);
  statsBar.hidden = true;
  hideRadiusBanner();

  try {
    const res = await fetch('/api/nearby', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat: selectedLat, lng: selectedLon, feature }),
    });
    clearInterval(loadingTimer);
    if (!res.ok) throw new Error('API error ' + res.status);
    const data = await res.json();
    renderNearbyResults(data.elements || [], feature, selectedLat, selectedLon, data);
  } catch (err) {
    clearInterval(loadingTimer);
    showMessage(`Could not load ${FEATURE_CONFIG[feature].label} data. Please try again.`, true);
  }
}

document.querySelectorAll('.feature-tile').forEach(tile => {
  tile.addEventListener('click', () => loadFeature(tile.dataset.feature));
});
