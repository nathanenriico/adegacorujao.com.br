// Configurar Supabase
const SUPABASE_URL = 'https://fykqqioozgotmmebtlix.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5a3FxaW9vemdvdG1tZWJ0bGl4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1NjYyNTksImV4cCI6MjA5NzE0MjI1OX0.ZWw5GvAcYNFCAlOcDLINE2Pi8g4SToBlPMmzg2NuTA8';
const client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Navegação entre abas
const navButtons = document.querySelectorAll('.nav-btn');
const tabs = document.querySelectorAll('.tab-content');
function switchTab(name) {
  tabs.forEach(t => t.classList.toggle('active', t.id === `tab-${name}`));
  navButtons.forEach(b => b.classList.toggle('active', b.dataset.tab === name));
}
navButtons.forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));

// ===== ESTADO =====
let products = [];
let selectedProduct = null;
let selectedCategory = '';

// ===== UTILITÁRIOS =====
const fmt = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const toastEl = document.getElementById('toast');
function showToast(text, type = 'info') {
  if (!toastEl) return;
  toastEl.textContent = text;
  toastEl.className = `toast toast-${type}`;
  toastEl.classList.remove('hidden');
  clearTimeout(toastEl._t);
  toastEl._t = setTimeout(() => toastEl.classList.add('hidden'), 2500);
}

// ===== ELEMENTOS DA ABA VENDAS =====
const vendaClienteEl   = document.getElementById('venda-cliente');
const buscaInput       = document.getElementById('busca-produto');
const resultadosBusca  = document.getElementById('resultados-busca');
const categoryChips    = document.getElementById('category-chips');
const prodSelecionado  = document.getElementById('produto-selecionado');
const prodSelNome      = document.getElementById('prod-sel-nome');
const prodSelEstoque   = document.getElementById('prod-sel-estoque');
const btnTrocar        = document.getElementById('btn-trocar-produto');
const vendaQtdEl       = document.getElementById('venda-quantidade');
const vendaValorEl     = document.getElementById('venda-valor-total');
const formaPagamentoEl = document.getElementById('forma-pagamento');
const obsVendaEl       = document.getElementById('obs-venda');
const btnRegistrar     = document.getElementById('btn-registrar-venda');
const listaUltimas     = document.getElementById('lista-ultimas-vendas');
const totalHojeEl      = document.getElementById('total-hoje-vendas');

// ===== PRODUTOS =====
async function loadProducts() {
  const { data, error } = await client.from('produtos').select('*').order('nome');
  if (error) { console.error(error); return; }
  products = data || [];
  alertasMostrados = new Set();
  verificarEstoqueMinimo();
  renderSearchResults();
  popularSelectEntrada();
  renderDashEstoqueBaixo();
}

function renderSearchResults() {
  if (!resultadosBusca) return;
  const q = (buscaInput?.value || '').trim().toLowerCase();
  const filtered = products.filter(p =>
    p.status === 'ativo' &&
    (!selectedCategory || p.categoria === selectedCategory) &&
    p.nome.toLowerCase().includes(q)
  );
  if (!filtered.length) {
    resultadosBusca.innerHTML = '<div class="resultado-item empty">Nenhum produto encontrado</div>';
  } else {
    resultadosBusca.innerHTML = filtered.slice(0, 50).map(p => `
      <div class="resultado-item" data-id="${p.id}">
        <div>
          <div class="resultado-nome">${p.nome}</div>
          <div class="resultado-info">${p.categoria} • ${p.estoque} em estoque</div>
        </div>
        <div class="resultado-preco">${fmt(p.preco_venda)}</div>
      </div>`).join('');
  }
  resultadosBusca.classList.remove('hidden');
}

buscaInput?.addEventListener('input', renderSearchResults);

categoryChips?.addEventListener('click', e => {
  const btn = e.target.closest('.chip'); if (!btn) return;
  categoryChips.querySelectorAll('.chip').forEach(c => c.classList.toggle('active', c === btn));
  selectedCategory = btn.dataset.category || '';
  renderSearchResults();
});

resultadosBusca?.addEventListener('click', e => {
  const item = e.target.closest('.resultado-item[data-id]'); if (!item) return;
  selectProduct(item.dataset.id);
});

function selectProduct(id) {
  const p = products.find(x => x.id === id); if (!p) return;
  selectedProduct = p;
  prodSelNome.textContent = p.nome;
  prodSelEstoque.textContent = `${p.estoque} em estoque`;
  prodSelecionado.classList.remove('hidden');
  resultadosBusca.classList.add('hidden');
  buscaInput.value = '';
  recalcTotal();
}

btnTrocar?.addEventListener('click', () => {
  selectedProduct = null;
  prodSelecionado.classList.add('hidden');
  vendaValorEl.value = '';
  buscaInput.value = '';
  buscaInput.focus();
  renderSearchResults();
});

// ===== CÁLCULO AUTOMÁTICO =====
function recalcTotal() {
  if (!selectedProduct) return;
  const qty = Math.max(1, parseInt(vendaQtdEl?.value) || 1);
  vendaValorEl.value = (Number(selectedProduct.preco_venda) * qty).toFixed(2);
}

vendaQtdEl?.addEventListener('input', recalcTotal);
document.getElementById('qty-dec')?.addEventListener('click', () => {
  vendaQtdEl.value = Math.max(1, (parseInt(vendaQtdEl.value) || 1) - 1);
  recalcTotal();
});
document.getElementById('qty-inc')?.addEventListener('click', () => {
  vendaQtdEl.value = (parseInt(vendaQtdEl.value) || 1) + 1;
  recalcTotal();
});

// ===== FECHAR BUSCA AO CLICAR FORA =====
document.addEventListener('click', e => {
  if (!e.target.closest('.search-wrap')) resultadosBusca?.classList.add('hidden');
});

// ===== REGISTRAR VENDA =====
// Trava global para evitar duplo clique / duplo envio
let _vendaEmAndamento = false;

