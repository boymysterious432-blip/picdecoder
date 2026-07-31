// GET /api/prompts?page=1&model=midjourney&style=cyberpunk-portrait
// Powers library.html and any future filtered browse pages. Reads live
// from Supabase, so new prompts appear the moment they're inserted.

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

module.exports = async function handler(req, res) {
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const pageSize = 24;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('prompts')
    .select('slug, image_url, prompt_text, model, extraction_method, style, created_at', { count: 'exact' })
    .eq('is_public', true)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (req.query.model) query = query.eq('model', req.query.model);
  if (req.query.style) query = query.eq('style', req.query.style);

  const { data, error, count } = await query;
  if (error) return res.status(500).json({ error: 'Could not load prompts' });

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600');
  res.status(200).json({ page, pageSize, total: count, prompts: data });
};
