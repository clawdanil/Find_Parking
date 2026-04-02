export const config = { runtime: 'edge' };

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const lat     = searchParams.get('lat');
  const lng     = searchParams.get('lng');
  const heading = searchParams.get('heading') || '0';

  if (!lat || !lng) return new Response(null, { status: 400 });
  if (!process.env.GOOGLE_MAPS_API_KEY) return new Response(null, { status: 503 });

  const key = process.env.GOOGLE_MAPS_API_KEY;

  try {
    const meta = await fetch(
      `https://maps.googleapis.com/maps/api/streetview/metadata?location=${lat},${lng}&radius=50&source=outdoor&key=${key}`
    ).then(r => r.json());

    if (meta.status !== 'OK') return new Response(null, { status: 404 });
    if (!meta.copyright?.includes('Google')) return new Response(null, { status: 404 });

    const imgUrl = `https://maps.googleapis.com/maps/api/streetview?size=800x400&pano=${meta.pano_id}&fov=75&pitch=-5&heading=${heading}&key=${key}`;
    const img    = await fetch(imgUrl);
    const buffer = await img.arrayBuffer();

    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch {
    return new Response(null, { status: 500 });
  }
}
