const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ランク階層（累計消費コイン基準）と購入時ボーナス率
const RANKS = [
  { name: 'ランクなし', min: 0, bonusRate: 0 },
  { name: 'ブロンズ', min: 100000, bonusRate: 0 },
  { name: 'シルバー', min: 500000, bonusRate: 0.005 },
  { name: 'ゴールド', min: 1500000, bonusRate: 0.01 },
  { name: 'プラチナ', min: 2500000, bonusRate: 0.015 },
  { name: 'ダイヤ', min: 10000000, bonusRate: 0.02 },
  { name: 'シークレットVIP', min: 50000000, bonusRate: 0.03 },
];
function getRankBonusRate(totalSpent) {
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if ((totalSpent || 0) >= RANKS[i].min) return RANKS[i];
  }
  return RANKS[0];
}

// 決済成功時にクーポン使用履歴を記録する（悪用防止のため、成功時のみ記録）
async function recordCouponUse(userId, couponCode) {
  if (!couponCode) return;
  const { data: coupon } = await supabase.from('coupons').select('id, total_used').eq('code', couponCode).single();
  if (!coupon) return;
  const { error } = await supabase.from('coupon_uses').insert({ user_id: userId, coupon_id: coupon.id });
  if (!error) {
    await supabase.from('coupons').update({ total_used: (coupon.total_used || 0) + 1 }).eq('id', coupon.id);
  }
}

// 友達招待ボーナス（初回コイン購入時に一度だけ判定、招待した側は先着20人まで）
async function processReferralBonus(userId) {
  const { data: buyer } = await supabase
    .from('users')
    .select('invited_by, referral_rewarded')
    .eq('id', userId)
    .single();
  if (!buyer || !buyer.invited_by || buyer.referral_rewarded) return;

  // この招待者が既に何人分のボーナスを出したか
  const { count } = await supabase
    .from('users')
    .select('id', { count: 'exact', head: true })
    .eq('invited_by', buyer.invited_by)
    .eq('referral_rewarded', true);

  // このユーザーの紹介判定は一度きり（条件付き更新で二重処理も防止）
  const { error: markErr } = await supabase
    .from('users')
    .update({ referral_rewarded: true })
    .eq('id', userId)
    .eq('referral_rewarded', false);
  if (markErr) return; // 既に処理済み（同時実行など）

  if ((count || 0) >= 20) {
    console.log(`⚠️ 招待コードの上限(20人)に達しているため紹介ボーナスなし: referrer=${buyer.invited_by}`);
    return;
  }

  const { data: buyerRow } = await supabase.from('users').select('coin_points').eq('id', userId).single();
  if (buyerRow) {
    await supabase.from('users').update({ coin_points: (buyerRow.coin_points || 0) + 150 })
      .eq('id', userId).eq('coin_points', buyerRow.coin_points || 0);
  }
  const { data: referrerRow } = await supabase.from('users').select('coin_points').eq('id', buyer.invited_by).single();
  if (referrerRow) {
    await supabase.from('users').update({ coin_points: (referrerRow.coin_points || 0) + 150 })
      .eq('id', buyer.invited_by).eq('coin_points', referrerRow.coin_points || 0);
  }
  await supabase.from('transactions').insert([
    { user_id: userId, type: 'referral_bonus', amount: 150, currency: 'coin', description: '友達招待ボーナス（招待された側）' },
    { user_id: buyer.invited_by, type: 'referral_bonus', amount: 150, currency: 'coin', description: '友達招待ボーナス（招待した側）' },
  ]);
  console.log(`🎁 紹介ボーナス付与: ${userId} <-> ${buyer.invited_by} 各+150コイン`);
}

// コイン付与共通処理（Checkout Session用）
async function grantCoins(session) {
  const { userId, coin, bonus, couponCode } = session.metadata;

  // 二重付与防止：同じsession.idで既に付与済みかチェック
  const { data: existing } = await supabase
    .from('point_purchases')
    .select('id')
    .eq('stripe_session_id', session.id)
    .single();

  if (existing) {
    console.log(`⚠️ 既に付与済みのSession: ${session.id}`);
    return;
  }

  const { data: user, error: userError } = await supabase
    .from('users')
    .select('coin_points, total_spent')
    .eq('id', userId)
    .single();

  if (userError || !user) throw new Error('User not found: ' + userId);

  const baseCoin = parseInt(coin) + parseInt(bonus);
  const rankInfo = getRankBonusRate(user.total_spent);
  const rankBonusCoin = Math.floor(baseCoin * rankInfo.bonusRate);
  const totalCoin = baseCoin + rankBonusCoin;
  const newCoin = (user.coin_points || 0) + totalCoin;

  await supabase
    .from('users')
    .update({ coin_points: newCoin })
    .eq('id', userId)
    .eq('coin_points', user.coin_points || 0);

  await supabase
    .from('point_purchases')
    .insert({
      user_id: userId,
      amount_jpy: session.amount_total,
      jp_points: parseInt(coin),
      bonus_points: parseInt(bonus) + rankBonusCoin,
      status: 'completed',
      stripe_session_id: session.id,
    });

  await supabase
    .from('transactions')
    .insert({
      user_id: userId,
      type: 'purchase_coin',
      amount: totalCoin,
      currency: 'coin',
      description: `コインチャージ ¥${session.amount_total?.toLocaleString()}${rankBonusCoin > 0 ? `（${rankInfo.name}特典+${rankBonusCoin}）` : ''}`,
    });

  console.log(`✅ コイン付与完了: ${userId} → +${totalCoin}コイン（ランクボーナス+${rankBonusCoin}）`);

  try { await processReferralBonus(userId); } catch (e) { console.error('紹介ボーナスエラー:', e); }
  try { await recordCouponUse(userId, couponCode); } catch (e) { console.error('クーポン記録エラー:', e); }
}

