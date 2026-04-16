export const config = { runtime: 'edge' };

function haversineMi(lat1, lon1, lat2, lon2) {
  const R = 3958.8, toR = d => d * Math.PI / 180;
  const dLat = toR(lat2 - lat1), dLon = toR(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Format a distance value based on unit preference
function fmtDist(mi, units) {
  if (units === 'imperial') {
    return mi < 0.1 ? `${Math.round(mi * 5280)} ft` : `${mi.toFixed(2)} mi`;
  }
  const km = mi * 1.60934;
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

// Format a radius in metres for display
function fmtRadius(metres, units) {
  if (units === 'imperial') {
    const mi = metres * 0.000621371;
    return mi < 0.1 ? `${Math.round(metres * 3.28084)} ft` : `${mi.toFixed(1)} mi`;
  }
  return metres >= 1000 ? `${(metres / 1000).toFixed(1).replace(/\.0$/, '')} km` : `${metres} m`;
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
    const t    = setTimeout(() => ctrl.abort(), 12000); // covers connect + body read
    try {
      const res  = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: encoded, signal: ctrl.signal });
      if (!res.ok) throw new Error('bad status');
      const data = await res.json(); // abort signal still active during body read
      clearTimeout(t);
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

    // 3 miles — local but enough for suburban areas
    const url = `https://app.ticketmaster.com/discovery/v2/events.json` +
      `?apikey=${apiKey}` +
      `&latlong=${lat},${lng}` +
      `&radius=3&unit=miles` +
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

      const prices    = e.priceRanges || [];
      const hasPrice  = prices.length > 0;
      const minPrice  = hasPrice ? Math.min(...prices.map(p => p.min ?? 0)) : null;
      const maxPrice  = hasPrice ? Math.max(...prices.map(p => p.max ?? 0)) : null;
      const currency  = prices[0]?.currency || 'USD';
      // Only "Free" when Ticketmaster explicitly returns $0 max — missing price data ≠ free
      const isFree    = hasPrice && maxPrice === 0;
      const isUnknown = !hasPrice; // no price data returned at all → show "Check Price"
      const priceLabel = isFree   ? 'Free'
        : !hasPrice               ? null   // unknown — handled separately in UI
        : minPrice !== null && maxPrice !== null && minPrice !== maxPrice
          ? `$${minPrice}–$${maxPrice} ${currency}`
          : minPrice !== null     ? `From $${minPrice} ${currency}` : null;

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

      // Normalize name: strip ticket-type suffixes, city suffixes, leading "The"
      const normName = (e.name || '').toLowerCase()
        .replace(/\s*[-–:]\s*(flexiticket|tickets?|general admission|admission|entry|experience).*$/i, '')
        .replace(/^the\s+/i, '')
        .replace(/\s+(new york|nyc|nj|manhattan|brooklyn|jersey city|chicago|la|los angeles)[!,.]?$/i, '')
        .replace(/[!.,?'"]/g, '')
        .replace(/\s+/g, ' ').trim();
      const normVenue = (venue.name || '').toLowerCase().replace(/[!.,?'"]/g, '').replace(/\s+/g, ' ').trim();

      return {
        _key:    `${normName}|||${normVenue}`,
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
          is_free:      isFree,
          is_unknown:   isUnknown,
          price_label:  priceLabel,
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

// ── PATH Train real-time departures (PANYNJ public API) ──────────────────────
const PATH_CODE_MAP = {
  'exchange place':     'EXP', 'grove street': 'GRV', 'grove st': 'GRV',
  'journal square':     'JSQ', 'newport':      'NEW', 'hoboken':  'HOB',
  'harrison':           'HAR', 'newark':       'NWK',
  'world trade center': 'WTC', 'wtc':          'WTC',
  'christopher':        'CHR', '9th street':   '09S', '9th st':   '09S',
  '14th street':        '14S', '14th st':      '14S',
  '23rd street':        '23S', '23rd st':      '23S',
  '33rd street':        '33S', '33rd st':      '33S',
};

// Official station display names — used to normalize "C Columbus Drive at Grove St" → "Grove Street"
const PATH_STATION_NAMES = {
  EXP: 'Exchange Place',        GRV: 'Grove Street',
  JSQ: 'Journal Square',        NEW: 'Newport',
  HOB: 'Hoboken Terminal',      HAR: 'Harrison',
  NWK: 'Newark',                WTC: 'World Trade Center',
  CHR: 'Christopher Street',   '09S': '9th Street',
  '14S': '14th Street',        '23S': '23rd Street',
  '33S': '33rd Street',
};

async function fetchPathRealtime() {
  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch('https://www.panynj.gov/bin/portauthority/ridepath.json', { signal: ctrl.signal });
    if (!res.ok) return null;
    const data = await res.json();
    const table = {};
    for (const r of (data.results || [])) {
      table[r.consideredStation] = r.destinations || [];
    }
    return table;
  } catch { return null; }
}

function pathDeparturesForStation(code, table) {
  if (!table || !table[code]) return [];
  const departures = [];
  for (const dest of table[code]) {
    for (const msg of (dest.messages || []).slice(0, 2)) {
      const secs = parseInt(msg.secondsToArrival || '0');
      const mins = Math.round(secs / 60);
      departures.push({
        headsign: msg.target || dest.label,
        arrival:  mins <= 1 ? 'Due' : `${mins} min`,
        color:    msg.lineColor || '#004B87',
      });
    }
  }
  return departures.sort((a, b) => {
    const av = a.arrival === 'Due' ? 0 : parseInt(a.arrival);
    const bv = b.arrival === 'Due' ? 0 : parseInt(b.arrival);
    return av - bv;
  }).slice(0, 4);
}

// ── OSM bus route lookup — finds routes serving a stop via Overpass ──────────
const OSM_OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

async function getOsmBusRoutes(slat, slon) {
  // Find bus/tram stop nodes near the point, then find route relations containing them
  const query = `[out:json][timeout:6];`
    + `(node["highway"="bus_stop"](around:80,${slat},${slon});`
    + `node["public_transport"="stop_position"](around:80,${slat},${slon});)->.s;`
    + `relation["route"~"^(bus|tram|trolleybus)$"](bn.s);out tags;`;
  for (const ep of OSM_OVERPASS) {
    try {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 6000);
      const res = await fetch(ep, {
        method: 'POST',
        body: `data=${encodeURIComponent(query)}`,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        signal: ctrl.signal,
      });
      if (!res.ok) continue;
      const data = await res.json();
      const routes = (data.elements || [])
        .map(r => ({
          ref:  (r.tags?.ref  || '').trim(),
          to:   (r.tags?.to   || r.tags?.destination || '').trim(),
          from: (r.tags?.from || '').trim(),
        }))
        .filter(r => r.ref) // must have a route number
        .filter((r, i, arr) => arr.findIndex(x => x.ref === r.ref && x.to === r.to) === i) // dedup
        .sort((a, b) => {
          const na = parseInt(a.ref) || 9999, nb = parseInt(b.ref) || 9999;
          return na - nb || a.ref.localeCompare(b.ref);
        })
        .slice(0, 8);
      return routes; // return even if empty — we got a valid response
    } catch {}
  }
  return [];
}

// ── Google Directions API (transit/bus) — real-time departure schedules ───────
// Calls Directions API from user's location to nearest transit hub.
// Returns a map of "lat4,lng4" → [{route, headsign, departureText, departureTs}]
// keyed by the departure stop coordinates (4 decimal places ≈ 11m precision).
async function getBusSchedulesNearUser(userLat, userLng, destLat, destLng, googleKey) {
  const now = Math.floor(Date.now() / 1000);
  const url = `https://maps.googleapis.com/maps/api/directions/json`
    + `?origin=${userLat},${userLng}`
    + `&destination=${destLat},${destLng}`
    + `&mode=transit&transit_mode=bus`
    + `&departure_time=${now}&alternatives=true`
    + `&key=${googleKey}`;
  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return {};
    const data = await res.json();
    const stopMap = {};
    for (const route of (data.routes || [])) {
      for (const leg of (route.legs || [])) {
        for (const step of (leg.steps || [])) {
          if (step.travel_mode !== 'TRANSIT') continue;
          const td = step.transit_details;
          if (!td) continue;
          const vType = td.line?.vehicle?.type;
          if (vType !== 'BUS' && vType !== 'TRAM') continue;
          const stopLat = td.departure_stop?.location?.lat;
          const stopLng = td.departure_stop?.location?.lng;
          if (!stopLat || !stopLng) continue;
          const key = `${stopLat.toFixed(4)},${stopLng.toFixed(4)}`;
          if (!stopMap[key]) stopMap[key] = [];
          const entry = {
            route:         td.line?.short_name || td.line?.name || '?',
            headsign:      td.headsign || '',
            departureText: td.departure_time?.text || '',
            departureTs:   td.departure_time?.value || 0,
          };
          // dedup: same route + same departure time
          if (!stopMap[key].some(d => d.route === entry.route && d.departureTs === entry.departureTs)) {
            stopMap[key].push(entry);
          }
        }
      }
    }
    return stopMap;
  } catch {
    return {};
  }
}

// ── Transit: Google Places stations + PATH real-time, with radius expansion ───
const TRANSIT_TIERS = [800, 1600, 3200, 8000, 16000]; // metres

// Generic country/region strings Google Places puts in `vicinity` for bus stops
const USELESS_VICINITY = new Set([
  'united states', 'new jersey', 'new york', 'usa', 'us', 'nj', 'ny',
]);

function cleanVicinity(v) {
  if (!v) return '';
  const norm = v.toLowerCase().trim();
  if (USELESS_VICINITY.has(norm)) return '';
  // If it's just a two-word country/region combo (e.g. "New Jersey, United States") drop it
  if (/^[a-z\s]+,\s*[a-z\s]+$/.test(norm) && norm.split(',').every(p => USELESS_VICINITY.has(p.trim()))) return '';
  return v;
}

// Normalise a stop name for duplicate detection: lowercase, strip direction suffixes,
// remove punctuation so "(inbound)" / "(outbound)" / "- 1" variants collapse
function normStopName(name) {
  return name.toLowerCase()
    .replace(/\b(inbound|outbound|nb|sb|eb|wb|northbound|southbound|eastbound|westbound)\b/g, '')
    .replace(/[-–—()\[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function queryTransitAtRadius(lat, lng, googleKey, radiusM) {
  const [pathTable, ...placeArrays] = await Promise.all([
    fetchPathRealtime(),
    ...['transit_station', 'subway_station', 'bus_station'].map(async type => {
      try {
        const ctrl = new AbortController();
        setTimeout(() => ctrl.abort(), 8000);
        const res = await fetch(
          `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radiusM}&type=${type}&key=${googleKey}`,
          { signal: ctrl.signal }
        );
        if (!res.ok) return [];
        const data = await res.json();
        return data.results || [];
      } catch { return []; }
    }),
  ]);

  // Step 1: dedup by place_id (same result from multiple type queries)
  const seenId = new Set();
  const raw = placeArrays.flat()
    .filter(p => { if (seenId.has(p.place_id)) return false; seenId.add(p.place_id); return true; })
    .map(p => ({
      name:     p.name || 'Station',
      lat:      p.geometry.location.lat,
      lon:      p.geometry.location.lng,
      vicinity: cleanVicinity(p.vicinity || ''),
      types:    p.types || [],
    }))
    // Sort by distance first so "keep first" = keep closest
    .sort((a, b) => haversineMi(lat, lng, a.lat, a.lon) - haversineMi(lat, lng, b.lat, b.lon));

  // Step 2: dedup by exact name (case-insensitive) regardless of distance.
  // Bus stops on opposite sides of a boulevard share the same name — keep the closest.
  const seenName = new Set();
  const nameDeduped = raw.filter(s => {
    const key = s.name.toLowerCase().trim();
    if (seenName.has(key)) return false;
    seenName.add(key);
    return true;
  });

  // Step 3: dedup by normalised name + 160m proximity to catch "(inbound)"/"(outbound)" variants
  const deduped = [];
  for (const s of nameDeduped) {
    const norm = normStopName(s.name);
    const isDup = deduped.some(d =>
      haversineMi(d.lat, d.lon, s.lat, s.lon) < 0.1 && normStopName(d.name) === norm
    );
    if (!isDup) deduped.push(s);
  }

  const stations = deduped.slice(0, 8);

  return { stations, pathTable };
}

async function queryTransit(lat, lng, googleKey, units) {
  if (!googleKey) return { elements: [], radiusLabel: '', expanded: false };

  let stations = [], pathTable = null, usedRadius = TRANSIT_TIERS[0], expanded = false;

  for (const radius of TRANSIT_TIERS) {
    usedRadius = radius;
    const result = await queryTransitAtRadius(lat, lng, googleKey, radius);
    if (result.stations.length > 0) { stations = result.stations; pathTable = result.pathTable; break; }
    expanded = true;
  }

  // Annotate each station with pathCode and isBus before dedup
  const annotated = stations.map(s => {
    const nameL = s.name.toLowerCase();
    let pathCode = null;
    for (const [keyword, code] of Object.entries(PATH_CODE_MAP)) {
      if (nameL.includes(keyword)) { pathCode = code; break; }
    }
    const isBus = !pathCode &&
      (s.types.includes('bus_station') || nameL.includes('bus') ||
       (!s.types.includes('subway_station') && !s.types.includes('train_station')));
    return { ...s, pathCode, isBus };
  });

  // Dedup PATH stations by pathCode — multiple Google Places entries for the same
  // physical station (e.g. "Grove St" + "C Columbus Drive at Grove St") share a code;
  // keep only the closest and replace the name with the canonical station name.
  const seenPath = new Set();
  const stationsDeduped = annotated.filter(s => {
    if (!s.pathCode) return true; // non-PATH always kept here
    if (seenPath.has(s.pathCode)) return false;
    seenPath.add(s.pathCode);
    return true;
  });

  const busStops = stationsDeduped.filter(s => s.isBus);

  // Nearest non-bus station (PATH/Subway/Train) used as Directions API destination
  // so we get scheduled bus departures from stops near the user heading toward transit
  const transitHub = stationsDeduped.find(s => !s.isBus);

  // Run OSM route lookup + Google Directions bus schedules in parallel
  const [osmRouteResults, dirSchedules] = await Promise.all([
    Promise.all(busStops.map(s => getOsmBusRoutes(s.lat, s.lon).catch(() => []))),
    transitHub
      ? getBusSchedulesNearUser(lat, lng, transitHub.lat, transitHub.lon, googleKey).catch(() => ({}))
      : Promise.resolve({}),
  ]);
  const osmRouteMap = new Map(busStops.map((s, i) => [s, osmRouteResults[i]]));

  const elements = stationsDeduped.map(s => {
    const distMi    = haversineMi(lat, lng, s.lat, s.lon);
    const distLabel = fmtDist(distMi, units);
    const departures = s.pathCode ? pathDeparturesForStation(s.pathCode, pathTable) : [];

    const transitType = s.pathCode
      ? 'PATH Train'
      : s.types.includes('subway_station')                           ? 'Subway'
      : s.types.includes('train_station')                            ? 'Train'
      : s.name.toLowerCase().includes('light rail')                  ? 'Light Rail'
      : s.name.toLowerCase().includes('ferry')                       ? 'Ferry'
      : s.isBus                                                      ? 'Bus Stop'
      : 'Transit';

    const displayName = s.pathCode && PATH_STATION_NAMES[s.pathCode]
      ? PATH_STATION_NAMES[s.pathCode]
      : s.name;

    const gmapsTransitUrl = s.isBus
      ? `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lon}&travelmode=transit`
      : null;

    // OSM routes = route numbers + destinations (fallback when no live times)
    const routes = s.isBus ? (osmRouteMap.get(s) || []) : [];

    // Google Directions schedules = same-day departure times matched by stop proximity (< 160m)
    let schedules = [];
    if (s.isBus) {
      for (const [key, deps] of Object.entries(dirSchedules)) {
        const [sLat, sLng] = key.split(',').map(Number);
        if (haversineMi(s.lat, s.lon, sLat, sLng) < 0.1) schedules.push(...deps);
      }
      schedules.sort((a, b) => a.departureTs - b.departureTs);
      schedules = schedules.slice(0, 5);
    }

    return {
      lat: s.lat, lon: s.lon,
      name: displayName,
      address: s.vicinity,
      transitType,
      distLabel,
      departures,
      routes,
      schedules,
      gmapsTransitUrl,
    };
  });

  return { elements, radiusLabel: fmtRadius(usedRadius, units), expanded };
}

// ── Handler: try each radius tier until results found ────────────────────────
export default async function handler(req) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return json({ error: 'Method not allowed' }, 405);
  }

  let lat, lng, feature, units;
  if (req.method === 'POST') {
    try { ({ lat, lng, feature, units } = await req.json()); } catch { return json({ error: 'Bad request' }, 400); }
  } else {
    const p = new URL(req.url).searchParams;
    lat = parseFloat(p.get('lat')); lng = parseFloat(p.get('lng')); feature = p.get('feature'); units = p.get('units') || 'metric';
  }
  units = units || 'metric';

  if (!lat || !lng || !feature) return json({ error: 'Missing params' }, 400);

  // ── Transit: Google Places + PATH real-time ──────────────────────────────
  if (feature === 'transit') {
    const googleKey = process.env.GOOGLE_MAPS_API_KEY || '';
    const { elements, radiusLabel, expanded } = await queryTransit(lat, lng, googleKey, units);
    return json({ elements, feature, count: elements.length, isTransit: true, radiusLabel, expanded });
  }

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
    radiusLabel:  fmtRadius(usedRadius, units),
    expanded,                          // true when default radius had no results
  });
}
