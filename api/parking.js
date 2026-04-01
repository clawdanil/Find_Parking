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
          content: `You are a street parking expert for ${city}. The user is looking for parking near: "${street}" in ${city}.

Determine if the input is a full address (contains a number, e.g. "340 Grove St") or just a street name (e.g. "Grove Street").
- If it is a full address: find 5 free parking spots within a 2-street radius of that exact address (include the cross streets on either side).
- If it is a street name: find 5 free parking spots along or immediately adjacent to that street.

Today is ${day} at ${time}. For each spot include the real approximate coordinates.

Return ONLY valid JSON, no markdown, no explanation:
{"street":"${street}","neighborhood":"area name","spots":[{"id":1,"address":"specific block (e.g. 300-340 Grove St)","side":"north/south/east/west side","landmark":"real nearby business or landmark","lat":40.7178,"lng":-74.0431,"status":"FREE","time_limit":"No limit","permit_zone":"None","permit_required":false,"sweeping_schedule":"None","has_meters":false,"overnight_parking":"Allowed","distance_from_search":"e.g. 0.1 mi or On street"}],"general_tips":["tip1","tip2"]}`
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
