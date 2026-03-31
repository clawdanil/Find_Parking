export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.status(405).end();
  const { street, day, time } = req.body;
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
        max_tokens: 600,
        messages: [{ role: 'user', content: `Jersey City NJ parking expert. Find 5 free street parking spots near "${street}". Today: ${day} ${time}. Reply ONLY in JSON: {"street":"","neighborhood":"","spots":[{"id":1,"address":"","side":"","status":"FREE","time_limit":"","permit_zone":"None","permit_required":false,"sweeping_schedule":"None","has_meters":false,"overnight_parking":"Allowed","distance_from_search":""}],"general_tips":[]}` }]
      })
    });
    const data = await r.json();
    const text = data.content[0].text.replace(/```json|```/g,'').trim();
    res.status(200).json(JSON.parse(text));
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
