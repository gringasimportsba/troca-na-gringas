import { catalog, rules, calculate, calculateUpgrade } from './calculator.js';
import { saveEvaluation, saveUpgrade, whatsappNumber } from './repository.js';
import * as validation from '../shared/validation.js';
import * as sanitization from '../shared/sanitization.js';

const { initialState, validateStep, validateEvaluation } = validation;
const { escapeHtml, safeImageUrl } = sanitization;
const { validatePhotoFile } = validation;
const TOTAL_STEPS = 11;

const money = value => Number(value || 0).toLocaleString('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
});

const installment = value => Number(value || 0).toLocaleString('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function progress(step) {
  return `<div class="progress-wrap"><div class="progress-meta"><span>AVALIAÇÃO</span><b>${step} de ${TOTAL_STEPS}</b></div>
    <div class="progress"><span style="width:${Math.round(step / TOTAL_STEPS * 100)}%"></span></div></div>`;
}

function shell(step, title, subtitle, body, footer) {
  return `<section class="screen">${progress(step)}<h1 class="question">${title}</h1>
    ${subtitle ? `<p class="sub">${subtitle}</p>` : ''}${body}
    <p class="note" data-error role="alert" hidden></p>
    <div class="footer-actions">${footer}</div></section>`;
}

function button(label = 'CONTINUAR →', className = 'primary', disabled = false) {
  return `<button type="button" class="${className}${disabled ? ' disabled' : ''}" data-next${disabled ? ' disabled' : ''}>${label}</button>`;
}

function showError(root, message = '') {
  const target = root.querySelector('[data-error]');
  if (!target) return;
  target.textContent = message;
  target.hidden = !message;
}

function choices(state, field, values, descriptions = []) {
  const modelChoices = field === 'model';
  return `<div class="choices${modelChoices ? ' model-grid' : ''}">${values.map((value, index) => {
    const selected = Array.isArray(state[field]) ? state[field].includes(value) : state[field] === value;
    return `<button type="button" class="choice${modelChoices ? ' model-card' : ''}${selected ? ' selected' : ''}" data-field="${field}" data-value="${escapeHtml(value)}" aria-pressed="${selected}">
      ${modelChoices ? '<span class="mini-phone"></span>' : ''}<div><strong>${escapeHtml(value)}</strong>${descriptions[index] ? `<small>${escapeHtml(descriptions[index])}</small>` : ''}</div><span class="radio"></span></button>`;
  }).join('')}</div>`;
}

function field(label, content) {
  return `<div class="field"><label>${label}</label>${content}</div>`;
}

function readPhoto(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Não foi possível ler a foto. Escolha outro arquivo.'));
    reader.onload = () => {
      const source = safeImageUrl(reader.result);
      if (!source) reject(new Error('A foto não pôde ser validada. Use JPEG, PNG ou WebP.'));
      else resolve(source);
    };
    reader.readAsDataURL(file);
  });
}

function whatsappUrl(message) {
  return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
}

