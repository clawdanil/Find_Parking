export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not set' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  let body;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const { city, street, day, time } = body;
  if (!city || !street) {
    return new Response(JSON.stringify({ error: 'Missing city or street' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const json = (data, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: `Parking expert for ${city}. Find ALL parking within 0.3mi of "${street}", ${city}. ${day}, ${time}.

Return 2-3 of each type that exists nearby:
- "FREE_STREET": free on-street (avg_cost:"Free")
- "PAID_STREET": metered street (avg_cost e.g."$2.50/hr")
- "PAID_LOT": paid surface lot (avg_cost e.g."$10/day")
- "GARAGE": parking garage (avg_cost e.g."$18/day")

COORDS: Street spots → mid-block lat/lng (NOT intersections). Garages/lots → entrance.
HEADING: Along street (E-W=90, N-S=0). Garages → toward entrance.

Return ONLY valid JSON, no markdown:
{"street":"${street}","neighborhood":"area name","spots":[{"id":1,"type":"FREE_STREET","address":"block","side":"north/south/east/west","landmark":"nearby business","lat":40.7178,"lng":-74.0431,"heading":90,"avg_cost":"Free","time_limit":"2 hrs","permit_required":false,"permit_zone":"None","sweeping_schedule":"Mon 8-10am","overnight_parking":"Allowed","distance_from_search":"0.1 mi","notes":""}],"general_tips":["tip1"]}`
        }]
      })
    });

    const data = await r.json();
    if (data.error) return json({ error: `Anthropic: ${data.error.message || JSON.stringify(data.error)}` }, 502);

    let text = data.content[0].text.trim().replace(/```json|```/g, '');
    const start = text.indexOf('{');
    const end   = text.lastIndexOf('}');
    if (start === -1 || end === -1) return json({ error: `No JSON in response: ${text.slice(0, 200)}` }, 502);

    const result = JSON.parse(text.slice(start, end + 1));
    if (!Array.isArray(result.spots)) result.spots = [];

    result.spots = result.spots.map(s => {
      if (!s.type) s.type = s.has_meters ? 'PAID_STREET' : 'FREE_STREET';
      if (!s.avg_cost) s.avg_cost = s.type === 'FREE_STREET' ? 'Free' : 'Varies';
      return s;
    });

    return json(result);

  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
