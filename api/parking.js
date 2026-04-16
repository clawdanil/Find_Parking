const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

// ── Haversine distance in miles ───────────────────────────────────────────────
function haversineMi(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const toRad = x => x * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDist(mi) {
  return mi < 0.1 ? `${Math.round(mi * 5280)} ft` : `${mi.toFixed(2)} mi`;
}

// Normalize an address to "housenum + street" for duplicate detection.
// Strips city/state/country suffix, abbreviates common words, removes punctuation.
function normAddr(s) {
  if (!s?.address) return '';
  return s.address
    .toLowerCase()
    // Drop city/state/country portion after first comma
    .replace(/,.*$/, '')
    // Expand or normalize common abbreviations so "st" == "street"
    .replace(/\bstreet\b/g, 'st')
    .replace(/\bavenue\b/g, 'ave')
    .replace(/\bboulevard\b/g, 'blvd')
    .replace(/\broad\b/g, 'rd')
    .replace(/\bdrive\b/g, 'dr')
    .replace(/\blane\b/g, 'ln')
    .replace(/\bplace\b/g, 'pl')
    // Remove all punctuation
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Street-side/lane tags are road designations, not actual parking facilities — skip them
const ROAD_PARKING_TYPES = new Set(['street_side','lane','on_street','half_on_kerb','shoulder','street','lay_by']);

// ── Map OSM tags → our 4 parking types ───────────────────────────────────────
function osmToType(tags) {
  const p      = (tags.parking || '').toLowerCase();
  const hasFee = tags.fee === 'yes';

  if (['multi-storey', 'underground', 'garage', 'rooftop', 'multistorey'].includes(p)) return 'GARAGE';
  if (p === 'surface') return hasFee ? 'PAID_LOT' : 'FREE_STREET';
  if (hasFee) return 'PAID_LOT';
  return 'PAID_LOT';
}

function osmToAvgCost(tags, type) {
  if (tags.charge) return tags.charge;
  if (type === 'FREE_STREET') return 'Free';
  if (type === 'PAID_STREET')  return '~$2–4/hr';
  if (type === 'PAID_LOT')     return '~$10–20/day';
  if (type === 'GARAGE')       return '~$15–30/day';
  return 'Varies';
}

function osmToAddress(tags) {
  // Only return a real street address — NOT the facility name
  if (tags['addr:housenumber'] && tags['addr:street'])  return `${tags['addr:housenumber']} ${tags['addr:street']}`;
  if (tags['addr:street'])                              return tags['addr:street'];
  return null;
}

// Returns the human-readable facility name (e.g. "South Garage")
function osmFacilityName(tags) {
  if (tags.name)     return tags.name;
  if (tags.operator) return tags.operator;
  return null;
}

function osmToNotes(tags) {
  const parts = [];
  if (tags.capacity)       parts.push(`${tags.capacity} spaces`);
  if (tags.opening_hours)  parts.push(tags.opening_hours);
  if (tags.operator && tags.operator !== tags.name) parts.push(tags.operator);
  return parts.join(' · ');
}

// ── Convert one OSM element to our spot format ────────────────────────────────
function osmElementToSpot(el, searchLat, searchLon, idx) {
  const tags = el.tags || {};
  const lat  = el.lat   ?? el.center?.lat;
  const lon  = el.lon   ?? el.center?.lon;
  if (!lat || !lon) return null;

  // Skip private / restricted access
  const access = (tags.access || '').toLowerCase();
  if (['private', 'customers', 'permit', 'no', 'delivery'].includes(access)) return null;

  // Skip road-designation entries (street_side, lane, etc.) — these are road tags,
  // not actual parking facilities. They show up as regular streets in street view.
  const pTag = (tags.parking || '').toLowerCase();
  if (ROAD_PARKING_TYPES.has(pTag)) return null;

  const type = osmToType(tags);
  const dist = haversineMi(searchLat, searchLon, lat, lon);

  const typeLabels = {
    FREE_STREET: 'Free Street Parking',
    PAID_STREET: 'Metered Street Parking',
    PAID_LOT:    'Paid Parking Lot',
    GARAGE:      'Parking Garage',
  };

  const streetAddr   = osmToAddress(tags);      // e.g. "401 Washington Blvd"
  const facilityName = osmFacilityName(tags);   // e.g. "South Garage"
  const hasRealAddr  = !!streetAddr;

  return {
    id:                   idx + 1,
    type,
    // Show real street address when available; fall back to facility name or generic label
    address:              streetAddr || facilityName || typeLabels[type],
    // Expose facility name as landmark so the card can show both
    side:                 '',
    landmark:             facilityName && facilityName !== streetAddr ? facilityName : '',
    lat,
    lng:                  lon,
    heading:              0,
    avg_cost:             osmToAvgCost(tags, type),
    time_limit:           tags.maxstay || '',
    permit_required:      false,
    permit_zone:          'None',
    sweeping_schedule:    'None',
    overnight_parking:    tags.overnight === 'yes' ? 'Allowed' : tags.overnight === 'no' ? 'Not allowed' : '',
    distance_from_search: formatDist(dist),
    notes:                osmToNotes(tags),
    source:               'osm',
    _distMi:              dist,
    // Always enrich when no proper housenumber+street found — even if we have a name
    _needsAddress:        !hasRealAddr,
    _osmType:             el.type,
    _osmId:               el.id,
  };
}

// ── Reverse geocode one spot via Google → clean address with house number ─────
async function googleReverseGeocode(lat, lng, key) {
  try {
    const ctrl = new AbortController();
    const t    = setTimeout(() => ctrl.abort(), 4000);
    const res  = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${key}`,
      { signal: ctrl.signal }
    );
    if (!res.ok) { clearTimeout(t); return null; }
    const data = await res.json();
    clearTimeout(t);
    if (data.status !== 'OK' || !data.results?.length) return null;

    const get = (result, type) =>
      result.address_components?.find(c => c.types.includes(type));

    // Prefer a result that has a street_number (house number)
    const withNum = data.results.find(r =>
      r.types.includes('street_address') || r.types.includes('premise')
    );
    const best = withNum || data.results[0];

    const houseNo = get(best, 'street_number')?.long_name  || '';
    const road    = get(best, 'route')?.long_name           || '';
    const city    = get(best, 'locality')?.long_name
                 || get(best, 'sublocality')?.long_name     || '';
    const state   = get(best, 'administrative_area_level_1')?.short_name || '';

    if (houseNo && road) return `${houseNo} ${road}, ${city}`;
    if (road && city)    return `${road} & ${crossStreet(data.results, road) || city}`;
    return null;
  } catch { return null; }
}

// Find a cross-street from geocoding results to enrich "Road, City" → "Road & CrossSt"
function crossStreet(results, mainRoad) {
  for (const r of results) {
    if (!r.types.includes('intersection')) continue;
    const roads = r.address_components
      .filter(c => c.types.includes('route'))
      .map(c => c.long_name)
      .filter(name => name !== mainRoad);
    if (roads.length) return roads[0];
  }
  return null;
}

// ── Enrich spots missing real addresses ──────────────────────────────────────
async function enrichAddresses(spots, googleKey) {
  const unnamed = spots.filter(s => s._needsAddress && s.lat && s.lng);
  if (unnamed.length === 0) return;

  if (googleKey) {
    // Google Geocoding: parallel reverse geocode, much better address quality
    await Promise.allSettled(unnamed.map(async spot => {
      const addr = await googleReverseGeocode(spot.lat, spot.lng, googleKey);
      if (addr) {
        if (spot.address && spot.address !== addr) spot.landmark = spot.landmark || spot.address;
        spot.address = addr;
        spot._needsAddress = false;
      }
    }));
  }

  // Nominatim fallback for any still-unnamed spots (no Google key or Google failed)
  const stillUnnamed = unnamed.filter(s => s._needsAddress);
  if (stillUnnamed.length === 0) return;

  // Try Nominatim batch lookup by OSM ID first
  try {
    const ids = stillUnnamed.map(s => {
      const prefix = s._osmType === 'node' ? 'N' : s._osmType === 'way' ? 'W' : 'R';
      return `${prefix}${s._osmId}`;
    }).join(',');
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 3000);
    const r = await fetch(
      `https://nominatim.openstreetmap.org/lookup?osm_ids=${encodeURIComponent(ids)}&format=json&addressdetails=1`,
      { headers: { 'User-Agent': 'Orbi/1.0 (orbinear.com)' }, signal: ctrl.signal }
    );
    if (r.ok) {
      const data = await r.json();
      const byId = {};
      data.forEach(item => { byId[String(item.osm_id)] = item; });
      stillUnnamed.forEach(spot => {
        const item = byId[String(spot._osmId)];
        if (!item) return;
        const addr    = item.address || {};
        const houseNo = addr.house_number || '';
        const road    = addr.road || addr.pedestrian || addr.footway || '';
        const city2   = addr.city || addr.town || addr.village || '';
        const streetAddr = houseNo && road ? `${houseNo} ${road}, ${city2}`
                         : road && city2   ? `${road}, ${city2}` : '';
        if (streetAddr) { spot.address = streetAddr; spot._needsAddress = false; }
      });
    }
  } catch { /* fall through */ }

  // Final fallback: individual reverse geocode via Nominatim
  await Promise.allSettled(stillUnnamed.filter(s => s._needsAddress).map(async spot => {
    try {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 2500);
      const r = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${spot.lat}&lon=${spot.lng}&format=json&zoom=17&addressdetails=1`,
        { headers: { 'User-Agent': 'Orbi/1.0 (orbinear.com)' }, signal: ctrl.signal }
      );
      if (!r.ok) return;
      const data    = await r.json();
      const a       = data.address || {};
      const houseNo = a.house_number || '';
      const road    = a.road || a.pedestrian || a.footway || '';
      const city    = a.city || a.town || a.village || '';
      const streetAddr = houseNo && road ? `${houseNo} ${road}, ${city}`
                       : road && city    ? `${road}, ${city}` : '';
      if (streetAddr) spot.address = streetAddr;
    } catch { /* keep as-is */ }
  }));
}

// ── Query OpenStreetMap Overpass API — race all mirrors simultaneously ─────────
const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

async function queryOverpass(lat, lon, radiusMeters) {
  const query = `[out:json][timeout:8];
(
  node["amenity"="parking"](around:${radiusMeters},${lat},${lon});
  way["amenity"="parking"](around:${radiusMeters},${lat},${lon});
  relation["amenity"="parking"](around:${radiusMeters},${lat},${lon});
);
out center tags;`;

  const body = `data=${encodeURIComponent(query)}`;

  const tryMirror = async (url) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 7000); // covers both connect + body read
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: ctrl.signal,
      });
      if (!r.ok) throw new Error(`${r.status}`);
      const data = await r.json(); // abort signal still active during body read
      clearTimeout(t);
      return data.elements || [];
    } catch (e) {
      clearTimeout(t);
      throw e;
    }
  };

  try {
    // Race all mirrors — whichever responds first wins
    return await Promise.any(OVERPASS_MIRRORS.map(tryMirror));
  } catch {
    return null; // all mirrors failed
  }
}

// ── Geocode an address via Nominatim (fallback when no lat/lng sent) ──────────
async function geocodeAddress(street, city) {
  const q    = encodeURIComponent(`${street}, ${city}`);
  const ctrl = new AbortController();
  const t    = setTimeout(() => ctrl.abort(), 5000);
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`,
      { headers: { 'User-Agent': 'Orbi/1.0 (orbinear.com)' }, signal: ctrl.signal }
    );
    clearTimeout(t);
    const data = await r.json();
    if (!data.length) throw new Error('Could not geocode address');
    return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
  } catch (e) {
    clearTimeout(t);
    throw new Error(e.name === 'AbortError' ? 'Geocoding timed out — please try again' : e.message);
  }
}

// ── Google Places Parking — Layer 2 (accurate addresses, open status, ratings) ─
async function queryGoogleParking(lat, lng, radiusM, apiKey) {
  try {
    const ctrl = new AbortController();
    const t    = setTimeout(() => ctrl.abort(), 8000);

    const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json` +
      `?location=${lat},${lng}&radius=${radiusM}&type=parking&key=${apiKey}`;

    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) { clearTimeout(t); return []; }
    const data = await res.json();
    clearTimeout(t);
    if (!['OK', 'ZERO_RESULTS'].includes(data.status)) return [];
    if (!data.results?.length) return [];

    const GAS_BRANDS = ['shell', 'lukoil', 'bp ', 'exxon', 'mobil', 'chevron', 'sunoco',
      'gulf ', 'citgo', 'wawa', 'speedway', 'marathon', 'valero'];

    return data.results.map(place => {
      const plat = place.geometry?.location?.lat;
      const plng = place.geometry?.location?.lng;
      if (!plat || !plng) return null;

      const name  = place.name || 'Parking';
      const nameL = name.toLowerCase();

      // Skip gas stations and car washes — Google's type=parking can include them
      const isGas = (place.types || []).includes('gas_station') ||
        GAS_BRANDS.some(b => nameL.startsWith(b));
      if (isGas) return null;

      const distMi = haversineMi(lat, lng, plat, plng);

      // Determine type from name keywords
      const isGarage = nameL.includes('garage') || nameL.includes('deck') ||
                       nameL.includes('structure') || nameL.includes('ramp') ||
                       nameL.includes('level') || nameL.includes('multi');
      const isFree   = nameL.includes('free') || nameL.includes('municipal');
      const type     = isGarage ? 'GARAGE' : 'PAID_LOT';

      // Google's vicinity is the best short address (e.g. "101 Hudson St, Jersey City")
      const address  = place.vicinity || name;

      // open_now from Nearby Search (no extra API call needed)
      const openNow  = place.opening_hours?.open_now;
      const openNote = openNow === true ? 'Open now' : openNow === false ? 'Closed now' : null;

      const rating   = place.rating
        ? `${place.rating}⭐ (${place.user_ratings_total || 0})`
        : null;

      return {
        id:                   0,
        type,
        address,
        landmark:             name !== address ? name : null,
        lat:                  plat,
        lng:                  plng,
        distance_from_search: formatDist(distMi),
        avg_cost:             isFree ? 'Free' : type === 'GARAGE' ? '~$15–30/day' : '~$10–20/day',
        time_limit:           openNote,
        permit_required:      false,
        permit_zone:          '',
        sweeping_schedule:    '',
        overnight_parking:    '',
        notes:                rating,
        source:               'google',
        _distMi:              distMi,
        _needsAddress:        false, // Google addresses are accurate
      };
    }).filter(Boolean).sort((a, b) => a._distMi - b._distMi);
  } catch (e) {
    console.error('Google Places parking error:', e.message);
    return [];
  }
}

// ── HERE Places Browse API — Layer 1 (free tier, parking category) ───────────
// Uses the HERE Places v1 Browse endpoint (not the deprecated Parking 4.0 API)
// Category 700-7600-0000 = Parking Lot, 700-7600-0116 = Parking Garage
async function queryHereParking(lat, lng, radiusM, apiKey) {
  try {
    const ctrl = new AbortController();
    const t    = setTimeout(() => ctrl.abort(), 8000);

    const url = `https://browse.search.hereapi.com/v1/browse` +
      `?at=${lat},${lng}` +
      `&categories=700-7600-0000,700-7600-0116` +
      `&limit=20` +
      `&circle:center=${lat},${lng}&circle:radius=${radiusM}` +
      `&apiKey=${apiKey}`;

    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) {
      clearTimeout(t);
      console.error('HERE browse status:', res.status, await res.text().catch(() => ''));
      return [];
    }
    const data = await res.json();
    clearTimeout(t);
    const items = data?.items;
    if (!Array.isArray(items) || items.length === 0) return [];

    // Gas station category IDs to exclude — HERE sometimes returns fuel stations
    const FUEL_CATEGORIES = new Set(['700-7600-0116', '700-7300-0000', '700-7300-0444']);

    return items.map(p => {
      const pos   = p.position || {};
      const addr  = p.address  || {};
      const plat  = pos.lat;
      const plng  = pos.lng;
      if (!plat || !plng) return null;

      const cats  = p.categories || [];
      const name  = p.title || 'Parking';
      const nameL = name.toLowerCase();

      // Skip gas stations, car washes, auto services — not parking facilities
      const isGasFuel = cats.some(c => c.id?.startsWith('700-73')) ||
        ['shell', 'lukoil', 'bp ', 'exxon', 'mobil', 'chevron', 'sunoco', 'gulf ',
         'citgo', 'wawa', 'speedway', 'marathon'].some(brand => nameL.startsWith(brand));
      if (isGasFuel) return null;

      const distMi    = haversineMi(lat, lng, plat, plng);
      const isGarage  = nameL.includes('garage') || nameL.includes('deck') ||
                        nameL.includes('structure') || nameL.includes('level') ||
                        nameL.includes('multi') ||
                        cats.some(c => c.id === '700-7600-0116');
      const type      = isGarage ? 'GARAGE' : 'PAID_LOT';

      // HERE Browse returns a formatted address string in addr.label
      const fullAddr  = addr.label
        ? addr.label.replace(/, [A-Z]{2} \d{5}.*$/, '') // strip ZIP+country suffix
        : [addr.houseNumber, addr.street, addr.city].filter(Boolean).join(' ');

      const avg_cost  = type === 'GARAGE' ? '~$15–30/day' : '~$10–20/day';

      // HERE Browse includes opening hours when available
      const oh        = p.openingHours?.[0]?.text?.join(', ') || null;

      return {
        id:                   0,
        type,
        address:              fullAddr || name,
        landmark:             name !== fullAddr ? name : null,
        lat:                  plat,
        lng:                  plng,
        distance_from_search: formatDist(distMi),
        avg_cost,
        time_limit:           oh,
        permit_required:      false,
        permit_zone:          '',
        sweeping_schedule:    '',
        overnight_parking:    '',
        here_avail:           null,
        here_total:           null,
        here_avail_count:     null,
        here_realtime:        false,
        source:               'here',
        _distMi:              distMi,
      };
    }).filter(Boolean);
  } catch (e) {
    console.error('HERE API error:', e.message);
    return [];
  }
}
export default async function handler(req) {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  let body;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { city, street, day, time } = body;
  let   { lat, lng } = body;
  if (!city || !street) return json({ error: 'Missing city or street' }, 400);

  try {
    // 1. Get coordinates if not provided by client
    if (!lat || !lng) {
      const geo = await geocodeAddress(street, city);
      lat = geo.lat;
      lng = geo.lon;
    }

    const hereKey   = process.env.HERE_API_KEY      || '';
    const googleKey = process.env.GOOGLE_MAPS_API_KEY || '';

    // Fire all three data sources in parallel to stay within Vercel's 30s limit
    const [hereSpots, googleSpots, els250, els600] = await Promise.all([
      // Layer 1: HERE — real-time availability for lots/garages
      hereKey   ? queryHereParking(lat, lng, 600, hereKey).then(r => r.sort((a,b) => a._distMi - b._distMi))   : Promise.resolve([]),
      // Layer 2: Google Places — accurate addresses, open/closed, ratings
      googleKey ? queryGoogleParking(lat, lng, 800, googleKey).then(r => r.sort((a,b) => a._distMi - b._distMi)) : Promise.resolve([]),
      // Layer 3: OSM — fills in street parking not covered above
      queryOverpass(lat, lng, 250),
      queryOverpass(lat, lng, 600),
    ]);

    // Process OSM elements
    const processElements = (els) => (els || [])
      .map((el, i) => osmElementToSpot(el, lat, lng, i))
      .filter(Boolean)
      .sort((a, b) => a._distMi - b._distMi);

    const spots250 = processElements(els250);
    const spots600 = processElements(els600);
    let osmSpots, radiusBlocks, radiusExpanded;
    if (spots250.length >= 5) {
      osmSpots = spots250; radiusBlocks = 2; radiusExpanded = false;
    } else {
      osmSpots = spots600; radiusBlocks = 4; radiusExpanded = spots600.length > 0;
    }

    // Merge layers: HERE → Google → OSM (each layer deduped against higher-priority layers)
    // 40m distance threshold OR matching street address = same physical location
    const deduped = (candidates, existing) =>
      candidates.filter(c => {
        const ca = normAddr(c);
        return !existing.some(e =>
          haversineMi(e.lat, e.lng, c.lat, c.lng) < 0.025 ||
          (ca.length > 4 && ca === normAddr(e))
        );
      });

    let spots, source;
    if (hereSpots.length > 0) {
      const googleUnique = deduped(googleSpots, hereSpots);
      const osmUnique    = deduped(osmSpots, [...hereSpots, ...googleUnique]);
      spots  = [...hereSpots, ...googleUnique, ...osmUnique];
      source = 'here';
    } else if (googleSpots.length > 0) {
      const osmUnique = deduped(osmSpots, googleSpots);
      spots  = [...googleSpots, ...osmUnique];
      source = 'google';
    } else {
      spots  = osmSpots;
      source = 'osm';
    }

    // Sort merged results by distance — closest first regardless of source
    spots.sort((a, b) => (a._distMi ?? 99) - (b._distMi ?? 99));

    // Final dedup: same-address OR within 15m
    const seen = [];
    spots = spots.filter(s => {
      const sa = normAddr(s);
      const dup = seen.find(p =>
        haversineMi(p.lat, p.lng, s.lat, s.lng) < 0.009 ||
        (sa.length > 4 && sa === normAddr(p))
      );
      if (dup) return false;
      seen.push(s);
      return true;
    });

    // Enrich OSM spots that are missing real addresses
    // Google Geocoding (primary) → Nominatim (fallback)
    if (spots.length > 0) await enrichAddresses(spots, googleKey);

    // Re-index IDs and strip temp fields
    spots.forEach((s, i) => {
      s.id = i + 1;
      delete s._distMi;
      delete s._needsAddress;
      delete s._osmType;
      delete s._osmId;
    });

    // Debug counts — visible in browser Network tab to diagnose source failures
    const _debug = {
      here:   hereSpots.length,
      google: googleSpots.length,
      osm:    osmSpots.length,
      merged: spots.length,
    };

    return json({ street, neighborhood: city, spots, general_tips: [], radiusBlocks, radiusExpanded, source, searchLat: lat, searchLng: lng, _debug });

  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
