import { config } from '../config.js';
import { calculate, calculateUpgrade } from './calculator.js';

const HISTORY_KEY = 'gringasTrocaEvaluationsV55';
const MAX_LOCAL_RECORDS = 150;
const MAX_PHOTO_BYTES = 6 * 1024 * 1024;
const PHOTO_TYPES = Object.freeze(['image/jpeg', 'image/png', 'image/webp']);
const PHOTO_KEYS = Object.freeze(['front', 'back', 'left', 'right', 'detail']);

let cloudClient;

function hasCloudConfiguration() {
  return Boolean(
    config.supabaseUrl &&
    config.supabaseAnonKey &&
    config.storeId &&
    config.photoBucket &&
    !String(config.supabaseUrl).includes('COLE_AQUI') &&
    !String(config.supabaseAnonKey).includes('COLE_AQUI')
  );
}

function getCloudClient() {
  if (!hasCloudConfiguration()) return null;
  const sdk = globalThis.window?.supabase;
  if (!sdk?.createClient) {
    throw new Error('Supabase está configurado, mas o SDK oficial não foi carregado em window.supabase.');
  }
  cloudClient ??= sdk.createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  return cloudClient;
}

function storage() {
  const value = globalThis.window?.localStorage;
  if (!value) throw new Error('O armazenamento local não está disponível neste navegador.');
  return value;
}

function cleanRecords(value) {
  return Array.isArray(value) ? value.filter(record => record && typeof record.id === 'string') : [];
}

export function readLocalEvaluations() {
  try {
    return cleanRecords(JSON.parse(storage().getItem(HISTORY_KEY) || '[]'));
  } catch (cause) {
    throw new Error('Não foi possível ler as avaliações salvas neste navegador.', { cause });
  }
}

export function writeLocalEvaluations(records) {
  try {
    storage().setItem(HISTORY_KEY, JSON.stringify(cleanRecords(records).slice(0, MAX_LOCAL_RECORDS)));
  } catch (cause) {
    throw new Error('Não foi possível salvar a avaliação no navegador. Libere espaço e tente novamente.', { cause });
  }
}

export function createEvaluationId() {
  const randomUUID = globalThis.crypto?.randomUUID;
  if (typeof randomUUID !== 'function') {
    throw new Error('Este navegador não oferece geração segura de identificadores. Atualize-o e tente novamente.');
  }
  return `GT-${randomUUID.call(globalThis.crypto)}`;
}

function createRecord(state, calculation, previous = null) {
  const now = new Date().toISOString();
  const id = previous?.id || state.evaluationId || createEvaluationId();
  return {
    id,
    createdAt: previous?.createdAt || now,
    updatedAt: now,
    status: previous?.status || 'Nova',
    customer: {
      name: state.name.trim(),
      phone: state.phone.trim(),
      service: state.service,
    },
    device: {
      model: state.model,
      storage: state.storage,
      battery: state.battery,
      condition: state.condition,
      screen: state.screen,
      issues: [...state.issues],
      repair: state.repair,
      partAlert: state.partAlert,
    },
    warranty: {
      status: state.warranty,
      date: state.warrantyDate,
      appleCare: state.appleCare,
    },
    accessories: [...state.accessories],
    notes: state.notes,
    photos: { ...state.photos },
    calculation: {
      ...calculation,
      manual: [...calculation.manual],
      lines: calculation.lines.map(line => ({ ...line })),
    },
    approvedValue: previous?.approvedValue ?? null,
    adjustmentReason: previous?.adjustmentReason || '',
    upgrade: previous?.upgrade || null,
  };
}

function rowFromRecord(record, photoPaths) {
  const batteryIsNumber = typeof record.device.battery === 'number';
  return {
    code: record.id,
    store_id: config.storeId,
    status: 'Nova',
    customer_name: record.customer.name,
    customer_phone: record.customer.phone,
    preferred_service: record.customer.service,
    device_model: record.device.model,
    device_storage: record.device.storage,
    battery: batteryIsNumber ? record.device.battery : null,
    battery_label: batteryIsNumber ? null : String(record.device.battery || ''),
    condition: record.device.condition,
    screen_condition: record.device.screen,
    issues: record.device.issues,
    repair_history: record.device.repair,
    part_alert: record.device.partAlert,
    warranty_status: record.warranty.status,
    warranty_date: record.warranty.date || null,
    applecare: record.warranty.appleCare,
    accessories: record.accessories,
    notes: record.notes,
    photos: photoPaths,
    base_value: record.calculation.base,
    total_discount: record.calculation.totalDiscount,
    estimated_value: record.calculation.estimated,
    manual_review: record.calculation.isManual,
    manual_reasons: record.calculation.manual,
    calculation_lines: record.calculation.lines,
    approved_value: null,
    adjustment_reason: '',
    metadata: { source: 'web-5.6-esm' },
  };
}

