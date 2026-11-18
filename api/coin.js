import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 本人確認
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  const { data: au, error: ae } = await supabase.auth.getUser(token);
  if (ae || !au || !au.user) return res.status(401).json({ error: 'Unauthorized' });
  const callerId = au.user.id;

  const { action, userId, amount, description, type } = req.body || {};
  if (!userId || !action) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  const amt = Number(amount);
  if (!Number.isInteger(amt) || amt <= 0 || amt > 10000000) {
    return res.status(400).json({ error: 'Invalid amount' });
  }
  if (action !== 'add' && action !== 'subtract') {
    return res.status(400).json({ error: 'Invalid action' });
  }

  try {
    // 他人の口座は管理者だけ
    const { data: me } = await supabase
      .from('users').select('is_admin').eq('id', callerId).single();
    const isAdmin = !!(me && me.is_admin);
    if (userId !== callerId && !isAdmin) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    // コインを増やせるのは管理者だけ（還元はデータベース側の関数で行う）
    if (action === 'add' && !isAdmin) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // 残高の更新（同時リクエストで二重に使われないよう、読んだ残高のままの時だけ更新）
    let newCoins = null;
    for (let i = 0; i < 5; i++) {
      const { data: user, error: userError } = await supabase
        .from('users').select('coin_points').eq('id', userId).single();
      if (userError || !user) {
        return res.status(404).json({ error: 'User not found' });
      }
      const cur = user.coin_points || 0;
      if (action === 'subtract' && cur < amt) {
        return res.status(400).json({ error: 'Insufficient coins' });
      }
      const next = action === 'add' ? cur + amt : cur - amt;

      let q = supabase.from('users').update({ coin_points: next }).eq('id', userId);
      q = user.coin_points == null ? q.is('coin_points', null) : q.eq('coin_points', user.coin_points);
      const { data: upd, error: updateError } = await q.select('coin_points');
      if (updateError) {
        return res.status(500).json({ error: updateError.message });
      }
      if (upd && upd.length) { newCoins = next; break; }
    }
    if (newCoins === null) {
      return res.status(409).json({ error: 'Busy, retry' });
    }

    // トランザクション記録
    if (type && description) {
      await supabase.from('transactions').insert({
        user_id: userId,
        type,
        amount: amt,
        currency: 'coin',
        description,
      });
    }

    return res.status(200).json({
      success: true,
      newCoins,
      diff: action === 'add' ? amt : -amt
    });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
