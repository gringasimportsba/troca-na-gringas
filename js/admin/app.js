import repository, { statuses, pricingRoles } from './repository.js';
import { escapeHtml, safeImageUrl } from '../shared/sanitization.js';

let currentView = 'overview';
let query = '';
let statusFilter = 'Todos';
let evaluations = [];
let authenticated = repository.mode === 'local';
let loginMessage = '';

// Modal de confirmação no visual do painel, no lugar do confirm() do navegador.
// O <dialog> com showModal() já prende o foco, fecha com Esc e bloqueia o fundo.
// Resolve true só quando a pessoa escolhe "Sair".
function confirmarSaida() {
  if (typeof HTMLDialogElement === 'undefined' || typeof HTMLDialogElement.prototype.showModal !== 'function') {
    return Promise.resolve(confirm('Sair do painel administrativo?'));
  }
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'confirm-modal';
    dialog.setAttribute('aria-labelledby', 'confirmModalTitle');
    dialog.setAttribute('aria-describedby', 'confirmModalText');
    dialog.innerHTML = `
      <form method="dialog" class="confirm-modal__box">
        <h2 id="confirmModalTitle">Sair do painel?</h2>
        <p id="confirmModalText">Sua sessão será encerrada e você precisará entrar novamente para acessar o painel.</p>
        <div class="confirm-modal__actions">
          <button type="submit" value="cancel" class="confirm-modal__cancel" autofocus>Cancelar</button>
          <button type="submit" value="ok" class="confirm-modal__ok">Sair</button>
        </div>
      </form>`;
    // clique fora da caixa (no fundo escurecido) cancela
    dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close('cancel'); });
    dialog.addEventListener('close', () => {
      resolve(dialog.returnValue === 'ok');
      dialog.remove();
    }, { once: true });
    document.body.append(dialog);
    dialog.showModal();
  });
}

const $ = selector => document.querySelector(selector);
const statusClasses = new Map(statuses.map(status => [status, status.replaceAll(' ', '-')]));

function money(value) {
  const number = Number(value);
  return Number.isFinite(number)
    ? number.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 })
    : '—';
}

function dateBR(value) {
  const date = new Date(typeof value === 'string' || typeof value === 'number' ? value : Number.NaN);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
    : '—';
}

function phoneLink(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 11) return escapeHtml(phone || '—');
  return `<a href="https://wa.me/55${digits}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">${escapeHtml(phone)}</a>`;
}

function setTitles(title, subtitle) {
  $('#pageTitle').textContent = title;
  $('#pageSub').textContent = subtitle;
}

function statusBadge(status) {
  const safeStatus = statuses.includes(status) ? status : 'Nova';
  return `<span class="status ${statusClasses.get(safeStatus)}">${escapeHtml(safeStatus)}</span>`;
}

function filteredEvaluations() {
  const needle = query.trim().toLowerCase();
  return evaluations.filter(record => {
    const haystack = [record.id, record.customer?.name, record.customer?.phone, record.device?.model, record.device?.storage]
      .map(value => String(value ?? ''))
      .join(' ')
      .toLowerCase();
    return (!needle || haystack.includes(needle)) && (statusFilter === 'Todos' || record.status === statusFilter);
  });
}

function tableRows(records, includePhone = false) {
  if (!records.length) return '<div class="empty"><b>Nenhum resultado.</b>Não há avaliações para este filtro.</div>';
  return `<div class="table-wrap"><table><thead><tr><th>Código</th><th>Cliente</th>${includePhone ? '<th>WhatsApp</th>' : ''}<th>Aparelho</th><th>Estimativa</th><th>Status</th></tr></thead><tbody>${records.map(record => `
    <tr class="clickable" data-id="${escapeHtml(record.id)}" tabindex="0">
      <td class="code">${escapeHtml(record.id)}</td>
      <td class="cell-main">${escapeHtml(record.customer?.name || '—')}</td>
      ${includePhone ? `<td data-label="WhatsApp">${escapeHtml(record.customer?.phone || '—')}</td>` : ''}
      <td data-label="Aparelho">${escapeHtml(record.device?.model || '—')} ${escapeHtml(record.device?.storage || '')}</td>
      <td class="money" data-label="Estimativa">${money(record.calculation?.estimated)}</td>
      <td class="cell-status">${statusBadge(record.status)}</td>
    </tr>`).join('')}</tbody></table></div>`;
}

function panelTable(records, title, subtitle) {
  return `<div class="panel"><div class="panel-head"><div><h2>${escapeHtml(title)}</h2><p>${escapeHtml(subtitle)}</p></div></div>${tableRows(records)}</div>`;
}

function bindRows() {
  document.querySelectorAll('[data-id]').forEach(row => {
    row.onclick = () => openDetail(row.dataset.id);
    row.onkeydown = event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openDetail(row.dataset.id);
      }
    };
  });
}

