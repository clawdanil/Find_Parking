export const config = { runtime: 'edge' };

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

// ── Map OSM tags → our 4 parking types ───────────────────────────────────────
function osmToType(tags) {
  const p    = (tags.parking || '').toLowerCase();
  const hasFee  = tags.fee === 'yes';
  const isFree  = tags.fee === 'no' || tags.fee === 'free';

  if (['multi-storey', 'underground', 'garage', 'rooftop', 'multistorey'].includes(p)) return 'GARAGE';
  if (['street_side', 'lane', 'on_street', 'half_on_kerb', 'shoulder', 'street'].includes(p)) {
    return hasFee ? 'PAID_STREET' : 'FREE_STREET';
  }
  if (p === 'surface') return hasFee ? 'PAID_LOT' : 'FREE_STREET';
  // no parking subtag — use fee to guess
  if (hasFee) return 'PAID_LOT';
  if (isFree) return 'FREE_STREET';
  return 'PAID_LOT'; // unknown, assume paid lot
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
  if (tags.name)                                        return tags.name;
  if (tags['addr:housenumber'] && tags['addr:street'])  return `${tags['addr:housenumber']} ${tags['addr:street']}`;
  if (tags['addr:street'])                              return tags['addr:street'];
  if (tags.operator)                                    return tags.operator;
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

  const type = osmToType(tags);
  const dist = haversineMi(searchLat, searchLon, lat, lon);

  const typeLabels = {
    FREE_STREET: 'Free Street Parking',
    PAID_STREET: 'Metered Street Parking',
    PAID_LOT:    'Paid Parking Lot',
    GARAGE:      'Parking Garage',
  };

  return {
    id:                   idx + 1,
    type,
    address:              osmToAddress(tags) || typeLabels[type],
    side:                 '',
    landmark:             '',
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
  };
}

// ── Query OpenStreetMap Overpass API ──────────────────────────────────────────
async function queryOverpass(lat, lon, radiusMeters) {
  const query = `[out:json][timeout:20];
(
  node["amenity"="parking"](around:${radiusMeters},${lat},${lon});
  way["amenity"="parking"](around:${radiusMeters},${lat},${lon});
  relation["amenity"="parking"](around:${radiusMeters},${lat},${lon});
);
out center tags;`;

  const r = await fetch('https://overpass-api.de/api/interpreter', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    `data=${encodeURIComponent(query)}`,
  });
  if (!r.ok) throw new Error(`Overpass API error: ${r.status}`);
  const data = await r.json();
  return data.elements || [];
}

// ── Geocode an address via Nominatim (fallback when no lat/lng sent) ──────────
async function geocodeAddress(street, city) {
  const q = encodeURIComponent(`${street}, ${city}`);
  const r = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`,
    { headers: { 'User-Agent': 'ParkMe/1.0 (parkme.fun)' } }
  );
  const data = await r.json();
  if (!data.length) throw new Error('Could not geocode address');
  return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
}

// ── Claude fallback for areas with sparse OSM data ────────────────────────────
async function askClaude(apiKey, prompt) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 1200,
      messages:   [{ role: 'user', content: prompt }],
    }),
  });
  const data = await r.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  let text = data.content[0].text.trim().replace(/```json|```/g, '');
  const start = text.indexOf('[');
  const end   = text.lastIndexOf(']');
  if (start === -1 || end === -1) return [];
  return JSON.parse(text.slice(start, end + 1));
}

async function claudeFallback(key, street, city, lat, lng, day, time, radiusBlocks) {
  const radiusMi = (radiusBlocks * 0.05).toFixed(2);
  const coords   = lat && lng ? ` Exact coordinates: ${lat}, ${lng}.` : '';
  const strict   = `STRICT RADIUS RULE: only within ${radiusBlocks} city blocks (≈${radiusMi} miles). Return empty array if nothing fits.`;
  const base     = `Location: "${street}", ${city}.${coords} ${day} ${time}. ${strict} Return ONLY a valid JSON array, no markdown.`;

  const [free, paid] = await Promise.all([
    askClaude(key, `${base} List up to 4 FREE_STREET spots. Fields: type,address,side,landmark,lat,lng,heading,avg_cost,time_limit,permit_required,permit_zone,sweeping_schedule,overnight_parking,distance_from_search`).catch(() => []),
    askClaude(key, `${base} List up to 2 PAID_STREET, 1 PAID_LOT, 2 GARAGE spots. Fields: type,address,side,landmark,lat,lng,heading,avg_cost,time_limit,permit_required,permit_zone,sweeping_schedule,overnight_parking,distance_from_search,notes`).catch(() => []),
  ]);

  return [...free, ...paid].map((s, i) => ({
    ...s,
    id:       i + 1,
    type:     s.type     || 'FREE_STREET',
    avg_cost: s.avg_cost || (s.type === 'FREE_STREET' ? 'Free' : 'Varies'),
    source:   'ai',
    _distMi:  parseFloat((s.distance_from_search || '0').replace(/[^\d.]/g, '')) || 0,
  }));
}

// ── Main handler ──────────────────────────────────────────────────────────────
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

    // 2. OSM Overpass: try 2 blocks (200m), expand to 4 blocks (400m) if empty
    let elements = await queryOverpass(lat, lng, 200);
    let radiusBlocks  = 2;
    let radiusExpanded = false;
    let source = 'osm';

    if (elements.length === 0) {
      elements = await queryOverpass(lat, lng, 400);
      radiusBlocks   = 4;
      radiusExpanded = true;
    }

    // 3. Convert, filter, deduplicate, sort by distance
    let spots = elements
      .map((el, i) => osmElementToSpot(el, lat, lng, i))
      .filter(Boolean)
      .sort((a, b) => a._distMi - b._distMi);

    // Deduplicate spots within 15m of each other
    const seen = [];
    spots = spots.filter(s => {
      const dup = seen.find(p => haversineMi(p.lat, p.lng, s.lat, s.lng) < 0.009);
      if (dup) return false;
      seen.push(s);
      return true;
    });

    // Re-index IDs
    spots.forEach((s, i) => { s.id = i + 1; delete s._distMi; });

    // 4. If OSM returned nothing (area not well mapped), fall back to Claude
    if (spots.length === 0 && process.env.ANTHROPIC_API_KEY) {
      source = 'ai';
      spots  = await claudeFallback(
        process.env.ANTHROPIC_API_KEY, street, city, lat, lng, day, time, radiusBlocks
      );
      spots.forEach((s, i) => { s.id = i + 1; delete s._distMi; });
    }

    return json({ street, neighborhood: city, spots, general_tips: [], radiusBlocks, radiusExpanded, source });

  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
