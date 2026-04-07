export const config = { runtime: 'edge' };

function haversineMi(lat1, lon1, lat2, lon2) {
  const R = 3958.8, toR = d => d * Math.PI / 180;
  const dLat = toR(lat2 - lat1), dLon = toR(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Expansion radius tiers per feature (metres) ───────────────────────────────
const RADIUS_TIERS = {
  food:     [800,  1600, 4000, 8000, 15000],
  bars:     [800,  1600, 4000, 8000, 15000],
  coffee:   [1000, 2000, 4000, 8000, 15000],
  gym:      [1200, 2500, 5000, 10000, 20000],
  shopping:      [2000, 4000, 8000, 16000, 25000],
  entertainment: [2000, 4000, 8000, 16000, 25000],
};

// ── Google Places type mappings ───────────────────────────────────────────────
const GOOGLE_TYPES = {
  food:     ['restaurant'],
  bars:     ['bar'],
  coffee:   ['cafe'],
  gym:      ['gym'],
  shopping:      ['shopping_mall', 'department_store'],
  entertainment: ['movie_theater', 'bowling_alley', 'amusement_park'],
};

// ── Overpass fallback queries (radius is passed in) ───────────────────────────
const OVERPASS_QUERY = {
  food: (lat, lng, r) => `
    node["amenity"~"restaurant|fast_food|food_court|diner|bistro|canteen"](around:${r},${lat},${lng});
    way["amenity"~"restaurant|fast_food|food_court|diner|bistro"](around:${r},${lat},${lng});`,

  bars: (lat, lng, r) => `
    node["amenity"~"bar|pub|biergarten|nightclub|lounge|brewery|tavern"](around:${r},${lat},${lng});
    way["amenity"~"bar|pub|biergarten|nightclub|lounge"](around:${r},${lat},${lng});`,

  coffee: (lat, lng, r) => `
    node["amenity"="cafe"](around:${r},${lat},${lng});
    way["amenity"="cafe"](around:${r},${lat},${lng});
    node["brand"~"Starbucks|Dunkin|Tim Hortons|Peet|Blue Bottle|Gregorys",i](around:${r},${lat},${lng});
    node["name"~"Coffee|Cafe|Espresso|Brew|Roast|Latte",i](around:${r},${lat},${lng});`,

  gym: (lat, lng, r) => `
    node["leisure"~"fitness_centre|sports_centre"](around:${r},${lat},${lng});
    way["leisure"~"fitness_centre|sports_centre"](around:${r},${lat},${lng});
    node["name"~"Gym|Fitness|Planet Fitness|LA Fitness|Equinox|CrossFit|YMCA|Sculpt|Orangetheory|Crunch|Anytime",i](around:${r},${lat},${lng});
    way["name"~"Gym|Fitness|Sculpt|Equinox|CrossFit|Orangetheory|Crunch",i](around:${r},${lat},${lng});`,

  shopping: (lat, lng, r) => `
    way["leisure"="shopping_centre"](around:${r},${lat},${lng});
    relation["leisure"="shopping_centre"](around:${r},${lat},${lng});
    node["shop"~"mall|department_store|supermarket|clothing|electronics"](around:${r},${lat},${lng});
    way["shop"~"mall|department_store|supermarket"](around:${r},${lat},${lng});
    way["name"~"Mall|Plaza|Centre|Center|Newport|Galleria|Outlet",i](around:${r},${lat},${lng});
    relation["name"~"Mall|Plaza|Centre|Center|Newport|Galleria",i](around:${r},${lat},${lng});`,

  entertainment: (lat, lng, r) => `
    node["amenity"="cinema"](around:${r},${lat},${lng});
    way["amenity"="cinema"](around:${r},${lat},${lng});
    node["leisure"="bowling_alley"](around:${r},${lat},${lng});
    way["leisure"="bowling_alley"](around:${r},${lat},${lng});
    node["leisure"~"amusement_arcade|escape_game|miniature_golf|indoor_play"](around:${r},${lat},${lng});
    way["leisure"~"amusement_arcade|escape_game|miniature_golf|indoor_play"](around:${r},${lat},${lng});
    node["leisure"="playground"]["indoor"="yes"](around:${r},${lat},${lng});
    node["amenity"="theatre"](around:${r},${lat},${lng});
    way["amenity"="theatre"](around:${r},${lat},${lng});
    node["sport"~"golf|bowling|billiards|laser_tag|climbing"](around:${r},${lat},${lng});
    way["sport"~"golf|bowling|billiards|laser_tag|climbing"](around:${r},${lat},${lng});
    node["name"~"Cinema|Theater|Theatre|Bowling|Golf|Arcade|Laser|Escape|Trampoline|Topgolf|Dave|Buster|Chuck|Regal|AMC|IMAX|Cineplex|Odeon|Cineworld",i](around:${r},${lat},${lng});
    way["name"~"Cinema|Theater|Theatre|Bowling|Golf|Arcade|Laser|Escape|Trampoline|Topgolf",i](around:${r},${lat},${lng});`,
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

function fmtRadius(metres) {
  return metres >= 1000 ? `${(metres / 1000).toFixed(1).replace(/\.0$/, '')} km` : `${metres} m`;
}

// ── Places Details: today's hours for one place ───────────────────────────────
async function fetchPlaceHours(placeId, key) {
  try {
    const ctrl = new AbortController();
    const t    = setTimeout(() => ctrl.abort(), 6000);
    const res  = await fetch(
      `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=opening_hours&key=${key}`,
      { signal: ctrl.signal }
    );
    clearTimeout(t);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== 'OK') return null;
    const oh = data.result?.opening_hours;
    if (!oh) return null;
    const todayIdx   = (new Date().getDay() + 6) % 7; // Mon=0 … Sun=6
    const todayHours = (oh.weekday_text?.[todayIdx] || '').replace(/^[^:]+:\s*/, '').trim();
    return { open_now: oh.open_now, today_hours: todayHours || null };
  } catch { return null; }
}

// ── Google Places Nearby Search at a specific radius ─────────────────────────
async function queryGooglePlaces(lat, lng, feature, key, radius) {
  const types = GOOGLE_TYPES[feature];
  if (!types || !key) return null;

  const rawPlaces = [];

  await Promise.all(types.map(async type => {
    try {
      const ctrl = new AbortController();
      const t    = setTimeout(() => ctrl.abort(), 10000);
      const res  = await fetch(
        `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}&type=${type}&key=${key}`,
        { signal: ctrl.signal }
      );
      clearTimeout(t);
      if (!res.ok) return;
      const data = await res.json();
      if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') return;
      for (const place of (data.results || [])) {
        rawPlaces.push({
          placeId:  place.place_id,
          name:     place.name || '',
          lat:      place.geometry.location.lat,
          lon:      place.geometry.location.lng,
          vicinity: place.vicinity || '',
          open_now: place.opening_hours?.open_now,
          rating:   place.rating ?? null,
        });
      }
    } catch { /* skip */ }
  }));

  if (rawPlaces.length === 0) return null;

  // Sort by distance, deduplicate by name, take top 15
  rawPlaces.sort((a, b) => haversineMi(lat, lng, a.lat, a.lon) - haversineMi(lat, lng, b.lat, b.lon));
  const seen = new Set();
  const top  = rawPlaces
    .filter(p => { if (!p.name || seen.has(p.name)) return false; seen.add(p.name); return true; })
    .slice(0, 15);

  // Fetch today's hours in parallel
  const hoursResults = await Promise.all(top.map(p => fetchPlaceHours(p.placeId, key)));

  return top.map((p, i) => {
    const hours      = hoursResults[i];
    const open_now   = hours?.open_now ?? p.open_now;
    const todayHours = hours?.today_hours || null;
    const openStatus = open_now === true ? 'Open now' : open_now === false ? 'Closed now' : '';
    return {
      type: 'node', lat: p.lat, lon: p.lon,
      tags: {
        name:          p.name,
        'addr:full':   p.vicinity,
        open_status:   openStatus,
        today_hours:   todayHours || '',
        rating:        p.rating ? `★ ${p.rating}` : '',
      },
    };
  });
}

// ── Overpass fallback at a specific radius ────────────────────────────────────
async function queryOverpass(overpassQuery) {
  const body    = `[out:json][timeout:20];\n(\n${overpassQuery}\n);\nout center 40;`;
  const encoded = 'data=' + encodeURIComponent(body);
  const tryMirror = async url => {
    const ctrl = new AbortController();
    const t    = setTimeout(() => ctrl.abort(), 15000);
    try {
      const res  = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: encoded, signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) throw new Error('bad status');
      const data = await res.json();
      const els  = data.elements || [];
      if (els.length === 0) throw new Error('empty');
      return els;
    } catch (e) { clearTimeout(t); throw e; }
  };
  try { return await Promise.any(OVERPASS_MIRRORS.map(tryMirror)); }
  catch { return []; }
}

// ── Ticketmaster Discovery API — public events in next 7 days ────────────────
async function queryTicketmaster(lat, lng, apiKey) {
  try {
    const ctrl  = new AbortController();
    setTimeout(() => ctrl.abort(), 10000);

    const now   = new Date();
    const end   = new Date(now); end.setDate(end.getDate() + 7);
    const fmt   = d => d.toISOString().replace(/\.\d{3}Z$/, 'Z');

    // 2 miles — hyper-local, excludes across-river cities entirely
    const url = `https://app.ticketmaster.com/discovery/v2/events.json` +
      `?apikey=${apiKey}` +
      `&latlong=${lat},${lng}` +
      `&radius=2&unit=miles` +
      `&startDateTime=${fmt(now)}` +
      `&endDateTime=${fmt(end)}` +
      `&size=50` +
      `&sort=date,asc`;

    const res  = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return [];
    const data = await res.json();
    const evts = data?._embedded?.events || [];

    const mapped = evts.map(e => {
      const venue    = e._embedded?.venues?.[0] || {};
      const vAddr    = venue.address?.line1 || '';
      const vCity    = venue.city?.name || '';
      const vState   = venue.state?.stateCode || '';
      const address  = [vAddr, vCity, vState].filter(Boolean).join(', ');
      const vLat     = parseFloat(venue.location?.latitude)  || lat;
      const vLng     = parseFloat(venue.location?.longitude) || lng;

      const distMi   = haversineMi(lat, lng, vLat, vLng);

      const cls      = e.classifications?.[0] || {};
      const segment  = cls.segment?.name || '';
      const genre    = cls.genre?.name    || '';
      const category = [segment, genre].filter(Boolean).filter(s => s !== 'Undefined').join(' · ');

      const prices   = e.priceRanges || [];
      const isFree   = prices.length === 0 || prices.some(p => p.min === 0);
      const minPrice = prices.length ? Math.min(...prices.map(p => p.min ?? 0)) : null;
      const maxPrice = prices.length ? Math.max(...prices.map(p => p.max ?? 0)) : null;
      const currency = prices[0]?.currency || 'USD';
      const priceLabel = isFree && minPrice === 0 ? 'Free'
        : minPrice !== null && maxPrice !== null && minPrice !== maxPrice
          ? `$${minPrice}–$${maxPrice} ${currency}`
          : minPrice !== null ? `$${minPrice} ${currency}` : null;

      const startLocal = e.dates?.start?.localDate || '';
      const startTime  = e.dates?.start?.localTime  || '';
      const tbd        = e.dates?.start?.timeTBA || e.dates?.start?.dateTBD;

      // Format date: "Sat Apr 12 · 7:30 PM"
      let dateLabel = '';
      let sortKey   = startLocal + (startTime || '');
      if (startLocal) {
        const d = new Date(`${startLocal}T${startTime || '00:00:00'}`);
        dateLabel = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        if (startTime && !tbd) {
          dateLabel += ' · ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        }
      }

      return {
        _key:    `${(e.name || '').toLowerCase().trim()}|||${(venue.name || '').toLowerCase().trim()}`,
        _sortKey: sortKey,
        _distMi: distMi,
        type: 'event',
        lat: vLat, lon: vLng,
        tags: {
          name:        e.name || 'Event',
          'addr:full': address,
          venue_name:  venue.name || '',
          category,
          date_label:  dateLabel,
          is_free:     isFree,
          price_label: priceLabel,
          ticket_url:  e.url || '',
          dist_label:  distMi < 0.1 ? `${Math.round(distMi * 5280)} ft` : `${distMi.toFixed(1)} mi`,
        },
      };
    });

    // Deduplicate: group by name+venue — keep earliest showtime, note extra slots
    const grouped = new Map();
    for (const ev of mapped) {
      if (!grouped.has(ev._key)) {
        grouped.set(ev._key, { ev, count: 1 });
      } else {
        const g = grouped.get(ev._key);
        // Keep earliest showtime
        if (ev._sortKey < g.ev._sortKey) g.ev = ev;
        g.count++;
      }
    }

    return Array.from(grouped.values())
      .sort((a, b) => a.ev._distMi - b.ev._distMi)   // nearest venue first
      .map(({ ev, count }) => {
        if (count > 1) ev.tags.showtimes = `${count} showtimes`;
        delete ev._key; delete ev._sortKey; delete ev._distMi;
        return ev;
      });
  } catch (e) {
    console.error('Ticketmaster error:', e.message);
    return [];
  }
}

// ── Handler: try each radius tier until results found ────────────────────────
export default async function handler(req) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return json({ error: 'Method not allowed' }, 405);
  }

  let lat, lng, feature;
  if (req.method === 'POST') {
    try { ({ lat, lng, feature } = await req.json()); } catch { return json({ error: 'Bad request' }, 400); }
  } else {
    const p = new URL(req.url).searchParams;
    lat = parseFloat(p.get('lat')); lng = parseFloat(p.get('lng')); feature = p.get('feature');
  }

  if (!lat || !lng || !feature) return json({ error: 'Missing params' }, 400);

  // ── Events: Ticketmaster API, not Places/Overpass ─────────────────────────
  if (feature === 'events') {
    const tmKey = process.env.TICKETMASTER_API_KEY || '';
    if (!tmKey) return json({ error: 'TICKETMASTER_API_KEY not configured', noKey: true }, 200);
    const events = await queryTicketmaster(lat, lng, tmKey);
    return json({ elements: events, feature, count: events.length, isEvents: true, expanded: false, radiusLabel: '25 mi' });
  }

  if (!OVERPASS_QUERY[feature]) return json({ error: 'Invalid feature' }, 400);

  const key   = process.env.GOOGLE_MAPS_API_KEY || '';
  const tiers = RADIUS_TIERS[feature];
  let elements    = null;
  let usedRadius  = tiers[0];
  let expanded    = false;

  for (const radius of tiers) {
    usedRadius = radius;

    // 1. Try Google Places at this radius
    if (key) {
      try { elements = await queryGooglePlaces(lat, lng, feature, key, radius); } catch { elements = null; }
    }

    // 2. Overpass fallback at same radius if Places returned nothing
    if (!elements || elements.length === 0) {
      elements = await queryOverpass(OVERPASS_QUERY[feature](lat, lng, radius));
    }

    if (elements && elements.length > 0) break;
    expanded = true; // will expand to next tier
  }

  return json({
    elements:    elements || [],
    feature,
    count:       (elements || []).length,
    searchRadius: usedRadius,
    radiusLabel:  fmtRadius(usedRadius),
    expanded,                          // true when default radius had no results
  });
}
