import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // ブラウザには絶対に送らないサーバー専用の鍵
);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { data: packs, error: packsError } = await supabase
    .from('packs')
    .select('*')
    .order('sort_order');

  if (packsError) {
    return res.status(500).json({ error: packsError.message });
  }
  if (!packs?.length) return res.status(200).json([]);

  const { data: prizes, error: prizesError } = await supabase
    .from('prizes')
    .select('id,pack_id,name,image_url,tier,tier_label,exchange_type,is_hidden,show_quantity,quantity,value_jp');

  if (prizesError) {
    return res.status(500).json({ error: prizesError.message });
  }

  // ここが肝: show_quantityがtrueの賞品だけ、実際の在庫数を返す。
  // それ以外は在庫数(quantity)を隠す(nullにする)。
  const safePrizes = (prizes || []).map(p => ({
    id: p.id,
    pack_id: p.pack_id,
    name: p.name,
    image_url: p.image_url,
    tier: p.tier,
    tier_label: p.tier_label,
    exchange_type: p.exchange_type,
    is_hidden: p.is_hidden,
    show_quantity: p.show_quantity,
    quantity: p.show_quantity ? p.quantity : null,
    value_jp: p.value_jp,
  }));

  const prizesByPack = {};
  safePrizes.forEach(p => {
    if (!prizesByPack[p.pack_id]) prizesByPack[p.pack_id] = [];
    prizesByPack[p.pack_id].push(p);
  });

  const result = packs.map(p => ({
    ...p,
    prizes_public: prizesByPack[p.id] || [],
  }));

  res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=30');
  return res.status(200).json(result);
}
