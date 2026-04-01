export default async function handler(req, res) {
  const { spot_id } = req.query;
  if (!spot_id) return res.status(400).end();

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    return res.status(200).json({ status: null });
  }

  try {
    const url = `${process.env.SUPABASE_URL}/rest/v1/spot_reports` +
      `?spot_id=eq.${encodeURIComponent(spot_id)}` +
      `&order=reported_at.desc&limit=1&select=status,reported_at`;

    const r = await fetch(url, {
      headers: {
        'apikey': process.env.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`
      }
    });

    const data = await r.json();
    if (!Array.isArray(data) || data.length === 0) {
      return res.status(200).json({ status: null });
    }

    const report = data[0];
    const minutesAgo = Math.floor(
      (Date.now() - new Date(report.reported_at).getTime()) / 60000
    );
    res.status(200).json({ status: report.status, minutes_ago: minutesAgo });
  } catch (e) {
    res.status(200).json({ status: null });
  }
}
