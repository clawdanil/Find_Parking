export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not set in environment variables' });
  }

  const { city, street, day, time } = req.body;
  if (!city || !street) return res.status(400).json({ error: 'Missing city or street' });

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
- "PAID_LOT": paid surface lot (avg_cost e.g."$10/day · $3/hr")
- "GARAGE": parking garage/structure (avg_cost e.g."$18/day · $5 first hr")

COORDS: Street spots → mid-block lat/lng (NOT intersections). Garages/lots → entrance.
HEADING: Along street direction (E-W street=90, N-S street=0). Garages → toward entrance.

Return ONLY valid JSON, no markdown:
{"street":"${street}","neighborhood":"area name","spots":[{"id":1,"type":"FREE_STREET","address":"block description","side":"north/south/east/west (blank for garages)","landmark":"nearby business","lat":40.7178,"lng":-74.0431,"heading":90,"avg_cost":"Free","time_limit":"2 hrs","permit_required":false,"permit_zone":"None","sweeping_schedule":"Mon 8-10am","overnight_parking":"Allowed","distance_from_search":"0.1 mi","notes":""}],"general_tips":["tip1"]}`
        }]
      })
    });

    const data = await r.json();

    if (data.error) {
      return res.status(502).json({ error: `Anthropic error: ${data.error.message || JSON.stringify(data.error)}` });
    }

    let text = data.content[0].text.trim().replace(/```json|```/g, '');
    const start = text.indexOf('{');
    const end   = text.lastIndexOf('}');
    if (start === -1 || end === -1) {
      return res.status(502).json({ error: `No JSON in response. Raw: ${text.slice(0, 200)}` });
    }
    const json = JSON.parse(text.slice(start, end + 1));
    if (!Array.isArray(json.spots)) json.spots = [];

    // Back-fill type for legacy responses
    json.spots = json.spots.map(s => {
      if (!s.type) {
        if (s.has_meters) s.type = 'PAID_STREET';
        else s.type = 'FREE_STREET';
      }
      if (!s.avg_cost) s.avg_cost = s.type === 'FREE_STREET' ? 'Free' : 'Varies';
      return s;
    });

    res.status(200).json(json);

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

