const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const PLANS = [
  { id: 'p110',     jpy: 110,     coin: 100,    bonus: 0,    priceId: 'price_1TB2MOJoybCGBMPZspgLHy6t' },
  { id: 'p550',     jpy: 550,     coin: 500,    bonus: 50,   priceId: 'price_1TB2RiJoybCGBMPZmSPJF7pP' },
  { id: 'p1100',    jpy: 1100,    coin: 1000,   bonus: 150,  priceId: 'price_1TB2V7JoybCGBMPZXxUeY8Em' },
  { id: 'p3300',    jpy: 3300,    coin: 3000,   bonus: 600,  priceId: 'price_1TB2WPJoybCGBMPZ0CKkXrBc' },
  { id: 'p5500',    jpy: 5500,    coin: 5000,   bonus: 1250, priceId: 'price_1TB2XKJoybCGBMPZIGXiyX7f' },
  { id: 'p11000',   jpy: 11000,   coin: 10000,  bonus: 3000, priceId: 'price_1TB2XVJoybCGBMPZTUlJeWLk' },
  { id: 'p22000',   jpy: 22000,   coin: 20000,  bonus: 7000, priceId: 'price_1TB2XfJoybCGBMPZRcunJkax' },
  { id: 'p50000',   jpy: 50000,   coin: 50000,  bonus: 20000,priceId: 'price_1TB2Y6JoybCGBMPZ3XUuyY7c' },
  { id: 'p100000',  jpy: 100000,  coin: 100000, bonus: 50000,priceId: 'price_1TB2YMJoybCGBMPZz8eXdgDX' },
  { id: 'p300000',  jpy: 300000,  coin: 300000, bonus: 180000,priceId: 'price_1TB2ZyJoybCGBMPZOrJxV50f' },
  { id: 'p500000',  jpy: 500000,  coin: 500000, bonus: 350000,priceId: 'price_1TB2aCJoybCGBMPZ9pO94Yvb' },
  { id: 'p1000000', jpy: 1000000, coin: 1000000,bonus: 800000,priceId: 'price_1TB2aWJoybCGBMPZdmgnA2x0' },
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
