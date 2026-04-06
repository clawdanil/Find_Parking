export const config = { runtime: 'edge' };

// ── Google Places type mappings ───────────────────────────────────────────────
const GOOGLE_TYPE = {
  food:     { types: ['restaurant'], radius: 800 },
  bars:     { types: ['bar'],        radius: 800 },
  coffee:   { types: ['cafe'],       radius: 1000 },
  gym:      { types: ['gym'],        radius: 1200 },
  shopping: { types: ['shopping_mall', 'department_store'], radius: 2000 },
};

// ── Overpass fallback queries ─────────────────────────────────────────────────
const OVERPASS_QUERY = {
  food: (lat, lng) => `
    node["amenity"~"restaurant|fast_food|food_court|diner|bistro|canteen"](around:800,${lat},${lng});
    way["amenity"~"restaurant|fast_food|food_court|diner|bistro"](around:800,${lat},${lng});`,

  bars: (lat, lng) => `
    node["amenity"~"bar|pub|biergarten|nightclub|lounge|brewery|tavern"](around:800,${lat},${lng});
    way["amenity"~"bar|pub|biergarten|nightclub|lounge"](around:800,${lat},${lng});`,

  coffee: (lat, lng) => `
    node["amenity"="cafe"](around:1000,${lat},${lng});
    way["amenity"="cafe"](around:1000,${lat},${lng});
    node["brand"~"Starbucks|Dunkin|Tim Hortons|Peet|Blue Bottle|Gregorys",i](around:1000,${lat},${lng});
    node["name"~"Coffee|Cafe|Espresso|Brew|Roast|Latte",i](around:1000,${lat},${lng});`,

  gym: (lat, lng) => `
    node["leisure"~"fitness_centre|sports_centre"](around:1200,${lat},${lng});
    way["leisure"~"fitness_centre|sports_centre"](around:1200,${lat},${lng});
    node["name"~"Gym|Fitness|Planet Fitness|LA Fitness|Equinox|CrossFit|YMCA|Sculpt|Orangetheory|Crunch|Anytime",i](around:1200,${lat},${lng});
    way["name"~"Gym|Fitness|Sculpt|Equinox|CrossFit|Orangetheory|Crunch",i](around:1200,${lat},${lng});`,

  shopping: (lat, lng) => `
    way["leisure"="shopping_centre"](around:2000,${lat},${lng});
    relation["leisure"="shopping_centre"](around:2000,${lat},${lng});
    node["shop"~"mall|department_store|supermarket|clothing|electronics"](around:2000,${lat},${lng});
    way["shop"~"mall|department_store|supermarket"](around:2000,${lat},${lng});
    way["name"~"Mall|Plaza|Centre|Center|Newport|Galleria|Outlet",i](around:2000,${lat},${lng});
    relation["name"~"Mall|Plaza|Centre|Center|Newport|Galleria",i](around:2000,${lat},${lng});`,
};

const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

