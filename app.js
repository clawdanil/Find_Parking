const TIMEOUT_MS = 8000;

const searchBtn   = document.getElementById('search-btn');
const locationInput = document.getElementById('location');
const resultsDiv  = document.getElementById('results');

// ── Skeleton loader (shown instantly on click) ──────────────────────────────
function showSkeletons() {
  const card = `
    <div class="card skeleton">
      <div class="skel-row">
        <div class="skel-line w-70"></div>
        <div class="skel-line w-20"></div>
      </div>
      <div class="skel-line w-50"></div>
      <div class="skel-row" style="margin-top:6px">
        <div class="skel-line w-35"></div>
        <div class="skel-line w-20" style="height:14px"></div>
      </div>
    </div>`;
  resultsDiv.innerHTML = card.repeat(5);
}

// ── Render real results ─────────────────────────────────────────────────────
function renderResults(parsed, street) {
  const spots = parsed.spots;
  if (!Array.isArray(spots) || spots.length === 0) {
    showMessage('No parking spots found. Try a different location.');
    return;
  }
  resultsDiv.innerHTML = spots.map(s => `
    <div class="card">
      <div class="card-header">
        <h3>${escHtml(s.address)} <span style="font-weight:400;color:#64748b">(${escHtml(s.side)})</span></h3>
        <span class="badge available">${escHtml(s.status)}</span>
      </div>
      <div class="card-meta">${escHtml(s.distance_from_search)}</div>
      <div class="card-footer">
        <span class="price">${escHtml(s.time_limit)}</span>
        <span>${s.permit_required ? escHtml(s.permit_zone) + ' permit' : 'No permit'}</span>
      </div>
    </div>`).join('');
}

function showMessage(text, isError = false) {
  resultsDiv.innerHTML = `
    <div class="msg ${isError ? 'error' : ''}">
      <div class="icon">${isError ? '⚠️' : 'ℹ️'}</div>
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

// ── API call ────────────────────────────────────────────────────────────────
async function searchParking() {
  const street = locationInput.value.trim();
  if (!street) {
    locationInput.focus();
    return;
  }

  showSkeletons(); // instant feedback
  searchBtn.disabled = true;

  const now = new Date();
  const dayName = now.toLocaleDateString('en-US', { weekday: 'long' });
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('TIMEOUT')), TIMEOUT_MS)
  );

  try {
    const response = await Promise.race([
      fetch('/api/parking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ street, day: dayName, time: timeStr })
      }),
      timeoutPromise
    ]);

    const parsed = await response.json();
    console.log('API response:', parsed);
    if (parsed.error) throw new Error(parsed.error);
    renderResults(parsed, street);
  } catch (err) {
    if (err.message === 'TIMEOUT') {
      showMessage('The search is taking too long. Please try again.', true);
    } else {
      showMessage('Something went wrong. Please try again.', true);
    }
  } finally {
    searchBtn.disabled = false;
  }
}

// ── Event listeners ─────────────────────────────────────────────────────────
searchBtn.addEventListener('click', searchParking);
locationInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') searchParking();
});