function calculationBox(record) {
  const calc = record.calculation || {};
  if (!Number.isFinite(Number(calc.base)) || !Number(calc.base)) return '';
  const lines = Array.isArray(calc.lines) ? calc.lines : [];
  const manual = Array.isArray(calc.manual) ? calc.manual : [];
  const applied = Math.max(0, Number(calc.base) - Number(calc.estimated));
  const capped = Number(calc.totalDiscount) > applied;
  return `<div class="detail-box"><h3>Diagnóstico do cálculo</h3>
    <div class="kv"><span>Valor-base (modelo + capacidade)</span><b>${money(calc.base)}</b></div>
    ${lines.map(line => `<div class="kv"><span>${escapeHtml(line.label)}</span><b>− ${money(line.amount)}</b></div>`).join('') || '<div class="kv"><span>Descontos automáticos</span><b>R$ 0</b></div>'}
    <div class="kv"><span>Total de descontos calculado</span><b>${money(calc.totalDiscount)}</b></div>
    ${capped ? `<div class="kv"><span>Desconto aplicado (limite)</span><b>− ${money(applied)}</b></div>` : ''}
    <div class="kv"><span>Estimativa</span><b>${money(calc.estimated)}</b></div>
    ${manual.length
      ? `<p><b>Análise manual:</b> ${manual.map(reason => escapeHtml(reason)).join(' • ')}</p>`
      : '<p>Nenhuma regra de análise manual foi acionada.</p>'}
  </div>`;
}

function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
}

function renderOverview() {
  setTitles(`${greeting()}!`, 'Aqui está o resumo do Gringas Troca.');
  const today = new Date().toDateString();
  const todayCount = evaluations.filter(record => new Date(record.createdAt).toDateString() === today).length;
  const pending = evaluations.filter(record => ['Nova', 'Em análise'].includes(record.status)).length;
  const contacted = evaluations.filter(record => ['Cliente contatado', 'Aguardando aparelho', 'Aprovado', 'Troca realizada'].includes(record.status)).length;
  const completed = evaluations.filter(record => record.status === 'Troca realizada').length;
  const source = repository.mode === 'cloud' ? 'sincronizadas com o Supabase' : 'salvas neste navegador';
  $('#content').innerHTML = `<div class="cards">
    <div class="metric"><small>Avaliações hoje</small><strong>${todayCount}</strong><em>${evaluations.length} ${source}</em></div>
    <div class="metric"><small>Aguardando análise</small><strong>${pending}</strong><em>pedem atenção</em></div>
    <div class="metric"><small>Clientes contatados</small><strong>${contacted}</strong><em>pipeline ativo</em></div>
    <div class="metric"><small>Trocas realizadas</small><strong>${completed}</strong><em>concluídas</em></div>
  </div>${panelTable(evaluations.slice(0, 8), 'Avaliações recentes', `Fonte: ${repository.mode === 'cloud' ? 'Supabase' : 'histórico local' }.`)}`;
  bindRows();
}

function renderEvaluations() {
  setTitles('Avaliações', 'Pesquise, filtre e abra cada ficha de trade-in.');
  $('#content').innerHTML = `<div class="panel"><div class="panel-head"><div><h2>Todas as avaliações</h2><p>${repository.mode === 'cloud' ? 'Somente registros atuais do Supabase; nenhum cache local é criado.' : 'Modo local: histórico deste navegador.'}</p></div><div class="toolbar">
    <input class="search" id="search" type="search" aria-label="Buscar avaliações" placeholder="Código, cliente, modelo..." value="${escapeHtml(query)}">
    <select class="filter" id="filter" aria-label="Filtrar por status">${['Todos', ...statuses].map(status => `<option${statusFilter === status ? ' selected' : ''}>${escapeHtml(status)}</option>`).join('')}</select>
  </div></div><div id="evalTable">${tableRows(filteredEvaluations(), true)}</div></div>`;

  const refresh = () => {
    $('#evalTable').innerHTML = tableRows(filteredEvaluations(), true);
    bindRows();
  };
  $('#search').oninput = event => { query = event.target.value; refresh(); };
  $('#filter').onchange = event => { statusFilter = event.target.value; refresh(); };
  bindRows();
}

function renderClients() {
  setTitles('Clientes', 'Leads consolidados pelas avaliações.');
  const clients = new Map();
  for (const record of evaluations) {
    const key = String(record.customer?.phone || record.customer?.name || record.id || '').toLowerCase();
    if (!clients.has(key)) {
      clients.set(key, { name: record.customer?.name || 'Cliente', phone: record.customer?.phone || '—', count: 0, last: record.createdAt });
    }
    const client = clients.get(key);
    client.count += 1;
    if (Date.parse(record.createdAt) > Date.parse(client.last)) client.last = record.createdAt;
  }
  const list = [...clients.values()];
  $('#content').innerHTML = list.length
    ? `<div class="client-grid">${list.map(client => `<div class="client-card"><h3>${escapeHtml(client.name)}</h3><p>${phoneLink(client.phone)}</p><strong>${client.count} avaliação(ões)</strong><p>Última: ${dateBR(client.last)}</p></div>`).join('')}</div>`
    : '<div class="panel"><div class="empty"><b>Nenhum cliente ainda.</b>Os leads aparecerão aqui após as avaliações.</div></div>';
}

