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

// ── Google Places Nearby Search ───────────────────────────────────────────────
async function queryGooglePlaces(lat, lng, feature, key) {
  const cfg = GOOGLE_TYPE[feature];
  if (!cfg || !key) return null;

  // For shopping, try both types and merge
  const allResults = [];
  for (const type of cfg.types) {
    try {
      const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${cfg.radius}&type=${type}&key=${key}`;
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 10000);
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) continue;
      const data = await res.json();
      if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') continue;
      for (const place of (data.results || [])) {
        allResults.push({
          type: 'node',
          lat:  place.geometry.location.lat,
          lon:  place.geometry.location.lng,
          tags: {
            name:          place.name || '',
            'addr:full':   place.vicinity || '',
            opening_hours: place.opening_hours?.open_now !== undefined
              ? (place.opening_hours.open_now ? 'Open now' : 'Closed now')
              : '',
            rating:        place.rating ? `★ ${place.rating}` : '',
          },
        });
      }
    } catch { /* continue */ }
  }

  // Deduplicate by name
  const seen = new Set();
  return allResults.filter(el => {
    if (seen.has(el.tags.name)) return false;
    seen.add(el.tags.name);
    return true;
  });
}

// ── Overpass fallback ─────────────────────────────────────────────────────────
async function queryOverpass(overpassQuery) {
  const body    = `[out:json][timeout:20];\n(\n${overpassQuery}\n);\nout center 40;`;
  const encoded = 'data=' + encodeURIComponent(body);

  // Race all mirrors in parallel, take first with results
  const tryMirror = async (url) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body:   encoded,
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (!res.ok) throw new Error('bad status');
      const data     = await res.json();
      const elements = data.elements || [];
      if (elements.length === 0) throw new Error('empty');
      return elements;
    } catch (e) { clearTimeout(t); throw e; }
  };

  try {
    return await Promise.any(OVERPASS_MIRRORS.map(tryMirror));
  } catch {
    return [];
  }
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

  // 1. Try Google Places (fast, accurate, has addresses)
  let elements = null;
  if (key) {
    try {
      elements = await queryGooglePlaces(lat, lng, feature, key);
    } catch { elements = null; }
  }

  // 2. Fall back to Overpass if Google Places returned nothing
  if (!elements || elements.length === 0) {
    elements = await queryOverpass(OVERPASS_QUERY[feature](lat, lng));
  }

  return json({ elements: elements || [], feature, count: (elements || []).length });
}
