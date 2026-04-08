import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action, userId, amount, description, type } = req.body;

  if (!userId || !action) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // 現在のコイン残高を取得
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('coin_points')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const currentCoins = user.coin_points || 0;
    let newCoins;

    if (action === 'add') {
      // コイン追加（還元・クーポン等）
      if (!amount || amount <= 0) {
        return res.status(400).json({ error: 'Invalid amount' });
      }
      newCoins = currentCoins + amount;

    } else if (action === 'subtract') {
      // コイン消費（購入等）
      if (!amount || amount <= 0) {
        return res.status(400).json({ error: 'Invalid amount' });
      }
      if (currentCoins < amount) {
        return res.status(400).json({ error: 'Insufficient coins' });
      }
      newCoins = currentCoins - amount;

    } else {
      return res.status(400).json({ error: 'Invalid action' });
    }

    // コイン残高を更新
    const { error: updateError } = await supabase
      .from('users')
      .update({ coin_points: newCoins })
      .eq('id', userId);

    if (updateError) {
      return res.status(500).json({ error: updateError.message });
    }

    // トランザクション記録
    if (type && description) {
      await supabase.from('transactions').insert({
        user_id: userId,
        type,
        amount,
        currency: 'coin',
        description,
      });
    }

    return res.status(200).json({ 
      success: true, 
      newCoins,
      diff: action === 'add' ? amount : -amount
    });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
