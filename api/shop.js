import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// コインを「今の残高に足す（マイナスなら引く）」。
// 他の処理と同時に動いても上書きしないよう、残高が読んだ時と同じ場合だけ更新し、違えば読み直して再試行する。
// 残高がマイナスになる場合や、何度やっても競合した場合は null を返す。
async function addCoins(userId, delta) {
  for (let i = 0; i < 8; i++) {
    const { data: cur } = await supabase.from('users').select('coin_points').eq('id', userId).single();
    if (!cur) return null;
    const base = cur.coin_points || 0;
    const next = base + delta;
    if (next < 0) return null;
    const { data: upd } = await supabase
      .from('users')
      .update({ coin_points: next })
      .eq('id', userId)
      .eq('coin_points', base)
      .select('coin_points')
      .single();
    if (upd) return upd.coin_points;
  }
  return null;
}

// 在庫を戻す（失敗時の巻き戻し用）
async function restoreStock(itemId, qty) {
  for (let i = 0; i < 8; i++) {
    const { data: cur } = await supabase.from('shop_items').select('stock').eq('id', itemId).single();
    if (!cur) return;
    const { data: upd } = await supabase
      .from('shop_items')
      .update({ stock: (cur.stock || 0) + qty })
      .eq('id', itemId)
      .eq('stock', cur.stock || 0)
      .select('id')
      .single();
    if (upd) return;
  }
}

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
    const { itemId } = req.body;
    const qty = Number(req.body.qty);
    if (!itemId || !Number.isInteger(qty) || qty < 1 || qty > 99) {
      return res.status(400).json({ error: '数量が不正です' });
    }

    const [{ data: item }, { data: userData }] = await Promise.all([
      supabase.from('shop_items').select('*').eq('id', itemId).single(),
      supabase.from('users').select('coin_points, is_banned').eq('id', userId).single()
    ]);

    if (!item) return res.status(404).json({ error: '商品が見つかりません' });
    if (!userData) return res.status(404).json({ error: 'ユーザーが見つかりません' });
    if (userData.is_banned) return res.status(403).json({ error: 'お客様のアカウントは制限されています' });

    const price = Number(item.price);
    if (!Number.isInteger(price) || price <= 0) {
      return res.status(400).json({ error: '商品の価格が不正です' });
    }
    const totalPrice = price * qty;

    if (userData.coin_points < totalPrice) {
      return res.status(400).json({ error: 'コインが不足しています' });
    }
    if ((item.stock || 0) < qty) {
      return res.status(400).json({ error: '在庫が不足しています' });
    }

    // 1) 在庫を確保（残数が読んだ時と同じ場合だけ成功＝同時購入での売り越しを防ぐ）
    const { data: stockOk } = await supabase
      .from('shop_items')
      .update({ stock: item.stock - qty })
      .eq('id', itemId)
      .eq('stock', item.stock)
      .select('id')
      .single();
    if (!stockOk) {
      return res.status(409).json({ error: '処理が混み合っています。もう一度お試しください' });
    }

    // 2) コインを引く（残高が足りない・競合した場合は在庫を戻して終了）
    const newCoin = await addCoins(userId, -totalPrice);
    if (newCoin === null) {
      await restoreStock(itemId, qty);
      return res.status(400).json({ error: 'コインが不足しているか、処理が混み合っています' });
    }

    // 3) 注文を保存（失敗したらコインと在庫を戻す）
    const orders = Array.from({ length: qty }, () => ({
      id: crypto.randomUUID(),
      user_id: userId,
      item_id: itemId,
      item_name: item.name,
      price: item.price,
      status: 'pending'
    }));
    const { error: orderErr } = await supabase.from('shop_orders').insert(orders);
    if (orderErr) {
      await addCoins(userId, totalPrice);
      await restoreStock(itemId, qty);
      return res.status(500).json({ error: '注文の保存に失敗しました。もう一度お試しください' });
    }

    await supabase.from('transactions').insert({
      user_id: userId, type: 'shop_purchase', amount: -totalPrice,
      currency: 'coin', description: `交換所: ${item.name} ×${qty}`
    });

    return res.status(200).json({ success: true, newCoin, orderId: orders[0].id });

  } else if (action === 'coupon') {
    // クーポン適用（コイン付与型はここで即時付与、割引%型は決済時にサーバー側で反映）
    const code = String(req.body.code || '').trim().toUpperCase();
    if (!code) return res.status(400).json({ error: 'クーポンコードを入力してください' });

    // クーポン使用にはLINE連携が必要（画面側だけでなくサーバー側でも確認する）
    const { data: me } = await supabase
      .from('users').select('line_id, is_banned').eq('id', userId).single();
    if (!me) return res.status(404).json({ error: 'ユーザーが見つかりません' });
    if (me.is_banned) return res.status(403).json({ error: 'お客様のアカウントは制限されています' });
    if (!me.line_id) return res.status(403).json({ error: 'クーポンの使用にはLINE連携が必要です' });

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
      const amt = Number(coupon.discount_amount);
      if (!Number.isInteger(amt) || amt <= 0) {
        return res.status(400).json({ error: 'クーポンの設定が不正です' });
      }
      // 先に「使用済み」を記録してからコインを付与する
      // （同時に何回送られても、記録に成功した1回だけがコインを受け取れる。要：coupon_usesの(user_id, coupon_id)UNIQUE）
      const { error: claimErr } = await supabase
        .from('coupon_uses').insert({ user_id: userId, coupon_id: coupon.id });
      if (claimErr) return res.status(400).json({ error: '既に使用済みです' });

      const newCoin = await addCoins(userId, amt);
      if (newCoin === null) {
        await supabase.from('coupon_uses').delete().eq('user_id', userId).eq('coupon_id', coupon.id);
        return res.status(500).json({ error: '処理が混み合っています。もう一度お試しください' });
      }
      await supabase.from('coupons').update({ total_used: (coupon.total_used || 0) + 1 }).eq('id', coupon.id);
      return res.status(200).json({ success: true, newCoin, discountType: 'coin', discountAmount: amt });
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
