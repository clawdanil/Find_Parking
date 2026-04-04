export const config = { runtime: 'edge' };

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

async function askClaude(apiKey, prompt) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1200,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  const data = await r.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  let text = data.content[0].text.trim().replace(/```json|```/g, '');
  const start = text.indexOf('[');
  const end   = text.lastIndexOf(']');
  if (start === -1 || end === -1) return [];
  return JSON.parse(text.slice(start, end + 1));
}

function buildPrompts(street, city, day, time, lat, lng, radiusBlocks) {
  // 1 city block ≈ 0.05 mi / 80 m. 2 blocks ≈ 0.1 mi, 4 blocks ≈ 0.2 mi
  const radiusMi  = (radiusBlocks * 0.05).toFixed(2);
  const radiusM   = radiusBlocks * 80;
  const coords    = (lat && lng) ? ` Exact coordinates: ${lat}, ${lng}.` : '';
  const strictMsg = `STRICT RADIUS RULE: ONLY include spots that are within ${radiusBlocks} city blocks (≈${radiusMi} miles / ${radiusM} meters) of the search address. Do NOT list anything beyond this distance. If fewer spots exist within range, return a shorter array — do NOT pad with distant results.`;

  const base = `Location: "${street}", ${city}.${coords} ${day} ${time}. Mid-block coords only (never intersections). Return ONLY a valid JSON array, no markdown, no explanation. ${strictMsg}`;

  const freePrompt = `${base}
List up to 4 FREE street parking spots within ${radiusBlocks} blocks. Each object: {"type":"FREE_STREET","address":"block","side":"N/S/E/W side","landmark":"nearby place","lat":0.0,"lng":0.0,"heading":90,"avg_cost":"Free","time_limit":"2 hrs","permit_required":false,"permit_zone":"None","sweeping_schedule":"None","overnight_parking":"Allowed","distance_from_search":"0.1 mi"}`;

  const paidPrompt = `${base}
List up to 2 metered street spots (PAID_STREET), 1 paid lot (PAID_LOT), and up to 2 garages (GARAGE) — all strictly within ${radiusBlocks} blocks. Each object: {"type":"GARAGE","address":"name or block","side":"","landmark":"nearby place","lat":0.0,"lng":0.0,"heading":90,"avg_cost":"$18/day","time_limit":"24hrs","permit_required":false,"permit_zone":"None","sweeping_schedule":"None","overnight_parking":"Allowed","distance_from_search":"0.2 mi","notes":"open 24/7"}`;

  return { freePrompt, paidPrompt };
}

async function searchAtRadius(key, street, city, day, time, lat, lng, radiusBlocks) {
  const { freePrompt, paidPrompt } = buildPrompts(street, city, day, time, lat, lng, radiusBlocks);
  const [freeSpots, paidSpots] = await Promise.all([
    askClaude(key, freePrompt).catch(() => []),
    askClaude(key, paidPrompt).catch(() => []),
  ]);
  return [...freeSpots, ...paidSpots];
}

export default async function handler(req) {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
  if (!process.env.ANTHROPIC_API_KEY) return json({ error: 'ANTHROPIC_API_KEY not set' }, 500);

  let body;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { city, street, day, time, lat, lng } = body;
  if (!city || !street) return json({ error: 'Missing city or street' }, 400);

  const key = process.env.ANTHROPIC_API_KEY;

  try {
    // First pass: strictly 2 blocks
    let spots = await searchAtRadius(key, street, city, day, time, lat, lng, 2);
    let radiusBlocks = 2;
    let radiusExpanded = false;

    // If nothing found, expand to 4 blocks
    if (spots.length === 0) {
      spots = await searchAtRadius(key, street, city, day, time, lat, lng, 4);
      radiusBlocks = 4;
      radiusExpanded = true;
    }

    spots = spots.map((s, i) => {
      if (!s.type) s.type = 'FREE_STREET';
      if (!s.avg_cost) s.avg_cost = s.type === 'FREE_STREET' ? 'Free' : 'Varies';
      s.id = i + 1;
      return s;
    });

    return json({ street, neighborhood: city, spots, general_tips: [], radiusBlocks, radiusExpanded });

  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

