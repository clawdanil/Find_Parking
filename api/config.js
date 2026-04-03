export const config = { runtime: 'edge' };

export default function handler(req) {
  const key = process.env.GOOGLE_MAPS_API_KEY || '';
  return new Response(JSON.stringify({ mapsKey: key }), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}
