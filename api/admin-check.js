import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const ADMIN_EMAILS = ['csoplayer8110@yahoo.co.jp'];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { token } = req.body;
  if (!token) return res.status(401).json({ isAdmin: false });

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return res.status(401).json({ isAdmin: false });

  const isAdmin = ADMIN_EMAILS.includes(user.email);
  return res.status(200).json({ isAdmin, email: isAdmin ? user.email : null });
}
