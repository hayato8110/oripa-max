const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

exports.handler = async (event) => {
  const sig = event.headers['stripe-signature'];
  let stripeEvent;

  try {
    stripeEvent = stripe.webhooks.constructEvent(
      event.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  if (stripeEvent.type === 'checkout.session.completed') {
    const session = stripeEvent.data.object;
    const { userId, planId, coin, bonus } = session.metadata;

    try {
      // ユーザーのコインを取得
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('coin_points')
        .eq('id', userId)
        .single();

      if (userError || !user) {
        console.error('User not found:', userId);
        return { statusCode: 400, body: 'User not found' };
      }

      const totalCoin = parseInt(coin) + parseInt(bonus);
      const newCoin = (user.coin_points || 0) + totalCoin;

      // コインを付与
      await supabase
        .from('users')
        .update({ coin_points: newCoin })
        .eq('id', userId);

      // 購入履歴を保存
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

      // トランザクション記録
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
      return { statusCode: 500, body: 'Database error' };
    }
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
