const TIMEOUT_MS = 25000;

const searchBtn      = document.getElementById('search-btn');
const streetInput    = document.getElementById('street-input');
const resultsDiv     = document.getElementById('results');

// App mode: hide/show hero visual — slideshow in app-mode, preview cards on web
const _heroPreview   = document.querySelector('.hero-preview');
const _heroSlideshow = document.getElementById('app-hero-slideshow');
function _appHeroEl() {
  return (document.documentElement.classList.contains('app-mode') && _heroSlideshow)
    ? _heroSlideshow : _heroPreview;
}
function appModeHideHero() {
  if (!document.documentElement.classList.contains('app-mode')) return;
  const el = _appHeroEl(); if (!el) return;
  el.style.cssText = 'opacity:0;transform:translateY(10px);pointer-events:none;transition:opacity .28s cubic-bezier(.4,0,1,1),transform .28s cubic-bezier(.4,0,1,1)';
}
function appModeShowHero() {
  if (!document.documentElement.classList.contains('app-mode')) return;
  const el = _appHeroEl(); if (!el) return;
  el.style.cssText = 'opacity:1;transform:translateY(0);pointer-events:auto;transition:opacity .44s cubic-bezier(.16,1,.3,1) .06s,transform .44s cubic-bezier(.16,1,.3,1) .06s';
}
const statsBar       = document.getElementById('stats-bar');
const metricsSection = document.getElementById('metrics-section');
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
      { input: q, types: ['address'] },
      (preds, status) => {
        if (status !== google.maps.places.PlacesServiceStatus.OK || !preds) { resolve([]); return; }
        resolve(preds.map(p => ({
          display:  p.description,
          main:     p.structured_formatting.main_text,
          sub:      p.structured_formatting.secondary_text || '',
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
  // Reset coords until geocoder confirms them
  selectedLat = null;
  selectedLon = null;

  if (!window._gmapsReady) return;
  // Wrap in a Promise so searchParking can await it if needed
  window._geocodePending = new Promise(resolve => {
    try {
      window._geocoder.geocode({ placeId: s.place_id }, (results, status) => {
        if (status === 'OK' && results?.[0]) {
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
        }
        resolve();
      });
    } catch { resolve(); }
  });
}

streetInput.addEventListener('input', () => {
  clearTimeout(acTimer);
  const q = streetInput.value.trim();
  if (q.length < 2) { acDropdown.hidden = true; if (q.length === 0) appModeShowHero(); return; }
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
  FREE_STREET:  { label: 'Free Street',  key: 'type_free_street', color: '#30D158', icon: '🅿️' },
  PAID_STREET:  { label: 'Paid Street',  key: 'type_paid_street', color: '#FF9F0A', icon: '🪙' },
  PAID_LOT:     { label: 'Paid Lot',     key: 'type_paid_lot',    color: '#FF6B00', icon: '🅿️' },
  GARAGE:       { label: 'Garage',       key: 'type_garage',      color: '#0A84FF', icon: '🏢' },
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
        <div style="font-size:0.68rem;font-weight:600;color:rgba(10,10,20,.35);letter-spacing:1.2px;text-transform:uppercase;margin-bottom:5px;">${t('spot_label','Spot')} ${num}</div>
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

function getLoadingMsgs() {
  return [t('load_scanning'), t('load_permit'), t('load_free'), t('load_almost')];
}

function getNearbyLoadingMsgs(feature) {
  const almost = t('load_almost');
  const nearby = t('load_nearby');
  return ({
    food:          [t('load_restaurants'), t('load_menus'), almost],
    bars:          [t('load_bars'), nearby, almost],
    coffee:        [t('load_coffee'), nearby, almost],
    gym:           [t('load_gyms'), t('load_fitness'), almost],
    shopping:      [t('load_shops'), t('load_malls'), almost],
    transit:       [t('load_transit_s'), t('load_departures'), almost],
    entertainment: [t('load_entertain'), t('load_theatres'), almost],
    events:        [t('load_events_s'), t('load_ticketm'), almost],
  })[feature];
}

let loadingTimer = null;
let statusPollInterval = null;

// ── Loading state: animated parking meter ────────────────────────────────────
function showSkeletons(feature) {
  appModeHideHero();
  if (metricsSection) metricsSection.hidden = true;
  clearInterval(loadingTimer);
  let idx = 0;
  const msgs = (feature && getNearbyLoadingMsgs(feature)) || getLoadingMsgs();
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
      ${{ all: t('tab_all','All'), free: t('tab_free','Free'), paid: t('tab_paid','Paid'), garage: t('tab_garages','Garages') }[tab]}
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
    resultsDiv.innerHTML = `<div class="msg"><div class="msg-icon">ℹ️</div><p>${t('err_no_parking','No parking spots found within 4 blocks. Try a different address.')}</p></div>`;
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
            <span class="status-badge" style="background:${color}22;color:${color}">${meta.icon} ${escHtml(t(meta.key, meta.label))}</span>
          </div>
          <div class="card-type-banner" style="background:${color}0d;border-color:${color}22">
            <span class="ctb-icon">${meta.icon}</span>
            <span class="ctb-label">${escHtml(t(meta.key, meta.label))}</span>
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
              <button class="report-btn report-free"  data-status="FREE">${t('still_free','✅ Still Free')}</button>
              <button class="report-btn report-taken" data-status="TAKEN">${t('its_taken',"❌ It's Taken")}</button>
            </div>
          </div>` : ''}
          <a class="gmaps-btn" href="${googleMapsUrl(s.lat, s.lng, s.address)}" target="_blank" rel="noopener">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>
            ${t('open_gmaps','Open in Google Maps')}
          </a>
        </div>
      </div>`;
  }).join('');

  updateMap(spots);

  const cardReports = Array.from(document.querySelectorAll('.card-report'));
  cardReports.forEach(el => {
    const spotId = el.dataset.spotId;
    fetchSpotStatus(spotId, el.querySelector('.report-status'));
    el.querySelectorAll('.report-btn').forEach(btn => {
      btn.addEventListener('click', () => handleReport(spotId, btn.dataset.status, el));
    });
  });

  // Refresh crowdsource statuses every 90s while parking results are visible
  clearInterval(statusPollInterval);
  if (cardReports.length > 0) {
    statusPollInterval = setInterval(() => {
      cardReports.forEach(el => {
        fetchSpotStatus(el.dataset.spotId, el.querySelector('.report-status'));
      });
    }, 90_000);
  }

  // AI insight for parking
  const parkingInsightItems = visible.slice(0, 8).map(s => {
    const meta = TYPE_META[s.type] || TYPE_META['FREE_STREET'];
    return {
      name:       s.address,
      category:   meta.label,
      dist:       parseFloat((s.distance_from_search || '').replace(/[^\d.]/g, '')) || null,
      time_limit: s.time_limit || null,
      cost:       s.avg_cost   || null,
    };
  });
  fetchAiInsight('parking', parkingInsightItems);
}

// ── Render parking cards ──────────────────────────────────────────────────────
function renderResults(parsed, street) {
  clearInterval(loadingTimer);

  const spots = parsed.spots;
  if (!Array.isArray(spots) || spots.length === 0) {
    showMessage(t('err_no_parking','No parking spots found within 4 blocks. Try a different address.'));
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
    : src === 'google'
    ? `<span style="margin-left:auto;font-size:.68rem;padding:2px 8px;border-radius:100px;background:rgba(234,67,53,.10);border:1px solid rgba(234,67,53,.22);color:#EA4335;">📍 Google Places</span>`
    : `<span style="margin-left:auto;font-size:.68rem;padding:2px 8px;border-radius:100px;background:rgba(52,211,153,.12);border:1px solid rgba(52,211,153,.25);color:#34D399;">🗺️ Live OSM data</span>`;

  if (parsed.radiusExpanded) {
    radiusBanner.innerHTML = `<div style="
      display:flex;align-items:center;gap:10px;padding:10px 18px;
      background:rgba(251,191,36,.08);border:1px solid rgba(251,191,36,.22);
      border-radius:14px;font-size:.78rem;font-weight:600;color:#FBBF24;
    ">⚠️ ${t('radius_exp_msg','Fewer than 3 spots within 2 blocks — expanded search to 4 blocks.')}${srcBadge}</div>`;
  } else {
    radiusBanner.innerHTML = `<div style="
      display:flex;align-items:center;gap:10px;padding:10px 18px;
      background:rgba(52,211,153,.06);border:1px solid rgba(52,211,153,.18);
      border-radius:14px;font-size:.78rem;font-weight:600;color:#34D399;
    ">✅ ${t('radius_norm_msg','Showing parking within 2 blocks.')}${srcBadge}</div>`;
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
    if (data.status) renderStatusBadge(statusEl, data.status, data.minutes_ago, data.free_votes, data.taken_votes);
  } catch {}
}

function renderStatusBadge(statusEl, status, minutesAgo, freeVotes = 0, takenVotes = 0) {
  const isFree  = status === 'FREE';
  const color   = isFree ? '#30D158' : '#FF453A';
  const icon    = isFree ? '✅' : '❌';
  const timeStr = minutesAgo < 1 ? t('just_now','just now') : `${minutesAgo} ${t('min_ago','min ago')}`;
  const parts   = [];
  if (freeVotes  > 0) parts.push(`${freeVotes} ${t('say_free','say Free')}`);
  if (takenVotes > 0) parts.push(`${takenVotes} ${t('say_taken','say Taken')}`);
  const voteStr = parts.length ? parts.join(' · ') + ' · ' : '';
  statusEl.innerHTML = `
    <span class="report-status-badge" style="color:${color};background:${color}12;border-color:${color}40">
      ${icon} ${voteStr}${timeStr}
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
    // Re-fetch to get updated vote counts immediately
    await fetchSpotStatus(spotId, cardReportEl.querySelector('.report-status'));
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

  // Wait for any in-flight autocomplete geocode (max 2s) before reading selectedLat/Lon
  if (window._geocodePending) {
    await Promise.race([window._geocodePending, new Promise(r => setTimeout(r, 2000))]);
    window._geocodePending = null;
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
    // Cache parking spots so Parking tile renders instantly when clicked
    allSpots  = Array.isArray(data.spots) ? data.spots : [];
    activeTab = 'all';
    // Activate the first tile and load its results by default
    const firstTile    = document.querySelector('.feature-tile');
    const firstFeature = firstTile?.dataset.feature || 'food';
    activeFeature = firstFeature;
    document.querySelectorAll('.feature-tile').forEach(t =>
      t.classList.toggle('active', t.dataset.feature === firstFeature)
    );
    await loadFeature(firstFeature);
  } catch (err) {
    console.error('Full error:', err);
    if (err.message === 'TIMEOUT') {
      showMessage(t('err_timeout','The search is taking too long. Please try again.'), true);
    } else {
      showMessage(err.message || t('err_generic','Something went wrong. Please try again.'), true);
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
    selectedLat  = chip.dataset.lat  ? parseFloat(chip.dataset.lat)  : null;
    selectedLon  = chip.dataset.lng  ? parseFloat(chip.dataset.lng)  : null;
    streetInput.value = '';
    streetInput.placeholder = `${t('addr_in','Address in')} ${chip.dataset.city}…`;
    streetInput.focus();
  });
});

// ── Current location ──────────────────────────────────────────────────────────
const locationBtn = document.getElementById('location-btn');

locationBtn.addEventListener('click', () => {
  if (!navigator.geolocation) {
    showMessage(t('err_no_geo','Geolocation is not supported by your browser.'), true);
    return;
  }

  locationBtn.disabled = true;
  locationBtn.textContent = t('locating_text','⏳ Locating…');

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
        showMessage(t('err_location','Could not find your address. Please type it manually.'), true);
        locationBtn.textContent = t('loc_reset','📍 Use My Current Location');
        locationBtn.disabled = false;
        return;
      }

      locationBtn.textContent = t('loc_success','📍 My Location ✓');
      locationBtn.disabled = false;
      // Do NOT auto-search — user must click Search explicitly
    },
    () => {
      locationBtn.textContent = t('loc_reset','📍 Use My Current Location');
      locationBtn.disabled = false;
      showMessage(t('err_loc_denied','Location access denied. Please enter your address manually.'), true);
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
});

// ── Unit detection: US/UK/Myanmar → imperial; everywhere else → metric ────────
const IMPERIAL_STATES = /,\s*(?:AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\b/i;
function getUnits() {
  const text = (streetInput.value || '') + ' ' + (selectedCity || '');
  if (IMPERIAL_STATES.test(text)) return 'imperial';
  if (/\b(USA|United States|United Kingdom|England|Scotland|Wales|Myanmar|Burma|Liberia)\b/i.test(text)) return 'imperial';
  return 'metric';
}

// ── Feature Tiles ─────────────────────────────────────────────────────────────

const FEATURE_CONFIG = {
  parking:       { label: 'Parking',       icon: '🅿️' },
  transit:       { label: 'Transit',       icon: '🚇' },
  food:          { label: 'Food',          icon: '🍔' },
  bars:          { label: 'Bars',          icon: '🍺' },
  coffee:        { label: 'Coffee',        icon: '☕' },
  gym:           { label: 'Gym',           icon: '💪' },
  shopping:      { label: 'Shopping',      icon: '🛒' },
  entertainment: { label: 'Entertainment', icon: '🎬' },
  events:        { label: 'Events',        icon: '🎟️' },
};

function haversineMiFE(lat1, lon1, lat2, lon2) {
  const R = 3958.8, toR = d => d * Math.PI / 180;
  const dLat = toR(lat2 - lat1), dLon = toR(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLon/2)**2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

function formatDistFE(mi) {
  if (getUnits() === 'imperial') {
    return mi < 0.1 ? `${Math.round(mi * 5280)} ft` : `${mi.toFixed(2)} mi`;
  }
  const km = mi * 1.60934;
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
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
    .filter((item, i, arr) => !arr.slice(0, i).some(prev => prev.name === item.name && Math.abs(prev.dist - item.dist) < 0.1))
    .slice(0, 15);

  if (items.length === 0) {
    showMessage(`No ${t(`tile_${feature}`, cfg.label)} ${t('no_nearby_suffix','found nearby. OSM data may be incomplete for this area — try a different address.')}`);
    return;
  }

  // Update stats bar with nearby-friendly text
  statsBar.hidden = false;
  const countEl = document.getElementById('stat-count');
  countEl.textContent = items.length;
  // Temporarily patch the " spots found" label text
  const statCountParent = countEl.parentElement;
  if (statCountParent) statCountParent.innerHTML = `<span class="stat-dot"></span><strong id="stat-count">${items.length}</strong>&nbsp;${t(`tile_${feature}`, cfg.label).toLowerCase()} ${t('found_label','found')}`;
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
      🔍 ${t('no_results_exp','No results nearby — expanded search to')} <strong style="margin:0 3px">${meta.radiusLabel}</strong> · ${t('nearest_first','Nearest shown first')}
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
      ? `<span class="detail-item">🕐 ${t('today_label','Today:')} ${escHtml(item.todayHours)}</span>`
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
            ${t('open_gmaps','Open in Google Maps')}
          </a>
        </div>
      </div>`;
  }).join('');

  fetchAiInsight(feature, items);
  if (typeof updateMapNearby === 'function') updateMapNearby(items, cfg);
}

function renderTransitResults(elements, meta = {}) {
  clearInterval(loadingTimer);
  if (!elements || elements.length === 0) {
    const r = meta.radiusLabel || 'the search area';
    showMessage(`${t('no_transit_msg','No transit stops found within')} ${r}.`);
    return;
  }

  statsBar.hidden = false;
  const countEl = document.getElementById('stat-count');
  if (countEl?.parentElement) {
    countEl.parentElement.innerHTML = `<span class="stat-dot"></span><strong id="stat-count">${elements.length}</strong>&nbsp;${t('stops_nearby','transit stops nearby')}`;
  }
  document.getElementById('stat-street').textContent = streetInput.value.split(',')[0] || '–';
  document.getElementById('stat-city').textContent   = selectedCity || '–';
  document.getElementById('stat-time').textContent   = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  document.getElementById('results-tabs-outer').hidden = true;
  hideRadiusBanner();

  if (meta.expanded && meta.radiusLabel) {
    let rb = document.getElementById('radius-banner');
    if (!rb) {
      rb = document.createElement('div');
      rb.id = 'radius-banner';
      rb.style.cssText = 'position:relative;z-index:10;width:100%;max-width:820px;margin:0 auto 10px;padding:0 20px;box-sizing:border-box;';
      document.getElementById('results-tabs-outer').insertAdjacentElement('afterend', rb);
    }
    rb.innerHTML = `<div style="display:flex;align-items:center;gap:10px;padding:10px 18px;background:rgba(37,99,235,.06);border:1px solid rgba(37,99,235,.18);border-radius:14px;font-size:.78rem;font-weight:600;color:#2563EB;">
      🔍 ${t('no_stops_exp','No stops nearby — expanded search to')} <strong style="margin:0 3px">${meta.radiusLabel}</strong> · ${t('nearest_first','Nearest shown first')}
    </div>`;
  }

  resultsDiv.innerHTML = elements.map((el, i) => {
    const num = String(i + 1).padStart(2, '0');
    const isPath = el.transitType === 'PATH Train';
    const typeColor = isPath ? '#004B87'
      : el.transitType === 'Subway'  ? '#0039A6'
      : el.transitType.includes('Bus') ? '#006847'
      : '#374151';

    const typeBadge = `<span class="transit-type-badge" style="background:${typeColor}18;color:${typeColor};border-color:${typeColor}30">${el.transitType}</span>`;

    const isBusStop = el.transitType === 'Bus Stop';

    // PATH / Subway departure table
    const departureHtml = el.departures && el.departures.length > 0
      ? `<div class="transit-departures">
          ${el.departures.map(d => `
            <div class="transit-dep-row">
              <span class="transit-dep-line" style="background:${d.color}"></span>
              <span class="transit-dep-dest">→ ${escHtml(d.headsign)}</span>
              <span class="transit-dep-time ${d.arrival === 'Due' ? 'dep-due' : ''}">${escHtml(d.arrival)}</span>
            </div>`).join('')}
         </div>`
      : isBusStop ? '' // bus stops use routeHtml instead
      : `<p class="transit-no-rt">${t('live_unavail','ℹ️ Live departures unavailable')}</p>`;

    // Bus stop info: prefer Google Directions schedules (has times), fall back to OSM routes
    const hasSchedules = isBusStop && el.schedules && el.schedules.length > 0;
    const hasRoutes    = isBusStop && el.routes    && el.routes.length    > 0;
    const routeHtml = isBusStop
      ? (hasSchedules
          ? `<div class="bus-routes">
              ${el.schedules.map(s => `
                <div class="bus-route-row">
                  <span class="bus-route-badge">${escHtml(s.route)}</span>
                  ${s.headsign ? `<span class="bus-route-dest">→ ${escHtml(s.headsign)}</span>` : ''}
                  <span class="bus-sched-time">${escHtml(s.departureText)}</span>
                </div>`).join('')}
             </div>`
          : hasRoutes
            ? `<div class="bus-routes">
                ${el.routes.map(r => `
                  <div class="bus-route-row">
                    <span class="bus-route-badge">${escHtml(r.ref)}</span>
                    ${r.to ? `<span class="bus-route-dest">→ ${escHtml(r.to)}</span>` : ''}
                  </div>`).join('')}
               </div>`
            : `<p class="transit-no-rt">${t('tap_schedules','🚌 Tap "View Schedules" for live arrivals')}</p>`)
      : '';

    // For bus stops: link to Google Maps in transit mode so schedules load automatically
    const directionsHref = isBusStop && el.gmapsTransitUrl
      ? el.gmapsTransitUrl
      : googleMapsUrl(el.lat, el.lon, el.address || el.name);

    return `
      <div class="parking-card nearby-card" style="--status-color:${typeColor};--delay:${i * 0.06}s">
        <div class="spot-number">${num}</div>
        <div class="card-body">
          <div class="card-header-row">
            <div style="flex:1;min-width:0">
              <h3 class="card-address">${escHtml(el.name)}</h3>
              ${el.address ? `<p class="card-landmark">📍 ${escHtml(el.address)}</p>` : ''}
            </div>
            ${typeBadge}
          </div>
          <div class="card-details" style="margin-bottom:10px">
            <span class="detail-item">🗺️ ${escHtml(el.distLabel)}</span>
          </div>
          ${departureHtml}${routeHtml}
          <a class="gmaps-btn" href="${escHtml(directionsHref)}" target="_blank" rel="noopener">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>
            ${isBusStop ? t('gmaps_transit','View Schedules') : t('gmaps_dir','Directions')}
          </a>
        </div>
      </div>`;
  }).join('');

  // AI insight for transit
  const transitInsightItems = elements.slice(0, 8).map(el => ({
    name:     el.name,
    category: el.transitType,
    dist:     parseFloat((el.distLabel || '').replace(/[^\d.]/g, '')) || null,
  }));
  fetchAiInsight('transit', transitInsightItems);
}

function renderEventsResults(elements) {
  clearInterval(loadingTimer);
  if (!elements || elements.length === 0) {
    showMessage(t('no_events_msg','No public events found within 3 miles in the next 7 days.'));
    return;
  }

  // Sort by distance to venue — nearest first
  elements.sort((a, b) =>
    haversineMiFE(selectedLat, selectedLon, a.lat, a.lon) -
    haversineMiFE(selectedLat, selectedLon, b.lat, b.lon)
  );

  statsBar.hidden = false;
  const countEl = document.getElementById('stat-count');
  if (countEl?.parentElement) {
    countEl.parentElement.innerHTML = `<span class="stat-dot"></span><strong id="stat-count">${elements.length}</strong>&nbsp;${t('events_week','events this week')}`;
  }
  document.getElementById('stat-street').textContent = streetInput.value.split(',')[0] || '–';
  document.getElementById('stat-city').textContent   = selectedCity || '–';
  document.getElementById('stat-time').textContent   = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  document.getElementById('results-tabs-outer').hidden = true;
  hideRadiusBanner();

  resultsDiv.innerHTML = elements.map((el, i) => {
    const tags = el.tags || {};
    const num = String(i + 1).padStart(2, '0');
    const isFree  = tags.is_free;
    const hasTicket = !!tags.ticket_url;

    const priceBadge = isFree
      ? `<span class="event-badge event-free">${t('event_free_b','🎟️ Free')}</span>`
      : tags.is_unknown
        ? `<span class="event-badge event-unknown">${t('event_check_p','🎫 Check Price')}</span>`
        : tags.price_label
          ? `<span class="event-badge event-paid">🎫 ${escHtml(tags.price_label)}</span>`
          : `<span class="event-badge event-paid">${t('event_paid_b','🎫 Paid')}</span>`;

    const categoryHtml  = tags.category
      ? `<span class="detail-item">🎭 ${escHtml(tags.category)}</span>` : '';
    const dateHtml = tags.date_label
      ? `<span class="detail-item">📅 ${escHtml(tags.date_label)}</span>` : '';
    const showtimesHtml = tags.showtimes
      ? `<span class="detail-item" style="color:#7C3AED;font-weight:600">🔁 ${escHtml(tags.showtimes)}</span>` : '';
    const distHtml = tags.dist_label
      ? `<span class="detail-item">🗺️ ${escHtml(tags.dist_label)} away</span>` : '';
    const venueHtml = tags.venue_name
      ? `<span class="detail-item">📍 ${escHtml(tags.venue_name)}${tags['addr:full'] ? ' — ' + escHtml(tags['addr:full']) : ''}</span>` : '';

    const ticketBtn = hasTicket
      ? `<a class="gmaps-btn event-ticket-btn" href="${escHtml(tags.ticket_url)}" target="_blank" rel="noopener">
           <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9a2 2 0 0 1 0 4v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a2 2 0 0 1 0-4V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v2z"/></svg>
           ${isFree ? t('event_register','Register / RSVP') : tags.is_unknown ? t('event_view','View Event & Pricing') : t('event_tickets','Get Tickets')}
         </a>` : '';

    const mapsBtn = `<a class="gmaps-btn" href="${googleMapsUrl(el.lat, el.lon, tags['addr:full'] || tags.venue_name)}" target="_blank" rel="noopener">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>
      ${t('open_gmaps','Open in Google Maps')}
    </a>`;

    return `
      <div class="parking-card nearby-card" style="--status-color:#7C3AED;--delay:${i * 0.06}s">
        <div class="spot-number">${num}</div>
        <div class="card-body">
          <div class="card-header-row">
            <div style="flex:1;min-width:0">
              <h3 class="card-address">${escHtml(tags.name)}</h3>
            </div>
            ${priceBadge}
          </div>
          <div class="card-details">
            ${dateHtml}
            ${showtimesHtml}
            ${categoryHtml}
            ${distHtml}
            ${venueHtml}
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            ${ticketBtn}
            ${mapsBtn}
          </div>
        </div>
      </div>`;
  }).join('');

  fetchAiInsight('events', elements);
}

// ── AI Insights ───────────────────────────────────────────────────────────────
const AI_INSIGHT_FEATURES = new Set(['food', 'bars', 'coffee', 'gym', 'entertainment', 'events', 'parking', 'transit', 'shopping']);

async function fetchAiInsight(feature, items) {
  if (!AI_INSIGHT_FEATURES.has(feature) || !items?.length) return;

  // Remove any stale panel and inject a loading one at the top of results
  document.getElementById('ai-insight-panel')?.remove();
  const panel = document.createElement('div');
  panel.id        = 'ai-insight-panel';
  panel.className = 'ai-insight-panel';
  panel.innerHTML = `
    <div class="ai-insight-icon">✦</div>
    <div class="ai-insight-body">
      <div class="ai-insight-label">${t('orbi_intel','Orbi Intelligence')}</div>
      <div class="ai-insight-text loading" id="ai-insight-text">
        <span class="ai-skel"></span><span class="ai-skel"></span><span class="ai-skel ai-skel-sm"></span>
      </div>
    </div>`;
  resultsDiv.insertBefore(panel, resultsDiv.firstChild);

  try {
    const timeStr = new Date().toLocaleString('en-US', {
      weekday: 'long', hour: 'numeric', minute: '2-digit', hour12: true,
    });
    const wDesc = document.getElementById('w-desc')?.textContent;
    const wTemp = document.getElementById('w-temp')?.textContent;
    const weather = wDesc && wTemp && wDesc !== 'Loading…' ? `${wTemp}, ${wDesc}` : null;

    const res = await fetch('/api/ai-insight', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        feature,
        items: items.slice(0, 8).map(r => ({
          name:        r.name,
          rating:      r.rating      ?? r.tags?.rating,
          price_level: r.price_level,
          dist:        r.dist        ? (+r.dist).toFixed(2) : undefined,
          open_now:    r.openStatus === 'Open now'   ? true
                     : r.openStatus === 'Closed now' ? false : undefined,
          cuisine:     r.cuisine     ?? r.tags?.cuisine,
          category:    r.category    ?? r.tags?.category,
          date_label:  r.tags?.date_label,
          venue_name:  r.tags?.venue_name,
        })),
        location: selectedCity || streetInput.value.split(',')[0] || '',
        timeStr,
        weather,
        lang: (typeof localStorage !== 'undefined' ? localStorage.getItem('orbi-lang') : null) || 'en',
      }),
    });

    if (!res.ok) throw new Error('api ' + res.status);
    const { insight } = await res.json();
    if (!insight) throw new Error('empty');

    const textEl = document.getElementById('ai-insight-text');
    if (textEl) {
      textEl.classList.remove('loading');
      textEl.textContent = insight;
    }
  } catch {
    document.getElementById('ai-insight-panel')?.remove();
  }
}

