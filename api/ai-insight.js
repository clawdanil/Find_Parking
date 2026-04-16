export const config = { runtime: 'edge' };

const FEATURE_LABEL = {
  food:          'restaurants and food spots',
  bars:          'bars and nightlife venues',
  coffee:        'cafes and coffee shops',
  gym:           'gyms and fitness centers',
  entertainment: 'entertainment venues',
  events:        'upcoming local events',
  parking:       'parking spots and garages',
  transit:       'transit stops and public transport options',
  shopping:      'shopping stores and retail venues',
};

const LANG_NAMES = {
  en: 'English', es: 'Spanish', fr: 'French', de: 'German',
  zh: 'Simplified Chinese', ja: 'Japanese', pt: 'Brazilian Portuguese',
  ar: 'Arabic', hi: 'Hindi', ko: 'Korean',
};

export default async function handler(req) {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  try {
    const { feature, items, location, timeStr, weather, lang } = await req.json();

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return new Response(JSON.stringify({ error: 'No API key configured' }), { status: 500 });

    const label = FEATURE_LABEL[feature] || feature;
    const langName = LANG_NAMES[lang] || 'English';
    const langInstruction = lang && lang !== 'en'
      ? `\nIMPORTANT: You MUST write your entire response in ${langName}. Do not use English.`
      : '';

    // Build a compact but rich summary of the results
    const itemsList = (items || []).slice(0, 8).map((r, i) => {
      const parts = [`${i + 1}. ${r.name}`];
      if (r.rating)      parts.push(`★${r.rating}`);
      if (r.price_level) parts.push('$'.repeat(r.price_level));
      if (r.dist)        parts.push(`${r.dist}mi away`);
      if (r.open_now === true)  parts.push('open now');
      if (r.open_now === false) parts.push('currently closed');
      if (r.cuisine)     parts.push(r.cuisine);
      if (r.category)    parts.push(r.category);
      if (r.time_limit)  parts.push(r.time_limit);
      if (r.cost)        parts.push(r.cost);
      if (r.date_label)  parts.push(r.date_label);
      if (r.venue_name)  parts.push(`@ ${r.venue_name}`);
      return parts.join(' · ');
    }).join('\n');

    const prompt = `You are a sharp, knowledgeable local city guide. A user is exploring ${label} near ${location}.

Here are the results they're seeing:
${itemsList}

Current time: ${timeStr}${weather ? `\nWeather: ${weather}` : ''}

Give 2–3 crisp, useful insights that a savvy local would share — not generic advice. Reference specific places by name where relevant. Consider: which is the standout pick and why, any timing or crowd tip, or a practical fact about this area right now. Under 65 words. No bullet points. Write like you're texting a friend who asked for a recommendation.${langInstruction}`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 160,
        messages:   [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Anthropic ${res.status}: ${err}`);
    }

    const data    = await res.json();
    const insight = data.content?.[0]?.text?.trim() || '';

    return new Response(JSON.stringify({ insight }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