btnRegistrar?.addEventListener('click', async () => {
  if (_vendaEmAndamento) return;                               // bloqueia reentrada
  if (!selectedProduct) return showToast('Selecione um produto', 'error');

  const qty   = parseInt(vendaQtdEl?.value) || 0;
  const total = parseFloat(vendaValorEl?.value) || 0;
  if (qty < 1)    return showToast('Informe a quantidade', 'error');
  if (total <= 0) return showToast('Informe o valor total', 'error');
  if (!formaPagamentoEl?.value) return showToast('Escolha a forma de pagamento', 'error');

  const vendedor = document.getElementById('vendedor-select')?.value;
  if (!vendedor) return showToast('Selecione o vendedor', 'error');

  // ── Travar UI ──────────────────────────────────────────────
  _vendaEmAndamento = true;
  btnRegistrar.disabled = true;
  btnRegistrar.textContent = '⏳ Registrando...';

  try {
    // ── 1. Busca estoque atual direto no banco (fonte da verdade) ──
    const { data: prodAtual, error: errProd } = await client
      .from('produtos').select('estoque').eq('id', selectedProduct.id).single();

    if (errProd || !prodAtual) throw new Error('Produto não encontrado.');
    if (qty > prodAtual.estoque)  throw new Error(`Estoque insuficiente. Disponível: ${prodAtual.estoque} un.`);

    const novoEstoque = prodAtual.estoque - qty;

    // ── 2. Decrementar estoque com condição (evita race condition) ──
    // Só atualiza se o estoque ainda for >= qty no momento do UPDATE
    const { data: updProd, error: errUpd } = await client
      .from('produtos')
      .update({ estoque: novoEstoque })
      .eq('id', selectedProduct.id)
      .gte('estoque', qty)   // condição atômica
      .select('estoque')
      .single();

    if (errUpd || !updProd) throw new Error('Estoque insuficiente ou alterado por outro vendedor. Tente novamente.');

    // ── 3. Inserir venda ────────────────────────────────────────
    const clienteNome = vendaClienteEl?.value.trim() || 'Cliente balcão';
    const { data: vendaData, error: vendaErr } = await client.from('vendas').insert([{
      cliente_nome:       clienteNome,
      produto_id:         selectedProduct.id,
      produto_nome:       selectedProduct.nome,
      quantidade:         qty,
      valor_unitario:     Number(selectedProduct.preco_venda),
      valor_total:        total,
      forma_pagamento:    formaPagamentoEl.value,
      observacao:         obsVendaEl?.value || '',
      administrador_email: vendedor,
    }]).select().single();

    if (vendaErr) throw new Error('Erro ao salvar venda: ' + vendaErr.message);

    // ── 4. Itens da venda + movimentação (fire-and-forget) ──────
    await Promise.all([
      client.from('itens_venda').insert([{
        venda_id:       vendaData.id,
        produto_id:     selectedProduct.id,
        nome_produto:   selectedProduct.nome,
        quantidade:     qty,
        preco_unitario: Number(selectedProduct.preco_venda),
        custo_unitario: Number(selectedProduct.preco_custo || 0),
        subtotal:       total,
      }]),
      client.from('movimentacoes_estoque').insert([{
        produto_id:          selectedProduct.id,
        nome_produto:        selectedProduct.nome,
        tipo:                'Saída',
        quantidade:          qty,
        motivo:              'Venda',
        administrador_email: vendedor,
      }]),
    ]);

    // ── 5. Registrar/atualizar cliente ────────────────────────
    const nomeCliente = clienteNome.trim();
    if (nomeCliente && nomeCliente !== 'Cliente balcão') {
      try {
        const { data: cliExist, error: cliErr } = await client
          .from('clientes').select('id, total_gasto, total_compras').eq('nome', nomeCliente).maybeSingle();
        if (!cliErr) {
          if (cliExist) {
            await client.from('clientes').update({
              total_gasto:   Number(cliExist.total_gasto) + total,
              total_compras: cliExist.total_compras + 1,
              ultima_compra: new Date().toISOString(),
            }).eq('id', cliExist.id);
          } else {
            await client.from('clientes').insert([{
              nome:          nomeCliente,
              total_gasto:   total,
              total_compras: 1,
              ultima_compra: new Date().toISOString(),
            }]);
          }
        } else {
          console.warn('Erro ao salvar cliente:', cliErr.message);
        }
      } catch (e) {
        console.warn('Erro na tabela clientes:', e);
      }
    }

    showToast('Venda registrada com sucesso! ✅', 'success');
    limparFormulario();
    // Realtime cuida das atualizações — só força products localmente
    const idx = products.findIndex(p => p.id === selectedProduct?.id);
    if (idx !== -1) products[idx] = { ...products[idx], estoque: novoEstoque };

  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    _vendaEmAndamento = false;
    btnRegistrar.disabled = false;
    btnRegistrar.textContent = '✅ Registrar Venda';
  }
});

function limparFormulario() {
  vendaClienteEl && (vendaClienteEl.value = '');
  vendaQtdEl && (vendaQtdEl.value = '1');
  vendaValorEl && (vendaValorEl.value = '');
  formaPagamentoEl && (formaPagamentoEl.value = '');
  obsVendaEl && (obsVendaEl.value = '');
  buscaInput && (buscaInput.value = '');
  const vendedorEl = document.getElementById('vendedor-select');
  if (vendedorEl) vendedorEl.value = '';
  resultadosBusca?.classList.add('hidden');
  prodSelecionado?.classList.add('hidden');
  selectedProduct = null;
}

// ===== ÚLTIMAS VENDAS DO DIA =====
async function loadUltimasVendas() {
  const hoje = new Date().toISOString().split('T')[0];
  const { data, error } = await client
    .from('vendas')
    .select('*')
    .gte('created_at', `${hoje}T00:00:00`)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) { console.error(error); return; }

  const total = (data || []).reduce((s, v) => s + Number(v.valor_total || 0), 0);
  if (totalHojeEl) totalHojeEl.textContent = `${fmt(total)} hoje`;

  if (!listaUltimas) return;
  if (!data?.length) { listaUltimas.innerHTML = '<div class="empty-state">Nenhuma venda hoje ainda.</div>'; return; }

  const pgIcon = { pix: '💰', dinheiro: '💵', debito: '💳', credito: '💳', fiado: '📒' };
  listaUltimas.innerHTML = data.map(v => `
    <div class="ultima-venda-item">
      <div class="uv-left">
        <span class="uv-cliente">${v.cliente_nome || 'Cliente balcão'}</span>
        <span class="uv-produto">${v.produto_nome || ''} × ${v.quantidade}</span>
      </div>
      <div class="uv-right">
        <span class="uv-valor">${fmt(v.valor_total)}</span>
        <span class="uv-pag">${pgIcon[v.forma_pagamento] || ''} ${v.forma_pagamento}</span>
      </div>
    </div>`).join('');

  updateDashToday(total);
}

// ===== HISTÓRICO =====
const painelHistorico = document.getElementById('painel-historico');
const painelVenda = document.getElementById('painel-venda');
const painelUltimas = document.getElementById('painel-ultimas-vendas');

document.getElementById('btn-historico-vendas')?.addEventListener('click', () => {
  painelVenda?.classList.add('hidden');
  painelUltimas?.classList.add('hidden');
  painelHistorico?.classList.remove('hidden');
  loadHistorico();
});
document.getElementById('btn-fechar-historico')?.addEventListener('click', () => {
  painelHistorico?.classList.add('hidden');
  painelVenda?.classList.remove('hidden');
  painelUltimas?.classList.remove('hidden');
});
document.getElementById('btn-filtrar-hist')?.addEventListener('click', loadHistorico);

