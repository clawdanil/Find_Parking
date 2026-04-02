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

STRICT RADIUS RULE: ALL spots MUST be within 0.15 miles. Prefer 0.1 miles. NEVER go beyond 0.15 miles. Return fewer than 5 spots rather than exceeding this limit.

INPUT PARSING:
- If input contains a business name (e.g. "175 2nd St in front of Mango Mango" or "near Mango Mango restaurant"), use the business name to identify the exact block and prioritize spots directly in front of or adjacent to that business.
- If input is a full address (has a number): same-block spots first, then immediate cross-streets.
- If input is a street name only: spots along that street or immediate cross-streets.

COORDINATE RULES (critical — bad coords cause wrong Street View images):
- lat/lng MUST be MID-BLOCK, NOT at intersections or corners.
- A mid-block coordinate is roughly halfway between two cross-streets along the parking side.
- NEVER place a coordinate at a corner, crosswalk, or intersection — move it at least 50–80 meters toward the center of the block.
- If you are unsure of the exact mid-block location, offset the nearest intersection by ~0.0005 degrees along the street direction.
- Example: if parking is on the east side of 1st Ave between 2nd St and 3rd St, the lat should be midway between the latitudes of 2nd St and 3rd St, NOT at either intersection.

HEADING RULE — face ALONG the street so the camera shows the parking lane in context:
- The Street View camera sits in the middle of the road. Facing perpendicular to the street just shows a building wall. Instead, face ALONG the street so the parking lane runs alongside the frame — exactly what a driver sees when pulling up to park.
- East-west street (parking on north or south side) → heading = 90 (face east along the street)
- North-south street (parking on east or west side) → heading = 0 (face north along the street)
- For diagonal streets, use the compass bearing that runs parallel to the street direction.
- Always pick the along-street direction, NOT the perpendicular/toward-curb direction.

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