// ===== Configuração comercial (preços, regras e upgrade) =====

function canEditPricing() {
  return pricingRoles.includes(repository.membership?.role || (repository.mode === 'local' ? 'owner' : ''));
}

function readonlyNote() {
  return canEditPricing() ? '' : '<p class="config-note">Sua função permite apenas consultar. Somente owner ou admin alteram estes valores.</p>';
}

function amountInput(attrs, value, label) {
  return `<label class="money-input"><span aria-hidden="true">R$</span><input type="number" inputmode="decimal" min="0" max="1000000" step="0.01" ${attrs} value="${escapeHtml(value)}" aria-label="${escapeHtml(label)}"${canEditPricing() ? '' : ' disabled'}></label>`;
}

function readAmount(input) {
  const value = input.value.trim() === '' ? Number.NaN : Math.round(Number(input.value) * 100) / 100;
  input.classList.toggle('invalid', !(value >= 0 && value <= 1000000));
  return value;
}

function saveBar(id, label) {
  if (!canEditPricing()) return '';
  return `<div class="save-bar"><span class="save-status" id="${id}Status" role="status"></span><button type="button" class="savebtn" id="${id}" disabled>${escapeHtml(label)}</button></div>`;
}

// Liga o botão de salvar: habilita quando algo muda e mostra o resultado.
// Tela de configuração com edição pendente; usada para avisar antes de sair dela.
let pendingChanges = () => false;

function bindSave(id, isDirty, save) {
  const button = document.getElementById(id);
  const status = document.getElementById(`${id}Status`);
  if (!button) return () => {};
  pendingChanges = isDirty;
  const refresh = () => {
    button.disabled = !isDirty();
    if (!button.disabled) status.textContent = 'Alterações não salvas.';
    else if (status.textContent === 'Alterações não salvas.') status.textContent = '';
  };
  button.onclick = async () => {
    button.disabled = true;
    status.textContent = 'Salvando...';
    try {
      await save();
      status.textContent = 'Salvo. As próximas avaliações já usam os novos valores.';
    } catch (error) {
      status.textContent = error?.message || 'Não foi possível salvar.';
      button.disabled = false;
    }
  };
  return refresh;
}

async function loadConfig(view, loader) {
  $('#content').innerHTML = '<div class="panel"><div class="empty"><b>Carregando...</b>Buscando a configuração da loja.</div></div>';
  try {
    const data = await loader();
    return currentView === view ? data : null;
  } catch (error) {
    if (currentView === view) {
      $('#content').innerHTML = `<div class="panel"><div class="empty"><b>Não foi possível carregar.</b>${escapeHtml(error?.message || 'Tente novamente.')}</div></div>`;
    }
    return null;
  }
}

function storageRange(model, rules) {
  const bonuses = model.storages.map(storage => Number(rules.storageBonus?.[storage] ?? 0));
  const min = model.basePrice + Math.min(...bonuses);
  const max = model.basePrice + Math.max(...bonuses);
  return min === max ? money(min) : `${money(min)} até ${money(max)}`;
}