async function loadHistorico() {
  const ini = document.getElementById('hist-data-ini')?.value;
  const fim = document.getElementById('hist-data-fim')?.value;
  const lista = document.getElementById('lista-historico-vendas'); if (!lista) return;
  lista.innerHTML = '<div class="loading">Carregando...</div>';
  let q = client.from('vendas').select('*').order('created_at', { ascending: false }).limit(100);
  if (ini) q = q.gte('created_at', `${ini}T00:00:00`);
  if (fim) q = q.lte('created_at', `${fim}T23:59:59`);
  const { data, error } = await q;
  if (error) { lista.innerHTML = '<div class="empty-state">Erro ao carregar.</div>'; return; }
  if (!data?.length) { lista.innerHTML = '<div class="empty-state">Nenhuma venda encontrada.</div>'; return; }
  lista.innerHTML = data.map(v => `
    <div class="historico-item">
      <div class="historico-item-header">
        <span class="hist-cliente">${v.cliente_nome || 'Cliente balcão'}</span>
        <span class="hist-total">${fmt(v.valor_total)}</span>
      </div>
      <div class="hist-produto">${v.produto_nome || ''} × ${v.quantidade}</div>
      <div class="hist-info">
        <span>${new Date(v.created_at).toLocaleString('pt-BR')}</span>
        <span class="badge-pagamento">${v.forma_pagamento}</span>
        ${v.administrador_email ? `<span>👤 ${v.administrador_email}</span>` : ''}
        ${v.observacao ? `<span>${v.observacao}</span>` : ''}
      </div>
    </div>`).join('');
}

// ===== DASHBOARD =====
function updateDashToday(total) {
  const el = document.getElementById('dash-hoje'); if (el) el.textContent = fmt(total);
}

async function loadDashboard() {
  const hoje = new Date().toISOString().split('T')[0];
  const inicioSemana = new Date(); inicioSemana.setDate(inicioSemana.getDate() - inicioSemana.getDay());
  const inicioMes = hoje.slice(0, 7) + '-01';

  const [{ data: dHoje }, { data: dSemana }, { data: dMes }, { data: dUltimas }] = await Promise.all([
    client.from('vendas').select('valor_total').gte('created_at', `${hoje}T00:00:00`),
    client.from('vendas').select('valor_total').gte('created_at', inicioSemana.toISOString()),
    client.from('vendas').select('valor_total').gte('created_at', `${inicioMes}T00:00:00`),
    client.from('vendas').select('*').order('created_at', { ascending: false }).limit(10),
  ]);

  const soma = arr => (arr || []).reduce((s, v) => s + Number(v.valor_total), 0);
  const elHoje   = document.getElementById('dash-hoje');   if (elHoje)   elHoje.textContent   = fmt(soma(dHoje));
  const elSemana = document.getElementById('dash-semana'); if (elSemana) elSemana.textContent = fmt(soma(dSemana));
  const elMes    = document.getElementById('dash-mes');    if (elMes)    elMes.textContent    = fmt(soma(dMes));

  renderDashUltimasVendas(dUltimas || []);
  renderDashMaisVendidos();
  renderDashEstoqueBaixo();
}

function renderDashUltimasVendas(vendas) {
  const lista = document.getElementById('dash-ultimas-vendas'); if (!lista) return;
  if (!vendas.length) { lista.innerHTML = '<div class="empty-state">Nenhuma venda ainda.</div>'; return; }
  const pgIcon = { pix: '💰', dinheiro: '💵', debito: '💳', credito: '💳', fiado: '📒' };
  lista.innerHTML = vendas.map(v => `
    <div class="venda-dash-item">
      <div>
        <div style="font-size:14px;font-weight:600">${v.cliente_nome || 'Cliente balcão'}</div>
        <div class="venda-dash-info">${v.produto_nome || ''} × ${v.quantidade} • ${pgIcon[v.forma_pagamento] || ''} ${v.forma_pagamento} • ${new Date(v.created_at).toLocaleString('pt-BR')}</div>
      </div>
      <div class="venda-dash-total">${fmt(v.valor_total)}</div>
    </div>`).join('');
}

async function renderDashMaisVendidos() {
  const lista = document.getElementById('dash-mais-vendidos'); if (!lista) return;
  const inicioMes = new Date().toISOString().slice(0, 7) + '-01';
  const { data } = await client.from('vendas').select('produto_nome, quantidade, valor_total').gte('created_at', `${inicioMes}T00:00:00`);
  if (!data?.length) { lista.innerHTML = '<div class="empty-state">Nenhuma venda no mês.</div>'; return; }

  // Agrupar por produto
  const mapa = {};
  data.forEach(v => {
    const nome = v.produto_nome || 'Desconhecido';
    if (!mapa[nome]) mapa[nome] = { qty: 0, total: 0 };
    mapa[nome].qty   += Number(v.quantidade);
    mapa[nome].total += Number(v.valor_total);
  });

  const ranking = Object.entries(mapa).sort((a, b) => b[1].qty - a[1].qty).slice(0, 5);
  lista.innerHTML = ranking.map(([nome, d], i) => `
    <div class="rank-item">
      <span class="rank-pos">${i + 1}°</span>
      <span class="rank-nome">${nome}</span>
      <span class="rank-qtd">${d.qty} un</span>
      <span class="rank-valor">${fmt(d.total)}</span>
    </div>`).join('');
}

function renderDashEstoqueBaixo() {
  const lista = document.getElementById('dash-alerta-estoque');
  const badge = document.getElementById('dash-estoque-baixo');
  const totalEl = document.getElementById('dash-total-estoque');
  if (!lista) return;

  const baixos = products.filter(p => p.status === 'ativo' && p.estoque <= p.estoque_minimo);
  if (badge) badge.textContent = baixos.length;

  const totalEstoque = products.filter(p => p.status === 'ativo').reduce((s, p) => s + p.estoque, 0);
  if (totalEl) totalEl.textContent = totalEstoque;

  if (!baixos.length) {
    lista.innerHTML = '<div class="empty-state">✅ Todos os produtos com estoque ok.</div>';
    return;
  }

  lista.innerHTML = baixos.map(p => {
    const zero = p.estoque <= 0;
    return `
    <div class="alerta-item ${zero ? 'alerta-item-zero' : ''}">
      <span class="alerta-nome">${p.nome}</span>
      <span class="alerta-estoque">${zero ? '🚨 Sem estoque' : `⚠️ ${p.estoque} / min ${p.estoque_minimo} — faltam ${p.estoque_minimo - p.estoque} un`}</span>
    </div>`;
  }).join('');
}

