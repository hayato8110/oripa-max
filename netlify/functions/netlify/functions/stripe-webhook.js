const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

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

  if (stripeEvent.type === 'checkout.session.completed') {
    const session = stripeEvent.data.object;
    const { userId, planId, coin, bonus } = session.metadata;

    try {
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('coin_points')
        .eq('id', userId)
        .single();

      if (userError || !user) {
        console.error('User not found:', userId);
        return res.status(400).send('User not found');
      }

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
    } catch (error) {
      console.error('Database error:', error);
      return res.status(500).send('Database error');
    }
  }

  return res.status(200).json({ received: true });
}

// Vercelではbodyのraw取得が必要
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
    bodyParser: false, // Stripe署名検証のためraw bodyが必要
  },
};
