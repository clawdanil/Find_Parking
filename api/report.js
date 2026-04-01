export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { spot_id, status } = req.body;
  if (!spot_id || !['FREE', 'TAKEN'].includes(status)) {
    return res.status(400).json({ error: 'Missing or invalid fields' });
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    return res.status(503).json({ error: 'Database not configured' });
  }

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

    if (!r.ok) {
      const err = await r.text();
      return res.status(500).json({ error: err });
    }
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
