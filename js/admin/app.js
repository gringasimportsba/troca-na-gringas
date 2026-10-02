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
    <tr class="clickable" data-id="${escapeHtml(record.id)}">
      <td class="code">${escapeHtml(record.id)}</td>
      <td>${escapeHtml(record.customer?.name || '—')}</td>
      ${includePhone ? `<td>${escapeHtml(record.customer?.phone || '—')}</td>` : ''}
      <td>${escapeHtml(record.device?.model || '—')} ${escapeHtml(record.device?.storage || '')}</td>
      <td class="money">${money(record.calculation?.estimated)}</td>
      <td>${statusBadge(record.status)}</td>
    </tr>`).join('')}</tbody></table></div>`;
}

function panelTable(records, title, subtitle) {
  return `<div class="panel"><div class="panel-head"><div><h2>${escapeHtml(title)}</h2><p>${escapeHtml(subtitle)}</p></div></div>${tableRows(records)}</div>`;
}

function bindRows() {
  document.querySelectorAll('[data-id]').forEach(row => {
    row.onclick = () => openDetail(row.dataset.id);
  });
}

function renderOverview() {
  setTitles('Painel Gringas Troca', 'Resumo das avaliações e negociações.');
  const today = new Date().toISOString().slice(0, 10);
  const todayCount = evaluations.filter(record => String(record.createdAt || '').slice(0, 10) === today).length;
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
    <input class="search" id="search" placeholder="Código, cliente, modelo..." value="${escapeHtml(query)}">
    <select class="filter" id="filter">${['Todos', ...statuses].map(status => `<option${statusFilter === status ? ' selected' : ''}>${escapeHtml(status)}</option>`).join('')}</select>
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
    ? `<div class="client-grid">${list.map(client => `<div class="client-card"><h3>${escapeHtml(client.name)}</h3><p>${escapeHtml(client.phone)}</p><strong>${client.count} avaliação(ões)</strong><p>Última: ${dateBR(client.last)}</p></div>`).join('')}</div>`
    : '<div class="panel"><div class="empty"><b>Nenhum cliente ainda.</b>Os leads aparecerão aqui após as avaliações.</div></div>';
}

function renderConfiguration(title) {
  setTitles(title, 'Configuração comercial ainda não integrada.');
  $('#content').innerHTML = '<div class="panel"><div class="empty"><b>Área demonstrativa.</b>Preços, regras e produtos não são persistidos nem aplicados ao motor nesta versão. Configure-os somente quando houver uma fonte comercial oficial.</div></div>';
}

function showLogin(message = '') {
  authenticated = false;
  evaluations = [];
  closeDrawer();
  setTitles('Acesse o painel', 'Login administrativo protegido pelo Supabase.');
  $('#content').innerHTML = `<div class="panel"><div class="panel-head"><h2>Entrar</h2></div><form id="cloudLoginForm" class="setting">
    <p id="loginMessage" role="alert"></p>
    <label>E-mail <input id="cloudEmail" type="email" autocomplete="username" required></label>
    <label>Senha <input id="cloudPassword" type="password" autocomplete="current-password" required></label>
    <button class="savebtn" type="submit">ENTRAR</button>
  </form></div>`;
  $('#loginMessage').textContent = message;
  $('#cloudLoginForm').onsubmit = async event => {
    event.preventDefault();
    const button = event.submitter;
    if (button) button.disabled = true;
    const email = $('#cloudEmail').value;
    const password = $('#cloudPassword').value;
    $('#cloudPassword').value = '';
    try {
      await repository.signIn(email, password);
      authenticated = true;
      loginMessage = '';
      await refreshEvaluations();
    } catch (error) {
      loginMessage = error?.message || 'Não foi possível entrar.';
      showLogin(loginMessage);
    }
  };
}