async function loadFeature(feature) {
  if (!selectedLat || !selectedLon) {
    showMessage(t('search_first_err','Enter an address and click Search first, then choose a category.'), true);
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
        countEl.parentElement.innerHTML = `<span class="stat-dot"></span><strong id="stat-count">${allSpots.length}</strong>&nbsp;${t('spots_found','spots found')}`;
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
      body: JSON.stringify({ lat: selectedLat, lng: selectedLon, feature, units: getUnits() }),
    });
    clearInterval(loadingTimer);
    if (!res.ok) throw new Error('API error ' + res.status);
    const data = await res.json();
    if (data.noKey) {
      showMessage('Events require a Ticketmaster API key. Add TICKETMASTER_API_KEY in Vercel settings.', true);
      return;
    }
    if (data.isTransit) {
      renderTransitResults(data.elements || [], data);
    } else if (data.isEvents) {
      renderEventsResults(data.elements || []);
    } else {
      renderNearbyResults(data.elements || [], feature, selectedLat, selectedLon, data);
    }
  } catch (err) {
    clearInterval(loadingTimer);
    showMessage(t('err_generic','Something went wrong. Please try again.'), true);
  }
}

document.querySelectorAll('.feature-tile').forEach(tile => {
  tile.addEventListener('click', () => loadFeature(tile.dataset.feature));
});


// ── Attribution toggle ────────────────────────────────────────────────────────
const attrToggle = document.getElementById('attr-toggle');
const attrBody   = document.getElementById('attr-body');
if (attrToggle && attrBody) {
  attrToggle.addEventListener('click', () => {
    const open = attrBody.classList.toggle('open');
    attrToggle.classList.toggle('open', open);
    attrToggle.setAttribute('aria-expanded', String(open));
  });
}
