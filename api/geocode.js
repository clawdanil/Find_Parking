export const config = { runtime: 'edge' };

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const place_id = searchParams.get('place_id') || '';
  const key      = process.env.GOOGLE_MAPS_API_KEY;

  if (!place_id || !key) return new Response('{}', { status: 400, headers: { 'Content-Type': 'application/json' } });

  try {
    const res    = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?place_id=${encodeURIComponent(place_id)}&key=${key}`
    );
    const data   = await res.json();
    const result = data.results?.[0];
    if (!result) return new Response('{}', { status: 404, headers: { 'Content-Type': 'application/json' } });

    const { lat, lng } = result.geometry.location;
    const comps = result.address_components;
    const get   = type => comps.find(c => c.types.includes(type));
    const city  = [
      get('locality')?.long_name || get('sublocality')?.long_name,
      get('administrative_area_level_1')?.short_name,
    ].filter(Boolean).join(', ');

    return new Response(JSON.stringify({ lat, lon: lng, city }), { headers: { 'Content-Type': 'application/json' } });
  } catch {
    return new Response('{}', { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
