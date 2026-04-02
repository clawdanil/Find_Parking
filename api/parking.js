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
        max_tokens: 3000,
        messages: [{
          role: 'user',
          content: `You are a parking expert for ${city}. The user wants ALL parking options near: "${street}" in ${city}. Today is ${day} at ${time}.

Return ALL types of parking within 0.3 miles — free street spots, paid street meters, paid lots, AND parking garages. Include at least 2–3 of each type that actually exists in this area.

SPOT TYPES — use exactly these values for the "type" field:
- "FREE_STREET"  — free on-street parking (no meter, no fee)
- "PAID_STREET"  — metered or paid on-street parking
- "PAID_LOT"     — surface parking lot (paid)
- "GARAGE"       — multi-level parking garage or structure

INPUT PARSING:
- If input contains a business name, identify the exact block and prioritize nearby spots.
- If input is a full address: same-block spots first, then nearby.
- If input is a street name: spots along that street or cross-streets.

COORDINATE RULES (critical):
- lat/lng MUST be MID-BLOCK for street spots, NOT at intersections or corners.
- For garages/lots use the actual entrance coordinate.
- NEVER place a coordinate at a corner or intersection — offset at least 50m toward block center.

HEADING RULE (for street spots):
- Face ALONG the street so the camera shows the parking lane.
- East-west street → heading = 90
- North-south street → heading = 0
- For garages/lots: heading toward the entrance.

COST RULES:
- FREE_STREET: avg_cost = "Free"
- PAID_STREET: avg_cost = realistic local meter rate e.g. "$2.50/hr"
- PAID_LOT: avg_cost = realistic daily/hourly rate e.g. "$10/day · $3/hr"
- GARAGE: avg_cost = realistic local garage rate e.g. "$18/day · $5 first hr"

Return ONLY valid JSON, no markdown:
{"street":"${street}","neighborhood":"area name","spots":[{"id":1,"type":"FREE_STREET","address":"specific block","side":"north/south/east/west side (empty for garages/lots)","landmark":"real nearby business or cross street","lat":40.7178,"lng":-74.0431,"heading":90,"status":"FREE","avg_cost":"Free","time_limit":"2 hrs","permit_zone":"None","permit_required":false,"sweeping_schedule":"Mon 8–10am","has_meters":false,"overnight_parking":"Allowed","distance_from_search":"0.1 mi","notes":"Any helpful detail"}],"general_tips":["tip1","tip2"]}`
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

