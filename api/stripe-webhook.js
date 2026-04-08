const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// コイン付与共通処理
async function grantCoins(session) {
  const { userId, coin, bonus } = session.metadata;

  const { data: user, error: userError } = await supabase
    .from('users')
    .select('coin_points')
    .eq('id', userId)
    .single();

  if (userError || !user) throw new Error('User not found: ' + userId);

  const totalCoin = parseInt(coin) + parseInt(bonus);
  const newCoin = (user.coin_points || 0) + totalCoin;

  await supabase
    .from('users')
    .update({ coin_points: newCoin })
    .eq('id', userId);

  await supabase
    .from('point_purchases')
    .insert({
      user_id: userId,
      amount_jpy: session.amount_total,
      jp_points: parseInt(coin),
      bonus_points: parseInt(bonus),
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
      description: `コインチャージ ¥${session.amount_total?.toLocaleString()}`,
    });

  console.log(`✅ コイン付与完了: ${userId} → +${totalCoin}コイン`);
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
      case 'checkout.session.completed':
        // クレカ：即時完了 → コイン付与
        // 銀行振込：入金待ち → スキップ
        if (session.payment_status === 'paid') {
          await grantCoins(session);
        } else {
          console.log(`⏳ 銀行振込入金待ち: ${session.id}`);
        }
        break;

      case 'checkout.session.async_payment_succeeded':
        // 銀行振込：入金確認後 → コイン付与
        await grantCoins(session);
        break;

      case 'checkout.session.async_payment_failed':
        // 銀行振込：失敗
        console.log(`❌ 銀行振込失敗: ${session.id}`);
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
