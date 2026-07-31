(() => {
  const dropzone   = document.getElementById('dropzone');
  const fileInput  = document.getElementById('fileInput');
  const dzContent  = document.getElementById('dzContent');
  const extractBtn = document.getElementById('extractBtn');
  const resultWrap = document.getElementById('resultWrap');

  let selectedFile = null;

  dropzone.addEventListener('click', () => fileInput.click());
  ['dragover','dragenter'].forEach(evt =>
    dropzone.addEventListener(evt, e => { e.preventDefault(); dropzone.classList.add('dragover'); }));
  ['dragleave','drop'].forEach(evt =>
    dropzone.addEventListener(evt, e => { e.preventDefault(); dropzone.classList.remove('dragover'); }));
  dropzone.addEventListener('drop', e => {
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener('change', e => {
    if (e.target.files[0]) handleFile(e.target.files[0]);
  });

  function handleFile(file){
    selectedFile = file;
    const url = URL.createObjectURL(file);
    dzContent.innerHTML = `<img class="preview" src="${url}" alt="Uploaded image preview">
      <div class="dz-sub">${file.name} · ${(file.size/1024).toFixed(0)} KB — click to change</div>`;
    extractBtn.disabled = false;
    resultWrap.innerHTML = '';
  }

  extractBtn.addEventListener('click', async () => {
    if (!selectedFile) return;
    extractBtn.disabled = true;
    extractBtn.textContent = 'Decoding…';
    resultWrap.innerHTML = `<div class="exhibit scan-wrap"><div class="stub">Analyzing</div>
      <div class="body"><p style="color:var(--ink-soft)">Checking file metadata, then falling back to vision analysis if needed…</p></div></div>`;

    try {
      const fd = new FormData();
      fd.append('image', selectedFile);

      const res = await fetch('/api/decode', { method: 'POST', body: fd });
      if (!res.ok) throw new Error((await res.json()).error || 'Extraction failed');
      const data = await res.json();
      renderResult(data);
    } catch (err) {
      resultWrap.innerHTML = `<div class="exhibit"><div class="stub">Error</div>
        <div class="body"><p style="color:var(--rust)">${err.message}. Please try another image.</p></div></div>`;
    } finally {
      extractBtn.disabled = false;
      extractBtn.textContent = 'Extract Prompt';
    }
  });

  function renderResult(d){
    const verified = d.extraction_method === 'metadata';
    const badge = verified
      ? `<span class="pill verified">✓ Read from file metadata</span>`
      : `<span class="pill reconstructed">✦ AI-reconstructed (approximate)</span>`;

    resultWrap.innerHTML = `
      <div class="exhibit">
        <div class="stub">Exhibit&nbsp;${d.slug.slice(0,6)}</div>
        <div class="body">
          <div class="tags">
            ${badge}
            <span class="pill neutral">${d.model || 'model unknown'}</span>
          </div>
          <div class="prompt-text">${escapeHtml(d.prompt_text)}</div>
          <div class="meta-grid">
            ${d.seed ? `<div><div class="k">Seed</div><div class="v mono">${escapeHtml(d.seed)}</div></div>` : ''}
            ${d.aspect_ratio ? `<div><div class="k">Aspect ratio</div><div class="v mono">${escapeHtml(d.aspect_ratio)}</div></div>` : ''}
          </div>
          <div class="disclaimer">
            ${verified
              ? 'This prompt was read directly from data embedded in your file — it should match the original exactly.'
              : 'No embedded generation data was found in this file, so this prompt was reconstructed by an AI model from the image itself. Treat it as a close starting point, not an exact original.'}
          </div>
          <div class="actions">
            <button class="btn" onclick="navigator.clipboard.writeText(${JSON.stringify(d.prompt_text)})">Copy Prompt</button>
            <a class="btn secondary" href="/prompt/${d.slug}">View permanent page →</a>
          </div>
        </div>
      </div>`;
  }

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
})();
