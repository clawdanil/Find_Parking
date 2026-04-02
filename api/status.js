export const config = { runtime: 'edge' };

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const spot_id = searchParams.get('spot_id');

  const json = (data, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

  if (!spot_id) return new Response(null, { status: 400 });
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) return json({ status: null });

  try {
    const url = `${process.env.SUPABASE_URL}/rest/v1/spot_reports` +
      `?spot_id=eq.${encodeURIComponent(spot_id)}` +
      `&order=reported_at.desc&limit=1&select=status,reported_at`;

    const r    = await fetch(url, {
      headers: {
        'apikey': process.env.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`
      }
    });
    const data = await r.json();

    if (!Array.isArray(data) || data.length === 0) return json({ status: null });

    const minutesAgo = Math.floor((Date.now() - new Date(data[0].reported_at).getTime()) / 60000);
    return json({ status: data[0].status, minutes_ago: minutesAgo });
  } catch {
    return json({ status: null });
  }
}
