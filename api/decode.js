// POST /api/decode
// 1) Reads the uploaded image.
// 2) Tries to read REAL generation metadata embedded in the file
//    (Stable Diffusion/ComfyUI PNG tEXt chunks, EXIF/XMP for other tools).
//    -> extraction_method = "metadata"  (exact)
// 3) If nothing is embedded, falls back to a vision AI reconstruction.
//    -> extraction_method = "vision_ai" (approximate)
// 4) Saves the image to Supabase Storage + a row to the `prompts` table.
//    That row is what makes it instantly show up at /prompt/[slug] and in
//    the library/sitemap — no redeploy involved.

const { createClient } = require('@supabase/supabase-js');
const formidable = require('formidable');
const fs = require('fs');
const crypto = require('crypto');
const exifr = require('exifr');
const extractChunks = require('png-chunks-extract');
const textChunk = require('png-chunk-text');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // service role: bypasses RLS, server-side only
);

module.exports = { config: { api: { bodyParser: false } } };

module.exports.default = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { file, buffer } = await parseUpload(req);

    // 1) Try to read real embedded metadata first.
    let metadata = await tryReadEmbeddedMetadata(buffer, file.mimetype);

    let promptText, model, extractionMethod, seed = null, aspectRatio = null, negativePrompt = null;

    if (metadata) {
      promptText = metadata.prompt;
      model = metadata.model;
      seed = metadata.seed;
      negativePrompt = metadata.negativePrompt;
      extractionMethod = 'metadata';
    } else {
      // 2) Fallback: vision AI reconstruction — clearly labeled as approximate.
      const guess = await reconstructWithVisionAI(buffer, file.mimetype);
      promptText = guess.prompt;
      model = guess.likelyModel || 'unknown';
      extractionMethod = 'vision_ai';
    }

    // 3) Store the image.
    const ext = (file.mimetype.split('/')[1] || 'png').replace('jpeg', 'jpg');
    const slug = crypto.randomBytes(5).toString('hex');
    const path = `${slug}.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from('images')
      .upload(path, buffer, { contentType: file.mimetype, upsert: false });
    if (uploadErr) throw uploadErr;

    const { data: pub } = supabase.storage.from('images').getPublicUrl(path);

    // 4) Insert the row — this single write is what makes the new page live.
    const { error: insertErr } = await supabase.from('prompts').insert({
      slug,
      image_url: pub.publicUrl,
      prompt_text: promptText,
      model,
      extraction_method: extractionMethod,
      seed,
      aspect_ratio: aspectRatio,
      negative_prompt: negativePrompt,
      is_public: true
    });
    if (insertErr) throw insertErr;

    res.status(200).json({
      slug, prompt_text: promptText, model,
      extraction_method: extractionMethod, seed, aspect_ratio: aspectRatio
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not process this image. Please try another file.' });
  }
};

function parseUpload(req) {
  return new Promise((resolve, reject) => {
    const form = new formidable.IncomingForm({ maxFileSize: 10 * 1024 * 1024 });
    form.parse(req, (err, _fields, files) => {
      if (err) return reject(err);
      const file = files.image?.[0] || files.image;
      if (!file) return reject(new Error('No image uploaded'));
      fs.readFile(file.filepath, (readErr, buffer) => {
        if (readErr) return reject(readErr);
        resolve({ file, buffer });
      });
    });
  });
}

// --- Real metadata extraction -------------------------------------------

async function tryReadEmbeddedMetadata(buffer, mimetype) {
  if (mimetype === 'image/png') {
    try {
      const chunks = extractChunks(buffer);
      for (const chunk of chunks) {
        if (chunk.name === 'tEXt' || chunk.name === 'iTXt') {
          const { keyword, text } = textChunk.decode(chunk.data);
          // Automatic1111 / ComfyUI convention: keyword "parameters"
          if (/parameters/i.test(keyword) && text) {
            return parseA1111Text(text);
          }
        }
      }
    } catch { /* not a valid/parseable PNG chunk set — fall through */ }
  }

  // JPEG/WEBP: check EXIF/XMP/IPTC fields some tools populate.
  try {
    const exif = await exifr.parse(buffer, { userComment: true, xmp: true, iptc: true });
    const candidate = exif?.UserComment || exif?.ImageDescription || exif?.['dc:description'];
    if (candidate && String(candidate).length > 15) {
      return { prompt: String(candidate), model: 'unknown', seed: null, negativePrompt: null };
    }
  } catch { /* no usable EXIF */ }

  return null;
}

function parseA1111Text(text) {
  // Typical format:
  // <prompt>
  // Negative prompt: <negative>
  // Steps: 20, Sampler: ..., Seed: 12345, ...
  const negIdx = text.indexOf('Negative prompt:');
  const paramIdx = text.search(/\nSteps:/);
  const prompt = (negIdx > -1 ? text.slice(0, negIdx) : text.slice(0, paramIdx > -1 ? paramIdx : undefined)).trim();
  const negMatch = text.match(/Negative prompt:\s*([\s\S]*?)(?:\nSteps:|$)/);
  const seedMatch = text.match(/Seed:\s*(\d+)/);
  return {
    prompt: prompt || text.trim(),
    model: 'stable-diffusion',
    negativePrompt: negMatch ? negMatch[1].trim() : null,
    seed: seedMatch ? seedMatch[1] : null
  };
}

// --- Vision AI fallback ---------------------------------------------------

async function reconstructWithVisionAI(buffer, mimetype) {
  const base64 = buffer.toString('base64');
  const apiKey = process.env.OPENROUTER_API_KEY;

  // 1️⃣ التأكد من وجود الـ Key
  if (!apiKey) {
    console.error('❌ OPENROUTER_API_KEY is missing in Environment Variables!');
    throw new Error('OPENROUTER_API_KEY is missing');
  }

  console.log('🚀 Sending image to OpenRouter...');

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://picdecoder.com',
        'X-Title': 'PicDecoder',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'meta-llama/llama-3.2-11b-vision-instruct:free',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Write a single detailed AI image generation prompt (subject, composition, lighting, style) to recreate this image.'
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimetype};base64,${base64}`
                }
              }
            ]
          }
        ]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ OpenRouter API Response Error:', data);
      throw new Error(data.error?.message || 'OpenRouter vision analysis failed');
    }

    console.log('✅ Prompt generated successfully!');
    return data.choices[0]?.message?.content || '';

  } catch (err) {
    console.error('❌ Error during OpenRouter fetch:', err.message);
    throw err;
  }
}