function photoExtension(type) {
  return type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
}

async function dataUrlToPhoto(value) {
  if (typeof value !== 'string' || !/^data:image\/(?:jpeg|png|webp);base64,/i.test(value)) {
    throw new Error('Foto inválida. Envie novamente em JPEG, PNG ou WebP.');
  }
  const response = await fetch(value);
  const blob = await response.blob();
  if (!PHOTO_TYPES.includes(blob.type) || blob.size <= 0 || blob.size > MAX_PHOTO_BYTES) {
    throw new Error('Cada foto deve ser JPEG, PNG ou WebP e ter no máximo 6 MB.');
  }
  return blob;
}

async function uploadPhotos(client, code, photos) {
  const paths = {};
  const uploaded = [];
  try {
    for (const [key, value] of Object.entries(photos || {})) {
      if (!PHOTO_KEYS.includes(key) || !value) continue;
      const blob = await dataUrlToPhoto(value);
      const filename = `${key}-${globalThis.crypto.randomUUID()}.${photoExtension(blob.type)}`;
      const path = `${config.storeId}/${code}/${filename}`;
      const { error } = await client.storage.from(config.photoBucket).upload(path, blob, {
        cacheControl: '3600',
        contentType: blob.type,
        upsert: false,
      });
      if (error) throw error;
      uploaded.push(path);
      paths[key] = path;
    }
    return { paths, uploaded };
  } catch (cause) {
    if (uploaded.length) {
      try { await client.storage.from(config.photoBucket).remove(uploaded); } catch { /* best effort */ }
    }
    throw new Error('Não foi possível enviar as fotos com segurança. Tente novamente.', { cause });
  }
}

function cloudError(message, cause) {
  const detail = cause?.message ? ` ${cause.message}` : '';
  return new Error(`${message}${detail}`, { cause });
}

async function saveCloud(record, client) {
  const { paths, uploaded } = await uploadPhotos(client, record.id, record.photos);
  const { error } = await client.from('evaluations').insert(rowFromRecord(record, paths));
  if (error) {
    if (uploaded.length) {
      try { await client.storage.from(config.photoBucket).remove(uploaded); } catch { /* best effort */ }
    }
    throw cloudError('Não foi possível salvar a avaliação na nuvem.', error);
  }
  return { ...record, photos: paths, cloud: true };
}

function saveLocal(record) {
  const records = readLocalEvaluations();
  const saved = { ...record, cloud: false };
  const next = [saved, ...records.filter(item => item.id !== saved.id)];
  try {
    writeLocalEvaluations(next);
  } catch (error) {
    const withoutPhotos = { ...saved, photos: {}, photoStorageWarning: true };
    writeLocalEvaluations([withoutPhotos, ...records.filter(item => item.id !== saved.id)]);
    return withoutPhotos;
  }
  return saved;
}

export function cloudConfigured() {
  return hasCloudConfiguration();
}

export async function saveEvaluation(state, calculation = calculate(state)) {
  if (hasCloudConfiguration()) {
    const record = createRecord(state, calculation);
    return saveCloud(record, getCloudClient());
  }

  const records = readLocalEvaluations();
  const previous = records.find(item => item.id === state.evaluationId) || null;
  return saveLocal(createRecord(state, calculation, previous));
}

export async function saveUpgrade(record, productId) {
  const upgrade = {
    ...calculateUpgrade(productId, record.calculation.estimated),
    selectedAt: new Date().toISOString(),
  };
  const updated = { ...record, upgrade, updatedAt: new Date().toISOString() };

  if (hasCloudConfiguration()) {
    // O código público da avaliação não é autorização para UPDATE. O interesse
    // segue no contato explícito por WhatsApp até existir um endpoint confiável.
    return { ...updated, cloud: true, upgrade: { ...upgrade, synced: false } };
  }

  const records = readLocalEvaluations();
  if (!records.some(item => item.id === record.id)) {
    throw new Error('A avaliação não foi encontrada no armazenamento local.');
  }
  writeLocalEvaluations(records.map(item => item.id === record.id ? updated : item));
  return { ...updated, cloud: false };
}

export const whatsappNumber = String(config.whatsappNumber || '5571999498939').replace(/\D/g, '');
