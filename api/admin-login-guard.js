import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const WINDOW_MINUTES = 15;
const MAX_ATTEMPTS = 10;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, email } = req.body;
  if (!email) return res.status(400).json({ error: 'メールアドレスが必要です' });

  const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString();

  if (action === 'check') {
    const { count } = await supabase
      .from('admin_login_failures')
      .select('id', { count: 'exact', head: true })
      .eq('email', email)
      .gte('created_at', windowStart);
    const locked = (count || 0) >= MAX_ATTEMPTS;
    return res.status(200).json({ locked, remainingAttempts: Math.max(0, MAX_ATTEMPTS - (count || 0)) });
  }

  if (action === 'record_failure') {
    await supabase.from('admin_login_failures').insert({ email });
    return res.status(200).json({ ok: true });
  }

  if (action === 'clear') {
    await supabase.from('admin_login_failures').delete().eq('email', email);
    return res.status(200).json({ ok: true });
  }

  return res.status(400).json({ error: '不正なリクエストです' });
}
