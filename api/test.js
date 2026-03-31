export default function handler(req, res) {
  res.json({
    hasKey: !!process.env.ANTHROPIC_API_KEY,
    keyPrefix: process.env.ANTHROPIC_API_KEY?.slice(0, 10) || 'NOT FOUND'
  });
}
