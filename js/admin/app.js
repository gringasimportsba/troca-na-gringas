import repository, { statuses } from './repository.js';
import { escapeHtml, safeImageUrl } from '../shared/sanitization.js';

let currentView = 'overview';
let query = '';
let statusFilter = 'Todos';
let evaluations = [];
let authenticated = repository.mode === 'local';
let loginMessage = '';

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

function renderConfiguration(title) {
  setTitles(title, 'Configuração comercial ainda não integrada.');
  $('#content').innerHTML = '<div class="panel"><div class="empty"><b>Área demonstrativa.</b>Preços, regras e produtos não são persistidos nem aplicados ao motor nesta versão. Configure-os somente quando houver uma fonte comercial oficial.</div></div>';
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

function renderView() {
  document.querySelectorAll('.nav').forEach(item => item.classList.toggle('active', item.dataset.view === currentView));
  if (repository.mode === 'cloud' && !authenticated) {
    showLogin(loginMessage);
    return;
  }
  const views = {
    overview: renderOverview,
    evaluations: renderEvaluations,
    clients: renderClients,
    prices: () => renderConfiguration('Aparelhos e preços'),
    rules: () => renderConfiguration('Regras de avaliação'),
    upgrade: () => renderConfiguration('Produtos para upgrade'),
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
    if (!confirm('Sair do painel administrativo?')) return;
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