async function renderPrices() {
  setTitles('Aparelhos e preços', 'Valor-base de cada iPhone aceito como entrada, em excelente estado.');
  const pricing = await loadConfig('prices', () => repository.getPricing());
  if (!pricing) return;
  const { models, rules } = pricing;
  const storages = Object.keys(rules.storageBonus || {});
  const families = [...new Set(models.map(item => item.model.match(/^iPhone \d+/)?.[0] || item.model))];
  let family = 'Todos';
  let search = '';

  $('#content').innerHTML = `${readonlyNote()}<div class="panel"><div class="panel-head"><div><h2>Tabela de preços</h2><p>Estimativa = valor-base + acréscimo da capacidade − descontos das regras de avaliação.</p></div>
      <div class="toolbar"><input class="search" id="priceSearch" type="search" placeholder="Buscar modelo..." aria-label="Buscar modelo"></div>
      <div class="chips" role="group" aria-label="Filtrar por geração">${['Todos', ...families].map(name => `<button type="button" class="chip${name === family ? ' active' : ''}" data-family="${escapeHtml(name)}">${escapeHtml(name)}</button>`).join('')}</div></div>
    <div class="config-list">${models.map(item => `<div class="config-row" data-row="${escapeHtml(item.model)}">
      <div class="config-info"><b>${escapeHtml(item.model)}</b><small>${item.storages.length} memórias (${escapeHtml(item.storages.join(', '))}) • <span data-range>${storageRange(item, rules)}</span></small></div>
      ${amountInput(`data-price="${escapeHtml(item.model)}"`, item.basePrice, `Valor-base do ${item.model}`)}</div>`).join('')}</div></div>
    <div class="panel"><div class="panel-head"><div><h2>Acréscimo por capacidade</h2><p>Somado ao valor-base conforme a memória escolhida pelo cliente.</p></div></div>
      <div class="config-list">${storages.map(storage => `<div class="config-row"><div class="config-info"><b>${escapeHtml(storage)}</b></div>${amountInput(`data-bonus="${escapeHtml(storage)}"`, rules.storageBonus[storage], `Acréscimo para ${storage}`)}</div>`).join('')}</div></div>
    ${saveBar('savePrices', 'SALVAR PREÇOS')}`;

  const priceInputs = [...document.querySelectorAll('[data-price]')];
  const bonusInputs = [...document.querySelectorAll('[data-bonus]')];
  const original = new Map(models.map(item => [item.model, item.basePrice]));
  const changedPrices = () => priceInputs
    .map(input => ({ model: input.dataset.price, basePrice: readAmount(input) }))
    .filter(item => item.basePrice !== original.get(item.model));
  const currentBonus = () => Object.fromEntries(bonusInputs.map(input => [input.dataset.bonus, readAmount(input)]));
  const bonusChanged = () => storages.some(storage => currentBonus()[storage] !== rules.storageBonus[storage]);

  const applyFilter = () => {
    const needle = search.trim().toLowerCase();
    document.querySelectorAll('[data-row]').forEach(row => {
      const model = row.dataset.row;
      row.hidden = !(family === 'Todos' || model.startsWith(`${family} `) || model === family) || !model.toLowerCase().includes(needle);
    });
    document.querySelectorAll('[data-family]').forEach(chip => chip.classList.toggle('active', chip.dataset.family === family));
  };
  const updateRanges = () => {
    const bonus = currentBonus();
    for (const item of models) {
      const basePrice = readAmount(priceInputs.find(input => input.dataset.price === item.model));
      const row = document.querySelector(`[data-row="${CSS.escape(item.model)}"] [data-range]`);
      if (row && Number.isFinite(basePrice)) row.textContent = storageRange({ ...item, basePrice }, { storageBonus: bonus });
    }
  };
  const refresh = bindSave('savePrices', () => changedPrices().length > 0 || bonusChanged(), async () => {
    const changes = changedPrices();
    const bonus = currentBonus();
    if (changes.some(item => !Number.isFinite(item.basePrice)) || Object.values(bonus).some(value => !Number.isFinite(value))) {
      throw new Error('Revise os valores destacados em vermelho.');
    }
    if (changes.length) await repository.saveModelPrices(changes);
    if (bonusChanged()) await repository.saveRules({ ...rules, storageBonus: bonus });
    changes.forEach(item => original.set(item.model, item.basePrice));
    rules.storageBonus = bonus;
  });
  [...priceInputs, ...bonusInputs].forEach(input => { input.oninput = () => { updateRanges(); refresh(); }; });
  $('#priceSearch').oninput = event => { search = event.target.value; applyFilter(); };
  document.querySelectorAll('[data-family]').forEach(chip => { chip.onclick = () => { family = chip.dataset.family; applyFilter(); }; });
}

