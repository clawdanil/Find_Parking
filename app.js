const API_KEY = 'YOUR_ANTHROPIC_API_KEY'; // Replace with your key
const API_URL = 'https://api.anthropic.com/v1/messages';
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
function renderResults(spots) {
  if (!Array.isArray(spots) || spots.length === 0) {
    showMessage('No parking spots found. Try a different location.');
    return;
  }
  resultsDiv.innerHTML = spots.map(s => `
    <div class="card">
      <div class="card-header">
        <h3>${escHtml(s.name)}</h3>
        <span class="badge ${s.available ? 'available' : 'unavailable'}">
          ${s.available ? 'Available' : 'Full'}
        </span>
      </div>
      <div class="card-meta">${escHtml(s.address)}</div>
      <div class="card-footer">
        <span class="price">${escHtml(s.price)}</span>
        <span>${escHtml(s.distance)} &bull; <span class="type">${escHtml(s.type)}</span></span>
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
  const location = locationInput.value.trim();
  if (!location) {
    locationInput.focus();
    return;
  }

  showSkeletons(); // instant feedback
  searchBtn.disabled = true;

  const prompt =
    `Find 5 nearby parking spots for: ${location}\n\n` +
    `Return ONLY a valid JSON array — no markdown, no explanation:\n` +
    `[\n` +
    `  {\n` +
    `    "name": "string",\n` +
    `    "address": "string",\n` +
    `    "distance": "string (e.g. 0.2 mi)",\n` +
    `    "price": "string (e.g. $3/hr)",\n` +
    `    "available": true,\n` +
    `    "type": "garage|lot|street"\n` +
    `  }\n` +
    `]`;

  const fetchPromise = fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('TIMEOUT')), TIMEOUT_MS)
  );

  try {
    const response = await Promise.race([fetchPromise, timeoutPromise]);

    if (!response.ok) {
      throw new Error(`API error ${response.status}`);
    }

    const data  = await response.json();
    const text  = data.content[0].text.trim();
    const spots = JSON.parse(text);
    renderResults(spots);
  } catch (err) {
    if (err.message === 'TIMEOUT') {
      showMessage('The search is taking too long. Please try again.', true);
    } else {
      showMessage('Something went wrong. Please check your API key and try again.', true);
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
