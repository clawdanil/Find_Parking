export const config = { runtime: 'edge' };

const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

const FEATURE_QUERIES = {
  food: (lat, lng) => `
    node["amenity"~"restaurant|fast_food|food_court|diner|bistro|canteen"](around:800,${lat},${lng});
    way["amenity"~"restaurant|fast_food|food_court|diner|bistro"](around:800,${lat},${lng});
    relation["amenity"~"restaurant|fast_food"](around:800,${lat},${lng});`,

  bars: (lat, lng) => `
    node["amenity"~"bar|pub|biergarten|nightclub|lounge|brewery|tavern"](around:800,${lat},${lng});
    way["amenity"~"bar|pub|biergarten|nightclub|lounge"](around:800,${lat},${lng});
    relation["amenity"~"bar|pub"](around:800,${lat},${lng});`,

  coffee: (lat, lng) => `
    node["amenity"="cafe"](around:1000,${lat},${lng});
    way["amenity"="cafe"](around:1000,${lat},${lng});
    relation["amenity"="cafe"](around:1000,${lat},${lng});
    node["amenity"="fast_food"]["cuisine"~"coffee|tea|espresso|bubble_tea",i](around:1000,${lat},${lng});
    node["shop"~"coffee|tea|beverages"](around:1000,${lat},${lng});
    node["brand"~"Starbucks|Dunkin|Tim Hortons|Peet|Blue Bottle|Gregorys|Joe Coffee",i](around:1000,${lat},${lng});
    way["brand"~"Starbucks|Dunkin|Tim Hortons",i](around:1000,${lat},${lng});
    node["name"~"Coffee|Cafe|Espresso|Brew|Roast|Latte|Cappuccino|Macchiato",i](around:1000,${lat},${lng});
    way["name"~"Coffee|Cafe|Espresso|Brew",i](around:1000,${lat},${lng});`,

  gym: (lat, lng) => `
    node["leisure"~"fitness_centre|sports_centre|sports_hall"](around:1200,${lat},${lng});
    way["leisure"~"fitness_centre|sports_centre|sports_hall"](around:1200,${lat},${lng});
    relation["leisure"~"fitness_centre|sports_centre"](around:1200,${lat},${lng});
    node["amenity"~"gym|dojo"](around:1200,${lat},${lng});
    way["amenity"~"gym|dojo"](around:1200,${lat},${lng});
    node["sport"~"fitness|gym|crossfit|yoga|pilates|martial_arts|swimming"](around:1200,${lat},${lng});
    way["sport"~"fitness|gym|crossfit|yoga|pilates"](around:1200,${lat},${lng});
    node["name"~"Gym|Fitness|Planet Fitness|LA Fitness|Equinox|CrossFit|YMCA|Sculpt|Orangetheory|Anytime|Crunch|SoulCycle|Barry|F45|Studio",i](around:1200,${lat},${lng});
    way["name"~"Gym|Fitness|Planet Fitness|LA Fitness|Equinox|CrossFit|YMCA|Sculpt|Orangetheory|Anytime",i](around:1200,${lat},${lng});`,

  shopping: (lat, lng) => `
    node["shop"~"mall|supermarket|department_store|convenience|clothing|grocery|general|wholesale|gift|electronics|jewelry|shoes|sports|books"](around:2000,${lat},${lng});
    way["shop"~"mall|supermarket|department_store|clothing|grocery|electronics"](around:2000,${lat},${lng});
    relation["shop"~"mall|supermarket|department_store"](around:2000,${lat},${lng});
    way["leisure"="shopping_centre"](around:2000,${lat},${lng});
    relation["leisure"="shopping_centre"](around:2000,${lat},${lng});
    node["leisure"="shopping_centre"](around:2000,${lat},${lng});
    way["name"~"Mall|Plaza|Center|Centre|Newport|Market|Square|Galleria|Outlet",i](around:2000,${lat},${lng});
    relation["name"~"Mall|Plaza|Center|Centre|Newport|Market|Square|Galleria",i](around:2000,${lat},${lng});`,
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

async function queryOverpass(overpassQuery) {
  const body = `[out:json][timeout:25];\n(\n${overpassQuery}\n);\nout center 50;`;
  const encoded = 'data=' + encodeURIComponent(body);

  for (const mirror of OVERPASS_MIRRORS) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 20000);
      const res = await fetch(mirror, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: encoded,
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (!res.ok) continue;
      const data = await res.json();
      const elements = data.elements || [];
      if (elements.length > 0) return elements; // return first mirror with actual results
    } catch {
      // try next mirror
    }
  }
  return [];
}

export default async function handler(req) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return json({ error: 'Method not allowed' }, 405);
  }

  let lat, lng, feature;
  if (req.method === 'POST') {
    try { ({ lat, lng, feature } = await req.json()); } catch { return json({ error: 'Bad request' }, 400); }
  } else {
    const p = new URL(req.url).searchParams;
    lat = parseFloat(p.get('lat'));
    lng = parseFloat(p.get('lng'));
    feature = p.get('feature');
  }

  if (!lat || !lng || !feature || !FEATURE_QUERIES[feature]) {
    return json({ error: 'Missing or invalid params: lat, lng, feature required' }, 400);
  }

  try {
    const queryFn = FEATURE_QUERIES[feature];
    const elements = await queryOverpass(queryFn(lat, lng));
    return json({ elements, feature, count: elements.length });
  } catch (err) {
    return json({ error: err.message || 'Overpass query failed' }, 500);
  }
}
