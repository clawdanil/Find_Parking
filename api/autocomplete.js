export const config = { runtime: 'edge' };

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const q   = searchParams.get('q') || '';
  const key = process.env.GOOGLE_MAPS_API_KEY;

  const empty = new Response('[]', { headers: { 'Content-Type': 'application/json' } });
  if (q.length < 2 || !key) return empty;

  try {
    const res  = await fetch(
      `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(q)}&key=${key}&types=address&language=en`
    );
    const data = await res.json();
    const out  = (data.predictions || []).map(p => ({
      display:  p.description,
      main:     p.structured_formatting.main_text,
      sub:      p.structured_formatting.secondary_text || '',
      place_id: p.place_id,
    }));
    return new Response(JSON.stringify(out), { headers: { 'Content-Type': 'application/json' } });
  } catch {
    return empty;
  }
}