// ===== AVISO DE ESTOQUE MÍNIMO =====
let alertasMostrados = new Set();

function verificarEstoqueMinimo() {
  const criticos = products.filter(p => p.status === 'ativo' && p.estoque <= p.estoque_minimo && p.estoque > 0);
  const zerados  = products.filter(p => p.status === 'ativo' && p.estoque <= 0);

  criticos.forEach(p => {
    if (!alertasMostrados.has(`min-${p.id}`)) {
      alertasMostrados.add(`min-${p.id}`);
      showAlertaEstoque(`⚠️ Estoque baixo: ${p.nome} (${p.estoque} un)`, 'warn');
    }
  });

  zerados.forEach(p => {
    if (!alertasMostrados.has(`zero-${p.id}`)) {
      alertasMostrados.add(`zero-${p.id}`);
      showAlertaEstoque(`🚨 Sem estoque: ${p.nome}`, 'danger');
    }
  });
}

function showAlertaEstoque(texto, tipo) {
  const container = document.getElementById('alertas-estoque');
  if (!container) return;
  const div = document.createElement('div');
  div.className = `alerta-estoque-item alerta-${tipo}`;
  div.innerHTML = `<span>${texto}</span><button class="btn-fechar-alerta">✕</button>`;
  div.querySelector('.btn-fechar-alerta').addEventListener('click', () => div.remove());
  container.appendChild(div);
  container.classList.remove('hidden');
  // Auto-remover após 8 segundos
  setTimeout(() => { div.remove(); if (!container.children.length) container.classList.add('hidden'); }, 8000);
}

// ===== ABA ENTRADAS DE MERCADORIAS =====
function popularSelectEntrada() {
  const sel = document.getElementById('entrada-produto'); if (!sel) return;
  const atual = sel.value;
  sel.innerHTML = '<option value="">📦 Selecione o produto...</option>' +
    products.map(p => `<option value="${p.id}">${p.nome}</option>`).join('');
  sel.value = atual;
}

function recalcEntrada() {
  const qty = parseFloat(document.getElementById('entrada-quantidade')?.value) || 0;
  const unit = parseFloat(document.getElementById('entrada-valor-unit')?.value) || 0;
  const total = qty * unit;
  const el = document.getElementById('entrada-total');
  if (el) el.textContent = fmt(total);
}

document.getElementById('entrada-quantidade')?.addEventListener('input', recalcEntrada);
document.getElementById('entrada-valor-unit')?.addEventListener('input', recalcEntrada);

document.getElementById('btn-registrar-entrada')?.addEventListener('click', async () => {
  const prodId = document.getElementById('entrada-produto')?.value;
  const qty = parseInt(document.getElementById('entrada-quantidade')?.value) || 0;
  const valorUnit = parseFloat(document.getElementById('entrada-valor-unit')?.value) || 0;
  const fornecedor = document.getElementById('entrada-fornecedor')?.value.trim() || '';
  const obs = document.getElementById('entrada-obs')?.value.trim() || '';

  if (!prodId) return showToast('Selecione um produto', 'error');
  if (qty < 1) return showToast('Informe a quantidade', 'error');
  if (valorUnit <= 0) return showToast('Informe o valor unitário', 'error');

  const prod = products.find(p => p.id === prodId);
  if (!prod) return;
  const valorTotal = qty * valorUnit;

  const btn = document.getElementById('btn-registrar-entrada');
  btn.disabled = true;

  // Salvar na tabela gastos
  const { error: gastoErr } = await client.from('gastos').insert([{
    descricao: `Entrada: ${prod.nome}`,
    produto_id: prodId,
    quantidade: qty,
    valor_gasto: valorTotal,
    fornecedor,
    observacao: obs,
    atualizar_estoque: true,
  }]);
  if (gastoErr) { btn.disabled = false; console.error(gastoErr); return showToast('Erro ao registrar entrada', 'error'); }

  // Atualizar estoque
  const { data: prodAtual } = await client.from('produtos').select('estoque').eq('id', prodId).single();
  const novoEstoque = (prodAtual?.estoque || 0) + qty;
  await client.from('produtos').update({ estoque: novoEstoque, preco_custo: valorUnit }).eq('id', prodId);

  // Registrar movimentação
  await client.from('movimentacoes_estoque').insert([{
    produto_id: prodId,
    nome_produto: prod.nome,
    tipo: 'Entrada',
    quantidade: qty,
    motivo: fornecedor ? `Compra - ${fornecedor}` : 'Entrada de mercadoria',
  }]);

  showToast('Mercadoria registrada com sucesso', 'success');
  limparEntrada();
  await Promise.all([loadProducts(), loadUltimasEntradas(), loadResumoEntradas()]);
  btn.disabled = false;
});

function limparEntrada() {
  const ids = ['entrada-produto', 'entrada-fornecedor', 'entrada-quantidade', 'entrada-valor-unit', 'entrada-obs'];
  ids.forEach(id => {
    const el = document.getElementById(id); if (!el) return;
    el.value = id === 'entrada-quantidade' ? '1' : '';
  });
  const totalEl = document.getElementById('entrada-total');
  if (totalEl) totalEl.textContent = fmt(0);
}

async function loadUltimasEntradas() {
  const lista = document.getElementById('lista-ultimas-entradas'); if (!lista) return;
  const { data } = await client.from('gastos').select('*').order('created_at', { ascending: false }).limit(10);
  if (!data?.length) { lista.innerHTML = '<div class="empty-state">Nenhuma entrada ainda.</div>'; return; }
  lista.innerHTML = data.map(g => `
    <div class="ultima-venda-item">
      <div class="uv-icon">📦</div>
      <div class="uv-left">
        <span class="uv-cliente">${g.descricao}</span>
        <span class="uv-produto">${g.fornecedor || 'Sem fornecedor'} · ${g.quantidade} un · ${new Date(g.created_at).toLocaleDateString('pt-BR')}</span>
      </div>
      <div class="uv-right">
        <span class="uv-valor" style="color:var(--orange)">${fmt(g.valor_gasto)}</span>
      </div>
    </div>`).join('');
}

