export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  const json = (data, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

  let body;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { spot_id, status } = body;
  if (!spot_id || !['FREE', 'TAKEN'].includes(status)) return json({ error: 'Missing or invalid fields' }, 400);
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) return json({ error: 'Database not configured' }, 503);

  try {
    const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/spot_reports`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ spot_id, status })
    });

    if (!r.ok) return json({ error: await r.text() }, 500);
    return json({ ok: true });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
