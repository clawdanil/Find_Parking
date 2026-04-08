export const config = { runtime: 'edge' };

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const spot_id = searchParams.get('spot_id');

  if (!spot_id) return json({ status: null }, 400);
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) return json({ status: null });

  try {
    // Fetch all reports for this spot from the last 3 hours
    const since = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    const url   = `${process.env.SUPABASE_URL}/rest/v1/spot_reports` +
      `?spot_id=eq.${encodeURIComponent(spot_id)}` +
      `&reported_at=gt.${encodeURIComponent(since)}` +
      `&order=reported_at.desc&limit=30&select=status,reported_at`;

    const r    = await fetch(url, {
      headers: {
        'apikey':        process.env.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
      },
    });
    const data = await r.json();
    if (!Array.isArray(data) || data.length === 0) return json({ status: null });

    // Count votes — weight recent reports more heavily (last 30 min = 2x weight)
    const now         = Date.now();
    const thirtyMins  = 30 * 60 * 1000;
    let freeScore = 0, takenScore = 0;

    for (const row of data) {
      const age    = now - new Date(row.reported_at).getTime();
      const weight = age < thirtyMins ? 2 : 1;
      if (row.status === 'FREE')  freeScore  += weight;
      if (row.status === 'TAKEN') takenScore += weight;
    }

    const consensus  = freeScore > takenScore ? 'FREE'
                     : takenScore > freeScore  ? 'TAKEN'
                     : data[0].status; // tie → most recent wins

    const freeVotes  = data.filter(r => r.status === 'FREE').length;
    const takenVotes = data.filter(r => r.status === 'TAKEN').length;
    const minutesAgo = Math.floor((now - new Date(data[0].reported_at).getTime()) / 60000);

    return json({ status: consensus, minutes_ago: minutesAgo, free_votes: freeVotes, taken_votes: takenVotes, total: data.length });
  } catch (e) {
    return json({ status: null });
  }
}
