export default async function handler(req, res) {
  const { lat, lng } = req.query;
  if (!lat || !lng) return res.status(400).end();

  if (!process.env.GOOGLE_MAPS_API_KEY) {
    return res.status(503).json({ error: 'GOOGLE_MAPS_API_KEY not configured' });
  }

  const url = `https://maps.googleapis.com/maps/api/streetview?size=640x300&location=${lat},${lng}&fov=90&pitch=0&source=outdoor&key=${process.env.GOOGLE_MAPS_API_KEY}`;

  try {
    const r = await fetch(url);
    // If Google returns a grey "no imagery" image, it still sends 200
    // Pass it through either way so the client can decide via onerror
    const buffer = await r.arrayBuffer();
    res.setHeader('Content-Type', r.headers.get('content-type') || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(Buffer.from(buffer));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
