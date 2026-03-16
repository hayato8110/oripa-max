const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const PLANS = [
  { id: 'p110',     jpy: 110,     coin: 110,     bonus: 0, priceId: 'price_1TBflZJoybCGBMPZnzyS8tbn' },
  { id: 'p550',     jpy: 550,     coin: 550,     bonus: 0, priceId: 'price_1TBfoAJoybCGBMPZxEKMqDfL' },
  { id: 'p1100',    jpy: 1100,    coin: 1100,    bonus: 0, priceId: 'price_1TBfoYJoybCGBMPZyyCmrmIn' },
  { id: 'p3300',    jpy: 3300,    coin: 3300,    bonus: 0, priceId: 'price_1TBfojJoybCGBMPZGjDAaaXF' },
  { id: 'p5500',    jpy: 5500,    coin: 5500,    bonus: 0, priceId: 'price_1TBfp1JoybCGBMPZ39H3qhvl' },
  { id: 'p11000',   jpy: 11000,   coin: 11000,   bonus: 0, priceId: 'price_1TBfpBJoybCGBMPZY1bRMrsV' },
  { id: 'p22000',   jpy: 22000,   coin: 22000,   bonus: 0, priceId: 'price_1TBfpVJoybCGBMPZLDQOm9mX' },
  { id: 'p50000',   jpy: 50000,   coin: 50000,   bonus: 0, priceId: 'price_1TBfpuJoybCGBMPZSYCAP40V' },
  { id: 'p100000',  jpy: 100000,  coin: 100000,  bonus: 0, priceId: 'price_1TBfqBJoybCGBMPZS6C3et2l' },
  { id: 'p300000',  jpy: 300000,  coin: 300000,  bonus: 0, priceId: 'price_1TBfqSJoybCGBMPZ7om3MFdB' },
  { id: 'p500000',  jpy: 500000,  coin: 500000,  bonus: 0, priceId: 'price_1TBfqjJoybCGBMPZGqPWuDNK' },
  { id: 'p1000000', jpy: 1000000, coin: 1000000, bonus: 0, priceId: 'price_1TBfqwJoybCGBMPZikNm3yuw' },
];

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { planId, userId, userEmail } = JSON.parse(event.body);
    const plan = PLANS.find(p => p.id === planId);
    if (!plan) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid plan' }) };
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price: plan.priceId,
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `https://oripa-max.netlify.app/?payment=success&plan=${planId}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `https://oripa-max.netlify.app/?payment=cancel`,
      customer_email: userEmail,
      metadata: {
        userId,
        planId,
        coin: String(plan.coin),
        bonus: String(plan.bonus),
      },
      locale: 'ja',
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ url: session.url }),
    };
  } catch (error) {
    console.error('Stripe error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
