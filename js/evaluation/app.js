import { catalog, rules, calculate, calculateUpgrade } from './calculator.js';
import { saveEvaluation, saveUpgrade } from './repository.js';
import { evaluationWhatsappUrl, upgradeWhatsappUrl } from '../shared/whatsapp.js';
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

function shell(step, title, subtitle, body, footer, animate = true) {
  return `<section class="screen${animate ? '' : ' is-static'}">${progress(step)}<h1 class="question">${title}</h1>
    ${subtitle ? `<p class="sub">${subtitle}</p>` : ''}<div class="screen-body">${body}</div>
    <p class="note" data-error role="alert" hidden></p>
    <div class="footer-actions">${footer}</div></section>`;
}

function button(label = 'CONTINUAR →', className = 'primary', disabled = false) {
  return `<button type="button" class="btn ${className}${disabled ? ' disabled' : ''}" data-next${disabled ? ' disabled' : ''}>${label}</button>`;
}

function showError(root, message = '') {
  const target = root.querySelector('[data-error]');
  if (!target) return;
  target.textContent = message;
  target.hidden = !message;
}

function choices(state, field, values, descriptions = [], { className = '', extra = '' } = {}) {
  const modelChoices = field === 'model';
  return `<div class="choices${modelChoices ? ' model-grid' : ''}${className ? ` ${className}` : ''}">${values.map((value, index) => {
    const selected = Array.isArray(state[field]) ? state[field].includes(value) : state[field] === value;
    return `<button type="button" class="choice${modelChoices ? ' model-card' : ''}${selected ? ' selected' : ''}" data-field="${field}" data-value="${escapeHtml(value)}" aria-pressed="${selected}">
      ${modelChoices ? '<span class="mini-phone"></span>' : ''}<div><strong>${escapeHtml(value)}</strong>${descriptions[index] ? `<small>${escapeHtml(descriptions[index])}</small>` : ''}</div><span class="radio"></span></button>`;
  }).join('')}${extra}</div>`;
}

function field(label, content, forId = '') {
  const heading = forId
    ? `<label class="label" for="${forId}">${label}</label>`
    : `<span class="label">${label}</span>`;
  return `<div class="field">${heading}${content}</div>`;
}

function readPhoto(file, maxSide = 1600, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Não foi possível ler a foto. Escolha outro arquivo.'));
    };
    image.onload = () => {
      try {
        const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(objectUrl);
        const source = safeImageUrl(canvas.toDataURL('image/jpeg', quality));
        if (!source) throw new Error('A foto não pôde ser validada. Use JPEG, PNG ou WebP.');
        resolve(source);
      } catch (error) {
        URL.revokeObjectURL(objectUrl);
        reject(error);
      }
    };
    image.src = objectUrl;
  });
}