async function renderRules() {
  setTitles('Regras de avaliação', 'Desconto aplicado para cada resposta do cliente no formulário.');
  const pricing = await loadConfig('rules', () => repository.getPricing());
  if (!pricing) return;
  const rules = pricing.rules;
  const manual = rules.manualReasons || {};
  const tiers = rules.batteryDiscount || [];
  const tierLabel = index => index === 0
    ? `${tiers[0].min}% ou mais`
    : tiers[index].min === 0 ? `Abaixo de ${tiers[index - 1].min}%` : `De ${tiers[index].min}% a ${tiers[index - 1].min - 1}%`;
  const optionRows = (section, manualKey) => Object.entries(rules[section] || {}).map(([option, amount]) => `<div class="config-row">
      <div class="config-info"><b>${escapeHtml(option)}</b>${(manual[manualKey] || []).includes(option) ? '<span class="tag">Envia para análise manual</span>' : ''}</div>
      ${amountInput(`data-rule="${section}" data-option="${escapeHtml(option)}"`, amount, `Desconto: ${option}`)}</div>`).join('');
  const block = (title, subtitle, body, open = true) => `<details class="panel config-block"${open ? ' open' : ''}><summary class="panel-head"><div><h2>${title}</h2><p>${subtitle}</p></div></summary><div class="config-list">${body}</div></details>`;

  $('#content').innerHTML = `${readonlyNote()}
    ${block('Saúde da bateria', 'Desconto conforme a porcentagem informada.', tiers.map((tier, index) => `<div class="config-row"><div class="config-info"><b>${escapeHtml(tierLabel(index))}</b></div>${amountInput(`data-tier="${index}"`, tier.amount, `Desconto bateria ${tierLabel(index)}`)}</div>`).join(''))}
    ${block('Estado físico', 'Aparência geral do aparelho.', optionRows('conditionDiscount', 'condition'))}
    ${block('Tela', 'Condição da tela informada pelo cliente.', optionRows('screenDiscount', 'screen'))}
    ${block('Funções com problema', 'Cada função marcada soma o seu desconto.', optionRows('issueDiscount', 'issues'))}
    ${block('Outros', 'Manutenção e limite geral de desconto.', `<div class="config-row"><div class="config-info"><b>Histórico de manutenção</b><small>Quando o aparelho já passou por reparo.</small></div>${amountInput('data-repair', rules.repairDiscount, 'Desconto por manutenção')}</div>
      <div class="config-row"><div class="config-info"><b>Limite de desconto automático</b><small>Acima deste percentual do valor-base, a avaliação vai para análise manual.</small></div><label class="money-input"><input type="number" inputmode="numeric" min="0" max="100" step="1" data-cap value="${escapeHtml(Math.round(Number(rules.maximumDiscountRate) * 100))}" aria-label="Limite de desconto em porcentagem"${canEditPricing() ? '' : ' disabled'}><span aria-hidden="true">%</span></label></div>`)}
    ${saveBar('saveRules', 'SALVAR REGRAS')}`;

  const collect = () => {
    const next = structuredClone(rules);
    document.querySelectorAll('[data-rule]').forEach(input => { next[input.dataset.rule][input.dataset.option] = readAmount(input); });
    document.querySelectorAll('[data-tier]').forEach(input => { next.batteryDiscount[Number(input.dataset.tier)].amount = readAmount(input); });
    next.repairDiscount = readAmount($('[data-repair]'));
    const capInput = $('[data-cap]');
    const cap = Number(capInput.value);
    const validCap = capInput.value.trim() !== '' && Number.isInteger(cap) && cap >= 0 && cap <= 100;
    capInput.classList.toggle('invalid', !validCap);
    next.maximumDiscountRate = validCap ? cap / 100 : Number.NaN;
    return next;
  };
  let saved = JSON.stringify(rules);
  const refresh = bindSave('saveRules', () => JSON.stringify(collect()) !== saved, async () => {
    const next = collect();
    if (document.querySelector('#content .invalid')) throw new Error('Revise os valores destacados em vermelho.');
    await repository.saveRules(next);
    saved = JSON.stringify(next);
  });
  document.querySelectorAll('#content input').forEach(input => { input.oninput = refresh; });
}

function productSlug(name) {
  const base = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'produto';
  return `${base}-${Math.random().toString(36).slice(2, 7)}`;
}

async function renderUpgradeProducts() {
  setTitles('Produtos para upgrade', 'iPhones oferecidos ao cliente depois da avaliação.');
  const loaded = await loadConfig('upgrade', () => repository.getUpgradeProducts());
  if (!loaded) return;
  let products = loaded.map(product => ({ ...product }));
  let saved = JSON.stringify(products);
  const editable = canEditPricing();
  const disabled = editable ? '' : ' disabled';

  const draw = () => {
    $('#content').innerHTML = `${readonlyNote()}<div class="panel"><div class="panel-head"><div><h2>Catálogo de upgrade</h2><p>Aparecem na tela "Escolha seu próximo iPhone", nesta ordem. A opção "Ainda não decidi" é sempre exibida no final.</p></div></div>
      <div class="config-list">${products.length ? products.map((product, index) => `<div class="product-row${product.active ? '' : ' inactive'}" data-index="${index}">
        <label class="field"><span>Modelo</span><input type="text" maxlength="80" data-field="name" value="${escapeHtml(product.name)}" placeholder="iPhone 18 Pro"${disabled}></label>
        <label class="field"><span>Capacidade</span><input type="text" maxlength="40" data-field="storage" value="${escapeHtml(product.storage)}" placeholder="256GB"${disabled}></label>
        <label class="field"><span>Preço</span>${amountInput('data-field="price"', product.price, `Preço do ${product.name || 'produto'}`)}</label>
        <label class="switch-field"><input type="checkbox" data-field="active"${product.active ? ' checked' : ''}${disabled}><span>${product.active ? 'Visível' : 'Oculto'}</span></label>
        ${editable ? `<div class="row-actions"><button type="button" class="icon-action" data-move="-1" aria-label="Subir"${index === 0 ? ' disabled' : ''}>↑</button><button type="button" class="icon-action" data-move="1" aria-label="Descer"${index === products.length - 1 ? ' disabled' : ''}>↓</button><button type="button" class="icon-action danger" data-remove aria-label="Remover ${escapeHtml(product.name)}">✕</button></div>` : ''}
      </div>`).join('') : '<div class="empty"><b>Nenhum produto cadastrado.</b>Sem produtos, o formulário mostra a lista padrão.</div>'}</div>
      ${editable ? '<div class="panel-foot"><button type="button" class="secondary" id="addProduct">＋ Adicionar produto</button></div>' : ''}</div>
      ${saveBar('saveProducts', 'SALVAR PRODUTOS')}`;

    const refresh = bindSave('saveProducts', () => JSON.stringify(products) !== saved, async () => {
      if (document.querySelector('#content .invalid')) throw new Error('Revise os valores destacados em vermelho.');
      await repository.saveUpgradeProducts(products);
      saved = JSON.stringify(products);
    });
    document.querySelectorAll('[data-index]').forEach(row => {
      const product = products[Number(row.dataset.index)];
      row.querySelectorAll('[data-field]').forEach(input => {
        input.oninput = input.onchange = () => {
          const field = input.dataset.field;
          if (field === 'price') product.price = readAmount(input);
          else if (field === 'active') {
            product.active = input.checked;
            row.classList.toggle('inactive', !input.checked);
            input.nextElementSibling.textContent = input.checked ? 'Visível' : 'Oculto';
          } else {
            product[field] = input.value;
            if (field === 'name') input.classList.toggle('invalid', !input.value.trim());
          }
          refresh();
        };
      });
      row.querySelectorAll('[data-move]').forEach(button => {
        button.onclick = () => {
          const from = Number(row.dataset.index);
          const to = from + Number(button.dataset.move);
          [products[from], products[to]] = [products[to], products[from]];
          draw();
        };
      });
      const remove = row.querySelector('[data-remove]');
      if (remove) remove.onclick = () => { products.splice(Number(row.dataset.index), 1); draw(); };
    });
    const add = $('#addProduct');
    if (add) {
      add.onclick = () => {
        products.push({ id: productSlug('produto'), name: '', storage: '256GB', price: 0, active: true });
        draw();
        document.querySelector(`[data-index="${products.length - 1}"] [data-field="name"]`)?.focus();
      };
    }
    refresh();
  };
  draw();
}