// ── Places Details: fetch today's opening hours for one place ─────────────────
async function fetchPlaceHours(placeId, key) {
  try {
    const ctrl = new AbortController();
    const t    = setTimeout(() => ctrl.abort(), 6000);
    const url  = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=opening_hours&key=${key}`;
    const res  = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== 'OK') return null;

    const oh = data.result?.opening_hours;
    if (!oh) return null;

    // weekday_text is Monday-indexed (0=Mon … 6=Sun); getDay() is 0=Sun … 6=Sat
    const todayIdx  = (new Date().getDay() + 6) % 7;
    const rawText   = oh.weekday_text?.[todayIdx] || '';
    // Strip leading "Monday: " / "Tuesday: " etc.
    const todayHours = rawText.replace(/^[^:]+:\s*/, '').trim();

    return {
      open_now:    oh.open_now,   // boolean | undefined
      today_hours: todayHours || null,
    };
  } catch {
    return null;
  }
}

// ── Google Places Nearby Search + enrich with hours ───────────────────────────
async function queryGooglePlaces(lat, lng, feature, key) {
  const cfg = GOOGLE_TYPE[feature];
  if (!cfg || !key) return null;

  const rawPlaces = [];   // { placeId, name, lat, lon, vicinity, open_now, rating }

  for (const type of cfg.types) {
    try {
      const url  = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${cfg.radius}&type=${type}&key=${key}`;
      const ctrl = new AbortController();
      const t    = setTimeout(() => ctrl.abort(), 10000);
      const res  = await fetch(url, { signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) continue;
      const data = await res.json();
      if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') continue;

      for (const place of (data.results || [])) {
        rawPlaces.push({
          placeId:  place.place_id,
          name:     place.name || '',
          lat:      place.geometry.location.lat,
          lon:      place.geometry.location.lng,
          vicinity: place.vicinity || '',
          open_now: place.opening_hours?.open_now,  // boolean or undefined
          rating:   place.rating ?? null,
        });
      }
    } catch { /* continue */ }
  }

  if (rawPlaces.length === 0) return null;

  // Deduplicate by name
  const seen = new Set();
  const deduped = rawPlaces.filter(p => {
    if (!p.name || seen.has(p.name)) return false;
    seen.add(p.name);
    return true;
  });

  // Fetch today's hours for each place in parallel (top 15 only)
  const top = deduped.slice(0, 15);
  const hoursResults = await Promise.all(
    top.map(p => fetchPlaceHours(p.placeId, key))
  );

  return top.map((p, i) => {
    const hours     = hoursResults[i];
    const open_now  = hours?.open_now ?? p.open_now;   // prefer Details data
    const todayHours = hours?.today_hours || null;

    let openStatus = '';
    if (open_now === true)  openStatus = 'Open now';
    if (open_now === false) openStatus = 'Closed now';

    return {
      type: 'node',
      lat:  p.lat,
      lon:  p.lon,
      tags: {
        name:          p.name,
        'addr:full':   p.vicinity,
        open_status:   openStatus,           // 'Open now' | 'Closed now' | ''
        today_hours:   todayHours || '',     // e.g. '9:00 AM – 10:00 PM'
        rating:        p.rating ? `★ ${p.rating}` : '',
      },
    };
  });
}

// ── Overpass fallback ─────────────────────────────────────────────────────────
async function queryOverpass(overpassQuery) {
  const body    = `[out:json][timeout:20];\n(\n${overpassQuery}\n);\nout center 40;`;
  const encoded = 'data=' + encodeURIComponent(body);

  const tryMirror = async (url) => {
    const ctrl = new AbortController();
    const t    = setTimeout(() => ctrl.abort(), 15000);
    try {
      const res      = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: encoded, signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) throw new Error('bad status');
      const data     = await res.json();
      const elements = data.elements || [];
      if (elements.length === 0) throw new Error('empty');
      return elements;
    } catch (e) { clearTimeout(t); throw e; }
  };

  try { return await Promise.any(OVERPASS_MIRRORS.map(tryMirror)); }
  catch { return []; }
}

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(req) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return json({ error: 'Method not allowed' }, 405);
  }

  let lat, lng, feature;
  if (req.method === 'POST') {
    try { ({ lat, lng, feature } = await req.json()); } catch { return json({ error: 'Bad request' }, 400); }
  } else {
    const p = new URL(req.url).searchParams;
    lat     = parseFloat(p.get('lat'));
    lng     = parseFloat(p.get('lng'));
    feature = p.get('feature');
  }

  if (!lat || !lng || !feature || !OVERPASS_QUERY[feature]) {
    return json({ error: 'Missing or invalid params' }, 400);
  }

  const key = process.env.GOOGLE_MAPS_API_KEY || '';

  let elements = null;
  if (key) {
    try { elements = await queryGooglePlaces(lat, lng, feature, key); } catch { elements = null; }
  }

  if (!elements || elements.length === 0) {
    elements = await queryOverpass(OVERPASS_QUERY[feature](lat, lng));
  }

  return json({ elements: elements || [], feature, count: (elements || []).length });
}
