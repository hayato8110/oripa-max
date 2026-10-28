import { createClient } from '@supabase/supabase-js';
import { CFG, applySettings, simulate } from './_cluster-core.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// 管理画面のパック作成で使う「試算」。保存はしない(保存は管理画面がpacksテーブルに直接書く)
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { userId, userToken, settings } = req.body || {};
  if (!userId || !userToken) return res.status(400).json({ error: 'Missing required fields' });

  // 管理者チェック(users.is_admin)
  const [{ data: { user }, error: authErr }, { data: u }] = await Promise.all([
    supabase.auth.getUser(userToken),
    supabase.from('users').select('is_admin').eq('id', userId).single(),
  ]);
  if (authErr || !user || user.id !== userId || !u?.is_admin) return res.status(403).json({ error: '権限がありません' });

  applySettings(settings || {});
  CFG.price = 1000;   // 還元率は価格に関係なく同じ
  const r = simulate(7000);
  return res.status(200).json({ ...r, betRate: CFG.betRate, maxWin: CFG.maxWin });
}
