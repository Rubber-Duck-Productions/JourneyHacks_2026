export default async function handler(req, res) {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "POST only" });
    }
  
    const { query, lat, lng, radius = 4500 } = req.body;
    if (!query || lat == null || lng == null) {
      return res.status(400).json({ error: "Missing params" });
    }
  
    const key = process.env.GOOGLE_MAPS_API_KEY;
    if (!key) {
      return res.status(500).json({ error: "Missing GOOGLE_MAPS_API_KEY" });
    }
  
    const url =
      `https://maps.googleapis.com/maps/api/place/textsearch/json` +
      `?query=${encodeURIComponent(query)}` +
      `&location=${lat},${lng}` +
      `&radius=${radius}` +
      `&key=${key}`;
  
    const r = await fetch(url);
    const data = await r.json();
    res.status(200).json(data);
  }
  