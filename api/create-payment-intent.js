const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const PLANS = [
  { id: 'p110',     coin: 110,     amount: 110 },
  { id: 'p550',     coin: 550,     amount: 550 },
  { id: 'p1100',    coin: 1100,    amount: 1100 },
  { id: 'p3300',    coin: 3300,    amount: 3300 },
  { id: 'p5500',    coin: 5500,    amount: 5500 },
  { id: 'p11000',   coin: 11000,   amount: 11000 },
  { id: 'p22000',   coin: 22000,   amount: 22000 },
  { id: 'p50000',   coin: 50000,   amount: 50000 },
  { id: 'p100000',  coin: 100000,  amount: 100000 },
  { id: 'p300000',  coin: 300000,  amount: 300000 },
  { id: 'p500000',  coin: 500000,  amount: 500000 },
  { id: 'p1000000', coin: 1000000, amount: 1000000 },
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://oripa-max.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { planId, userId, userToken, method, couponCode } = req.body;
    if (!userToken) return res.status(400).json({ error: 'Missing token' });

    // 本人確認：リクエストしてきたuserTokenが、本当にuserIdの持ち主かを検証する
    const { data: { user }, error: authErr } = await supabase.auth.getUser(userToken);
    if (authErr || !user || user.id !== userId) {
      return res.status(401).json({ error: '認証エラー' });
    }
    const userEmail = user.email;

    const plan = PLANS.find(p => p.id === planId);
    if (!plan) return res.status(400).json({ error: 'Invalid plan' });

    // クーポンの検証（サーバー側で必ず再検証し、金額を確定する）
    console.log('DEBUG couponCode受信:', JSON.stringify(couponCode));
    let finalAmount = plan.amount;
    let appliedCouponCode = null;
    if (couponCode) {
      const { data: coupon } = await supabase
        .from('coupons')
        .select('*')
        .eq('code', couponCode.toUpperCase())
        .eq('is_active', true)
        .single();

      console.log('DEBUG coupon検索結果:', JSON.stringify(coupon));
      if (coupon) {
        const now = new Date();
        const notExpired = !coupon.expires_at || new Date(coupon.expires_at) > now;
        const { data: alreadyUsed } = await supabase
          .from('coupon_uses')
          .select('id')
          .eq('user_id', userId)
          .eq('coupon_id', coupon.id)
          .single();
        const underTotalCap = !coupon.max_total_uses || coupon.max_total_uses === 0 || (coupon.total_used || 0) < coupon.max_total_uses;

        if (notExpired && !alreadyUsed && underTotalCap) {
          let percent = 0;
          if (coupon.discount_type === 'percent') {
            const capOk = !coupon.max_applicable_amount || coupon.max_applicable_amount === 0 || plan.amount <= coupon.max_applicable_amount;
            if (capOk) percent = coupon.discount_amount || 0;
          } else if (coupon.discount_type === 'tiered_percent') {
            percent = (coupon.tiered_discounts && coupon.tiered_discounts[planId]) || 0;
          }
          if (percent > 0) {
            finalAmount = Math.max(50, Math.round(plan.amount * (1 - percent / 100)));
            appliedCouponCode = coupon.code;
          }
        }
      }
    }

    // Stripe Customer取得 or 作成
    let customerId;
    const existing = await stripe.customers.list({ email: userEmail, limit: 1 });
    if (existing.data.length > 0) {
      customerId = existing.data[0].id;
    } else {
      const customer = await stripe.customers.create({
        email: userEmail,
        metadata: { userId },
      });
      customerId = customer.id;
    }

    // 銀行振込の場合
    if (method === 'bank') {
      // 既存の未完了PaymentIntentを確認
      const existingPIs = await stripe.paymentIntents.list({
        customer: customerId,
        limit: 5,
      });
      
      const existingPI = existingPIs.data.find(pi => 
        pi.status === 'requires_action' && 
        pi.payment_method_types.includes('customer_balance') &&
        pi.metadata?.planId === planId
      );

      let paymentIntent;
      if (existingPI) {
        paymentIntent = existingPI;
      } else {
        paymentIntent = await stripe.paymentIntents.create({
          amount: finalAmount,
          currency: 'jpy',
          customer: customerId,
          payment_method_types: ['customer_balance'],
          payment_method_options: {
            customer_balance: {
              funding_type: 'bank_transfer',
              bank_transfer: { type: 'jp_bank_transfer' },
            },
          },
          confirm: true,
          payment_method_data: { type: 'customer_balance' },
          metadata: { userId, planId, coin: String(plan.coin), bonus: '0', couponCode: appliedCouponCode || '' },
        });
      }

      const instructions = paymentIntent.next_action?.display_bank_transfer_instructions;
      const financialAddress = instructions?.financial_addresses?.[0];
      
      console.log('PaymentIntent status:', paymentIntent.status);
      console.log('Instructions:', JSON.stringify(instructions));

      return res.status(200).json({
        type: 'bank',
        paymentIntentId: paymentIntent.id,
        amount: instructions?.amount_remaining || finalAmount,
        bankInfo: financialAddress?.zengin || financialAddress || null,
        reference: instructions?.reference,
        instructionsUrl: instructions?.hosted_instructions_url || null,
      });
    }

    // クレカの場合
    const paymentIntent = await stripe.paymentIntents.create({
      amount: finalAmount,
      currency: 'jpy',
      customer: customerId,
      payment_method_types: ['card'],
      metadata: { userId, planId, coin: String(plan.coin), bonus: '0', couponCode: appliedCouponCode || '' },
    });

    return res.status(200).json({
      type: 'card',
      clientSecret: paymentIntent.client_secret,
      amount: finalAmount,
    });
  } catch (error) {
    console.error('Stripe error:', error);
    return res.status(500).json({ error: error.message });
  }
}
