export const config = { runtime: 'edge' };

// ── Intent detection ──────────────────────────────────────────────────────────
const INTENT_PATTERNS = {
  parking:       /\bpark(ing)?\b|\bgarage\b|\bmeter\b|\blot\b/i,
  bars:          /\bbar(s)?\b|\bdrink(s|ing)?\b|\bbeer\b|\bnightlife\b|\bpub\b|\bcocktail\b|\bhappy.?hour\b/i,
  coffee:        /\bcoffee\b|\bcafe\b|\bcafé\b|\blatte\b|\bespresso\b|\bcappuccino\b|\bcold.?brew\b/i,
  gym:           /\bgym\b|\bworkout\b|\bfitness\b|\byoga\b|\bpilates\b|\bspin\b/i,
  transit:       /\btransit\b|\btrain\b|\bbus\b|\bpath\b|\bsubway\b|\bmta\b|\bcommute\b|\bget.?to\b|\bhow.?do.?i.?get\b/i,
  events:        /\bevent(s)?\b|\bconcert\b|\bshow\b|\bhappening\b|\btonight\b|\bthis.?weekend\b|\bperformance\b/i,
  entertainment: /\bmovie\b|\bcinema\b|\btheater\b|\btheatre\b|\bentertain\b/i,
  food:          /\beat\b|\bfood\b|\brestaurant\b|\blunch\b|\bdinner\b|\bbreakfast\b|\bbrunch\b|\btaco(s)?\b|\bpizza\b|\bsushi\b|\bburger\b|\bramen\b|\bdiner\b|\bbistro\b|\bcuisine\b|\bhungry\b|\bbite\b|\bspot(s)?\b|\bplace(s)?\b|\brecommend\b/i,
};

function detectIntent(message) {
  for (const [intent, pattern] of Object.entries(INTENT_PATTERNS)) {
    if (pattern.test(message)) return intent;
  }
  return null;
}

// ── Live data fetcher ─────────────────────────────────────────────────────────
async function fetchLiveData(intent, lat, lng, origin) {
  try {
    const isParking = intent === 'parking';
    const res = await fetch(`${origin}${isParking ? '/api/parking' : '/api/nearby'}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        isParking ? { lat, lng, units: 'imperial' }
                  : { lat, lng, feature: intent, units: 'imperial' }
      ),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

function summarize(intent, data) {
  if (!data) return '';

  if (intent === 'parking') {
    const spots = (data.combined || data.spots || []).slice(0, 6);
    if (!spots.length) return '';
    return '\nLive parking near user:\n' + spots.map((s, i) => {
      const parts = [`${i + 1}. ${s.name || s.address || 'Parking'}`];
      if (s.dist_label) parts.push(s.dist_label);
      if (s.cost)       parts.push(`Cost: ${s.cost}`);
      if (s.type)       parts.push(s.type);
      if (s.status)     parts.push(s.status);
      return parts.join(' | ');
    }).join('\n');
  }

  const elements = (data.elements || []).slice(0, 8);
  if (!elements.length) return '';

  return `\nLive ${intent} results near user:\n` + elements.map((el, i) => {
    const t    = el.tags || {};
    const name = t.name || el.name || '';
    if (!name) return null;
    const parts = [`${i + 1}. ${name}`];
    if (t.rating)       parts.push(`★${t.rating}`);
    if (t.open_status)  parts.push(t.open_status);
    if (t.today_hours)  parts.push(t.today_hours);
    if (t.cuisine)      parts.push(t.cuisine);
    if (t.category)     parts.push(t.category);
    if (t.date_label)   parts.push(t.date_label);
    if (t.venue_name)   parts.push(`@ ${t.venue_name}`);
    const addr = [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' ');
    if (addr) parts.push(addr);
    return parts.join(' · ');
  }).filter(Boolean).join('\n');
}

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(req) {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const { messages, lat, lng, location, weather } = await req.json();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return new Response('Missing ANTHROPIC_API_KEY', { status: 500 });

  const latestUser = [...messages].reverse().find(m => m.role === 'user')?.content || '';
  const intent     = detectIntent(latestUser);
  const origin     = new URL(req.url).origin;

  // Fetch live context in parallel with intent resolution
  let liveContext = '';
  if (intent && lat && lng) {
    const data = await fetchLiveData(intent, lat, lng, origin);
    liveContext = summarize(intent, data);
  }

  const timeStr = new Date().toLocaleString('en-US', {
    weekday: 'long', hour: 'numeric', minute: '2-digit', hour12: true,
  });

  const system = `You are Orbi Chat — a sharp, friendly local city guide. Your job is to help people find the best spots, navigate their city, find parking, check transit, and discover events.

User location: ${location || 'unknown (ask if relevant)'}
Time: ${timeStr}${weather ? `\nWeather: ${weather}` : ''}${liveContext}

Rules:
- Be warm and concise — like a knowledgeable local friend, not a corporate chatbot
- When live data is provided above, reference specific places by name with ratings, hours, or distance
- Never invent specific details (hours, prices, addresses) not in the provided data
- If you don't have live data for a request, be honest: tell them to tap the relevant category tile on the main screen for real-time results
- Keep responses to 2–4 sentences unless more detail is clearly needed
- Offer a natural follow-up when helpful ("Want me to compare those two?" / "Should I find parking nearby?")`;

  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json',
    },
    body: JSON.stringify({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 400,
      stream:     true,
      system,
      messages:   messages.map(m => ({ role: m.role, content: m.content })),
    }),
  });

  if (!anthropicRes.ok) {
    const err = await anthropicRes.text();
    return new Response(err, { status: anthropicRes.status });
  }

  // Forward the SSE stream directly to the client
  return new Response(anthropicRes.body, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
  });
}