// コイン付与共通処理（PaymentIntent用）
async function grantCoinsFromPaymentIntent(paymentIntent) {
  const { userId, coin, bonus, couponCode } = paymentIntent.metadata;

  const { data: user, error: userError } = await supabase
    .from('users')
    .select('coin_points, total_spent')
    .eq('id', userId)
    .single();

  if (userError || !user) throw new Error('User not found: ' + userId);

  // 二重付与防止：同じpaymentIntentIdで既に付与済みかチェック
  const { data: existing } = await supabase
    .from('point_purchases')
    .select('id')
    .eq('stripe_session_id', paymentIntent.id)
    .single();

  if (existing) {
    console.log(`⚠️ 既に付与済みのPaymentIntent: ${paymentIntent.id}`);
    return;
  }

  const baseCoin = parseInt(coin) + parseInt(bonus || 0);
  const rankInfo = getRankBonusRate(user.total_spent);
  const rankBonusCoin = Math.floor(baseCoin * rankInfo.bonusRate);
  const totalCoin = baseCoin + rankBonusCoin;
  const newCoin = (user.coin_points || 0) + totalCoin;

  await supabase
    .from('users')
    .update({ coin_points: newCoin })
    .eq('id', userId)
    .eq('coin_points', user.coin_points || 0);

  await supabase
    .from('point_purchases')
    .insert({
      user_id: userId,
      amount_jpy: paymentIntent.amount,
      jp_points: parseInt(coin),
      bonus_points: parseInt(bonus || 0) + rankBonusCoin,
      status: 'completed',
      stripe_session_id: paymentIntent.id,
    });

  await supabase
    .from('transactions')
    .insert({
      user_id: userId,
      type: 'purchase_coin',
      amount: totalCoin,
      currency: 'coin',
      description: `コインチャージ ¥${paymentIntent.amount?.toLocaleString()}${rankBonusCoin > 0 ? `（${rankInfo.name}特典+${rankBonusCoin}）` : ''}`,
    });

  console.log(`✅ コイン付与完了(PI): ${userId} → +${totalCoin}コイン（ランクボーナス+${rankBonusCoin}）`);

  try { await processReferralBonus(userId); } catch (e) { console.error('紹介ボーナスエラー:', e); }
  try { await recordCouponUse(userId, couponCode); } catch (e) { console.error('クーポン記録エラー:', e); }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const sig = req.headers['stripe-signature'];
  let stripeEvent;

  try {
    const rawBody = await getRawBody(req);
    stripeEvent = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const session = stripeEvent.data.object;

  try {
    switch (stripeEvent.type) {
      // ── Checkout Session ──
      case 'checkout.session.completed':
        if (session.payment_status === 'paid') {
          await grantCoins(session);
        } else {
          console.log(`⏳ 銀行振込入金待ち: ${session.id}`);
        }
        break;

      case 'checkout.session.async_payment_succeeded':
        await grantCoins(session);
        break;

      case 'checkout.session.async_payment_failed':
        console.log(`❌ 銀行振込失敗: ${session.id}`);
        break;

      // ── Payment Intent（Elements用）──
      case 'payment_intent.succeeded':
        // metadataにuserIdがある場合のみ処理（オリパMAXからの決済）
        if (session.metadata?.userId) {
          await grantCoinsFromPaymentIntent(session);
        }
        break;

      case 'payment_intent.payment_failed':
        console.log(`❌ 決済失敗(PI): ${session.id}`);
        break;

      default:
        console.log(`Unhandled event: ${stripeEvent.type}`);
    }
  } catch (error) {
    console.error('Database error:', error);
    return res.status(500).send('Database error');
  }

  return res.status(200).json({ received: true });
}

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

export const config = {
  api: {
    bodyParser: false,
  },
};
