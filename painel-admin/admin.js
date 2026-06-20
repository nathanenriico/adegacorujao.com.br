const SUPABASE_URL = 'https://fykqqioozgotmmebtlix.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5a3FxaW9vemdvdG1tZWJ0bGl4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1NjYyNTksImV4cCI6MjA5NzE0MjI1OX0.ZWw5GvAcYNFCAlOcDLINE2Pi8g4SToBlPMmzg2NuTA8';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

document.getElementById('btn-sair').addEventListener('click', () => {
  window.location.href = '../index.html';
});

carregarProdutos();

// ===== ESTADO =====
let produtos = [];
let fotosArquivos = [];   // arquivos novos a enviar
let fotosUrls = [];       // urls já salvas + novas via URL

// ===== TOAST =====
const toastEl = document.getElementById('toast');
function toast(msg, tipo = 'info') {
  toastEl.textContent = msg;
  toastEl.className = `toast toast-${tipo}`;
  toastEl.classList.remove('hidden');
  clearTimeout(toastEl._t);
  toastEl._t = setTimeout(() => toastEl.classList.add('hidden'), 2800);
}

// ===== CARREGAR PRODUTOS =====
async function carregarProdutos() {
  const lista = document.getElementById('lista-produtos');
  lista.innerHTML = '<div class="loading">Carregando...</div>';
  const { data, error } = await db.from('produtos').select('*').order('nome');
  if (error) { lista.innerHTML = '<div class="empty-state">Erro ao carregar.</div>'; return; }
  produtos = data || [];
  renderizar();
}

function renderizar() {
  const lista   = document.getElementById('lista-produtos');
  const busca   = document.getElementById('busca').value.trim().toLowerCase();
  const tipo    = document.getElementById('filtro-tipo').value;
  const filtro  = produtos.filter(p =>
    p.nome.toLowerCase().includes(busca) && (!tipo || p.categoria === tipo)
  );

  if (!filtro.length) { lista.innerHTML = '<div class="empty-state">Nenhum produto encontrado.</div>'; return; }

  const tipoEmoji = {
    'Cervejas': '🍺', 'Copões': '🥤', 'Combos': '🎁', 'Doses': '🥃',
    'Destilados': '🥃', 'Gourmet': '🍽️', 'Garrafas': '🍾',
  };
  const fmt = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

  lista.innerHTML = filtro.map(p => {
    const esc = p.estoque <= 0 ? 'estoque-zero' : p.estoque <= p.estoque_minimo ? 'estoque-baixo' : 'estoque-ok';
    const escLabel = p.estoque <= 0 ? '🚨 Sem estoque' : p.estoque <= p.estoque_minimo ? `⚠️ ${p.estoque} un` : `✅ ${p.estoque} un`;
    const fotoHtml = p.foto_url
      ? `<img src="${p.foto_url}" alt="${p.nome}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" /><div class="produto-card-sem-foto" style="display:none">${tipoEmoji[p.categoria] || '📦'}</div>`
      : `<div class="produto-card-sem-foto">${tipoEmoji[p.categoria] || '📦'}</div>`;
    return `
    <div class="produto-card">
      ${fotoHtml}
      <div class="produto-card-body">
        <span class="produto-card-nome">${p.nome}</span>
        <span class="produto-card-tipo">${p.categoria}</span>
        <span class="produto-card-preco">${fmt(p.preco_venda)}</span>
        <span class="produto-card-estoque ${esc}">${escLabel}</span>
        ${p.status === 'inativo' ? '<span class="inativo-badge">Inativo</span>' : ''}
      </div>
      <div class="produto-card-acoes">
        <button class="btn-secondary" data-id="${p.id}" data-acao="editar">✏️ Editar</button>
        <button class="btn-secondary" data-id="${p.id}" data-acao="excluir" style="color:var(--red);border-color:var(--red)">🗑️</button>
      </div>
    </div>`;
  }).join('');
}

document.getElementById('busca').addEventListener('input', renderizar);
document.getElementById('filtro-tipo').addEventListener('change', renderizar);

document.getElementById('lista-produtos').addEventListener('click', e => {
  const btn = e.target.closest('[data-acao]'); if (!btn) return;
  if (btn.dataset.acao === 'editar')  abrirModal(btn.dataset.id);
  if (btn.dataset.acao === 'excluir') excluir(btn.dataset.id);
});

// ===== MODAL =====
const modal = document.getElementById('modal');

document.getElementById('btn-novo').addEventListener('click',        () => abrirModal());
document.getElementById('btn-fechar-modal').addEventListener('click', fecharModal);
document.getElementById('btn-cancelar').addEventListener('click',    fecharModal);
modal.addEventListener('click', e => { if (e.target === modal) fecharModal(); });

