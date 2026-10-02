import { config } from '../config.js';
import { calculate, calculateUpgrade } from './calculator.js';

const HISTORY_KEY = 'gringasTrocaEvaluationsV55';
const MAX_LOCAL_RECORDS = 150;
const MAX_PHOTO_BYTES = 6 * 1024 * 1024;
const PHOTO_TYPES = Object.freeze(['image/jpeg', 'image/png', 'image/webp']);
const PHOTO_KEYS = Object.freeze(['front', 'back', 'left', 'right', 'detail']);

let cloudClient;

function hasCloudConfiguration() {
  return config.mode !== 'local' && config.mode !== 'demo' && Boolean(
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

async function ensureSubmissionSession(client) {
  const { data, error } = await client.auth.getSession();
  if (error) throw new Error('Não foi possível verificar a sessão de envio.', { cause: error });
  if (data?.session?.user?.id) return data.session;

  const { data: signed, error: signInError } = await client.auth.signInAnonymously();
  if (signInError || !signed?.session?.user?.id) {
    throw new Error(
      'Não foi possível iniciar o envio seguro. Confirme que o login anônimo está habilitado no Supabase e tente novamente.',
      { cause: signInError }
    );
  }
  return signed.session;
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

function updateRowFromRecord(record, photoPaths) {
  const { code, store_id, ...payload } = rowFromRecord(record, photoPaths);
  return payload;
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

async function uploadPhoto(client, code, key, value) {
  const blob = await dataUrlToPhoto(value);
  const filename = `${key}-${globalThis.crypto.randomUUID()}.${photoExtension(blob.type)}`;
  const path = `${config.storeId}/${code}/${filename}`;
  const { error } = await client.storage.from(config.photoBucket).upload(path, blob, {
    cacheControl: '3600',
    contentType: blob.type,
    upsert: false,
  });
  if (error) throw error;
  return path;
}

async function removePhotos(client, paths) {
  const uniquePaths = [...new Set((paths || []).filter(Boolean))];
  if (!uniquePaths.length) return null;
  try {
    const { error } = await client.storage.from(config.photoBucket).remove(uniquePaths);
    return error || null;
  } catch (error) {
    return error;
  }
}

async function preparePhotos(client, record, previous = null) {
  const paths = {};
  const uploaded = [];
  try {
    for (const key of PHOTO_KEYS) {
      const value = record.photos?.[key];
      if (!value) continue;

      const previousPath = previous?.photos?.[key];
      const previousPreview = previous?.photoPreviews?.[key];
      if (previousPath && (value === previousPath || value === previousPreview)) {
        paths[key] = previousPath;
        continue;
      }

      const path = await uploadPhoto(client, record.id, key, value);
      uploaded.push(path);
      paths[key] = path;
    }

    const retained = new Set(Object.values(paths));
    const obsolete = Object.values(previous?.photos || {}).filter(path => !retained.has(path));
    return { paths, uploaded, obsolete };
  } catch (cause) {
    await removePhotos(client, uploaded);
    throw new Error('Não foi possível enviar as fotos com segurança. Tente novamente.', { cause });
  }
}

function cloudError(message, cause) {
  if (String(cause?.message || '').includes('submission rate limit exceeded')) {
    return new Error('Muitas avaliações foram enviadas em pouco tempo. Aguarde 15 minutos e tente novamente.', { cause });
  }
  const detail = cause?.message ? ` ${cause.message}` : '';
  return new Error(`${message}${detail}`, { cause });
}

async function updateCloudRecord(client, record, paths) {
  const { data, error } = await client
    .from('evaluations')
    .update(updateRowFromRecord(record, paths))
    .eq('store_id', config.storeId)
    .eq('code', record.id)
    .select('code')
    .maybeSingle();
  if (error) throw error;
  if (!data?.code) {
    throw new Error('Esta avaliação não está mais disponível para edição. Atualize o atendimento com a equipe.');
  }
}

async function createCloud(record, client) {
  const { error: insertError } = await client.from('evaluations').insert(rowFromRecord(record, {}));
  if (insertError) throw cloudError('Não foi possível iniciar a avaliação na nuvem.', insertError);

  let prepared = { paths: {}, uploaded: [], obsolete: [] };
  try {
    prepared = await preparePhotos(client, record);
    await updateCloudRecord(client, record, prepared.paths);
  } catch (cause) {
    await removePhotos(client, prepared.uploaded);
    await client.from('evaluations').delete()
      .eq('store_id', config.storeId)
      .eq('code', record.id);
    throw cloudError('Não foi possível concluir a avaliação na nuvem.', cause);
  }

  return {
    ...record,
    photos: prepared.paths,
    photoPreviews: { ...record.photos },
    cloud: true,
  };
}

async function updateCloud(record, previous, client) {
  const prepared = await preparePhotos(client, record, previous);
  try {
    await updateCloudRecord(client, record, prepared.paths);
  } catch (cause) {
    await removePhotos(client, prepared.uploaded);
    throw cloudError('Não foi possível atualizar a avaliação na nuvem.', cause);
  }

  const cleanupError = await removePhotos(client, prepared.obsolete);
  return {
    ...record,
    photos: prepared.paths,
    photoPreviews: { ...record.photos },
    photoCleanupWarning: Boolean(cleanupError),
    cloud: true,
  };
}

function recordForLocalStorage(record) {
  const { photoPreviews, photoCleanupWarning, photoStorageWarning, ...persisted } = record;
  return { ...persisted, photos: {}, cloud: false };
}

function saveLocal(record) {
  const records = readLocalEvaluations();
  const persisted = recordForLocalStorage(record);
  writeLocalEvaluations([persisted, ...records.filter(item => item.id !== persisted.id)]);
  return {
    ...record,
    photoPreviews: { ...record.photos },
    photoStorageWarning: Object.keys(record.photos || {}).length > 0,
    cloud: false,
  };
}

export function cloudConfigured() {
  return hasCloudConfiguration();
}

export async function saveEvaluation(state, calculation = calculate(state), previousRecord = null) {
  if (hasCloudConfiguration()) {
    const client = getCloudClient();
    await ensureSubmissionSession(client);
    const previous = previousRecord?.cloud && previousRecord.id === state.evaluationId
      ? previousRecord
      : null;
    if (state.evaluationId && !previous) {
      throw new Error('A sessão de edição desta avaliação foi perdida. Recomece o formulário para criar uma nova avaliação.');
    }
    const record = createRecord(state, calculation, previous);
    return previous ? updateCloud(record, previous, client) : createCloud(record, client);
  }

  const records = readLocalEvaluations();
  const previous = previousRecord?.id === state.evaluationId
    ? previousRecord
    : records.find(item => item.id === state.evaluationId) || null;
  return saveLocal(createRecord(state, calculation, previous));
}

export async function saveUpgrade(record, productId) {
  const upgrade = {
    ...calculateUpgrade(productId, record.calculation.estimated),
    selectedAt: new Date().toISOString(),
  };
  const updated = { ...record, upgrade, updatedAt: new Date().toISOString() };

  if (hasCloudConfiguration()) {
    // O interesse segue no contato explícito por WhatsApp; o cliente não recebe
    // permissão para alterar campos operacionais do painel.
    return { ...updated, cloud: true, upgrade: { ...upgrade, synced: false } };
  }

  const records = readLocalEvaluations();
  if (!records.some(item => item.id === record.id)) {
    throw new Error('A avaliação não foi encontrada no armazenamento local.');
  }
  const persisted = recordForLocalStorage(updated);
  writeLocalEvaluations(records.map(item => item.id === record.id ? persisted : item));
  return { ...updated, cloud: false };
}
