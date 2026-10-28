import { createClient } from '@supabase/supabase-js';
import { CFG, genSet, simulate, applySettings, sanitizePrices } from './_cluster-core.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// 結果の検証用に残す(後から「この結果は本当にこの内容だった」と確認できる)
async function saveSession(row) {
  try { await supabase.from('cluster_sessions').insert(row); } catch (e) { console.error('cluster_sessions insert failed', e); }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { packId, userId, userToken, action, price: reqPrice } = req.body || {};

  // 管理画面の「試算」(Vercel無料プランの関数数上限のため、このファイルに同居)
  if (action === 'admin_sim') {
    const { settings } = req.body || {};
    if (!userId || !userToken) return res.status(400).json({ error: 'Missing required fields' });
    const [{ data: { user }, error: aErr }, { data: u }] = await Promise.all([
      supabase.auth.getUser(userToken),
      supabase.from('users').select('is_admin').eq('id', userId).single(),
    ]);
    if (aErr || !user || user.id !== userId || !u?.is_admin) return res.status(403).json({ error: '権限がありません' });
    applySettings(settings || {});
    CFG.price = 1000;
    const r = simulate(7000);
    return res.status(200).json({ ...r, betRate: CFG.betRate, maxWin: CFG.maxWin });
  }
  if (!packId) return res.status(400).json({ error: 'Missing required fields' });

  // パック(管理画面で作ったFRUIT MAX)の設定を読む
  const { data: pack, error: packErr } = await supabase
    .from('packs').select('id, name, is_active, starts_at, game_type, game_config').eq('id', packId).maybeSingle();
  if (packErr || !pack || pack.game_type !== 'fruit_max') return res.status(404).json({ error: 'ゲームが見つかりません' });
  const config = pack.game_config || {};
  const prices = sanitizePrices(config.prices);
  const startsAtMs = pack.starts_at ? new Date(pack.starts_at).getTime() : 0;
  const notYet = startsAtMs > Date.now();

  // 画面表示用(価格など)。ログイン不要
  if (action === 'info') {
    return res.status(200).json({ name: pack.name, prices, tries: CFG.tries, enabled: pack.is_active !== false && !notYet, startsAt: pack.starts_at || null });
  }

  if (!userId || !userToken) return res.status(400).json({ error: 'Missing required fields' });

  // 認証 + ユーザー情報
  const [{ data: { user }, error: authErr }, { data: userData, error: userErr }] = await Promise.all([
    supabase.auth.getUser(userToken),
    supabase.from('users').select('coin_points, is_banned, is_admin').eq('id', userId).single(),
  ]);
  if (authErr || !user || user.id !== userId) return res.status(401).json({ error: '認証エラー' });
  if (userErr || !userData) return res.status(404).json({ error: 'ユーザーが見つかりません' });
  if (userData.is_banned) return res.status(403).json({ error: 'お客様のアカウントは制限されています' });

  // 公開前・停止中は、管理者だけ遊べる(テスト用)
  if ((pack.is_active === false || notYet) && !userData.is_admin) {
    return res.status(403).json({ error: notYet ? 'まだ販売開始前です' : '現在このゲームは停止中です' });
  }

  // 連打防止(request_locks の (user_id, window_key) UNIQUE を利用)
  const { error: rlErr } = await supabase
    .from('request_locks')
    .insert({ user_id: userId, window_key: `cluster_${Math.floor(Date.now() / 1000)}` });
  if (rlErr) return res.status(429).json({ error: 'リクエストが速すぎます。少し待ってから再度お試しください' });

  const price = Number(reqPrice);
  if (!prices.includes(price)) return res.status(400).json({ error: '不正なリクエストです' });
  if (userData.coin_points < price) return res.status(400).json({ error: 'コインが不足しています' });

  // 購入額を引く(読み取った残高と一致する場合のみ成功する条件付き更新)
  const { data: paid, error: payErr } = await supabase
    .from('users')
    .update({ coin_points: userData.coin_points - price })
    .eq('id', userId).eq('coin_points', userData.coin_points)
    .select('coin_points').single();
  if (payErr || !paid) return res.status(400).json({ error: '処理が混み合っています。もう一度お試しください' });

  // 抽選(結果はここで確定。クライアントは再生するだけ)。パックの設定を反映して、すぐ同期的に抽選する
  let set;
  try { applySettings(config); CFG.price = price; set = genSet(); } catch (e) { set = null; }
  if (!set || set.failed) {
    for (let i = 0; i < 5; i++) {   // 払い戻し
      const { data: cur } = await supabase.from('users').select('coin_points').eq('id', userId).single();
      const { data: ok } = await supabase.from('users').update({ coin_points: cur.coin_points + price })
        .eq('id', userId).eq('coin_points', cur.coin_points).select('coin_points').single();
      if (ok) break;
    }
    return res.status(500).json({ error: '抽選に失敗しました。コインは返却しました' });
  }

  // 商品設定(game_config.items): 獲得コインが範囲に入ったら、コインの代わりに商品(アイテム)を付与する
  // 付与した商品は通常のガチャ同様「アイテム」に入り、保持/コイン交換(claim_draw_item)を選べる
  const items = Array.isArray(config.items) ? config.items : [];
  const hit = set.total > 0 ? items.find(it => set.total >= Number(it.min) && set.total <= Number(it.max)) : null;
  let item = null;
  let balance = null;
  if (hit) {
    const expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const { data: sess, error: sErr } = await supabase.from('draw_sessions').insert({
      user_id: userId, pack_id: packId, draw_count: 1, total_cost: price, currency: 'coin',
      results: [{ prize_name: hit.name, prize_tier: 'c', tier_label: 'FRUIT MAX', value_jp: set.total,
        exchange_type: hit.exchange_type || 'both', image_url: hit.image_url || null, is_converted: false, is_shipped: false }],
      expires_at: expiresAt,
    }).select('id').single();
    if (!sErr && sess) {
      item = { name: hit.name, image_url: hit.image_url || null, value: set.total, exchange_type: hit.exchange_type || 'both', sessionId: sess.id };
      balance = paid.coin_points;
    } else console.error('fruitmax item insert failed', sErr);
  }
  // 商品にならなかった場合(範囲外・商品設定なし・付与失敗)は、これまで通りコインを加算
  if (!item) {
    if (set.total > 0) {
      for (let i = 0; i < 8 && balance === null; i++) {
        const { data: cur } = await supabase.from('users').select('coin_points').eq('id', userId).single();
        const { data: ok } = await supabase.from('users').update({ coin_points: cur.coin_points + set.total })
          .eq('id', userId).eq('coin_points', cur.coin_points).select('coin_points').single();
        if (ok) balance = ok.coin_points;
      }
    } else {
      balance = paid.coin_points;
    }
  }

  await saveSession({
    user_id: userId, pack_id: String(pack.id), price, total_win: set.total,
    credited: balance !== null,
    result: { spins: set.spins, item: item ? { name: item.name, sessionId: item.sessionId } : null },
  });

  if (balance === null) {
    return res.status(500).json({ error: '獲得コインの反映に失敗しました。サポートにお問い合わせください' });
  }
  return res.status(200).json({ set, coin: balance, price, item });
}
