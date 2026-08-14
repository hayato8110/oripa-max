import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

function pickPrize(prizes, rng, tenjoCount, tenjoLimit, prizeStock) {
  if (tenjoLimit > 0 && tenjoCount >= tenjoLimit - 1) {
    const sarPrizes = prizes.filter(p => p.tier === 'sar');
    if (sarPrizes.length) return sarPrizes[0];
  }
  // 確率は残り在庫数に比例させる（真の抽選箱方式）。
  // static weightだけで決めると、レア賞品の在庫が最後まで温存され、
  // ハズレ在庫が尽きた瞬間に「消去法で強制当選」する偏りが生まれるため。
  const total = prizes.reduce((s, p) => s + (prizeStock[p.id] || 0), 0);
  let t = rng * total;
  for (const p of prizes) { t -= (prizeStock[p.id] || 0); if (t <= 0) return p; }
  return prizes[prizes.length - 1];
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { packId, drawCount, userId, userToken } = req.body;

  if (!packId || !drawCount || !userId || !userToken) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (!Number.isInteger(drawCount) || drawCount <= 0 || drawCount > 1000) {
    return res.status(400).json({ error: '不正なリクエストです' });
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
    supabase.from('prizes').select('id, name, tier, tier_label, weight, value_jp, slot_coin_min, slot_coin_max, exchange_type, image_url, quantity, remaining_qty, trigger_remaining').eq('pack_id', packId).eq('is_active', true),
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

  // 連打防止：同じユーザーが1秒以内に連続でリクエストしたら拒否する
  // （request_locksテーブルに (user_id, window_key) のUNIQUE制約が必要）
  const rateLimitWindow = Math.floor(Date.now() / 1000); // 1秒単位の窓
  const { error: rateLimitErr } = await supabase
    .from('request_locks')
    .insert({ user_id: userId, window_key: `draw_${rateLimitWindow}` });
  if (rateLimitErr) {
    return res.status(429).json({ error: 'リクエストが速すぎます。少し待ってから再度お試しください' });
  }

  // 必要チャージ額：このパックが「公開されていて、かつ販売開始時刻(starts_at)を過ぎていた期間」
  // 中にチャージした金額だけを見る（非公開中・予約公開でまだ販売開始前のチャージは対象外。
  //  active_periodsが無い古いパックはpublished_at/created_atで代用する）
  let earnedAttempts = Infinity;
  if (pack.required_charge > 0) {
    const { data: purchases } = await supabase
      .from('point_purchases')
      .select('amount_jpy, created_at')
      .eq('user_id', userId);
    const periods = (pack.active_periods && pack.active_periods.length)
      ? pack.active_periods
      : [{ start: pack.published_at || pack.created_at || 0, end: null }];
    const startsAtMs = pack.starts_at ? new Date(pack.starts_at).getTime() : 0;
    const eligibleCharge = (purchases || [])
      .filter(p => {
        const t = new Date(p.created_at).getTime();
        if (t < startsAtMs) return false; // 予約公開の販売開始前は対象外
        return periods.some(period => {
          const start = new Date(period.start).getTime();
          const end = period.end ? new Date(period.end).getTime() : Infinity;
          return t >= start && t < end;
        });
      })
      .reduce((s, p) => s + (p.amount_jpy || 0), 0);
    earnedAttempts = Math.floor(eligibleCharge / pack.required_charge);
    if (earnedAttempts <= 0) {
      return res.status(400).json({
        error: `このガチャを引くには、パック公開後に累計チャージ額${pack.required_charge.toLocaleString()}円が必要です（現在${eligibleCharge.toLocaleString()}円）`,
      });
    }
  }

  // 挑戦回数の上限（1人◯回まで、と必要チャージ額の両方があれば、より厳しい方を採用）
  const effectiveLimit = pack.max_draws_per_user > 0
    ? Math.min(pack.max_draws_per_user, earnedAttempts)
    : earnedAttempts;

  // 挑戦回数を安全にカウント（楽観ロック。count一致時のみ更新し、同時多重実行を防止）
  // ※チャージ制パックは「引いた枚数(drawCount)の累計」で消費、通常の1人◯回までパックは
  //  従来通り「引いた回数(クリック数)」で消費する。
  const consumeUnit = pack.required_charge > 0 ? drawCount : 1;
  if (effectiveLimit < Infinity) {
    const { data: attemptRow } = await supabase
      .from('pack_draw_attempts')
      .select('count')
      .eq('user_id', userId).eq('pack_id', packId)
      .maybeSingle();
    const currentCount = attemptRow?.count || 0;
    const remainingAttempts = effectiveLimit - currentCount;
    if (remainingAttempts <= 0) {
      return res.status(400).json({ error: pack.required_charge > 0 ? 'このガチャを引く権利を使い切りました。追加でチャージすると挑戦できます' : `このガチャは1人${effectiveLimit}回までです` });
    }
    if (consumeUnit > remainingAttempts) {
      return res.status(400).json({ error: pack.required_charge > 0 ? `残り${remainingAttempts}回分の権利しかありません（${drawCount}連は引けません）` : `残り${remainingAttempts}回までです` });
    }
    if (attemptRow) {
      const { error: incErr } = await supabase
        .from('pack_draw_attempts')
        .update({ count: currentCount + consumeUnit })
        .eq('user_id', userId).eq('pack_id', packId).eq('count', currentCount);
      if (incErr) return res.status(400).json({ error: '処理が混み合っています。もう一度お試しください' });
    } else {
      const { error: insErr } = await supabase
        .from('pack_draw_attempts')
        .insert({ user_id: userId, pack_id: packId, count: consumeUnit });
      if (insErr) return res.status(400).json({ error: '処理が混み合っています。もう一度お試しください' });
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
    if (effectiveLimit < Infinity) {
      const { data: row } = await supabase.from('pack_draw_attempts').select('count').eq('user_id', userId).eq('pack_id', packId).maybeSingle();
      if (row && row.count > 0) {
        await supabase.from('pack_draw_attempts').update({ count: row.count - 1 }).eq('user_id', userId).eq('pack_id', packId);
      }
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
  // ※ランクはチャージ額ベースに変更したため、total_spentはここでは更新しない
  const { data: coinLockResult, error: coinLockErr } = await supabase
    .from('users')
    .update({ coin_points: userData.coin_points - cost })
    .eq('id', userId)
    .eq('coin_points', userData.coin_points)
    .select('coin_points')
    .single();

  if (coinLockErr || !coinLockResult) {
    await releaseLockIfNeeded();
    return res.status(409).json({ error: '処理が混み合っています。もう一度お試しください' });
  }

  // 在庫コピー（口数無制限パックでは使わない）
  const prizeStock = {};
  prizes.forEach(p => {
    prizeStock[p.id] = (p.remaining_qty != null ? p.remaining_qty : p.quantity) || 0;
  });

  // 天井カウントはパックに天井設定がある時だけ計算（余計なクエリを避ける）
  const tenjoCount = pack.tenjo_limit > 0 ? await computeTenjoCount() : 0;

  // 抽選
  const results = [];
  for (let i = 0; i < drawCount; i++) {
    let prize;
    if (pack.unlimited_draws) {
      // 口数無制限: 在庫を見ず、固定weightだけで毎回同じ確率で抽選(実スロットのRTP方式)
      prize = pickPrizeUnlimited(prizes, Math.random(), tenjoCount + i, pack.tenjo_limit || 0);
    } else {
      const currentRemaining = (pack.remaining || 0) - i;
      const available = prizes.filter(p => {
        if (prizeStock[p.id] <= 0) return false;
        if (p.trigger_remaining != null && currentRemaining > p.trigger_remaining) return false;
        return true;
      });
      if (!available.length) break;
      prize = pickPrize(available, Math.random(), tenjoCount + i, pack.tenjo_limit || 0, prizeStock);
      prizeStock[prize.id]--;
    }
    // スロット表示コイン範囲は、スロット演出のパックでのみ適用する
    // (動画/カラー演出のパックでは、うっかり範囲を設定してても無視して固定の還元コインを使う)
    let effectiveValueJp = prize.value_jp;
    if (pack.animation_type === 'slot' && prize.slot_coin_min != null && prize.slot_coin_max != null && prize.slot_coin_max >= prize.slot_coin_min) {
      effectiveValueJp = prize.slot_coin_min + Math.floor(Math.random() * (prize.slot_coin_max - prize.slot_coin_min + 1));
    }
    results.push({ prize: { id: prize.id, name: prize.name, tier: prize.tier, tier_label: prize.tier_label, value_jp: effectiveValueJp, exchange_type: prize.exchange_type, image_url: prize.image_url } });
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
  const expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
  // ランク判定は「チャージ額」ベースに変更したため、ここでは行わない
  // （コインチャージが確定する処理側でランク判定・報酬付与を行う）

// 在庫を安全に減算する（同時アクセスで他のリクエストの減算が消えないよう、
// 最新値を都度読み直しながら「更新できるまで」再試行する）
async function safeDecrement(table, id, amount, floorZero = true) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const col = table === 'prizes' ? 'remaining_qty' : 'remaining';
    const { data: cur } = await supabase.from(table).select(col).eq('id', id).single();
    if (!cur) return false;
    const curVal = cur[col] || 0;
    const newVal = floorZero ? Math.max(0, curVal - amount) : curVal - amount;
    const { data: updated } = await supabase
      .from(table)
      .update({ [col]: newVal })
      .eq('id', id)
      .eq(col, curVal)
      .select('id')
      .single();
    if (updated) return true;
    // 他のリクエストが同時に更新した→最新値で再試行
  }
  return false;
}

  const [, , , { data: sess }] = await Promise.all([
    Promise.all(Object.entries(usedPrizes).map(([id, qty]) => safeDecrement('prizes', id, qty))),
    safeDecrement('packs', packId, results.length),
    supabase.from('users').update({ coin_points: newCoin }).eq('id', userId),
    supabase.from('draw_sessions').insert({
      user_id: userId,
      pack_id: packId,
      draw_count: results.length,
      total_cost: cost,
      currency: 'coin',
      results: results.map(r => ({ prize_name: r.prize.name, prize_tier: r.prize.tier, tier_label: r.prize.tier_label, value_jp: r.prize.value_jp || 0, exchange_type: r.prize.exchange_type, image_url: r.prize.image_url, is_converted: false, is_shipped: false })),
      expires_at: expiresAt,
    }).select('id').single()
  ]);

  // 表示用の残数は、実際にDBへ反映された最新値を取得し直す
  const { data: freshPack } = await supabase.from('packs').select('remaining').eq('id', packId).single();
  const finalRemaining = freshPack ? freshPack.remaining : newRemaining;

  return res.status(200).json({
    results,
    sessionId: sess?.id,
    newCoin,
    newRemaining: finalRemaining,
    soldOut: finalRemaining <= 0,
    expiresAt,
    packVideos: packVideos || [],
  });
}
