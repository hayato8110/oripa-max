import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

function pickPrize(prizes, rng, tenjoCount, tenjoLimit) {
  if (tenjoLimit > 0 && tenjoCount >= tenjoLimit - 1) {
    const sarPrizes = prizes.filter(p => p.tier === 'sar');
    if (sarPrizes.length) return sarPrizes[0];
  }
  const total = prizes.reduce((s, p) => s + p.weight, 0);
  let t = rng * total;
  for (const p of prizes) { t -= p.weight; if (t <= 0) return p; }
  return prizes[prizes.length - 1];
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { packId, drawCount, userId, userToken, tenjoCount } = req.body;

  if (!packId || !drawCount || !userId || !userToken) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // トークン検証と各データを並列取得
  const [
    { data: { user }, error: authErr },
    { data: pack, error: packErr },
    { data: userData, error: userErr },
    { data: prizes, error: prizesErr }
  ] = await Promise.all([
    supabase.auth.getUser(userToken),
    supabase.from('packs').select('*').eq('id', packId).single(),
    supabase.from('users').select('coin_points, total_spent').eq('id', userId).single(),
    supabase.from('prizes').select('id, name, tier, tier_label, weight, value_jp, exchange_type, image_url, quantity, remaining_qty, trigger_remaining').eq('pack_id', packId).eq('is_active', true)
  ]);

  if (authErr || !user || user.id !== userId) {
    return res.status(401).json({ error: '認証エラー' });
  }
  if (packErr || !pack) return res.status(404).json({ error: 'パックが見つかりません' });
  if (userErr || !userData) return res.status(404).json({ error: 'ユーザーが見つかりません' });
  if (prizesErr || !prizes?.length) {
    return res.status(400).json({ error: '賞品データの取得に失敗しました' });
  }

  const cost = pack.price * drawCount;

  if (userData.coin_points < cost) {
    return res.status(400).json({ error: 'コインが不足しています' });
  }

  if ((pack.remaining || 0) < drawCount) {
    return res.status(400).json({ error: '残り口数が不足しています' });
  }

  // 在庫コピー
  const prizeStock = {};
  prizes.forEach(p => {
    prizeStock[p.id] = (p.remaining_qty != null ? p.remaining_qty : p.quantity) || 0;
  });

  // 抽選
  const results = [];
  for (let i = 0; i < drawCount; i++) {
    const currentRemaining = (pack.remaining || 0) - i;
    const available = prizes.filter(p => {
      if (prizeStock[p.id] <= 0) return false;
      if (p.trigger_remaining != null && currentRemaining > p.trigger_remaining) return false;
      return true;
    });
    if (!available.length) break;
    const prize = pickPrize(available, Math.random(), tenjoCount + i, pack.tenjo_limit || 0);
    results.push({ prize: { id: prize.id, name: prize.name, tier: prize.tier, tier_label: prize.tier_label, value_jp: prize.value_jp, exchange_type: prize.exchange_type, image_url: prize.image_url } });
    prizeStock[prize.id]--;
  }

  if (!results.length) {
    return res.status(400).json({ error: '在庫がありません' });
  }

  // 在庫・パック・ユーザー・セッションを並列更新
  const usedPrizes = {};
  results.forEach(r => { usedPrizes[r.prize.id] = (usedPrizes[r.prize.id] || 0) + 1; });

  const onStockTotal = prizes.reduce((s, p) => s + prizeStock[p.id], 0);
  const newRemaining = onStockTotal <= 0 ? 0 : Math.max(0, (pack.remaining || 0) - results.length);
  const newCoin = userData.coin_points - cost;
  const newTotalSpent = (userData.total_spent || 0) + cost;
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const [, , , { data: sess }] = await Promise.all([
    Promise.all(Object.entries(usedPrizes).map(([id]) =>
      supabase.from('prizes').update({ remaining_qty: Math.max(0, prizeStock[id]) }).eq('id', id)
    )),
    supabase.from('packs').update({ remaining: newRemaining }).eq('id', packId),
    supabase.from('users').update({ coin_points: newCoin, total_spent: newTotalSpent }).eq('id', userId),
    supabase.from('draw_sessions').insert({
      user_id: userId,
      pack_id: packId,
      draw_count: results.length,
      total_cost: cost,
      currency: 'coin',
      results: results.map(r => ({ prize_name: r.prize.name, prize_tier: r.prize.tier, is_converted: false, is_shipped: false })),
      expires_at: expiresAt,
    }).select('id').single()
  ]);

  return res.status(200).json({
    results,
    sessionId: sess?.id,
    newCoin,
    newRemaining,
    soldOut: newRemaining <= 0,
    expiresAt,
  });
}
