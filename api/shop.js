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
    // クーポン適用（コイン付与型はここで即時付与、割引%型は決済時にサーバー側で反映）
    const { code } = req.body;

    const { data: coupon } = await supabase
      .from('coupons').select('*').eq('code', code).eq('is_active', true).single();

    if (!coupon) return res.status(404).json({ error: 'クーポンが見つかりません' });

    if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
      return res.status(400).json({ error: 'このクーポンは期限切れです' });
    }
    if (coupon.max_total_uses > 0 && (coupon.total_used || 0) >= coupon.max_total_uses) {
      return res.status(400).json({ error: 'このクーポンは配布上限に達しました' });
    }

    // 使用済みチェック
    const { data: used } = await supabase
      .from('coupon_uses').select('id').eq('user_id', userId).eq('coupon_id', coupon.id).single();
    if (used) return res.status(400).json({ error: '既に使用済みです' });

    if (coupon.discount_type === 'coin') {
      const { data: userData } = await supabase
        .from('users').select('coin_points').eq('id', userId).single();
      const newCoin = (userData?.coin_points || 0) + coupon.discount_amount;
      await Promise.all([
        supabase.from('users').update({ coin_points: newCoin }).eq('id', userId),
        supabase.from('coupons').update({ total_used: (coupon.total_used || 0) + 1 }).eq('id', coupon.id),
        supabase.from('coupon_uses').insert({ user_id: userId, coupon_id: coupon.id })
      ]);
      return res.status(200).json({ success: true, newCoin, discountType: 'coin', discountAmount: coupon.discount_amount });
    }

    // 割引%型・プラン別割引型は、ここでは「使用済み」にせず、次回のコイン購入時にサーバー側で自動適用される
    return res.status(200).json({
      success: true,
      discountType: coupon.discount_type,
      discountAmount: coupon.discount_amount,
      maxApplicableAmount: coupon.max_applicable_amount,
      tieredDiscounts: coupon.tiered_discounts,
    });

  } else {
    return res.status(400).json({ error: 'Invalid action' });
  }
}