function hideLogin() {
  document.querySelector('#cloudLogin')?.remove();
}

function showLogin(message = '') {
  authenticated = false;
  evaluations = [];
  closeDrawer();
  updateSessionControls();
  setTitles('Acesse o painel', 'Login administrativo protegido pelo Supabase.');
  $('#content').replaceChildren();
  hideLogin();

  const overlay = document.createElement('div');
  overlay.id = 'cloudLogin';
  overlay.className = 'login-overlay';
  overlay.innerHTML = `<form id="cloudLoginForm" class="login-card">
    <div class="login-brand"><img src="assets/logo-gringas-white.png" alt="Gringas Imports" width="340" height="160"><small>TROCA • ADMIN</small></div>
    <h2>Acesse o painel</h2><p>Entre com sua conta vinculada a esta loja.</p>
    <label for="cloudEmail">E-mail</label><input id="cloudEmail" type="email" autocomplete="username" required>
    <label for="cloudPassword">Senha</label><input id="cloudPassword" type="password" autocomplete="current-password" required>
    <div id="cloudLoginError" class="login-error" role="alert"></div>
    <button type="submit">ENTRAR →</button>
  </form>`;
  document.body.append(overlay);
  overlay.querySelector('#cloudLoginError').textContent = message;
  overlay.querySelector('#cloudLoginForm').onsubmit = async event => {
    event.preventDefault();
    const button = event.submitter;
    const errorElement = overlay.querySelector('#cloudLoginError');
    button.disabled = true;
    errorElement.textContent = 'Entrando...';
    const email = overlay.querySelector('#cloudEmail').value;
    const passwordInput = overlay.querySelector('#cloudPassword');
    const password = passwordInput.value;
    passwordInput.value = '';
    try {
      await repository.signIn(email, password);
      authenticated = true;
      loginMessage = '';
      await refreshEvaluations();
    } catch (error) {
      loginMessage = error?.message || 'Não foi possível entrar.';
      errorElement.textContent = loginMessage;
      button.disabled = false;
      passwordInput.focus();
    }
  };
}

async function refreshEvaluations() {
  setCloudBadge(repository.mode === 'cloud' ? 'Sincronizando...' : 'Modo local', repository.mode === 'cloud');
  evaluations = await repository.getEvaluations();
  authenticated = true;
  hideLogin();
  updateSessionControls();
  setCloudBadge(repository.mode === 'cloud' ? 'Nuvem conectada' : 'Modo local', repository.mode === 'cloud');
  renderView();
}

function confirmDiscardChanges() {
  return !pendingChanges() || confirm('Há alterações não salvas nesta tela. Sair sem salvar?');
}

function renderView() {
  pendingChanges = () => false;
  document.querySelectorAll('.nav').forEach(item => item.classList.toggle('active', item.dataset.view === currentView));
  if (repository.mode === 'cloud' && !authenticated) {
    showLogin(loginMessage);
    return;
  }
  const views = {
    overview: renderOverview,
    evaluations: renderEvaluations,
    clients: renderClients,
    prices: renderPrices,
    rules: renderRules,
    upgrade: renderUpgradeProducts,
  };
  (views[currentView] || renderOverview)();
}

function closeDrawer() {
  $('#drawer').classList.remove('open');
  $('#drawer').setAttribute('aria-hidden', 'true');
  $('#drawerContent').replaceChildren();
}

function setMenu(open) {
  $('#sidebar').classList.toggle('open', open);
  $('#backdrop').hidden = !open;
  $('#menuBtn').setAttribute('aria-expanded', String(open));
}

