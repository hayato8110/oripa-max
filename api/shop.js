import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, userId, userToken } = req.body;

  // 認証確認
  const { data: { user }, error: authErr } = await supabase.auth.getUser(userToken);
  if (authErr || !user || user.id !== userId) {
    return res.status(401).json({ error: '認証エラー' });
  }

  if (action === 'purchase') {
    // 交換所購入
    const { itemId, qty } = req.body;

    const [{ data: item }, { data: userData }] = await Promise.all([
      supabase.from('shop_items').select('*').eq('id', itemId).single(),
      supabase.from('users').select('coin_points').eq('id', userId).single()
    ]);

    if (!item) return res.status(404).json({ error: '商品が見つかりません' });
    if (!userData) return res.status(404).json({ error: 'ユーザーが見つかりません' });

    const totalPrice = item.price * qty;

    if (userData.coin_points < totalPrice) {
      return res.status(400).json({ error: 'コインが不足しています' });
    }
    if ((item.stock || 0) < qty) {
      return res.status(400).json({ error: '在庫が不足しています' });
    }

    const newCoin = userData.coin_points - totalPrice;

    await Promise.all([
      supabase.from('users').update({ coin_points: newCoin }).eq('id', userId),
      supabase.from('shop_items').update({ stock: Math.max(0, item.stock - qty) }).eq('id', itemId),
      supabase.from('transactions').insert({
        user_id: userId, type: 'shop_purchase', amount: -totalPrice,
        currency: 'coin', description: `交換所: ${item.name} ×${qty}`
      })
    ]);

    // 注文を保存
    const orders = Array.from({ length: qty }, () => ({
      id: crypto.randomUUID(),
      user_id: userId,
      item_id: itemId,
      item_name: item.name,
      price: item.price,
      status: 'pending'
    }));
    await supabase.from('shop_orders').insert(orders);

    return res.status(200).json({ success: true, newCoin, orderId: orders[0].id });

  } else if (action === 'coupon') {
    // クーポン適用
    const { code } = req.body;

    const { data: coupon } = await supabase
      .from('coupons').select('*').eq('code', code).eq('is_active', true).single();

    if (!coupon) return res.status(404).json({ error: 'クーポンが見つかりません' });

    // 使用済みチェック
    const { data: used } = await supabase
      .from('coupon_uses').select('id').eq('user_id', userId).eq('coupon_id', coupon.id).single();
    if (used) return res.status(400).json({ error: '既に使用済みです' });

    const { data: userData } = await supabase
      .from('users').select('coin_points').eq('id', userId).single();

    let newCoin = userData.coin_points;
    if (coupon.discount_type === 'coin') {
      newCoin += coupon.discount_amount;
      await supabase.from('users').update({ coin_points: newCoin }).eq('id', userId);
    }

    await Promise.all([
      supabase.from('coupons').update({ total_used: (coupon.total_used || 0) + 1 }).eq('id', coupon.id),
      supabase.from('coupon_uses').insert({ user_id: userId, coupon_id: coupon.id })
    ]);

    return res.status(200).json({
      success: true,
      newCoin,
      discountType: coupon.discount_type,
      discountAmount: coupon.discount_amount
    });

  } else {
    return res.status(400).json({ error: 'Invalid action' });
  }
}
