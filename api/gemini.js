export default async function handler(req, res) {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "POST only" });
    }
  
    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: "Missing prompt" });
    }
  
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      return res.status(500).json({ error: "Missing GEMINI_API_KEY" });
    }
  
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      }
    );
  
    const data = await r.json();
    res.status(200).json(data);
  }
  