export default async function handler(req, res) {
  const { lat, lng, heading } = req.query;
  if (!lat || !lng) return res.status(400).end();

  if (!process.env.GOOGLE_MAPS_API_KEY) {
    return res.status(503).end();
  }

  const key = process.env.GOOGLE_MAPS_API_KEY;

  try {
    // Step 1: find the nearest real panorama within 100 m
    const metaUrl = `https://maps.googleapis.com/maps/api/streetview/metadata?location=${lat},${lng}&radius=50&source=outdoor&key=${key}`;
    const meta = await fetch(metaUrl).then(r => r.json());

    if (meta.status !== 'OK') {
      return res.status(404).end();
    }

    // Reject user-contributed / business panoramas — only accept Google's own street imagery
    if (!meta.copyright?.includes('Google')) {
      return res.status(404).end();
    }

    // Step 2: fetch the image using the exact panorama ID + supplied heading
    const h = heading || 0;
    // pitch=-5: near eye-level, slight downward tilt to show curb + parking lane naturally
    const imgUrl = `https://maps.googleapis.com/maps/api/streetview?size=800x400&pano=${meta.pano_id}&fov=75&pitch=-5&heading=${h}&key=${key}`;
    const r = await fetch(imgUrl);
    const buffer = await r.arrayBuffer();
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(Buffer.from(buffer));
  } catch (e) {
    res.status(500).end();
  }
}
