export const config = { runtime: 'edge' };

const LANG_NAMES = {
  en: 'English', es: 'Spanish', fr: 'French', de: 'German',
  zh: 'Simplified Chinese', ja: 'Japanese', pt: 'Brazilian Portuguese',
  ar: 'Arabic', hi: 'Hindi', ko: 'Korean', it: 'Italian',
  nl: 'Dutch', ru: 'Russian', pl: 'Polish', tr: 'Turkish',
};

const PLACE_TYPES = {
  restaurant:          /food|eat|restaurant|lunch|dinner|meal|pizza|burger|sushi|dine|hungry|snack|brunch/i,
  cafe:                /coffee|cafe|café|latte|espresso|cappuccino|tea|brew/i,
  bar:                 /bar|beer|cocktail|pub|nightlife|night out|drink/i,
  movie_theater:       /movie|cinema|film|theater|theatre/i,
  tourist_attraction:  /museum|gallery|tourist|sightseeing|attraction|landmark/i,
  amusement_park:      /fun|entertain|bowling|arcade|amusement|activity|activities/i,
};

async function fetchPlaces(lat, lng, type, apiKey) {
  const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?` +
    `location=${lat},${lng}&radius=2000&type=${encodeURIComponent(type)}&key=${apiKey}`;
  try {
    const r = await fetch(url);
    const d = await r.json();
    return (d.results || []).slice(0, 5).map(p => ({
      name:        p.name,
      rating:      p.rating,
      price_level: p.price_level,
      place_id:    p.place_id,
      vicinity:    p.vicinity,
      lat:         p.geometry?.location?.lat,
      lng:         p.geometry?.location?.lng,
      type,
    }));
  } catch { return []; }
}

export default async function handler(req) {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  try {
    const { messages, location, lang } = await req.json();

    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const mapsKey      = process.env.GOOGLE_MAPS_API_KEY;
    if (!anthropicKey) return new Response(JSON.stringify({ error: 'No API key' }), { status: 500 });

    const langName        = LANG_NAMES[lang] || 'English';
    const langInstruction = lang && lang !== 'en'
      ? `\nIMPORTANT: Your ENTIRE response must be in ${langName}. Do not use English at all.`
      : '';

    const lastUser = [...messages].reverse().find(m => m.role === 'user')?.content || '';

    // Detect which venue types to fetch
    const typesToFetch = Object.entries(PLACE_TYPES)
      .filter(([, rx]) => rx.test(lastUser))
      .map(([t]) => t);

    const budgetMatch = lastUser.match(/[\$€£¥₹]\s*(\d+(?:[.,]\d+)?)|(\d+(?:[.,]\d+)?)\s*(?:dollars?|euros?|bucks?|usd|eur)/i);
    const hasBudget   = !!budgetMatch;

    // Default to food + coffee if budget mentioned but no categories
    if (!typesToFetch.length && hasBudget) typesToFetch.push('restaurant', 'cafe');

    // Always fetch venues when GPS is available, even if no category keywords
    if (!typesToFetch.length && location?.lat && location?.lng) {
      typesToFetch.push('restaurant', 'cafe', 'bar');
    }

    // Fetch nearby venues from Google Places
    const allVenues = [];
    if (mapsKey && location?.lat && location?.lng && typesToFetch.length) {
      const fetches = typesToFetch.slice(0, 3).map(t => fetchPlaces(location.lat, location.lng, t, mapsKey));
      const results = await Promise.all(fetches);
      results.forEach(arr => allVenues.push(...arr));
    }

    const locationLabel = location?.city || (location?.lat ? `${location.lat.toFixed(3)},${location.lng.toFixed(3)}` : null);

    const venueContext = allVenues.length
      ? `\n\nUser location: ${locationLabel || 'provided'}\n\nNearby venues available:\n` + allVenues.map((v, i) => {
          const price  = v.price_level ? '$'.repeat(v.price_level) : 'price unknown';
          const rating = v.rating ? `★${v.rating}` : '';
          return `${i + 1}. [${v.type}] ${v.name} | ${price} ${rating} | ${v.vicinity || ''} | place_id:${v.place_id}`;
        }).join('\n')
      : locationLabel
        ? `\n\nThe user is in ${locationLabel}. GPS confirmed — do NOT ask for their location again. No venue data available right now so give general advice based on their budget and preferences for that area.`
        : '\n\nNo GPS location available yet. Ask the user to simply type their city, neighborhood, or area (e.g. "Jersey City" or "downtown Chicago"). Do NOT tell them to use any other app or window.';

    const system = `You are Orbi, a friendly and concise budget planner assistant. Your ONLY purpose is helping users plan their day within a budget by recommending nearby food, coffee, bars, and activities/events.

IMPORTANT: Never tell the user to open another app, go to the main screen, or search anywhere else. Everything happens right here in this chat. If no location is available, simply ask them to type their city or neighborhood.

When a user gives you their budget and preferences:
1. Recommend specific venues from the nearby list provided. Always use real venues from the list — never invent them.
2. Estimate cost per person: cafes $5–10, restaurants $12–35 avg, bars $8–20, movies ~$15, attractions vary.
3. Show a brief budget breakdown at the end, e.g.: "Coffee ~$8 + Lunch ~$20 = $28 of your $50 ✓"
4. Keep it friendly, concise, and practical. 2–3 venue suggestions max per response.

If asked something unrelated to food, drinks, activities, events, or budget planning, reply exactly: "I'm just a budget planner — I can't help with that, but I'd love to help you plan an amazing day out! 😊"
${venueContext}${langInstruction}`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key':         anthropicKey,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 500,
        system,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
      }),
    });

    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);

    const data   = await res.json();
    const text   = data.content?.[0]?.text?.trim() || '';

    // Match venues that are mentioned by name in the response
    const mentioned = allVenues.filter(v => text.toLowerCase().includes(v.name.toLowerCase()));

    return new Response(JSON.stringify({ text, venues: mentioned }), {
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