function maskPhone(value) {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits ? `(${digits}` : '';
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
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
  let currentView = 'wizard';
  let renderedStep = null;

  function pushNavigation(view = currentView, step = state.step, { replace = false } = {}) {
    currentView = view;
    const method = replace ? 'replaceState' : 'pushState';
    globalThis.history?.[method]({ gringasEvaluation: true, view, step }, '');
  }

  function reset() {
    closeUpgrade?.();
    closeUpgrade = null;
    state = initialState();
    record = null;
    saving = false;
    photoLoading = false;
    currentView = 'wizard';
    renderedStep = null;
    pushNavigation('wizard', 1, { replace: true });
    render();
  }

  function syncNextButton() {
    const nextButton = root.querySelector('[data-next]');
    if (!nextButton) return;
    const error = validateStep(state);
    nextButton.disabled = Boolean(error) || saving || photoLoading;
    nextButton.classList.toggle('disabled', nextButton.disabled);
  }

  function refreshSelections() {
    root.querySelectorAll('[data-field]').forEach(control => {
      const { field: key, value } = control.dataset;
      const selected = Array.isArray(state[key]) ? state[key].includes(value) : state[key] === value;
      if (control.getAttribute('role') === 'switch') {
        control.setAttribute('aria-checked', selected);
        control.querySelector('.switch')?.classList.toggle('on', selected);
      } else {
        control.classList.toggle('selected', selected);
        control.setAttribute('aria-pressed', selected);
      }
    });
    const none = root.querySelector('#noAccessories');
    if (none) {
      none.classList.toggle('selected', !state.accessories.length);
      none.setAttribute('aria-pressed', !state.accessories.length);
    }
    showError(root, '');
    syncNextButton();
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
      pushNavigation('wizard', state.step);
      render();
      globalThis.scrollTo?.(0, 0);
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
      record = await saveEvaluation(state, calculation, record);
      saving = false;
      state.evaluationId = record.id;
      state.step = 12;
      pushNavigation('result', state.step);
      render();
      globalThis.scrollTo?.(0, 0);
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

        if (key === 'warranty') render();
        else refreshSelections();
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
        state[key] = id === 'phone' ? maskPhone(event.target.value) : event.target.value;
        if (id === 'phone') event.target.value = state.phone;
        if (id === 'notes') root.querySelector('#count').textContent = state.notes.length;
        showError(root, '');
        syncNextButton();
      });
    }

    root.querySelector('#noAccessories')?.addEventListener('click', () => {
      state.accessories = [];
      refreshSelections();
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
          input.closest('.photo-box')?.classList.add('loading');
          syncNextButton();
          state.photos[input.dataset.photo] = await readPhoto(file);
          photoLoading = false;
          render();
        } catch (error) {
          photoLoading = false;
          input.value = '';
          input.disabled = false;
          input.closest('.photo-box')?.classList.remove('loading');
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
        extra = '<button type="button" class="btn ghost" id="unknownBattery">NÃO CONSIGO VERIFICAR</button>';
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
        title = 'Alguma dessas funções está com problema?';
        subtitle = 'Ative apenas o que <b>não</b> está funcionando. Se está tudo certo, é só continuar.';
        body = `<div class="toggle-list">${Object.keys(rules.issueDiscount).map(issue => {
          const on = state.issues.includes(issue);
          return `<button type="button" class="toggle-row" data-field="issues" data-value="${escapeHtml(issue)}" role="switch" aria-checked="${on}">
            <span>${escapeHtml(issue)}</span><span class="switch${on ? ' on' : ''}" aria-hidden="true"></span></button>`;
        }).join('')}</div>`;
        break;
      case 7:
        title = 'Seu iPhone já passou por manutenção?';
        subtitle = 'Também precisamos saber se existe algum alerta de peça no sistema.';
        body = field('JÁ FOI PARA MANUTENÇÃO?', choices(state, 'repair', ['Não', 'Sim', 'Não sei'])) +
          field('APARECE AVISO DE PEÇA DESCONHECIDA?', choices(state, 'partAlert', ['Não', 'Sim', 'Não sei']));
        break;
      case 8:
        title = 'Seu aparelho ainda possui garantia Apple?';
        subtitle = 'A garantia não define o valor sozinha, mas fica registrada para a análise da Gringas.';
        body = choices(state, 'warranty', ['Sim', 'Não', 'Não sei']) + (state.warranty === 'Sim'
          ? field('GARANTIA VÁLIDA ATÉ (OPCIONAL)', `<input class="input" type="date" id="wdate" value="${escapeHtml(state.warrantyDate)}">`, 'wdate') +
            field('POSSUI APPLECARE+?', choices(state, 'appleCare', ['Sim', 'Não', 'Não sei']))
          : '') + '<div class="note">Garantia e AppleCare+ são informações de apoio e não aumentam automaticamente a estimativa.</div>';
        break;
      case 9:
        title = 'Agora mostre seu aparelho.';
        subtitle = 'Frente e traseira são obrigatórias. As outras ajudam a Gringas a confirmar o estado informado.';
        body = `<div class="photo-grid">${[
          ['front', 'Frente'], ['back', 'Traseira'], ['left', 'Lateral esquerda'],
          ['right', 'Lateral direita'], ['detail', 'Avaria / detalhe'],
        ].map(([key, label]) => {
          const source = safeImageUrl(state.photos[key]);
          const required = key === 'front' || key === 'back';
          return `<div class="photo-wrap"><label class="photo-box${source ? ' has-photo' : ''}${required ? ' required' : ''}">${source
            ? `<img src="${escapeHtml(source)}" alt="Foto: ${escapeHtml(label)}">`
            : `<span class="photo-plus" aria-hidden="true">＋</span><b>${escapeHtml(label)}</b><small>${required ? 'obrigatória' : 'opcional'}</small>`}
            <input aria-label="Foto: ${escapeHtml(label)}" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" data-photo="${key}"${photoLoading ? ' disabled' : ''}></label>
            ${source ? `<button type="button" class="photo-remove" data-remove-photo="${key}">Remover</button>` : ''}</div>`;
        }).join('')}</div><p class="note">Tire a foto na hora ou escolha da galeria. Prefira um lugar bem iluminado. Envie JPEG, PNG ou WebP de até 6 MB.</p>`;
        break;
      case 10:
        title = 'Algo mais que devemos saber?';
        subtitle = 'Conte sobre marcas, reparos ou qualquer detalhe útil. É opcional.';
        body = `<div class="field"><textarea class="input" aria-label="Observações" id="notes" maxlength="500" rows="4" placeholder="Ex.: troquei a bateria há 4 meses na Apple. Pequena marca na lateral direita...">${escapeHtml(state.notes)}</textarea>
          <div class="counter"><span id="count">${state.notes.length}</span>/500</div></div>` +
          field('O QUE ACOMPANHA O APARELHO?', '<p class="hint">Você pode avaliar só o aparelho.</p>' +
            choices(state, 'accessories', ['Caixa', 'Cabo', 'Nota fiscal'], [], {
              className: 'chips',
              extra: `<button type="button" class="choice${state.accessories.length ? '' : ' selected'}" id="noAccessories" aria-pressed="${!state.accessories.length}"><strong>Nenhum</strong><span class="radio" aria-hidden="true"></span></button>`,
            }));
        extra = '<button type="button" class="btn ghost" id="noNotes">NÃO TENHO OBSERVAÇÕES</button>';
        break;
      case 11:
        title = 'Estamos quase lá.';
        subtitle = 'Deixe seus dados para identificarmos sua avaliação e falarmos com você.';
        body = field('NOME COMPLETO', `<input class="input" id="name" maxlength="120" autocomplete="name" autocapitalize="words" value="${escapeHtml(state.name)}" placeholder="Seu nome e sobrenome">`, 'name') +
          field('WHATSAPP', `<input class="input" id="phone" maxlength="15" autocomplete="tel-national" type="tel" value="${escapeHtml(maskPhone(state.phone))}" placeholder="(71) 99999-9999" inputmode="tel">`, 'phone') +
          field('COMO PREFERE SER ATENDIDO?', choices(state, 'service', ['WhatsApp', 'Loja física'])) +
          '<div class="note">Ao continuar, você confirma que as informações fornecidas são verdadeiras e autoriza a Gringas a utilizá-las nesta avaliação.</div>';
        break;
      default:
        throw new Error('Etapa inválida.');
    }

    const label = state.step === 11 ? 'CALCULAR MINHA AVALIAÇÃO →' : 'CONTINUAR →';
    const className = state.step === 11 ? 'primary gold' : 'primary';
    const animate = renderedStep !== state.step;
    renderedStep = state.step;
    root.innerHTML = shell(state.step, title, subtitle, body, `${button(label, className, disabled)}${extra}`, animate);
    bindStepEvents();
  }

  function renderResult() {
    const calculation = record.calculation;
    const warranty = record.warranty;
    const warrantyLabel = warranty.status === 'Sim'
      ? `Sim${warranty.date ? ` • até ${warranty.date.split('-').reverse().join('/')}` : ''}`
      : warranty.status || 'Não informado';
    const whatsappHref = evaluationWhatsappUrl(record, money(calculation.estimated));
    const persistenceWarning = record.photoStorageWarning
      ? '<div class="note">As fotos ficam disponíveis somente nesta tela e não foram gravadas no armazenamento local do navegador.</div>'
      : record.photoCleanupWarning
        ? '<div class="note">A avaliação foi atualizada, mas uma foto substituída não pôde ser removida. Avise a equipe se o problema persistir.</div>'
        : '';

    root.innerHTML = `<section class="screen result-screen"><div class="result-kicker">SUA AVALIAÇÃO FICOU PRONTA</div>
      <div class="result-device"><span class="result-phone-art"></span><div><b>${escapeHtml(record.device.model)}</b><small>${escapeHtml(record.device.storage)}</small></div></div>
      ${calculation.isManual
        ? `<div class="manual-card"><span>ANÁLISE ESPECIAL</span><h1>Precisamos confirmar alguns detalhes do seu iPhone.</h1><p>A Gringas fará uma análise antes de confirmar o valor. Sua referência inicial é de <b>${money(calculation.estimated)}</b>.</p></div>`
        : `<div class="value-label">SEU IPHONE PODE VALER ATÉ</div><div class="result-value">${money(calculation.estimated)}</div><div class="value-sub">como entrada na Gringas.</div><div class="result-callout">🔥 Seu próximo iPhone está mais perto.</div>`}
      <div class="evaluation-code">Avaliação <b>${escapeHtml(record.id)}</b></div>
      ${persistenceWarning}
      <div class="demo-warning">⚠️ Valores demonstrativos para validar o motor. A condição final será confirmada pela Gringas.</div>
      <div class="summary-card"><h3>Dados complementares</h3>
        <div class="summary-row"><span>📸 Fotos</span><b>${Object.keys(record.photos || {}).length}</b></div>
        <div class="summary-row"><span>🍎 Garantia Apple</span><b>${escapeHtml(warrantyLabel)}</b></div>
        <div class="summary-row"><span>🛡️ AppleCare+</span><b>${escapeHtml(warranty.appleCare || '—')}</b></div>
        <div class="summary-row"><span>📦 Acompanha</span><b>${escapeHtml(record.accessories.join(', ') || 'Somente aparelho')}</b></div>
        <div class="summary-notes"><span>📝 Observações</span><p>${escapeHtml(record.notes || 'Nenhuma observação.')}</p></div>
      </div>
      <div class="footer-actions result-actions"><button type="button" class="btn primary gold" id="upgrade">QUERO FAZER MEU UPGRADE →</button>
        <button type="button" class="btn ghost" id="diagnostic">VER DIAGNÓSTICO DO CÁLCULO</button>
        <button type="button" class="btn ghost" id="edit">VOLTAR E EDITAR</button>
        <a class="btn whatsapp" href="${escapeHtml(whatsappHref)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">FALAR COM A GRINGAS →</a></div>
      <p class="legal">Valor estimado com base nas informações fornecidas. O WhatsApp abre somente ao clicar e a mensagem não inclui links das fotos.</p></section>`;

    root.querySelector('#edit').addEventListener('click', () => {
      state.step = 11;
      pushNavigation('wizard', 11);
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
      <div class="footer-actions"><button type="button" class="btn primary" id="backResult">VOLTAR AO RESULTADO →</button></div></section>`;
    root.querySelector('#backResult').addEventListener('click', renderResult);
  }

  function showUpgrade({ push = true } = {}) {
    currentView = 'upgrade';
    if (push) pushNavigation('upgrade', 12);
    let selected = record.upgrade?.productId || '';

    const draw = () => {
      const value = selected ? calculateUpgrade(selected, record.calculation.estimated) : null;
      root.innerHTML = `<section class="screen upgrade-screen"><span class="pill">SEU UPGRADE</span>
        <h1 class="question">Escolha seu próximo iPhone.</h1>
        <div class="screen-body"><div class="credit-chip"><span>Crédito do seu ${escapeHtml(record.device.model)}</span><b>${money(record.calculation.estimated)}</b></div>
        <div class="products">${catalog.upgradeProducts.map(product => `<button type="button" class="product${selected === product.id ? ' selected' : ''}" data-product="${escapeHtml(product.id)}" aria-pressed="${selected === product.id}">
          <span class="mini-phone" aria-hidden="true"></span><div class="product-info"><strong>${escapeHtml(product.name)}</strong><small>${product.price === null ? 'A equipe ajuda você a escolher' : `${escapeHtml(product.storage)} • ${money(product.price)}`}</small></div>
          ${product.price === null ? '' : `<div class="product-diff"><small>${Math.max(0, product.price - record.calculation.estimated) ? 'você completa' : 'seu crédito'}</small><b>${Math.max(0, product.price - record.calculation.estimated) ? money(Math.max(0, product.price - record.calculation.estimated)) : 'cobre tudo'}</b></div>`}<span class="radio" aria-hidden="true"></span></button>`).join('')}</div>
        ${value ? `<div class="deal-card" aria-live="polite">${value.price === null ? `<p class="deal-help">Sem problema! A equipe da Gringas ajuda você a escolher.</p>` : `<div class="deal-row"><span>${escapeHtml(value.productName)} ${escapeHtml(value.storage)}</span><b>${money(value.price)}</b></div><div class="deal-row credit"><span>Seu iPhone como entrada</span><b>− ${money(Math.min(value.tradeValue, value.price))}</b></div><div class="deal-total"><span class="value-label">${value.difference > 0 ? 'VOCÊ COMPLETA' : 'SALDO ESTIMADO'}</span><div class="deal-amount">${money(value.difference > 0 ? value.difference : value.creditOver)}</div>${value.difference > 0 ? `<div class="deal-installment">ou em até <b>12x de ${installment(value.installment)}</b>*</div>` : ''}</div>`}</div>` : ''}</div>
        <p class="note" data-error role="alert" hidden></p><div class="footer-actions"><button type="button" class="btn primary" id="confirmUpgrade"${selected ? '' : ' disabled'}>${selected ? 'CONTINUAR →' : 'ESCOLHA UM IPHONE →'}</button></div>
        <p class="legal">*Simulação. Preços, parcelamento e valor final da troca são confirmados pela Gringas no atendimento.</p></section>`;
      root.querySelectorAll('[data-product]').forEach(button => button.addEventListener('click', () => {
        selected = button.dataset.product;
        draw();
      }));
      root.querySelector('#confirmUpgrade')?.addEventListener('click', confirm);
    };

    const confirm = async () => {
      if (!selected) return;
      const control = root.querySelector('#confirmUpgrade');
      control.disabled = true;
      try {
        record = await saveUpgrade(record, selected);
        const value = record.upgrade;
        const whatsappHref = upgradeWhatsappUrl(
          record,
          money(value.tradeValue),
          value.difference === null ? '' : money(value.difference)
        );
        root.innerHTML = `<section class="screen upgrade-screen"><div class="screen-body"><div class="success-note">✓ UPGRADE SELECIONADO</div><h1 class="question">${value.productId === 'undecided' ? 'Vamos ajudar você a escolher.' : 'Seu próximo iPhone está ainda mais perto.'}</h1><div class="deal-card"><div class="deal-row"><span>Crédito estimado</span><b>${money(value.tradeValue)}</b></div><div class="deal-row"><span>Interesse</span><b>${escapeHtml(value.productName)} ${escapeHtml(value.storage)}</b></div>${value.difference === null ? '' : `<div class="deal-total"><span>Diferença estimada</span><div class="deal-amount">${money(value.difference)}</div></div>`}</div></div><div class="footer-actions"><a class="btn whatsapp" href="${escapeHtml(whatsappHref)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">CONTINUAR NO WHATSAPP →</a><button type="button" class="btn ghost" id="backResult">VOLTAR AO RESULTADO</button></div><p class="legal">O WhatsApp abre somente ao clicar e a mensagem não inclui links das fotos.</p></section>`;
        root.querySelector('#backResult').addEventListener('click', () => globalThis.history.back());
      } catch (error) {
        showError(root, error.message || 'Não foi possível salvar o upgrade.');
        control.disabled = false;
      }
    };
    draw();
    globalThis.scrollTo?.(0, 0);
  }

  function render() {
    if (back) back.classList.toggle('hidden', state.step === 1);
    document.body.dataset.view = currentView;
    if (currentView === 'upgrade' && record) {
      renderedStep = null;
      showUpgrade({ push: false });
    } else if (state.step === 12 && record) {
      currentView = 'result';
      renderedStep = null;
      renderResult();
    } else {
      currentView = 'wizard';
      renderStep();
    }
  }

  globalThis.addEventListener?.('popstate', event => {
    const navigation = event.state;
    if (!navigation?.gringasEvaluation) {
      globalThis.location.href = 'index.html';
      return;
    }
    currentView = navigation.view;
    state.step = navigation.step;
    render();
    globalThis.scrollTo?.(0, 0);
  });

  if (back) back.addEventListener('click', () => globalThis.history.back());
  restart?.addEventListener('click', () => {
    if (state.step > 1 && currentView === 'wizard' && !globalThis.confirm('Recomeçar a avaliação do início?')) return;
    reset();
  });
  pushNavigation('wizard', 1, { replace: true });
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