export function mountEvaluationApp({ document = globalThis.document } = {}) {
  const root = document?.getElementById('screen');
  const back = document?.getElementById('backBtn');
  const restart = document?.getElementById('restartBtn');
  if (!root) throw new Error('Não foi encontrada a área do formulário.');

  let state = initialState();
  let record = null;
  let saving = false;
  let photoLoading = false;
  let closeUpgrade = null;

  function reset() {
    closeUpgrade?.();
    closeUpgrade = null;
    state = initialState();
    record = null;
    saving = false;
    photoLoading = false;
    render();
  }

  function syncNextButton() {
    const nextButton = root.querySelector('[data-next]');
    if (!nextButton) return;
    const error = validateStep(state);
    nextButton.disabled = Boolean(error) || saving || photoLoading;
    nextButton.classList.toggle('disabled', nextButton.disabled);
  }

  async function next() {
    const stepError = validateStep(state);
    if (stepError) {
      showError(root, stepError);
      syncNextButton();
      return;
    }
    if (photoLoading || saving) return;

    if (state.step < TOTAL_STEPS) {
      state.step += 1;
      render();
      return;
    }

    const errors = validateEvaluation(state);
    if (errors.length) {
      showError(root, errors[0]);
      return;
    }

    saving = true;
    syncNextButton();
    const submit = root.querySelector('[data-next]');
    if (submit) submit.textContent = 'SALVANDO...';
    try {
      const calculation = calculate(state);
      record = await saveEvaluation(state, calculation);
      state.evaluationId = record.id;
      state.step = 12;
      render();
    } catch (error) {
      saving = false;
      if (submit) submit.textContent = 'CALCULAR MINHA AVALIAÇÃO →';
      showError(root, error.message || 'Não foi possível concluir a avaliação.');
      syncNextButton();
    }
  }

  function bindStepEvents() {
    root.querySelector('[data-next]')?.addEventListener('click', next);

    root.querySelectorAll('[data-field]').forEach(control => {
      control.addEventListener('click', () => {
        const { field: key, value } = control.dataset;
        if (Array.isArray(state[key])) {
          state[key] = state[key].includes(value)
            ? state[key].filter(item => item !== value)
            : [...state[key], value];
        } else {
          state[key] = value;
        }
        if (key === 'model') state.storage = '';
        if (key === 'warranty' && value !== 'Sim') {
          state.warrantyDate = '';
          state.appleCare = '';
        }
        render();
      });
    });

    const battery = root.querySelector('#battery');
    if (battery) {
      battery.addEventListener('input', event => {
        state.battery = Number(event.target.value);
        root.querySelector('.battery-value').textContent = `${state.battery}%`;
        root.querySelector('.battery-icon span').style.width = `${state.battery}%`;
        syncNextButton();
      });
    }
    root.querySelector('#unknownBattery')?.addEventListener('click', () => {
      state.battery = 'Não informado';
      next();
    });

    for (const [id, key] of [['wdate', 'warrantyDate'], ['name', 'name'], ['phone', 'phone'], ['notes', 'notes']]) {
      const input = root.querySelector(`#${id}`);
      if (!input) continue;
      input.addEventListener('input', event => {
        state[key] = event.target.value;
        if (id === 'notes') root.querySelector('#count').textContent = state.notes.length;
        showError(root, '');
        syncNextButton();
      });
    }

    root.querySelector('#noAccessories')?.addEventListener('click', () => {
      state.accessories = [];
      render();
    });
    root.querySelector('#noNotes')?.addEventListener('click', () => {
      state.notes = '';
      next();
    });

    root.querySelectorAll('[data-photo]').forEach(input => {
      input.addEventListener('change', async () => {
        const file = input.files?.[0];
        if (!file) return;
        try {
          const validationError = validatePhotoFile(file);
          if (validationError) throw new Error(validationError);
          photoLoading = true;
          input.disabled = true;
          syncNextButton();
          state.photos[input.dataset.photo] = await readPhoto(file);
          photoLoading = false;
          render();
        } catch (error) {
          photoLoading = false;
          input.value = '';
          input.disabled = false;
          showError(root, error.message || 'Foto inválida.');
          syncNextButton();
        }
      });
    });

    root.querySelectorAll('[data-remove-photo]').forEach(control => {
      control.addEventListener('click', () => {
        delete state.photos[control.dataset.removePhoto];
        render();
      });
    });
  }

  function renderStep() {
    const error = validateStep(state);
    const disabled = Boolean(error) || saving || photoLoading;
    let title = '';
    let subtitle = '';
    let body = '';
    let extra = '';

    switch (state.step) {
      case 1:
        title = 'Qual iPhone você tem?';
        subtitle = 'Escolha o modelo do aparelho que você quer usar na troca.';
        body = choices(state, 'model', catalog.models);
        break;
      case 2:
        title = 'Qual a capacidade do seu iPhone?';
        subtitle = 'Mostraremos apenas opções compatíveis com o modelo escolhido.';
        body = choices(state, 'storage', catalog.storageByModel[state.model] || []);
        break;
      case 3: {
        title = 'Qual a saúde da bateria?';
        subtitle = 'Informe a capacidade máxima mostrada nos Ajustes do seu iPhone.';
        const known = typeof state.battery === 'number';
        body = `<div class="battery-card"><div class="battery-icon"><span style="width:${known ? state.battery : 0}%"></span></div>
          <div class="battery-value">${known ? `${state.battery}%` : '—'}</div>
          <input aria-label="Saúde da bateria" class="range" id="battery" type="range" min="50" max="100" value="${known ? state.battery : 87}">
          <div class="help"><b>Como verificar?</b><br>Ajustes → Bateria → Saúde da Bateria</div></div>`;
        extra = '<button type="button" class="secondary" id="unknownBattery">NÃO CONSIGO VERIFICAR</button>';
        break;
      }
      case 4:
        title = 'Como está seu iPhone?';
        subtitle = 'Escolha a opção que mais se aproxima do estado físico atual.';
        body = choices(state, 'condition', Object.keys(rules.conditionDiscount), [
          'Praticamente sem marcas de uso.',
          'Pequenas marcas normais de uso.',
          'Riscos ou marcas aparentes.',
          'Trincas, amassados ou danos importantes.',
        ]);
        break;
      case 5:
        title = 'A tela está funcionando perfeitamente?';
        subtitle = 'Essa informação ajuda a deixar a estimativa mais próxima da avaliação presencial.';
        body = choices(state, 'screen', Object.keys(rules.screenDiscount));
        break;
      case 6:
        title = 'Existe algum problema nas seguintes funções?';
        subtitle = 'Ative apenas o que NÃO está funcionando corretamente.';
        body = `<div class="toggle-list">${Object.keys(rules.issueDiscount).map(issue => `<div class="toggle-row"><span>${escapeHtml(issue)}</span>
          <button type="button" class="switch${state.issues.includes(issue) ? ' on' : ''}" data-field="issues" data-value="${escapeHtml(issue)}" aria-label="Problema em ${escapeHtml(issue)}" aria-pressed="${state.issues.includes(issue)}"></button></div>`).join('')}</div>`;
        break;
      case 7:
        title = 'Seu iPhone já passou por manutenção?';
        subtitle = 'Também precisamos saber se existe algum alerta de peça no sistema.';
        body = field('MANUTENÇÃO', choices(state, 'repair', ['Não', 'Sim', 'Não sei'])) +
          field('APRESENTA AVISO DE PEÇA?', choices(state, 'partAlert', ['Não', 'Sim', 'Não sei']));
        break;
      case 8:
        title = 'Seu aparelho ainda possui garantia Apple?';
        subtitle = 'A garantia não define o valor sozinha, mas fica registrada para a análise da Gringas.';
        body = choices(state, 'warranty', ['Sim', 'Não', 'Não sei']) + (state.warranty === 'Sim'
          ? field('GARANTIA VÁLIDA ATÉ', `<input aria-label="Garantia válida até" type="date" id="wdate" value="${escapeHtml(state.warrantyDate)}">`) +
            field('POSSUI APPLECARE+?', choices(state, 'appleCare', ['Sim', 'Não', 'Não sei']))
          : '') + '<div class="note">Garantia e AppleCare+ são informações de apoio e não aumentam automaticamente a estimativa.</div>';
        break;
      case 9:
        title = 'Agora queremos conhecer seu aparelho.';
        subtitle = 'Frente e traseira são obrigatórias. As demais fotos ajudam a Gringas a conferir o estado informado.';
        body = `<div class="photo-grid">${[
          ['front', 'Frente'], ['back', 'Traseira'], ['left', 'Lateral esquerda'],
          ['right', 'Lateral direita'], ['detail', 'Avaria / detalhe'],
        ].map(([key, label]) => {
          const source = safeImageUrl(state.photos[key]);
          const required = key === 'front' || key === 'back';
          return `<div class="photo-wrap"><label class="photo-box">${source
            ? `<img src="${escapeHtml(source)}" alt="${escapeHtml(label)}">`
            : `<div><div class="photo-plus">＋</div><b>${escapeHtml(label)}</b><br><small>${required ? 'obrigatória' : 'opcional'}</small></div>`}
            <input aria-label="Foto: ${escapeHtml(label)}" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" data-photo="${key}"${photoLoading ? ' disabled' : ''}></label>
            ${source ? `<button type="button" class="photo-remove" data-remove-photo="${key}">REMOVER</button>` : ''}</div>`;
        }).join('')}</div><div class="note">Envie JPEG, PNG ou WebP de até 6 MB. As fotos não alteram o valor automaticamente.</div>`;
        break;
      case 10:
        title = 'Tem algo importante que devemos saber?';
        subtitle = 'Conte sobre marcas, reparos ou qualquer outra informação útil.';
        body = `<div class="field"><textarea aria-label="Observações" id="notes" maxlength="500" placeholder="Ex.: Troquei a bateria há 4 meses...">${escapeHtml(state.notes)}</textarea>
          <div class="counter"><span id="count">${state.notes.length}</span>/500</div></div>` +
          field('O QUE ACOMPANHA O APARELHO?', choices(state, 'accessories', ['Caixa', 'Cabo', 'Nota fiscal']) +
            `<button type="button" class="choice${state.accessories.length ? '' : ' selected'}" id="noAccessories"><strong>Nenhum</strong><span class="radio"></span></button>`);
        extra = '<button type="button" class="secondary" id="noNotes">NÃO TENHO OBSERVAÇÕES</button>';
        break;
      case 11:
        title = 'Estamos quase lá. 🔥';
        subtitle = 'Deixe seus dados para identificarmos a avaliação e entrarmos em contato.';
        body = field('NOME COMPLETO', `<input aria-label="Nome completo" id="name" maxlength="120" autocomplete="name" value="${escapeHtml(state.name)}" placeholder="Seu nome">`) +
          field('WHATSAPP', `<input aria-label="WhatsApp" id="phone" maxlength="25" autocomplete="tel" value="${escapeHtml(state.phone)}" placeholder="(71) 99999-9999" inputmode="tel">`) +
          field('COMO PREFERE SER ATENDIDO?', choices(state, 'service', ['WhatsApp', 'Loja física'])) +
          '<div class="note">Ao continuar, você confirma que as informações fornecidas são verdadeiras e autoriza a Gringas a utilizá-las nesta avaliação.</div>';
        break;
      default:
        throw new Error('Etapa inválida.');
    }

    const label = state.step === 11 ? 'CALCULAR MINHA AVALIAÇÃO →' : 'CONTINUAR →';
    const className = state.step === 11 ? 'primary gold' : 'primary';
    root.innerHTML = shell(state.step, title, subtitle, body, `${button(label, className, disabled)}${extra}`);
    bindStepEvents();
  }

  function renderResult() {
    const calculation = record.calculation;
    const warranty = record.warranty;
    const warrantyLabel = warranty.status === 'Sim'
      ? `Sim${warranty.date ? ` • até ${warranty.date.split('-').reverse().join('/')}` : ''}`
      : warranty.status || 'Não informado';
    const message = `Olá, Gringas! Fiz uma avaliação no Gringas Troca. Código: ${record.id}. Aparelho: ${record.device.model} ${record.device.storage}. Valor estimado: ${money(calculation.estimated)}. Quero continuar o atendimento.`;

    root.innerHTML = `<section class="screen result-screen"><div class="result-kicker">SUA AVALIAÇÃO FICOU PRONTA</div>
      <div class="result-device"><span class="result-phone-art"></span><div><b>${escapeHtml(record.device.model)}</b><small>${escapeHtml(record.device.storage)}</small></div></div>
      ${calculation.isManual
        ? `<div class="manual-card"><span>ANÁLISE ESPECIAL</span><h1>Precisamos confirmar alguns detalhes do seu iPhone.</h1><p>A Gringas fará uma análise antes de confirmar o valor. Sua referência inicial é de <b>${money(calculation.estimated)}</b>.</p></div>`
        : `<div class="value-label">SEU IPHONE PODE VALER ATÉ</div><div class="result-value">${money(calculation.estimated)}</div><div class="value-sub">como entrada na Gringas.</div><div class="result-callout">🔥 Seu próximo iPhone está mais perto.</div>`}
      <div class="evaluation-code">Avaliação <b>${escapeHtml(record.id)}</b></div>
      <div class="demo-warning">⚠️ Valores demonstrativos para validar o motor. A condição final será confirmada pela Gringas.</div>
      <div class="summary-card"><h3>Dados complementares</h3>
        <div class="summary-row"><span>📸 Fotos</span><b>${Object.keys(record.photos || {}).length}</b></div>
        <div class="summary-row"><span>🍎 Garantia Apple</span><b>${escapeHtml(warrantyLabel)}</b></div>
        <div class="summary-row"><span>🛡️ AppleCare+</span><b>${escapeHtml(warranty.appleCare || '—')}</b></div>
        <div class="summary-row"><span>📦 Acompanha</span><b>${escapeHtml(record.accessories.join(', ') || 'Somente aparelho')}</b></div>
        <div class="summary-notes"><span>📝 Observações</span><p>${escapeHtml(record.notes || 'Nenhuma observação.')}</p></div>
      </div>
      <div class="footer-actions result-actions"><button type="button" class="primary gold" id="upgrade">QUERO FAZER MEU UPGRADE →</button>
        <button type="button" class="secondary" id="diagnostic">VER DIAGNÓSTICO DO CÁLCULO</button>
        <button type="button" class="secondary" id="edit">VOLTAR E EDITAR</button>
        <a class="secondary" href="${escapeHtml(whatsappUrl(message))}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">FALAR COM A GRINGAS →</a></div>
      <p class="legal">Valor estimado com base nas informações fornecidas. O WhatsApp abre somente ao clicar e a mensagem não inclui links das fotos.</p></section>`;

    root.querySelector('#edit').addEventListener('click', () => {
      state.evaluationId = '';
      state.step = 11;
      record = null;
      render();
    });
    root.querySelector('#diagnostic').addEventListener('click', renderDiagnostic);
    root.querySelector('#upgrade').addEventListener('click', showUpgrade);
  }

  function renderDiagnostic() {
    const calculation = record.calculation;
    root.innerHTML = `<section class="screen"><span class="pill">DIAGNÓSTICO 5.6</span>
      <h1 class="question">Como o sistema chegou ao valor.</h1><p class="sub">Confira os critérios usados na estimativa.</p>
      <div class="calc-card"><div class="calc-row"><span>Valor-base demonstrativo</span><b>${money(calculation.base)}</b></div>
        ${calculation.lines.length ? calculation.lines.map(line => `<div class="calc-row deduction"><span>${escapeHtml(line.label)}</span><b>− ${money(line.amount)}</b></div>`).join('') : '<div class="calc-row"><span>Descontos automáticos</span><b>R$ 0</b></div>'}
        <div class="calc-row"><span>Total calculado</span><b>${money(calculation.totalDiscount)}</b></div>
        <div class="calc-row"><span>Limite aplicado (30%)</span><b>${money(calculation.cap)}</b></div>
        <div class="calc-row total"><span>Estimativa</span><b>${money(calculation.estimated)}</b></div></div>
      ${calculation.isManual
        ? `<div class="manual-reasons"><b>Encaminhado para análise manual porque:</b>${calculation.manual.map(reason => `<span>• ${escapeHtml(reason)}</span>`).join('')}</div>`
        : '<div class="success-note">✓ Nenhuma regra de análise manual foi acionada.</div>'}
      <div class="footer-actions"><button type="button" class="primary" id="backResult">VOLTAR AO RESULTADO →</button></div></section>`;
    root.querySelector('#backResult').addEventListener('click', renderResult);
  }

  function showUpgrade() {
    closeUpgrade?.();
    const previousFocus = document.activeElement;
    const modal = document.createElement('div');
    modal.className = 'v54-overlay';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Escolha seu próximo iPhone');
    modal.innerHTML = `<div class="v54-shell"><div class="v54-top"><button class="v54-back" type="button" aria-label="Voltar ao resultado">←</button>
      <div><strong>GRINGAS</strong><span>TROCA</span></div><span class="v54-code">${escapeHtml(record.id)}</span></div>
      <div class="v54-progress"><i></i></div><div class="v54-content"><div class="v54-kicker">SEU UPGRADE</div>
      <h2>Agora escolha seu próximo iPhone.</h2><p class="v54-sub">Seu aparelho entra com crédito estimado de <strong>${money(record.calculation.estimated)}</strong>.</p>
      <div class="v54-products"></div><div class="v54-summary" hidden></div><p class="note" data-error role="alert" hidden></p>
      <button type="button" class="v54-continue" disabled>CONTINUAR →</button>
      <p class="v54-note">Valores e parcelamento demonstrativos, sujeitos à confirmação da Gringas.</p></div></div>`;
    document.body.appendChild(modal);

    let selected = record.upgrade?.productId || '';
    const products = modal.querySelector('.v54-products');
    const summary = modal.querySelector('.v54-summary');
    const continueButton = modal.querySelector('.v54-continue');
    const close = () => {
      modal.remove();
      previousFocus?.focus();
      if (closeUpgrade === close) closeUpgrade = null;
    };
    closeUpgrade = close;
    modal.querySelector('.v54-back').addEventListener('click', close);
    modal.addEventListener('keydown', event => {
      if (event.key === 'Escape') close();
    });

    function renderUpgradeSummary() {
      const value = calculateUpgrade(selected, record.calculation.estimated);
      summary.hidden = false;
      summary.innerHTML = value.price === null
        ? '<div class="v54-summary-title">Ainda não decidiu?</div><p>Sem problema. A equipe Gringas pode ajudar você a escolher.</p>'
        : `<div class="v54-summary-title">Sua troca</div>
          <div class="v54-row"><span>${escapeHtml(value.productName)} ${escapeHtml(value.storage)}</span><strong>${money(value.price)}</strong></div>
          <div class="v54-row credit"><span>Seu iPhone como entrada</span><strong>− ${money(Math.min(value.tradeValue, value.price))}</strong></div>
          <div class="v54-divider"></div><div class="v54-paylabel">${value.difference > 0 ? 'VOCÊ COMPLETA' : 'SALDO ESTIMADO'}</div>
          <div class="v54-difference">${money(value.difference > 0 ? value.difference : value.creditOver)}</div>
          ${value.difference > 0 ? `<div class="v54-or">ou <strong>12x de ${installment(value.installment)}</strong>*</div>` : ''}
          <div class="v54-disclaimer">*Simulação ilustrativa, sujeita à confirmação.</div>`;
      continueButton.disabled = false;
    }

    for (const product of catalog.upgradeProducts) {
      const productButton = document.createElement('button');
      productButton.type = 'button';
      productButton.className = `v54-product${selected === product.id ? ' active' : ''}`;
      productButton.innerHTML = `<div><strong>${escapeHtml(product.name)}</strong><span>${escapeHtml(product.storage)}</span></div>
        <div class="v54-product-price">${product.price === null ? 'Quero ajuda' : money(product.price)}<small>${product.price === null ? '' : 'demonstrativo'}</small></div>`;
      productButton.addEventListener('click', () => {
        selected = product.id;
        [...products.children].forEach(item => item.classList.toggle('active', item === productButton));
        showError(modal, '');
        renderUpgradeSummary();
      });
      products.appendChild(productButton);
    }
    if (selected) renderUpgradeSummary();

    continueButton.addEventListener('click', async () => {
      if (!selected || continueButton.disabled) return;
      continueButton.disabled = true;
      try {
        record = await saveUpgrade(record, selected);
        const value = record.upgrade;
        const message = `Olá, Gringas! Quero continuar meu upgrade. Avaliação: ${record.id}. Crédito estimado: ${money(value.tradeValue)}. Interesse: ${value.productName} ${value.storage}.${value.difference === null ? '' : ` Diferença estimada: ${money(value.difference)}.`}`;
        modal.querySelector('.v54-content').innerHTML = `<div class="v54-successmark">✓</div><div class="v54-kicker">UPGRADE SELECIONADO</div>
          <h2>${value.productId === 'undecided' ? 'Vamos ajudar você a escolher.' : 'Seu próximo iPhone está ainda mais perto.'}</h2>
          <div class="v54-final-card"><div class="v54-final-code">Avaliação <strong>${escapeHtml(record.id)}</strong></div>
            <div class="v54-final-line"><span>Crédito estimado</span><strong>${money(value.tradeValue)}</strong></div>
            <div class="v54-final-line"><span>Interesse</span><strong>${escapeHtml(value.productName)} ${escapeHtml(value.storage)}</strong></div>
            ${value.difference === null ? '' : `<div class="v54-final-highlight"><span>Diferença estimada</span><strong>${money(value.difference)}</strong><small>ou 12x de ${installment(value.installment)}*</small></div>`}</div>
          <a class="v54-whatsapp" href="${escapeHtml(whatsappUrl(message))}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">FALAR COM A GRINGAS →</a>
          <button type="button" class="v54-secondary">VOLTAR AO RESULTADO</button>
          <p class="v54-note">O interesse não é atualizado diretamente no banco pelo visitante. Continue pelo WhatsApp; ele abre somente ao clicar e não recebe links das fotos.</p>`;
        modal.querySelector('.v54-secondary').addEventListener('click', close);
        modal.querySelector('.v54-whatsapp').focus();
      } catch (error) {
        showError(modal, error.message || 'Não foi possível salvar o upgrade.');
        continueButton.disabled = false;
      }
    });
    modal.querySelector('.v54-back').focus();
  }

  function render() {
    if (back) back.classList.toggle('hidden', state.step === 1 || state.step === 12);
    if (state.step === 12 && record) renderResult();
    else renderStep();
  }

  if (back) {
    back.addEventListener('click', () => {
      if (state.step > 1 && state.step <= TOTAL_STEPS) {
        state.step -= 1;
        render();
      } else if (state.step === 1) {
        globalThis.location.href = 'index.html';
      }
    });
  }
  restart?.addEventListener('click', reset);
  render();

  return () => {
    closeUpgrade?.();
    root.replaceChildren();
  };
}

if (typeof document !== 'undefined') {
  const start = () => mountEvaluationApp();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}
