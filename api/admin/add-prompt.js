// POST /api/admin/add-prompt
// Header: x-admin-secret: <ADMIN_SECRET>
// Body (JSON): { image_url, prompt_text, model, style, seed?, negative_prompt? }
//
// This is the "add a prompt without redeploying" endpoint for editorial/seed
// content — e.g. you want to hand-curate 50 great prompts for the library
// launch. Call this from a script, Postman, or a small internal tool; the
// page appears at /prompt/[slug] immediately, no deploy required.

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (req.headers['x-admin-secret'] !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { image_url, prompt_text, model, style, seed, negative_prompt, extraction_method } = req.body || {};
  if (!image_url || !prompt_text) {
    return res.status(400).json({ error: 'image_url and prompt_text are required' });
  }

  const slug = crypto.randomBytes(5).toString('hex');
  const { error } = await supabase.from('prompts').insert({
    slug,
    image_url,
    prompt_text,
    model: model || 'unknown',
    style: style || null,
    seed: seed || null,
    negative_prompt: negative_prompt || null,
    extraction_method: extraction_method || 'metadata',
    is_public: true
  });

  if (error) return res.status(500).json({ error: error.message });
  res.status(200).json({ slug, url: `https://www.picdecoder.com/prompt/${slug}` });
};
