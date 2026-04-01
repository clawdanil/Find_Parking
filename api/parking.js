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
          content: `You are a street parking expert for ${city}. The user wants parking near: "${street}" in ${city}. Today is ${day} at ${time}.

STRICT RADIUS RULE: ALL spots MUST be within 0.15 miles. Prefer spots within 0.1 miles. NEVER return a spot beyond 0.15 miles. If you cannot find 5 spots within 0.15 miles, return fewer spots rather than going further.

If the input is a full address (has a number, e.g. "175 2nd St"):
- Spots on the SAME block get priority (distance_from_search: "On street").
- Remaining spots come from immediately adjacent blocks or the nearest 1 cross-street only.

If the input is a street name: find spots along that street or its immediate cross-streets only.

For heading: provide the compass degrees (0-359) a person should face TO LOOK AT the parking spot from the street (e.g. facing the curb where cars park).

Return ONLY valid JSON, no markdown:
{"street":"${street}","neighborhood":"area name","spots":[{"id":1,"address":"specific block","side":"north/south/east/west side","landmark":"real nearby business","lat":40.7178,"lng":-74.0431,"heading":90,"status":"FREE","time_limit":"No limit","permit_zone":"None","permit_required":false,"sweeping_schedule":"None","has_meters":false,"overnight_parking":"Allowed","distance_from_search":"On street"}],"general_tips":["tip1","tip2"]}`
        }]
      })
    });

    const data = await r.json();

    if (data.error) {
      return res.status(502).json({ error: `Anthropic error: ${data.error.message || JSON.stringify(data.error)}` });
    }

    // Robustly extract JSON even if Claude wraps it in markdown fences or adds prose
    let text = data.content[0].text.trim().replace(/```json|```/g, '');
    const start = text.indexOf('{');
    const end   = text.lastIndexOf('}');
    if (start === -1 || end === -1) {
      return res.status(502).json({ error: `No JSON in response. Raw: ${text.slice(0, 200)}` });
    }
    const json = JSON.parse(text.slice(start, end + 1));
    if (!Array.isArray(json.spots)) json.spots = [];
    res.status(200).json(json);

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