async function loadResumoEntradas() {
  const hoje = new Date().toISOString().split('T')[0];
  const inicioMes = hoje.slice(0, 7) + '-01';
  const [{ data: dHoje }, { data: dMes }] = await Promise.all([
    client.from('gastos').select('valor_gasto').gte('created_at', `${hoje}T00:00:00`),
    client.from('gastos').select('valor_gasto').gte('created_at', `${inicioMes}T00:00:00`),
  ]);
  const somaHoje = (dHoje || []).reduce((s, g) => s + Number(g.valor_gasto), 0);
  const somaMes  = (dMes  || []).reduce((s, g) => s + Number(g.valor_gasto), 0);
  const elHoje = document.getElementById('entrada-hoje');
  const elMes  = document.getElementById('entrada-mes');
  if (elHoje) elHoje.textContent = fmt(somaHoje);
  if (elMes)  elMes.textContent  = fmt(somaMes);
  // Atualiza card de gastos no dashboard
  const dashGastos = document.getElementById('dash-gastos');
  if (dashGastos) dashGastos.textContent = fmt(somaMes);
}

// Histórico de entradas
const painelHistEntradas = document.getElementById('painel-hist-entradas');
const painelEntrada = document.getElementById('painel-entrada');

document.getElementById('btn-hist-entradas')?.addEventListener('click', () => {
  painelEntrada?.classList.add('hidden');
  painelHistEntradas?.classList.remove('hidden');
  loadHistEntradas();
});
document.getElementById('btn-fechar-hist-entradas')?.addEventListener('click', () => {
  painelHistEntradas?.classList.add('hidden');
  painelEntrada?.classList.remove('hidden');
});
document.getElementById('btn-filtrar-entradas')?.addEventListener('click', loadHistEntradas);

async function loadHistEntradas() {
  const lista = document.getElementById('lista-hist-entradas'); if (!lista) return;
  lista.innerHTML = '<div class="loading">Carregando...</div>';
  const prod = document.getElementById('hist-entrada-produto')?.value.toLowerCase() || '';
  const forn = document.getElementById('hist-entrada-fornecedor')?.value.toLowerCase() || '';
  const ini  = document.getElementById('hist-entrada-ini')?.value;
  const fim  = document.getElementById('hist-entrada-fim')?.value;
  let q = client.from('gastos').select('*').order('created_at', { ascending: false }).limit(100);
  if (ini) q = q.gte('created_at', `${ini}T00:00:00`);
  if (fim) q = q.lte('created_at', `${fim}T23:59:59`);
  const { data, error } = await q;
  if (error || !data?.length) { lista.innerHTML = '<div class="empty-state">Nenhuma entrada encontrada.</div>'; return; }
  const filtrado = data.filter(g =>
    g.descricao.toLowerCase().includes(prod) &&
    (g.fornecedor || '').toLowerCase().includes(forn)
  );
  if (!filtrado.length) { lista.innerHTML = '<div class="empty-state">Nenhuma entrada encontrada.</div>'; return; }
  lista.innerHTML = filtrado.map(g => `
    <div class="historico-item">
      <div class="historico-item-header">
        <span class="hist-cliente">${g.descricao}</span>
        <span class="hist-total" style="color:var(--red)">${fmt(g.valor_gasto)}</span>
      </div>
      <div class="hist-produto">${g.quantidade} un • ${g.fornecedor || 'Sem fornecedor'}</div>
      <div class="hist-info">
        <span>${new Date(g.created_at).toLocaleString('pt-BR')}</span>
        ${g.observacao ? `<span>${g.observacao}</span>` : ''}
      </div>
    </div>`).join('');
}
let prodViewMode = 'cards';

document.getElementById('btn-toggle-view')?.addEventListener('click', () => {
  prodViewMode = prodViewMode === 'cards' ? 'tabela' : 'cards';
  document.getElementById('btn-toggle-view').textContent = prodViewMode === 'cards' ? '📋 Tabela' : '📦 Cards';
  renderProdutosList();
});

let prodFilterCat = '';

async function loadProdutosList() {
  const lista = document.getElementById('lista-produtos'); if (!lista) return;
  lista.innerHTML = '<div class="loading">Carregando...</div>';
  const { data, error } = await client.from('produtos').select('*').order('nome');
  if (error) { lista.innerHTML = '<div class="empty-state">Erro ao carregar produtos.</div>'; return; }
  products = data || [];
  renderProdutosList();
}

