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

export default async function handler(req) {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
  if (!process.env.ANTHROPIC_API_KEY) return json({ error: 'ANTHROPIC_API_KEY not set' }, 500);

  let body;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { city, street, day, time } = body;
  if (!city || !street) return json({ error: 'Missing city or street' }, 400);

  const key = process.env.ANTHROPIC_API_KEY;

  const base = `Location: "${street}", ${city}. ${day} ${time}. Mid-block coords only (never intersections). Return ONLY a valid JSON array, no markdown, no explanation.`;

  const freePrompt = `${base}
List up to 4 free street parking spots within 0.15mi. Each object: {"type":"FREE_STREET","address":"block","side":"N/S/E/W side","landmark":"nearby place","lat":0.0,"lng":0.0,"heading":90,"avg_cost":"Free","time_limit":"2 hrs","permit_required":false,"permit_zone":"None","sweeping_schedule":"None","overnight_parking":"Allowed","distance_from_search":"0.1 mi"}`;

  const paidPrompt = `${base}
List up to 2 metered street spots (type PAID_STREET), up to 1 paid lot (type PAID_LOT), and up to 2 parking garages (type GARAGE) within 0.3mi. Each object: {"type":"GARAGE","address":"name or block","side":"","landmark":"nearby place","lat":0.0,"lng":0.0,"heading":90,"avg_cost":"$18/day","time_limit":"24hrs","permit_required":false,"permit_zone":"None","sweeping_schedule":"None","overnight_parking":"Allowed","distance_from_search":"0.2 mi","notes":"open 24/7"}`;

  try {
    // Run both requests in parallel
    const [freeSpots, paidSpots] = await Promise.all([
      askClaude(key, freePrompt).catch(() => []),
      askClaude(key, paidPrompt).catch(() => []),
    ]);

    const spots = [...freeSpots, ...paidSpots].map((s, i) => {
      if (!s.type) s.type = 'FREE_STREET';
      if (!s.avg_cost) s.avg_cost = s.type === 'FREE_STREET' ? 'Free' : 'Varies';
      s.id = i + 1;
      return s;
    });

    return json({ street, neighborhood: city, spots, general_tips: [] });

  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
