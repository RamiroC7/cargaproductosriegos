// Página HTML simple con la estética de la app, para respuestas que se ven en el navegador
// (por ejemplo, al volver de autorizar en Tiendanube).
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function pagina(res, status, titulo, cuerpoHtml) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.end(`<!doctype html>
<html lang="es"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)} · Riegos del Sur</title>
<link rel="icon" href="/img/logo.png">
<style>
  body { margin:0; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background:#20348b; color:#0f172a; }
  main { max-width: 34rem; margin: 0 auto; padding: 2rem 1rem; }
  .logo { display:block; width:9rem; margin: 0 auto 1rem; }
  .card { background:#fff; border-radius:1rem; padding:1.5rem; box-shadow: 0 1px 3px rgba(0,0,0,.2); }
  h1 { font-size:1.25rem; margin:0 0 .75rem; }
  p, li { line-height:1.5; color:#334155; }
  label { display:block; font-size:.85rem; font-weight:600; margin:1rem 0 .25rem; }
  .fila { display:flex; gap:.5rem; }
  input { flex:1; min-width:0; font: .9rem ui-monospace, monospace; padding:.6rem .75rem; border:1px solid #cbd5e1; border-radius:.6rem; background:#f8fafc; }
  button, .btn { font:inherit; font-size:.9rem; padding:.6rem 1rem; border:0; border-radius:.6rem; background:#20348b; color:#fff; cursor:pointer; text-decoration:none; display:inline-block; }
  code { background:#eef1fa; padding:.1rem .35rem; border-radius:.3rem; font-size:.85rem; word-break: break-all; }
  .aviso { background:#fff7ed; border:1px solid #fed7aa; color:#9a3412; padding:.75rem; border-radius:.6rem; font-size:.9rem; }
  .ok { color:#166534; }
</style></head>
<body><main>
<img class="logo" src="/img/logo.png" alt="Riegos del Sur">
<div class="card"><h1>${esc(titulo)}</h1>${cuerpoHtml}</div>
</main>
<script>
  document.querySelectorAll('[data-copiar]').forEach(b => b.addEventListener('click', async () => {
    const campo = document.getElementById(b.dataset.copiar);
    try { await navigator.clipboard.writeText(campo.value); } catch { campo.select(); document.execCommand('copy'); }
    b.textContent = 'Copiado ✓';
    setTimeout(() => { b.textContent = 'Copiar'; }, 2000);
  }));
</script>
</body></html>`);
}

module.exports = { pagina, esc };