async function openDetail(id) {
  const original = evaluations.find(record => String(record.id) === String(id));
  if (!original) return;

  let record = original;
  let photoError = '';
  try {
    record = await repository.signPhotos(original);
  } catch (error) {
    photoError = error?.message || 'Não foi possível assinar as fotos.';
  }

  const originalPhotos = Object.values(original.photos || {}).slice(0, 6);
  const photoUrls = Object.values(record.photos || {})
    .map(photo => safeImageUrl(typeof photo === 'object' ? photo?.data || photo?.url : photo, repository.config))
    .filter(Boolean);
  const issues = Array.isArray(record.device?.issues) ? record.device.issues.join(', ') : '';
  const warranty = record.warranty?.status === 'Sim'
    ? `Sim${record.warranty.date ? ` • até ${dateBR(`${record.warranty.date}T12:00:00Z`).split(' ')[0]}` : ''}`
    : record.warranty?.status || 'Não informado';
  const approvedValue = Number.isFinite(Number(record.approvedValue)) ? String(record.approvedValue) : '';

  $('#drawerContent').innerHTML = `<div class="detail-head"><div class="eyebrow">${escapeHtml(record.id)} • ${dateBR(record.createdAt)}</div><h2>${escapeHtml(record.device?.model || '—')} ${escapeHtml(record.device?.storage || '')}</h2><p>${escapeHtml(record.customer?.name || '—')} • ${record.customer?.phone ? phoneLink(record.customer.phone) : 'Sem WhatsApp'}</p></div>
    <div class="detail-value">${money(record.calculation?.estimated)}</div>
    ${record.upgrade ? `<div class="upgrade-tag">↗ Interesse: ${escapeHtml(record.upgrade.productName || '—')} ${escapeHtml(record.upgrade.storage || '')} • diferença ${record.upgrade.difference == null ? 'a definir' : money(record.upgrade.difference)}</div>` : ''}
    ${calculationBox(record)}
    <div class="detail-box"><h3>Aparelho</h3>
      <div class="kv"><span>Bateria</span><b>${escapeHtml(record.device?.battery ?? '—')}${typeof record.device?.battery === 'number' ? '%' : ''}</b></div>
      <div class="kv"><span>Estado físico</span><b>${escapeHtml(record.device?.condition || '—')}</b></div>
      <div class="kv"><span>Tela</span><b>${escapeHtml(record.device?.screen || '—')}</b></div>
      <div class="kv"><span>Problemas</span><b>${escapeHtml(issues || 'Nenhum informado')}</b></div>
      <div class="kv"><span>Manutenção</span><b>${escapeHtml(record.device?.repair || '—')}</b></div>
      <div class="kv"><span>Alerta de peça</span><b>${escapeHtml(record.device?.partAlert || '—')}</b></div>
    </div>
    <div class="detail-box"><h3>Complementares</h3>
      <div class="kv"><span>Garantia Apple</span><b>${escapeHtml(warranty)}</b></div>
      <div class="kv"><span>AppleCare+</span><b>${escapeHtml(record.warranty?.appleCare || '—')}</b></div>
      <div class="kv"><span>Acompanha</span><b>${escapeHtml((Array.isArray(record.accessories) ? record.accessories : []).join(', ') || 'Somente aparelho')}</b></div>
      <div class="kv"><span>Observações</span><b>${escapeHtml(record.notes || 'Nenhuma')}</b></div>
    </div>
    <div class="detail-box"><h3>Fotos (${originalPhotos.length})</h3>
      <p>${photoUrls.length} disponíveis • ${originalPhotos.length - photoUrls.length} indisponíveis</p>
      ${photoError ? `<p>${escapeHtml(photoError)}</p>` : ''}
      ${photoUrls.length ? `<div class="photos">${photoUrls.map(url => `<img src="${escapeHtml(url)}" referrerpolicy="no-referrer" alt="Foto da avaliação">`).join('')}</div>` : '<p>Nenhuma foto segura disponível.</p>'}
    </div>
    ${repository.mode === 'cloud' ? `<div class="detail-box"><h3>Gestão da negociação</h3><div class="ops">
      <label for="statusEdit">Status</label><select id="statusEdit">${statuses.map(status => `<option${record.status === status ? ' selected' : ''}>${escapeHtml(status)}</option>`).join('')}</select>
      <label for="approved">Valor aprovado presencialmente</label><input id="approved" type="number" min="0" max="99999999.99" step="0.01" value="${escapeHtml(approvedValue)}" placeholder="${escapeHtml(record.calculation?.estimated ?? 0)}">
      <label for="reason">Motivo do ajuste</label><textarea id="reason" maxlength="4000" placeholder="Ex.: estado físico diferente do informado">${escapeHtml(record.adjustmentReason || '')}</textarea>
      <p id="opsError" role="alert"></p>
      <button class="primary gold" id="saveOps">SALVAR ALTERAÇÕES</button>
    </div></div>` : '<div class="detail-box"><h3>Somente leitura</h3><p>Sem conexão com a fonte oficial, alterações de negociação não são disponibilizadas.</p></div>'}`;

  $('#drawer').classList.add('open');
  $('#drawer').setAttribute('aria-hidden', 'false');
  if (repository.mode !== 'cloud') return;
  $('#saveOps').onclick = async () => {
    const approvedInput = $('#approved').value;
    const approved = approvedInput === '' ? null : Number(approvedInput);
    if (approved !== null && (!Number.isFinite(approved) || approved < 0 || approved > 99999999.99 || Number(approved.toFixed(2)) !== approved)) {
      $('#opsError').textContent = 'Valor aprovado inválido: use até duas casas decimais.';
      return;
    }
    const button = $('#saveOps');
    button.disabled = true;
    $('#opsError').textContent = '';
    try {
      const requested = {
        id: record.id,
        status: $('#statusEdit').value,
        approvedValue: approved,
        adjustmentReason: $('#reason').value,
      };
      const updated = await repository.updateEvaluationOps(requested);
      if (updated.status !== requested.status ||
          updated.approvedValue !== requested.approvedValue ||
          updated.adjustmentReason !== requested.adjustmentReason) {
        throw new Error('A fonte oficial não confirmou todos os campos da alteração.');
      }
      await refreshEvaluations();
      closeDrawer();
    } catch (error) {
      $('#opsError').textContent = error?.message || 'Não foi possível salvar.';
      button.disabled = false;
    }
  };
}

