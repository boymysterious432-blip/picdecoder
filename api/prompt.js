// GET /prompt/:slug  (rewritten to /api/prompt?slug=:slug by vercel.json)
//
// This function renders a full, indexable HTML page by reading the prompt
// straight from Supabase ON EVERY REQUEST (with a short CDN cache).
// That's the whole trick: to publish a new page, INSERT A ROW in Supabase
// (via /api/decode.js, or manually — see api/admin/add-prompt.js). This
// function will render it immediately. Nothing here is baked at build time,
// so there is nothing to redeploy.

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

module.exports = async function handler(req, res) {
  const slug = req.query.slug;
  if (!slug) return res.status(400).send('Missing slug');

  const { data: p, error } = await supabase
    .from('prompts')
    .select('*')
    .eq('slug', slug)
    .eq('is_public', true)
    .single();

  if (error || !p) {
    res.status(404).send(renderNotFound());
    return;
  }

  // Fire-and-forget view counter — don't block the response on it.
  supabase.from('prompts').update({ views: (p.views || 0) + 1 }).eq('slug', slug).then(() => {});

  // Edge/CDN cache: fast for readers, but refreshes often enough that edits
  // (e.g. toggling is_public) show up quickly without a manual purge.
  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=86400');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(renderPage(p));
};

function renderPage(p) {
  const verified = p.extraction_method === 'metadata';
  const title = `${truncate(p.prompt_text, 60)} — AI Prompt | PicDecoder`;
  const description = `${verified ? 'Exact prompt read from file metadata' : 'AI-reconstructed prompt'} for a ${escapeHtml(p.model)} image: ${truncate(p.prompt_text, 140)}`;
  const url = `https://www.picdecoder.com/prompt/${p.slug}`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CreativeWork',
    name: title,
    about: p.prompt_text,
    url,
    image: p.image_url,
    dateCreated: p.created_at
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${url}">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:image" content="${escapeHtml(p.image_url)}">
<meta property="og:type" content="article">
<meta property="og:url" content="${url}">
<meta name="twitter:card" content="summary_large_image">
<link rel="stylesheet" href="/style.css">
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head>
<body>
<header class="site-header">
  <a href="/" class="logo"><span class="dot"></span>PicDecoder</a>
  <nav class="site-nav">
    <a href="/">Decoder</a>
    <a href="/library.html">Prompt Library</a>
    <a href="/about.html">About</a>
  </nav>
</header>
<main class="container">
  <div style="margin-top:30px;">
    <img src="${escapeHtml(p.image_url)}" alt="${escapeHtml(truncate(p.prompt_text, 100))}"
         style="max-width:100%;border-radius:3px;border:1px solid var(--line);max-height:480px;object-fit:contain;background:#fff;">
  </div>
  <div class="exhibit">
    <div class="stub">Exhibit&nbsp;${p.slug.slice(0,6)}</div>
    <div class="body">
      <div class="tags">
        ${verified
          ? '<span class="pill verified">✓ Read from file metadata</span>'
          : '<span class="pill reconstructed">✦ AI-reconstructed (approximate)</span>'}
        <span class="pill neutral">${escapeHtml(p.model)}</span>
      </div>
      <h1 style="font-size:1.1rem;font-family:'JetBrains Mono',monospace;font-weight:500;">Extracted prompt</h1>
      <div class="prompt-text">${escapeHtml(p.prompt_text)}</div>
      <div class="meta-grid">
        ${p.seed ? `<div><div class="k">Seed</div><div class="v mono">${escapeHtml(p.seed)}</div></div>` : ''}
        ${p.negative_prompt ? `<div><div class="k">Negative prompt</div><div class="v mono">${escapeHtml(p.negative_prompt)}</div></div>` : ''}
      </div>
      <div class="actions">
        <button class="btn" onclick="navigator.clipboard.writeText(${JSON.stringify(p.prompt_text)})">Copy Prompt</button>
        <a class="btn secondary" href="/">Decode your own image →</a>
      </div>
    </div>
  </div>
  <p style="color:var(--ink-soft);font-size:.85rem;margin-top:20px;">
    ${verified
      ? 'This prompt was read directly from generation data embedded in the original file.'
      : 'No embedded generation data was found in the original file. This prompt was reconstructed by an AI model from the image itself and is an approximation, not the guaranteed original text.'}
  </p>
</main>
<footer class="site-footer"><div class="container"><span>© 2026 PicDecoder</span><span><a href="/about.html">About</a> · <a href="/privacy.html">Privacy</a></span></div></footer>
</body>
</html>`;
}

function renderNotFound() {
  return `<!DOCTYPE html><html><head><title>Prompt not found | PicDecoder</title>
  <link rel="stylesheet" href="/style.css"></head><body>
  <main class="container"><h1 style="margin-top:60px;">This exhibit doesn't exist (anymore).</h1>
  <p><a class="btn" href="/">Decode a new image</a></p></main></body></html>`;
}

function truncate(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
