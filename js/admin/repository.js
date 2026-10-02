import { config } from '../config.js';
import { safeImageUrl } from '../shared/sanitization.js';

export const HISTORY_KEY = 'gringasTrocaEvaluationsV55';
export const statuses = Object.freeze([
  'Nova',
  'Em análise',
  'Cliente contatado',
  'Aguardando aparelho',
  'Aprovado',
  'Troca realizada',
  'Recusado',
  'Cliente desistiu',
]);

const roles = ['owner', 'admin', 'seller', 'viewer'];
const writableRoles = ['owner', 'admin', 'seller'];

function clone(value) {
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function numberOrNull(value) {
  return value === null || value === undefined || value === '' ? null : Number(value);
}

function recordFromRow(row) {
  return {
    id: row.code,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    status: row.status || 'Nova',
    customer: {
      name: row.customer_name || 'Cliente',
      phone: row.customer_phone || '',
      service: row.preferred_service || 'WhatsApp',
    },
    device: {
      model: row.device_model || '',
      storage: row.device_storage || '',
      battery: row.battery ?? row.battery_label ?? 'Não informado',
      condition: row.condition || '',
      screen: row.screen_condition || '',
      issues: Array.isArray(row.issues) ? row.issues : [],
      repair: row.repair_history || '',
      partAlert: row.part_alert || '',
    },
    warranty: {
      status: row.warranty_status || '',
      date: row.warranty_date || '',
      appleCare: row.applecare || '',
    },
    accessories: Array.isArray(row.accessories) ? row.accessories : [],
    notes: row.notes || '',
    photos: row.photos && typeof row.photos === 'object' && !Array.isArray(row.photos) ? row.photos : {},
    calculation: {
      base: Number(row.base_value || 0),
      totalDiscount: Number(row.total_discount || 0),
      estimated: Number(row.estimated_value || 0),
      isManual: Boolean(row.manual_review),
      manual: Array.isArray(row.manual_reasons) ? row.manual_reasons : [],
      lines: Array.isArray(row.calculation_lines) ? row.calculation_lines : [],
    },
    approvedValue: numberOrNull(row.approved_value),
    adjustmentReason: row.adjustment_reason || '',
    upgrade: row.upgrade_product_name ? {
      productId: row.upgrade_product_id || '',
      productName: row.upgrade_product_name,
      storage: row.upgrade_storage || '',
      tradeValue: numberOrNull(row.upgrade_trade_value),
      difference: numberOrNull(row.upgrade_difference),
    } : null,
    cloud: true,
  };
}

function validApprovedValue(value) {
  return value === null || (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 99999999.99 &&
    Number(value.toFixed(2)) === value
  );
}

function hasCloudConfiguration(settings) {
  if (settings?.mode === 'local' || settings?.mode === 'demo') return false;
  try {
    const url = new URL(settings?.supabaseUrl);
    return url.protocol === 'https:' &&
      !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash &&
      typeof settings?.supabaseAnonKey === 'string' && settings.supabaseAnonKey.length > 0 &&
      /^[a-f0-9-]{36}$/i.test(settings?.storeId || '') &&
      /^[A-Za-z0-9_-]+$/.test(settings?.photoBucket || '');
  } catch {
    return false;
  }
}

function localStorageFor(options) {
  if (options.storage) return options.storage;
  try { return globalThis.localStorage; } catch { return null; }
}

export function createAdminRepository(settings = config, options = {}) {
  const configured = hasCloudConfiguration(settings);
  const mode = configured ? 'cloud' : 'local';
  const storage = localStorageFor(options);
  let client = options.client || null;
  let currentMembership = null;

  function cloudClient() {
    if (!configured) throw new Error('Supabase não configurado; operação disponível apenas no modo local.');
    if (client) return client;
    const sdk = options.supabase || globalThis.window?.supabase;
    if (!sdk?.createClient) {
      throw new Error('SDK oficial do Supabase não carregado. Inclua @supabase/supabase-js antes do painel.');
    }
    client = sdk.createClient(settings.supabaseUrl, settings.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
    return client;
  }

  function readLocal() {
    if (!storage) throw new Error('Armazenamento local indisponível.');
    try {
      const value = JSON.parse(storage.getItem(HISTORY_KEY) || '[]');
      if (!Array.isArray(value)) throw new Error('Formato inválido.');
      return value.filter(record => record && typeof record === 'object');
    } catch (error) {
      throw new Error('Não foi possível ler o histórico local.', { cause: error });
    }
  }

  function writeLocal(records) {
    if (!storage) throw new Error('Armazenamento local indisponível.');
    try {
      storage.setItem(HISTORY_KEY, JSON.stringify(records));
      return records;
    } catch (error) {
      throw new Error('Não foi possível salvar o histórico local.', { cause: error });
    }
  }

  async function rawSession() {
    const { data, error } = await cloudClient().auth.getSession();
    if (error) throw error;
    return data?.session || null;
  }

  async function getMembership(userId) {
    if (!configured) return { store_id: settings.storeId || 'local', user_id: 'local', role: 'owner' };
    if (!userId) return null;
    const { data, error } = await cloudClient()
      .from('store_members')
      .select('store_id,user_id,role')
      .eq('store_id', settings.storeId)
      .eq('user_id', userId)
      .limit(1);
    if (error) throw error;
    const membership = Array.isArray(data) ? data[0] : data;
    if (!membership || !roles.includes(membership.role)) return null;
    currentMembership = membership;
    return membership;
  }

  async function session() {
    if (!configured) return { local: true, user: null, membership: await getMembership() };
    const active = await rawSession();
    if (!active?.user?.id) {
      currentMembership = null;
      return null;
    }
    const membership = await getMembership(active.user.id);
    if (!membership) throw new Error('Conta sem vínculo com esta loja. Solicite acesso em store_members.');
    return { ...active, membership };
  }

  async function requireMembership(write = false) {
    const active = await session();
    if (!active) throw new Error('Entre com sua conta administrativa.');
    if (write && !writableRoles.includes(active.membership.role)) {
      throw new Error('Sua função permite somente leitura.');
    }
    return active.membership;
  }

  async function signIn(email, password) {
    if (!configured) return session();
    const { data, error } = await cloudClient().auth.signInWithPassword({ email, password });
    if (error) throw error;
    try {
      const membership = await getMembership(data?.user?.id || data?.session?.user?.id);
      if (!membership) throw new Error('Conta sem vínculo com esta loja. Solicite acesso em store_members.');
      return { ...data, membership };
    } catch (error) {
      await cloudClient().auth.signOut().catch(() => {});
      currentMembership = null;
      throw error;
    }
  }

  async function signOut() {
    currentMembership = null;
    if (!configured) return;
    const { error } = await cloudClient().auth.signOut();
    if (error) throw error;
  }

  async function getEvaluations() {
    if (!configured) return clone(readLocal());
    await requireMembership();
    const { data, error } = await cloudClient()
      .from('evaluations')
      .select('*')
      .eq('store_id', settings.storeId)
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error('Resposta inválida de avaliações.');
    return data.map(recordFromRow);
  }

  async function updateEvaluationOps(record) {
    const approvedValue = record.approvedValue === '' ? null : record.approvedValue;
    const reason = String(record.adjustmentReason || '');
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(String(record.id || '')) ||
        !statuses.includes(record.status) ||
        !validApprovedValue(approvedValue) ||
        new TextEncoder().encode(reason).length > 4000) {
      throw new Error('Alteração operacional inválida. Revise status, valor e motivo.');
    }

    if (!configured) {
      const records = readLocal();
      const index = records.findIndex(item => String(item.id) === String(record.id));
      if (index < 0) throw new Error('Avaliação não encontrada no histórico local.');
      records[index] = {
        ...records[index],
        status: record.status,
        approvedValue,
        adjustmentReason: reason,
        updatedAt: new Date().toISOString(),
      };
      writeLocal(records);
      return clone(records[index]);
    }

    await requireMembership(true);
    const { data, error } = await cloudClient()
      .from('evaluations')
      .update({
        status: record.status,
        approved_value: approvedValue,
        adjustment_reason: reason,
        updated_at: new Date().toISOString(),
      })
      .eq('store_id', settings.storeId)
      .eq('code', record.id)
      .select('*')
      .limit(1);
    if (error) throw error;
    const updated = Array.isArray(data) ? data[0] : data;
    if (!updated || updated.code !== record.id) throw new Error('O banco não confirmou a alteração.');
    return recordFromRow(updated);
  }

  async function signedPhotoUrl(path, expiresIn = 300) {
    if (!configured) return safeImageUrl(typeof path === 'object' ? path?.data || path?.url : path, settings);
    await requireMembership();
    const parts = typeof path === 'string' ? path.split('/') : [];
    if (parts.length !== 3 || parts[0] !== settings.storeId ||
        !/^[A-Za-z0-9_-]{1,80}$/.test(parts[1]) ||
        !/^[A-Za-z0-9_-]{1,100}\.(?:jpe?g|png|webp)$/i.test(parts[2])) return '';
    const seconds = Math.min(3600, Math.max(30, Number(expiresIn) || 300));
    const { data, error } = await cloudClient().storage.from(settings.photoBucket).createSignedUrl(path, seconds);
    if (error) throw error;
    const signed = data?.signedUrl || data?.signedURL || '';
    if (!safeImageUrl(signed, settings)) throw new Error('O armazenamento retornou uma URL de foto inválida.');
    return signed;
  }

  async function signPhotos(record) {
    const copy = clone(record);
    const entries = Object.entries(record?.photos || {}).slice(0, 6);
    copy.photos = {};
    for (const [key, value] of entries) {
      const signed = await signedPhotoUrl(value);
      if (signed) copy.photos[key] = signed;
    }
    return copy;
  }

  function onAuthStateChange(callback) {
    if (!configured) return () => {};
    const { data } = cloudClient().auth.onAuthStateChange((event, activeSession) => {
      if (event === 'SIGNED_OUT' || !activeSession) currentMembership = null;
      callback(event, activeSession);
    });
    return () => data?.subscription?.unsubscribe();
  }

  return {
    config: settings,
    configured,
    mode,
    get membership() { return currentMembership; },
    session,
    getMembership,
    signIn,
    signOut,
    getEvaluations,
    updateEvaluationOps,
    signedPhotoUrl,
    signPhotos,
    onAuthStateChange,
  };
}

const repository = createAdminRepository();
export default repository;
