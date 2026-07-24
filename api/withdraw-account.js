import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { userId, userToken } = req.body;
  if (!userId || !userToken) return res.status(400).json({ error: 'Missing required fields' });

  // 本人確認
  const { data: { user }, error: authErr } = await supabase.auth.getUser(userToken);
  if (authErr || !user || user.id !== userId) {
    return res.status(401).json({ error: '認証エラー' });
  }

  // 個人情報を匿名化し、ログインできない状態にする
  // （取引記録は削除せず、法令に基づき保持する）
  const anonEmail = `withdrawn_${userId}@withdrawn.oripa-max.local`;
  const { error: updateErr } = await supabase
    .from('users')
    .update({
      username: '退会済みユーザー',
      is_banned: true,
      coin_points: 0,
      invited_by: null,
      invite_code: null,
    })
    .eq('id', userId);

  if (updateErr) {
    return res.status(500).json({ error: updateErr.message });
  }

  // 発送先住所も匿名化（住所は個人情報のため）
  await supabase
    .from('shipping_addresses')
    .update({ name: '退会済み', tel: '', zip: '', prefecture: '', city: '', address: '', building: '' })
    .eq('user_id', userId);

  // Supabase Auth側のメールアドレスも変更し、再登録を防ぐ
  try {
    await supabase.auth.admin.updateUserById(userId, { email: anonEmail });
  } catch (e) {
    console.error('auth email更新エラー:', e);
  }

  return res.status(200).json({ ok: true });
}