async function refreshEvaluations() {
  evaluations = await repository.getEvaluations();
  authenticated = true;
  updateSessionControls();
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

  $('#drawerContent').innerHTML = `<div class="detail-head"><div class="eyebrow">${escapeHtml(record.id)} • ${dateBR(record.createdAt)}</div><h2>${escapeHtml(record.device?.model || '—')} ${escapeHtml(record.device?.storage || '')}</h2><p>${escapeHtml(record.customer?.name || '—')} • ${escapeHtml(record.customer?.phone || 'Sem WhatsApp')}</p></div>
    <div class="detail-value">${money(record.calculation?.estimated)}</div>
    ${record.upgrade ? `<div class="upgrade-tag">↗ Interesse: ${escapeHtml(record.upgrade.productName || '—')} ${escapeHtml(record.upgrade.storage || '')} • diferença ${record.upgrade.difference == null ? 'a definir' : money(record.upgrade.difference)}</div>` : ''}
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
    <div class="detail-box"><h3>Gestão da negociação</h3><div class="ops">
      <label>Status</label><select id="statusEdit">${statuses.map(status => `<option${record.status === status ? ' selected' : ''}>${escapeHtml(status)}</option>`).join('')}</select>
      <label>Valor aprovado presencialmente</label><input id="approved" type="number" min="0" max="99999999.99" step="0.01" value="${escapeHtml(approvedValue)}" placeholder="${escapeHtml(record.calculation?.estimated ?? 0)}">
      <label>Motivo do ajuste</label><textarea id="reason" maxlength="4000" placeholder="Ex.: estado físico diferente do informado">${escapeHtml(record.adjustmentReason || '')}</textarea>
      <p id="opsError" role="alert"></p>
      <button class="primary gold" id="saveOps">SALVAR ALTERAÇÕES</button>
    </div></div>`;

  $('#drawer').classList.add('open');
  $('#drawer').setAttribute('aria-hidden', 'false');
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
      await repository.updateEvaluationOps({
        id: record.id,
        status: $('#statusEdit').value,
        approvedValue: approved,
        adjustmentReason: $('#reason').value,
      });
      closeDrawer();
      await refreshEvaluations();
    } catch (error) {
      $('#opsError').textContent = error?.message || 'Não foi possível salvar.';
      button.disabled = false;
    }
  };
}

let logoutButton;
let refreshButton;

function updateSessionControls() {
  if (logoutButton) logoutButton.disabled = repository.mode !== 'cloud' || !authenticated;
  if (refreshButton) refreshButton.textContent = repository.mode === 'cloud' ? 'Atualizar nuvem' : 'Atualizar local';
  const footer = document.querySelector('.side-foot small');
  if (footer) footer.textContent = repository.mode === 'cloud' ? 'Nuvem • acesso por store_members' : 'Modo local • histórico deste navegador';
}

async function initialize() {
  document.querySelectorAll('.nav').forEach(item => {
    item.onclick = () => {
      currentView = item.dataset.view;
      closeDrawer();
      renderView();
      $('.sidebar').classList.remove('open');
    };
  });
  $('#drawerClose').onclick = closeDrawer;
  $('#drawer').onclick = event => { if (event.target === $('#drawer')) closeDrawer(); };
  $('#menuBtn').onclick = () => $('.sidebar').classList.toggle('open');

  const header = document.querySelector('header');
  refreshButton = document.createElement('button');
  refreshButton.className = 'admin-pill';
  refreshButton.textContent = 'Atualizar';
  refreshButton.onclick = async () => {
    try { await refreshEvaluations(); }
    catch (error) {
      loginMessage = error?.message || 'Não foi possível atualizar.';
      if (repository.mode === 'cloud') showLogin(loginMessage);
      else {
        setTitles('Modo local indisponível', loginMessage);
        $('#content').replaceChildren();
      }
    }
  };
  header.append(refreshButton);

  logoutButton = document.createElement('button');
  logoutButton.className = 'admin-pill';
  logoutButton.textContent = 'Sair';
  logoutButton.onclick = async () => {
    try { await repository.signOut(); }
    finally {
      authenticated = false;
      evaluations = [];
      loginMessage = 'Sessão encerrada.';
      updateSessionControls();
      showLogin(loginMessage);
    }
  };
  header.append(logoutButton);
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