function abrirModal(id = null) {
  const p = id ? produtos.find(x => x.id === id) : null;
  document.getElementById('modal-titulo').textContent = p ? 'Editar Produto' : 'Novo Produto';
  document.getElementById('prod-id').value            = p?.id || '';
  document.getElementById('prod-nome').value          = p?.nome || '';
  document.getElementById('prod-categoria').value     = p?.categoria || '';
  document.getElementById('prod-preco-venda').value   = p?.preco_venda || '';
  document.getElementById('prod-preco-custo').value   = p?.preco_custo || '';
  document.getElementById('prod-estoque').value       = p?.estoque ?? 0;
  document.getElementById('prod-estoque-min').value   = p?.estoque_minimo ?? 5;
  document.getElementById('prod-status').value        = p?.status || 'ativo';
  document.getElementById('prod-foto-url').value      = '';
  document.getElementById('form-erro').classList.add('hidden');
  fotosArquivos = [];
  fotosUrls = p?.fotos_urls?.length ? [...p.fotos_urls] : (p?.foto_url ? [p.foto_url] : []);
  document.getElementById('input-foto').value = '';
  renderFotosPreviews();
  modal.classList.remove('hidden');
}

function fecharModal() { modal.classList.add('hidden'); }

// Múltiplas fotos
document.getElementById('input-foto').addEventListener('change', e => {
  const files = Array.from(e.target.files); if (!files.length) return;
  fotosArquivos.push(...files);
  e.target.value = '';
  renderFotosPreviews();
});

document.getElementById('prod-foto-url').addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const url = e.target.value.trim(); if (!url) return;
  fotosUrls.push(url);
  e.target.value = '';
  renderFotosPreviews();
});

function renderFotosPreviews() {
  const container = document.getElementById('fotos-previews');
  const existentes = fotosUrls.map((url, i) => `
    <div class="foto-thumb">
      <img src="${url}" onerror="this.style.display='none'" />
      <button type="button" class="foto-remove" data-tipo="url" data-idx="${i}">✕</button>
    </div>`);
  const novos = fotosArquivos.map((f, i) => `
    <div class="foto-thumb">
      <img src="${URL.createObjectURL(f)}" />
      <button type="button" class="foto-remove" data-tipo="arquivo" data-idx="${i}">✕</button>
    </div>`);
  const vazio = !fotosUrls.length && !fotosArquivos.length
    ? '<div class="foto-placeholder">📷 Nenhuma foto adicionada</div>' : '';
  container.innerHTML = vazio + existentes.join('') + novos.join('');
}

document.getElementById('fotos-previews').addEventListener('click', e => {
  const btn = e.target.closest('.foto-remove'); if (!btn) return;
  const idx = parseInt(btn.dataset.idx);
  if (btn.dataset.tipo === 'url') fotosUrls.splice(idx, 1);
  else fotosArquivos.splice(idx, 1);
  renderFotosPreviews();
});

// ===== SALVAR =====
document.getElementById('form-produto').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = document.getElementById('btn-salvar');
  btn.disabled = true;
  btn.textContent = 'Salvando...';

  const id = document.getElementById('prod-id').value;

  // Upload de arquivos novos
  for (const arquivo of fotosArquivos) {
    const ext  = arquivo.name.split('.').pop();
    const path = `produtos/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    const { error: upErr } = await db.storage.from('fotos').upload(path, arquivo, { upsert: true });
    if (upErr) { mostrarErro('Erro ao enviar foto: ' + upErr.message); btn.disabled = false; btn.textContent = '💾 Salvar'; return; }
    const { data: urlData } = db.storage.from('fotos').getPublicUrl(path);
    fotosUrls.push(urlData.publicUrl);
  }

  const payload = {
    nome:           document.getElementById('prod-nome').value.trim(),
    categoria:      document.getElementById('prod-categoria').value,
    preco_venda:    parseFloat(document.getElementById('prod-preco-venda').value) || 0,
    preco_custo:    parseFloat(document.getElementById('prod-preco-custo').value) || 0,
    estoque:        parseInt(document.getElementById('prod-estoque').value) || 0,
    estoque_minimo: parseInt(document.getElementById('prod-estoque-min').value) || 0,
    status:         document.getElementById('prod-status').value,
    foto_url:       fotosUrls[0] || null,
    fotos_urls:     fotosUrls.length ? fotosUrls : null,
  };

  if (!payload.nome) { mostrarErro('Informe o nome do produto.'); btn.disabled = false; btn.textContent = '💾 Salvar'; return; }
  if (!payload.categoria) { mostrarErro('Selecione o tipo.'); btn.disabled = false; btn.textContent = '💾 Salvar'; return; }

  const { error } = id
    ? await db.from('produtos').update(payload).eq('id', id)
    : await db.from('produtos').insert([payload]);

  btn.disabled = false;
  btn.textContent = '💾 Salvar';

  if (error) { mostrarErro('Erro ao salvar: ' + error.message); return; }

  fecharModal();
  toast(id ? 'Produto atualizado!' : 'Produto criado!', 'success');
  await carregarProdutos();
});

function mostrarErro(msg) {
  const el = document.getElementById('form-erro');
  el.textContent = msg;
  el.classList.remove('hidden');
}

// ===== EXCLUIR =====
async function excluir(id) {
  const p = produtos.find(x => x.id === id); if (!p) return;
  if (!confirm(`Excluir "${p.nome}"? Esta ação não pode ser desfeita.`)) return;
  const { error } = await db.from('produtos').delete().eq('id', id);
  if (error) { toast('Erro ao excluir: ' + error.message, 'error'); return; }
  toast('Produto excluído!', 'success');
  await carregarProdutos();
}
