const TIMEOUT_MS = 8000;

const searchBtn   = document.getElementById('search-btn');
const cityInput   = document.getElementById('city-input');
const streetInput = document.getElementById('street-input');
const resultsDiv  = document.getElementById('results');
const statsBar    = document.getElementById('stats-bar');

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

// ── Render parking cards ──────────────────────────────────────────────────────
function renderResults(parsed, street) {
  clearInterval(loadingTimer);

  const spots = parsed.spots;
  if (!Array.isArray(spots) || spots.length === 0) {
    showMessage('No parking spots found. Try a different location.');
    return;
  }

  const freeCount = spots.filter(s => s.status === 'FREE').length;
  document.getElementById('stat-count').textContent = freeCount;
  document.getElementById('stat-street').textContent = parsed.street || street;
  document.getElementById('stat-city').textContent   = parsed.neighborhood || cityInput.value;
  document.getElementById('stat-time').textContent   = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  statsBar.hidden = false;

  const STATUS_COLOR = {
    'FREE':            '#00C853',
    'LIMITED':         '#FFB300',
    'PERMIT REQUIRED': '#F44336',
  };

  resultsDiv.innerHTML = '';
  resultsDiv.innerHTML = spots.map((s, i) => {
    const color = STATUS_COLOR[s.status] || '#00C853';
    const num   = String(i + 1).padStart(2, '0');
    return `
      <div class="parking-card" style="--status-color:${color};--delay:${i * 0.08}s">
        <div class="spot-number">${num}</div>
        <div class="card-body">
          <div class="card-header-row">
            <h3 class="card-address">${escHtml(s.address)} <span class="card-side">(${escHtml(s.side)})</span></h3>
            <span class="status-badge" style="background:${color}22;color:${color}">${escHtml(s.status)}</span>
          </div>
          ${s.landmark ? `<p class="card-landmark">📌 ${escHtml(s.landmark)}</p>` : ''}
          ${s.lat && s.lng ? `<img class="card-streetview" src="/api/streetview?lat=${s.lat}&lng=${s.lng}&heading=${s.heading ?? 0}" alt="Street view of ${escHtml(s.address)}" loading="lazy" onerror="this.style.display='none'">` : ''}
          <div class="card-details">
            <span class="detail-item">🕐 ${escHtml(s.time_limit)}</span>
            <span class="detail-item">🧹 ${escHtml(s.sweeping_schedule)}</span>
            <span class="detail-item">🔑 ${s.permit_required ? escHtml(s.permit_zone) + ' permit' : 'No permit'}</span>
            <span class="detail-item">🌙 ${escHtml(s.overnight_parking)}</span>
            <span class="detail-item">📍 ${escHtml(s.distance_from_search)}</span>
          </div>
          <div class="card-report" data-spot-id="${escHtml(s.address)}">
            <div class="report-status"></div>
            <div class="report-actions">
              <button class="report-btn report-free"  data-status="FREE">✅ Still Free</button>
              <button class="report-btn report-taken" data-status="TAKEN">❌ It's Taken</button>
            </div>
          </div>
        </div>
      </div>`;
  }).join('');

  // Fetch existing crowdsourced status and wire buttons for each card
  document.querySelectorAll('.card-report').forEach(el => {
    const spotId = el.dataset.spotId;
    fetchSpotStatus(spotId, el.querySelector('.report-status'));
    el.querySelectorAll('.report-btn').forEach(btn => {
      btn.addEventListener('click', () => handleReport(spotId, btn.dataset.status, el));
    });
  });
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
  const color   = isFree ? '#00C853' : '#F44336';
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
  const city   = cityInput.value.trim();   // id="city-input"
  const street = streetInput.value.trim(); // id="street-input"
  if (!street) { streetInput.focus(); return; }
  if (!city)   { cityInput.focus();   return; }

  showSkeletons();
  searchBtn.disabled = true;
  statsBar.hidden = true;

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
streetInput.addEventListener('keydown', e => { if (e.key === 'Enter') searchParking(); });
cityInput.addEventListener('keydown',   e => { if (e.key === 'Enter') searchParking(); });

document.querySelectorAll('.chip').forEach(chip => {
  chip.addEventListener('click', () => {
    cityInput.value = chip.dataset.city;
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
        const a = data.address;

        const city   = [a.city || a.town || a.village || a.county, a.state].filter(Boolean).join(', ');
        const houseNo = a.house_number ? a.house_number + ' ' : '';
        const street  = houseNo + (a.road || a.pedestrian || a.footway || '');

        cityInput.value   = city;
        streetInput.value = street;
      } catch {
        // Reverse geocode failed — fill coordinates as fallback
        cityInput.value   = '';
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
