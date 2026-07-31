// GET /sitemap.xml — rebuilt from Supabase on every crawl request.
// Every new /prompt/[slug] page is included automatically; nothing to
// regenerate or redeploy when you add prompts.

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

module.exports = async function handler(req, res) {
  const { data } = await supabase
    .from('prompts')
    .select('slug, created_at')
    .eq('is_public', true)
    .order('created_at', { ascending: false })
    .limit(50000); // sitemap protocol limit; paginate into /sitemap-2.xml etc. once you exceed this

  const staticUrls = [
    { loc: 'https://www.picdecoder.com/', priority: '1.0' },
    { loc: 'https://www.picdecoder.com/library.html', priority: '0.8' },
    { loc: 'https://www.picdecoder.com/about.html', priority: '0.3' }
  ];

  const urls = [
    ...staticUrls.map(u => `<url><loc>${u.loc}</loc><priority>${u.priority}</priority></url>`),
    ...(data || []).map(p => `<url><loc>https://www.picdecoder.com/prompt/${p.slug}</loc><lastmod>${new Date(p.created_at).toISOString()}</lastmod></url>`)
  ].join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

  res.setHeader('Content-Type', 'application/xml');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
  res.status(200).send(xml);
};
