export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { code, redirect_uri } = req.body;

  if (!code || !redirect_uri) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  try {
    const response = await fetch('https://api.line.me/oauth2/v2.1/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri,
        client_id: '2009627127',
        client_secret: process.env.LINE_CLIENT_SECRET,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(400).json({ error: data.error_description || 'Token error' });
    }

    return res.status(200).json({ access_token: data.access_token });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
