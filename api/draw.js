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

  const { packId, drawCount, userId, userToken } = req.body;

  if (!packId || !drawCount || !userId || !userToken) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // 天井カウントはクライアント申告を信用せず、実際の抽選履歴から都度サーバー側で算出する
  async function computeTenjoCount() {
    const { data: pastSessions } = await supabase
      .from('draw_sessions')
      .select('results')
      .eq('user_id', userId)
      .eq('pack_id', packId)
      .order('created_at', { ascending: false })
      .limit(200);
    let count = 0;
    for (const s of (pastSessions || [])) {
      const results = s.results || [];
      for (let i = results.length - 1; i >= 0; i--) {
        if (results[i].prize_tier === 'sar') return count;
        count++;
      }
    }
    return count;
  }

  // トークン検証と各データを並列取得
  const [
    { data: { user }, error: authErr },
    { data: pack, error: packErr },
    { data: userData, error: userErr },
    { data: prizes, error: prizesErr },
    { data: packVideos }
  ] = await Promise.all([
    supabase.auth.getUser(userToken),
    supabase.from('packs').select('*').eq('id', packId).single(),
    supabase.from('users').select('coin_points, total_spent, is_banned').eq('id', userId).single(),
    supabase.from('prizes').select('id, name, tier, tier_label, weight, value_jp, exchange_type, image_url, quantity, remaining_qty, trigger_remaining').eq('pack_id', packId).eq('is_active', true),
    supabase.from('pack_videos').select('tier, video_url').eq('pack_id', packId).eq('is_active', true)
  ]);

  if (authErr || !user || user.id !== userId) {
    return res.status(401).json({ error: '認証エラー' });
  }
  if (packErr || !pack) return res.status(404).json({ error: 'パックが見つかりません' });
  if (userErr || !userData) return res.status(404).json({ error: 'ユーザーが見つかりません' });
  if (userData.is_banned) {
    return res.status(403).json({ error: 'お客様のアカウントは制限されています' });
  }
  if (prizesErr || !prizes?.length) {
    return res.status(400).json({ error: '賞品データの取得に失敗しました' });
  }

  // 1人1回限定パックの排他ロック（DB側のunique制約で二重実行を確実に防止）
  if (pack.max_draws_per_user === 1) {
    const { error: lockErr } = await supabase
      .from('one_time_draw_locks')
      .insert({ user_id: userId, pack_id: packId });
    if (lockErr) {
      // unique制約違反 = 既に引いている（連打・多重リクエストもここで確実にブロック）
      return res.status(400).json({ error: 'このガチャは1人1回限定です' });
    }
  }

  // 1日1回限定パックの排他ロック（DB側のunique制約で二重実行を確実に防止）
  const today = new Date().toISOString().slice(0, 10);
  if (pack.is_daily_limit) {
    const { error: dailyLockErr } = await supabase
      .from('daily_gacha_log')
      .insert({ user_id: userId, pack_id: packId, drawn_date: today });
    if (dailyLockErr) {
      return res.status(400).json({ error: 'このガチャは1日1回限定です。明日また挑戦してください！' });
    }
  }

  const cost = pack.price * drawCount;

  // 以降の失敗時にロックを解放するヘルパー
  const releaseLockIfNeeded = async () => {
    if (pack.max_draws_per_user === 1) {
      await supabase.from('one_time_draw_locks').delete().eq('user_id', userId).eq('pack_id', packId);
    }
    if (pack.is_daily_limit) {
      await supabase.from('daily_gacha_log').delete().eq('user_id', userId).eq('pack_id', packId).eq('drawn_date', today);
    }
  };

  if (userData.coin_points < cost) {
    await releaseLockIfNeeded();
    return res.status(400).json({ error: 'コインが不足しています' });
  }

  if ((pack.remaining || 0) < drawCount) {
    await releaseLockIfNeeded();
    return res.status(400).json({ error: '残り口数が不足しています' });
  }

  // コイン残高の減算は「読み取った時点の残高と一致してる場合のみ」成功する条件付き更新にする
  // →同時に2回リクエストが来ても、片方は失敗して二重消費を防げる
  const { data: coinLockResult, error: coinLockErr } = await supabase
    .from('users')
    .update({ coin_points: userData.coin_points - cost, total_spent: (userData.total_spent || 0) + cost })
    .eq('id', userId)
    .eq('coin_points', userData.coin_points)
    .select('coin_points, total_spent')
    .single();

  if (coinLockErr || !coinLockResult) {
    await releaseLockIfNeeded();
    return res.status(409).json({ error: '処理が混み合っています。もう一度お試しください' });
  }

  // 在庫コピー
  const prizeStock = {};
  prizes.forEach(p => {
    prizeStock[p.id] = (p.remaining_qty != null ? p.remaining_qty : p.quantity) || 0;
  });

  // 天井カウントはパックに天井設定がある時だけ計算（余計なクエリを避ける）
  const tenjoCount = pack.tenjo_limit > 0 ? await computeTenjoCount() : 0;

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
    await releaseLockIfNeeded();
    return res.status(400).json({ error: '在庫がありません' });
  }

  // 在庫・パック・ユーザー・セッションを並列更新
  const usedPrizes = {};
  results.forEach(r => { usedPrizes[r.prize.id] = (usedPrizes[r.prize.id] || 0) + 1; });

  const onStockTotal = prizes.reduce((s, p) => s + prizeStock[p.id], 0);
  const newRemaining = onStockTotal <= 0 ? 0 : Math.max(0, (pack.remaining || 0) - results.length);
  let newCoin = coinLockResult.coin_points;
  const newTotalSpent = coinLockResult.total_spent;
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  // ランク階層（累計消費コインで判定）
  const RANKS = [
    { name: 'ランクなし', min: 0, reward: 0 },
    { name: 'ブロンズ', min: 100000, reward: 500 },
    { name: 'シルバー', min: 500000, reward: 5000 },
    { name: 'ゴールド', min: 1500000, reward: 20000 },
    { name: 'プラチナ', min: 2500000, reward: 30000 },
    { name: 'ダイヤ', min: 10000000, reward: 100000 },
    { name: 'シークレットVIP', min: 50000000, reward: 500000 },
  ];
  const oldSpent = userData.total_spent || 0;
  const newlyCrossedRanks = RANKS.filter(r => oldSpent < r.min && newTotalSpent >= r.min);

  let rankRewardTotal = 0;
  for (const r of newlyCrossedRanks) {
    const { error: claimErr } = await supabase
      .from('rank_rewards_claimed')
      .insert({ user_id: userId, rank_name: r.name, reward_coin: r.reward });
    if (!claimErr) rankRewardTotal += r.reward; // unique制約で二重付与を防止
  }
  newCoin += rankRewardTotal;

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
    packVideos: packVideos || [],
    newTotalSpent,
    rankUp: newlyCrossedRanks.length ? newlyCrossedRanks[newlyCrossedRanks.length - 1].name : null,
    rankRewardTotal,
  });
}