let refreshButton;

function setCloudBadge(text, ok) {
  let badge = $('#cloudBadge');
  if (!badge) {
    badge = document.createElement('button');
    badge.id = 'cloudBadge';
    badge.type = 'button';
    $('#headActions').prepend(badge);
  }
  badge.className = `admin-pill ${ok ? 'ok' : 'warn'}`;
  badge.setAttribute('aria-label', text);
  badge.innerHTML = `<span class="dot" aria-hidden="true">${ok ? '●' : '▲'}</span><span class="pill-text">${escapeHtml(text)}</span>`;
  return badge;
}

function updateSessionControls() {
  document.querySelectorAll('[data-logout]').forEach(button => {
    button.hidden = repository.mode !== 'cloud' || !authenticated;
  });
  if (refreshButton) refreshButton.hidden = repository.mode === 'cloud' && !authenticated;
}

async function initialize() {
  document.querySelectorAll('.nav').forEach(item => {
    item.onclick = () => {
      if (!confirmDiscardChanges()) return;
      currentView = item.dataset.view;
      closeDrawer();
      renderView();
      setMenu(false);
      window.scrollTo(0, 0);
    };
  });
  $('#drawerClose').onclick = closeDrawer;
  $('#drawer').onclick = event => { if (event.target === $('#drawer')) closeDrawer(); };
  $('#menuBtn').onclick = () => setMenu(!$('#sidebar').classList.contains('open'));
  $('#backdrop').onclick = () => setMenu(false);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      setMenu(false);
      closeDrawer();
    }
  });

  const headActions = $('#headActions');
  refreshButton = document.createElement('button');
  refreshButton.className = 'admin-pill';
  refreshButton.textContent = 'Atualizar';
  refreshButton.onclick = async () => {
    if (!confirmDiscardChanges()) return;
    try { await refreshEvaluations(); }
    catch (error) {
      loginMessage = error?.message || 'Não foi possível atualizar.';
      if (repository.mode === 'cloud') {
        setCloudBadge('Erro na nuvem', false);
        showLogin(loginMessage);
      }
      else {
        setTitles('Modo local indisponível', loginMessage);
        $('#content').replaceChildren();
      }
    }
  };
  headActions.prepend(refreshButton);

  const logout = async () => {
    if (!(await confirmarSaida())) return;
    try { await repository.signOut(); }
    finally {
      authenticated = false;
      evaluations = [];
      loginMessage = 'Sessão encerrada.';
      updateSessionControls();
      showLogin(loginMessage);
    }
  };
  document.querySelectorAll('[data-logout]').forEach(button => { button.onclick = logout; });
  setCloudBadge(repository.mode === 'cloud' ? 'Verificando nuvem...' : 'Modo local', false).onclick = () => refreshButton.click();
  updateSessionControls();

  globalThis.addEventListener('beforeunload', event => {
    if (pendingChanges()) event.preventDefault();
  });

  if (repository.mode === 'local') {
    try { await refreshEvaluations(); }
    catch (error) {
      setTitles('Modo local indisponível', error?.message || 'Não foi possível abrir o histórico local.');
      $('#content').replaceChildren();
    }
    return;
  }

  try {
    const activeSession = await repository.session();
    if (!activeSession) {
      showLogin();
      updateSessionControls();
      return;
    }
    authenticated = true;
    await refreshEvaluations();
  } catch (error) {
    loginMessage = error?.message || 'Não foi possível validar a sessão.';
    showLogin(loginMessage);
    updateSessionControls();
  }
}

if (typeof document !== 'undefined') initialize();