function renderProdutosList() {
  const lista = document.getElementById('lista-produtos'); if (!lista) return;
  const q = (document.getElementById('busca-produto-lista')?.value || '').trim().toLowerCase();
  const cat = document.getElementById('filtro-categoria-prod')?.value || '';
  const filtered = products.filter(p =>
    p.nome.toLowerCase().includes(q) && (!cat || p.categoria === cat)
  );
  if (!filtered.length) { lista.innerHTML = '<div class="empty-state">Nenhum produto encontrado.</div>'; return; }

  if (prodViewMode === 'tabela') {
    lista.innerHTML = `
      <div style="overflow-x:auto">
        <table class="tabela-produtos">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Categoria</th>
              <th>Venda</th>
              <th>Custo</th>
              <th>Estoque</th>
              <th>Mínimo</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.map(p => {
              const estoqueClass = p.estoque <= 0 ? 'estoque-zero' : p.estoque <= p.estoque_minimo ? 'estoque-baixo' : 'estoque-ok';
              const estoqueLabel = p.estoque <= 0 ? '🚨 0' : p.estoque <= p.estoque_minimo ? `⚠️ ${p.estoque}` : p.estoque;
              return `
              <tr>
                <td>${p.nome}</td>
                <td>${p.categoria}</td>
                <td>${fmt(p.preco_venda)}</td>
                <td>${fmt(p.preco_custo)}</td>
                <td><span class="estoque-badge ${estoqueClass}">${estoqueLabel}</span></td>
                <td>${p.estoque_minimo}</td>
                <td>${p.status === 'inativo' ? '<span class="inativo-badge">Inativo</span>' : '<span style="color:var(--green)">Ativo</span>'}</td>
                <td style="display:flex;gap:6px">
                  <button class="btn-secondary btn-sm" data-action="editar" data-id="${p.id}">✏️</button>
                  <button class="btn-secondary btn-sm" data-action="estoque" data-id="${p.id}">📦</button>
                  <button class="btn-secondary btn-sm" data-action="excluir" data-id="${p.id}" style="color:var(--red);border-color:var(--red)">🗑️</button>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
    return;
  }

  lista.innerHTML = filtered.map(p => {
    const estoqueClass = p.estoque <= 0 ? 'estoque-zero' : p.estoque <= p.estoque_minimo ? 'estoque-baixo' : 'estoque-ok';
    const estoqueLabel = p.estoque <= 0 ? '🚨 Sem estoque' : p.estoque <= p.estoque_minimo ? `⚠️ ${p.estoque} un` : `${p.estoque} un`;
    const fotos = (p.fotos_urls && p.fotos_urls.length ? p.fotos_urls : (p.foto_url ? [p.foto_url] : []));
    const pid = p.id;

    let fotoHtml = '';
    if (fotos.length === 1) {
      fotoHtml = `<div class="produto-item-img"><img src="${fotos[0]}" alt="${p.nome}" onerror="this.parentElement.style.display='none'" /></div>`;
    } else if (fotos.length > 1) {
      const slides = fotos.map((url, i) =>
        `<div class="carrossel-slide${i === 0 ? ' ativo' : ''}"><img src="${url}" alt="${p.nome} ${i+1}" onerror="this.parentElement.style.display='none'" /></div>`
      ).join('');
      const dots = fotos.map((_, i) =>
        `<button class="carrossel-dot${i === 0 ? ' ativo' : ''}" data-idx="${i}"></button>`
      ).join('');
      fotoHtml = `
        <div class="produto-item-img carrossel" data-pid="${pid}">
          <div class="carrossel-track">${slides}</div>
          <button class="carrossel-btn carrossel-prev" data-dir="-1">&#8249;</button>
          <button class="carrossel-btn carrossel-next" data-dir="1">&#8250;</button>
          <div class="carrossel-dots">${dots}</div>
          <span class="carrossel-counter">1 / ${fotos.length}</span>
        </div>`;
    }

    return `
    <div class="produto-item">
      ${fotoHtml}
      <div class="produto-item-body">
        <div class="produto-item-header">
          <span class="produto-nome">${p.nome}</span>
          <span class="produto-categoria">${p.categoria}</span>
        </div>
        <div class="produto-precos">
          <span>Venda: <strong>${fmt(p.preco_venda)}</strong></span>
          <span class="custo">Custo: <strong>${fmt(p.preco_custo)}</strong></span>
        </div>
        <div class="produto-estoque-row">
          <span class="estoque-badge ${estoqueClass}">${estoqueLabel}</span>
          ${p.status === 'inativo' ? '<span class="inativo-badge">Inativo</span>' : ''}
        </div>
        <div class="produto-acoes">
          <button class="btn-secondary btn-sm" data-action="editar" data-id="${pid}">✏️ Editar</button>
          <button class="btn-secondary btn-sm" data-action="estoque" data-id="${pid}">📦 Estoque</button>
          <button class="btn-secondary btn-sm" data-action="excluir" data-id="${pid}" style="color:var(--red);border-color:var(--red)">🗑️ Excluir</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

document.getElementById('lista-produtos')?.addEventListener('click', e => {
  const btn = e.target.closest('[data-action]'); if (!btn) return;
  const id = btn.dataset.id;
  if (btn.dataset.action === 'editar') abrirModalProduto(id);
  if (btn.dataset.action === 'estoque') abrirModalEstoque(id);
  if (btn.dataset.action === 'excluir') excluirProduto(id);
});

// Carrossel de fotos
document.getElementById('lista-produtos')?.addEventListener('click', e => {
  const btnNav = e.target.closest('.carrossel-btn');
  const btnDot = e.target.closest('.carrossel-dot');
  const carr = (btnNav || btnDot)?.closest('.carrossel');
  if (!carr) return;
  e.stopPropagation();

  const slides = carr.querySelectorAll('.carrossel-slide');
  const dots   = carr.querySelectorAll('.carrossel-dot');
  const counter = carr.querySelector('.carrossel-counter');
  const total  = slides.length;
  let atual = [...slides].findIndex(s => s.classList.contains('ativo'));

  if (btnDot) {
    atual = parseInt(btnDot.dataset.idx);
  } else {
    atual = (atual + parseInt(btnNav.dataset.dir) + total) % total;
  }

  slides.forEach((s, i) => s.classList.toggle('ativo', i === atual));
  dots.forEach((d, i) => d.classList.toggle('ativo', i === atual));
  if (counter) counter.textContent = `${atual + 1} / ${total}`;
});

document.getElementById('busca-produto-lista')?.addEventListener('input', renderProdutosList);
document.getElementById('filtro-categoria-prod')?.addEventListener('change', renderProdutosList);

// Modal Produto (novo / editar)
function abrirModalProduto(id = null) {
  const modal = document.getElementById('modal-produto'); if (!modal) return;
  const p = id ? products.find(x => x.id === id) : null;
  document.getElementById('modal-produto-titulo').textContent = p ? 'Editar Produto' : 'Novo Produto';
  document.getElementById('prod-id').value = p?.id || '';
  document.getElementById('prod-nome').value = p?.nome || '';
  document.getElementById('prod-categoria').value = p?.categoria || '';
  document.getElementById('prod-preco-venda').value = p?.preco_venda || '';
  document.getElementById('prod-preco-custo').value = p?.preco_custo || '';
  document.getElementById('prod-estoque').value = p?.estoque ?? '';
  document.getElementById('prod-estoque-min').value = p?.estoque_minimo ?? '';
  document.getElementById('prod-status').value = p?.status || 'ativo';
  modal.classList.remove('hidden');
}

document.getElementById('btn-novo-produto')?.addEventListener('click', () => abrirModalProduto());

document.getElementById('form-produto')?.addEventListener('submit', async e => {
  e.preventDefault();
  const id = document.getElementById('prod-id').value;
  const payload = {
    nome: document.getElementById('prod-nome').value.trim(),
    categoria: document.getElementById('prod-categoria').value,
    preco_venda: parseFloat(document.getElementById('prod-preco-venda').value) || 0,
    preco_custo: parseFloat(document.getElementById('prod-preco-custo').value) || 0,
    estoque: parseInt(document.getElementById('prod-estoque').value) || 0,
    estoque_minimo: parseInt(document.getElementById('prod-estoque-min').value) || 0,
    status: document.getElementById('prod-status').value,
  };
  const { error } = id
    ? await client.from('produtos').update(payload).eq('id', id)
    : await client.from('produtos').insert([payload]);
  if (error) { console.error(error); return showToast('Erro ao salvar produto', 'error'); }
  document.getElementById('modal-produto').classList.add('hidden');
  showToast(id ? 'Produto atualizado!' : 'Produto criado!', 'success');
  await loadProdutosList();
});

async function excluirProduto(id) {
  const p = products.find(x => x.id === id); if (!p) return;
  if (!confirm(`Excluir "${p.nome}"? Esta ação não pode ser desfeita.`)) return;

  // Anular referências nas tabelas filhas antes de excluir
  await Promise.all([
    client.from('vendas').update({ produto_id: null }).eq('produto_id', id),
    client.from('itens_venda').update({ produto_id: null }).eq('produto_id', id),
    client.from('gastos').update({ produto_id: null }).eq('produto_id', id),
    client.from('movimentacoes_estoque').update({ produto_id: null }).eq('produto_id', id),
  ]);

  const { error } = await client.from('produtos').delete().eq('id', id);
  if (error) { console.error(error); return showToast('Erro ao excluir produto', 'error'); }
  showToast('Produto excluído!', 'success');
  await loadProdutosList();
}

// Modal Ajuste de Estoque
function abrirModalEstoque(id) {
  const p = products.find(x => x.id === id); if (!p) return;
  const modal = document.getElementById('modal-estoque'); if (!modal) return;
  document.getElementById('estoque-produto-id').value = p.id;
  document.getElementById('estoque-produto-nome').textContent = p.nome;
  document.getElementById('estoque-quantidade').value = '';
  document.getElementById('estoque-motivo').value = '';
  document.getElementById('estoque-tipo').value = 'entrada';
  modal.classList.remove('hidden');
}

document.getElementById('form-estoque')?.addEventListener('submit', async e => {
  e.preventDefault();
  const id = document.getElementById('estoque-produto-id').value;
  const tipo = document.getElementById('estoque-tipo').value;
  const qty = parseInt(document.getElementById('estoque-quantidade').value) || 0;
  const motivo = document.getElementById('estoque-motivo').value || 'Ajuste manual';
  if (qty < 1) return showToast('Informe a quantidade', 'error');
  const p = products.find(x => x.id === id); if (!p) return;
  const novoEstoque = tipo === 'entrada' ? p.estoque + qty : Math.max(0, p.estoque - qty);
  const { data: session } = await client.auth.getSession();
  const user = session?.session?.user;
  const { error } = await client.from('produtos').update({ estoque: novoEstoque }).eq('id', id);
  if (error) { console.error(error); return showToast('Erro ao ajustar estoque', 'error'); }
  await client.from('movimentacoes_estoque').insert([{
    produto_id: id, nome_produto: p.nome,
    tipo: tipo === 'entrada' ? 'Entrada' : 'Saída',
    quantidade: qty, motivo, administrador_id: user?.id,
  }]);
  document.getElementById('modal-estoque').classList.add('hidden');
  showToast('Estoque atualizado!', 'success');
  await loadProdutosList();
});

// ===== RELATÓRIOS =====
document.getElementById('btn-gerar-relatorio')?.addEventListener('click', gerarRelatorio);

async function gerarRelatorio() {
  const ini      = document.getElementById('rel-data-ini')?.value;
  const fim      = document.getElementById('rel-data-fim')?.value;
  const catFilt    = document.getElementById('rel-categoria')?.value || '';
  const pagFilt    = document.getElementById('rel-pagamento')?.value || '';
  const prodFilt   = (document.getElementById('rel-produto')?.value || '').toLowerCase();
  const clienteFilt = (document.getElementById('rel-cliente')?.value || '').toLowerCase();

  if (!ini || !fim) return showToast('Selecione o período', 'error');

  const btn = document.getElementById('btn-gerar-relatorio');
  btn.textContent = 'Gerando...';
  btn.disabled = true;

  // Buscar vendas e gastos do período
  let qVendas = client.from('vendas').select('*')
    .gte('created_at', `${ini}T00:00:00`)
    .lte('created_at', `${fim}T23:59:59`);
  if (pagFilt) qVendas = qVendas.eq('forma_pagamento', pagFilt);

  const [{ data: vendas }, { data: gastos }] = await Promise.all([
    qVendas,
    client.from('gastos').select('valor_gasto')
      .gte('created_at', `${ini}T00:00:00`)
      .lte('created_at', `${fim}T23:59:59`),
  ]);

  btn.textContent = 'Gerar';
  btn.disabled = false;

  // Filtrar por produto/categoria no client
  let vendasFilt = (vendas || []).filter(v => {
    const p = products.find(x => x.id === v.produto_id);
    if (catFilt && p?.categoria !== catFilt) return false;
    if (prodFilt && !(v.produto_nome || '').toLowerCase().includes(prodFilt)) return false;
    if (clienteFilt && !(v.cliente_nome || '').toLowerCase().includes(clienteFilt)) return false;
    return true;
  });

  const totalVendido  = vendasFilt.reduce((s, v) => s + Number(v.valor_total), 0);
  const totalGastos   = (gastos || []).reduce((s, g) => s + Number(g.valor_gasto), 0);
  const custoVendas   = vendasFilt.reduce((s, v) => {
    const p = products.find(x => x.id === v.produto_id);
    return s + (Number(p?.preco_custo || 0) * Number(v.quantidade));
  }, 0);
  const lucro = totalVendido - custoVendas - totalGastos;

  // Resumo
  document.getElementById('rel-total-vendido').textContent = fmt(totalVendido);
  document.getElementById('rel-custo').textContent         = fmt(custoVendas);
  document.getElementById('rel-gastos-periodo').textContent = fmt(totalGastos);
  document.getElementById('rel-lucro').textContent         = fmt(lucro);
  document.getElementById('rel-resumo').classList.remove('hidden');

  // Por forma de pagamento
  const porPag = {};
  vendasFilt.forEach(v => {
    const k = v.forma_pagamento || 'outros';
    porPag[k] = (porPag[k] || 0) + Number(v.valor_total);
  });
  document.getElementById('rel-pagamento-lista').innerHTML = Object.entries(porPag)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `
      <div class="rel-row">
        <span class="rel-label" style="text-transform:capitalize">${k}</span>
        <span class="rel-valor">${fmt(v)}</span>
      </div>`).join('') || '<div class="empty-state">Sem dados.</div>';
  document.getElementById('rel-por-pagamento').classList.remove('hidden');

  // Por produto
  const porProd = {};
  vendasFilt.forEach(v => {
    const nome = v.produto_nome || 'Desconhecido';
    if (!porProd[nome]) porProd[nome] = { qty: 0, total: 0 };
    porProd[nome].qty   += Number(v.quantidade);
    porProd[nome].total += Number(v.valor_total);
  });
  document.getElementById('rel-produto-lista').innerHTML = Object.entries(porProd)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([nome, d]) => `
      <div class="rel-row">
        <span class="rel-label">${nome}</span>
        <span style="font-size:13px;color:var(--text2)">${d.qty} un</span>
        <span class="rel-valor">${fmt(d.total)}</span>
      </div>`).join('') || '<div class="empty-state">Sem dados.</div>';
  document.getElementById('rel-por-produto').classList.remove('hidden');
  document.getElementById('rel-exportar').classList.remove('hidden');

  // Vendas detalhadas
  const pgIcon = { pix: '💰', dinheiro: '💵', debito: '💳', credito: '💳', fiado: '📒' };
  document.getElementById('rel-vendas-lista').innerHTML = vendasFilt.length
    ? vendasFilt.map(v => `
      <div class="historico-item">
        <div class="historico-item-header">
          <span class="hist-cliente">${v.cliente_nome || 'Cliente balcão'}</span>
          <span class="hist-total">${fmt(v.valor_total)}</span>
        </div>
        <div class="hist-produto">${v.produto_nome || ''} × ${v.quantidade} • ${fmt(v.valor_unitario)} un</div>
        <div class="hist-info">
          <span>${new Date(v.created_at).toLocaleString('pt-BR')}</span>
          <span class="badge-pagamento">${pgIcon[v.forma_pagamento] || ''} ${v.forma_pagamento}</span>
          ${v.administrador_email ? `<span>👤 ${v.administrador_email}</span>` : ''}
        </div>
      </div>`).join('')
    : '<div class="empty-state">Nenhuma venda no período.</div>';
  document.getElementById('rel-vendas-detalhadas').classList.remove('hidden');

  // Guardar dados para exportação
  window._relDados = { vendasFilt, ini, fim, totalVendido, custoVendas, totalGastos, lucro, porPag, porProd };
}

// Exportar Excel
document.getElementById('btn-export-excel')?.addEventListener('click', () => {
  const d = window._relDados; if (!d) return;
  const rows = d.vendasFilt.map(v => ({
    Data: new Date(v.created_at).toLocaleString('pt-BR'),
    Cliente: v.cliente_nome || 'Cliente balcão',
    Produto: v.produto_nome || '',
    Quantidade: v.quantidade,
    'Valor Total': Number(v.valor_total),
    Pagamento: v.forma_pagamento,
    Vendedor: v.administrador_email || '',
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Vendas');
  XLSX.writeFile(wb, `relatorio_${d.ini}_${d.fim}.xlsx`);
});

// Exportar PDF
document.getElementById('btn-export-pdf')?.addEventListener('click', () => {
  const d = window._relDados; if (!d) return;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text(`Relatório ${d.ini} a ${d.fim}`, 14, 18);
  doc.setFontSize(11);
  doc.text(`Total Vendido: ${fmt(d.totalVendido)}`, 14, 30);
  doc.text(`Custo dos Produtos: ${fmt(d.custoVendas)}`, 14, 38);
  doc.text(`Gastos no Período: ${fmt(d.totalGastos)}`, 14, 46);
  doc.text(`Lucro Estimado: ${fmt(d.lucro)}`, 14, 54);
  doc.setFontSize(13);
  doc.text('Vendas por Produto', 14, 66);
  doc.setFontSize(10);
  let y = 74;
  Object.entries(d.porProd).sort((a, b) => b[1].total - a[1].total).forEach(([nome, v]) => {
    doc.text(`${nome} — ${v.qty} un — ${fmt(v.total)}`, 14, y);
    y += 8;
    if (y > 270) { doc.addPage(); y = 20; }
  });
  doc.save(`relatorio_${d.ini}_${d.fim}.pdf`);
});

// Fechar modais
document.querySelectorAll('.btn-close[data-close]').forEach(btn => {
  btn.addEventListener('click', () => document.getElementById(btn.dataset.close)?.classList.add('hidden'));
});
document.querySelectorAll('.modal').forEach(modal => {
  modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });
});

// ===== REALTIME =====
let _realtimeChannel = null;

// Debounce simples para agrupar múltiplos eventos rápidos
function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

const _debouncedUltimasVendas   = debounce(loadUltimasVendas, 300);
const _debouncedDashboard        = debounce(loadDashboard, 600);
const _debouncedUltimasEntradas  = debounce(loadUltimasEntradas, 300);
const _debouncedResumoEntradas   = debounce(loadResumoEntradas, 600);
const _debouncedProdutosList     = debounce(renderProdutosList, 300);

function onProdutoChange(payload) {
  const novo = payload.new;
  if (!novo) return;

  // Atualiza só o item alterado no array local
  const idx = products.findIndex(p => p.id === novo.id);
  if (idx !== -1) products[idx] = { ...products[idx], ...novo };
  else products.push(novo);

  // Atualiza o produto selecionado na tela de vendas
  if (selectedProduct?.id === novo.id) {
    selectedProduct = { ...selectedProduct, ...novo };
    if (prodSelEstoque) prodSelEstoque.textContent = `${novo.estoque} em estoque`;
    // Avisa se estoque foi reduzido por outro vendedor enquanto este está digitando
    if (novo.estoque < (parseInt(vendaQtdEl?.value) || 1)) {
      showToast(`⚠️ Estoque de "${novo.nome}" atualizado: ${novo.estoque} un disponíveis.`, 'info');
    }
    recalcTotal();
  }

  renderSearchResults();
  renderDashEstoqueBaixo();
  verificarEstoqueMinimo();
  _debouncedProdutosList();
}

function setupRealtime() {
  // Remove canal anterior se existir
  if (_realtimeChannel) {
    client.removeChannel(_realtimeChannel);
    _realtimeChannel = null;
  }

  _realtimeChannel = client.channel('adega-realtime', {
    config: { broadcast: { self: false } },
  })
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'vendas' }, () => {
    _debouncedUltimasVendas();
    _debouncedDashboard();
  })
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'gastos' }, () => {
    _debouncedUltimasEntradas();
    _debouncedResumoEntradas();
  })
  .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'gastos' }, () => {
    _debouncedUltimasEntradas();
    _debouncedResumoEntradas();
  })
  .on('postgres_changes', { event: '*', schema: 'public', table: 'produtos' }, onProdutoChange)
  .subscribe(status => {
    if (status === 'SUBSCRIBED') {
      console.log('✅ Realtime conectado');
    }
    if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      console.warn('⚠️ Realtime desconectado, reconectando em 4s...');
      setTimeout(setupRealtime, 4000);
    }
  });
}

// ===== INIT =====
window.addEventListener('load', async () => {
  await Promise.all([loadProducts(), loadUltimasVendas(), loadProdutosList(), loadUltimasEntradas(), loadResumoEntradas(), loadDashboard()]);
  setupRealtime();
  navButtons.forEach(b => b.addEventListener('click', () => {
    if (b.dataset.tab === 'produtos') loadProdutosList();
    if (b.dataset.tab === 'gastos') { loadUltimasEntradas(); loadResumoEntradas(); }
    if (b.dataset.tab === 'dashboard') loadDashboard();
    if (b.dataset.tab === 'relatorios') {
      // Preencher datas padrão: primeiro dia do mês até hoje
      const hoje = new Date().toISOString().split('T')[0];
      const inicioMes = hoje.slice(0, 7) + '-01';
      const ini = document.getElementById('rel-data-ini');
      const fim = document.getElementById('rel-data-fim');
      if (ini && !ini.value) ini.value = inicioMes;
      if (fim && !fim.value) fim.value = hoje;
    }
  }));
});
