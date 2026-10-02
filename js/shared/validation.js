import { catalog, rules } from '../evaluation/calculator.js';

const answers = ['Sim', 'Não', 'Não sei'];
const accessories = ['Caixa', 'Cabo', 'Nota fiscal'];
const photoTypes = ['image/jpeg', 'image/png', 'image/webp'];
const maxPhotoBytes = 6 * 1024 * 1024;

export const initialState = () => ({
  step: 1,
  model: '',
  storage: '',
  battery: 87,
  condition: '',
  screen: '',
  issues: [],
  repair: '',
  partAlert: '',
  warranty: '',
  warrantyDate: '',
  appleCare: '',
  notes: '',
  accessories: [],
  name: '',
  phone: '',
  service: 'WhatsApp',
  photos: {},
  evaluationId: '',
});

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function uniqueAllowed(values, allowed) {
  return Array.isArray(values) && new Set(values).size === values.length && values.every(value => allowed.includes(value));
}

export function validatePhotoFile(file) {
  if (!file || !photoTypes.includes(String(file.type || '').toLowerCase())) {
    return 'Use uma foto JPEG, PNG ou WebP.';
  }
  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > maxPhotoBytes) {
    return 'Cada foto deve ter conteúdo e no máximo 6 MiB.';
  }
  return '';
}

export function validateStep(state, step = state?.step) {
  if (!state || typeof state !== 'object') return 'Dados da avaliação inválidos.';

  switch (step) {
    case 1:
      return catalog.models.includes(state.model) ? '' : 'Escolha um modelo válido.';
    case 2:
      return catalog.storageByModel[state.model]?.includes(state.storage) ? '' : 'Escolha uma capacidade compatível.';
    case 3:
      return state.battery === 'Não informado' ||
        (Number.isInteger(state.battery) && state.battery >= 50 && state.battery <= 100)
        ? '' : 'Informe a bateria entre 50% e 100%, ou escolha não informado.';
    case 4:
      return Object.hasOwn(rules.conditionDiscount, state.condition) ? '' : 'Escolha o estado físico.';
    case 5:
      return Object.hasOwn(rules.screenDiscount, state.screen) ? '' : 'Escolha o estado da tela.';
    case 6:
      return uniqueAllowed(state.issues, Object.keys(rules.issueDiscount)) ? '' : 'Revise as funções informadas.';
    case 7:
      return answers.includes(state.repair) && answers.includes(state.partAlert)
        ? '' : 'Responda às duas perguntas sobre manutenção e peças.';
    case 8:
      if (!answers.includes(state.warranty)) return 'Informe a garantia.';
      if (state.warranty === 'Sim' && (!validDate(state.warrantyDate) || !answers.includes(state.appleCare))) {
        return 'Informe uma data válida de garantia e responda sobre AppleCare+.';
      }
      return '';
    case 9:
      return state.photos && state.photos.front && state.photos.back
        ? '' : 'Envie as fotos da frente e traseira.';
    case 10:
      return typeof state.notes === 'string' && state.notes.length <= 500 && uniqueAllowed(state.accessories, accessories)
        ? '' : 'Revise as observações (até 500 caracteres) e acessórios.';
    case 11: {
      const name = typeof state.name === 'string' ? state.name.trim() : '';
      const digits = typeof state.phone === 'string' ? state.phone.replace(/\D/g, '') : '';
      if (name.length < 2 || name.length > 120) return 'Informe seu nome (2 a 120 caracteres).';
      if (!/^(?:55)?[1-9]\d\d{8,9}$/.test(digits)) return 'Informe um telefone brasileiro válido com DDD.';
      return ['WhatsApp', 'Loja física'].includes(state.service) ? '' : 'Escolha a preferência de atendimento.';
    }
    default:
      return 'Etapa inválida.';
  }
}

export function validateEvaluation(state) {
  return Array.from({ length: 11 }, (_, index) => validateStep(state, index + 1)).filter(Boolean);
}
