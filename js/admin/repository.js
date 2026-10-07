import { config } from '../config.js';
import { safeImageUrl } from '../shared/sanitization.js';
import { catalog, rules as defaultRules, defaultUpgradeProducts } from '../evaluation/calculator.js';

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
// Preços, regras e produtos: o banco só aceita escrita de owner/admin.
export const pricingRoles = Object.freeze(['owner', 'admin']);

// Modo local (desenvolvimento): a configuração comercial fica neste navegador.
const LOCAL_PRICES_KEY = 'gringasTrocaLocalPrices';
const LOCAL_RULES_KEY = 'gringasTrocaLocalRules';
const LOCAL_PRODUCTS_KEY = 'gringasTrocaLocalProducts';

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

function validAmount(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1000000 &&
    Number(value.toFixed(2)) === value;
}

// Mesmas verificações do trigger validate_pricing_rules (supabase/setup.sql).
function validateRules(value) {
  const sections = ['storageBonus', 'conditionDiscount', 'screenDiscount', 'issueDiscount'];
  const tiers = value?.batteryDiscount;
  const ok = value && typeof value === 'object' &&
    sections.every(section => value[section] && typeof value[section] === 'object' &&
      Object.values(value[section]).every(validAmount)) &&
    Array.isArray(tiers) && tiers.length > 0 &&
    tiers.every((tier, index) => Number.isInteger(tier?.min) && tier.min >= 0 && tier.min <= 100 &&
      validAmount(tier.amount) && (index === 0 || tier.min < tiers[index - 1].min)) &&
    tiers.at(-1).min === 0 &&
    validAmount(value.repairDiscount) &&
    typeof value.maximumDiscountRate === 'number' && value.maximumDiscountRate >= 0 && value.maximumDiscountRate <= 1 &&
    value.manualReasons && typeof value.manualReasons === 'object';
  if (!ok) throw new Error('Regras inválidas. Use valores entre R$ 0 e R$ 1.000.000 e faixas de bateria em ordem decrescente terminando em 0%.');
}

function validateProduct(product) {
  if (!/^[a-z0-9-]{1,40}$/.test(product?.id || '') || product.id === 'undecided' ||
      typeof product.name !== 'string' || !product.name.trim() || product.name.length > 80 ||
      typeof product.storage !== 'string' || product.storage.length > 40 ||
      !validAmount(product.price) || typeof product.active !== 'boolean') {
    throw new Error('Produto inválido. Informe nome, capacidade (até 40 caracteres) e preço entre R$ 0 e R$ 1.000.000.');
  }
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

  // No modo cloud o painel nunca grava histórico local; este apaga o que restou
  // de versões anteriores (nomes e telefones de clientes) ao encerrar a sessão.
  function clearLocalHistory() {
    try { storage?.removeItem(HISTORY_KEY); } catch { /* armazenamento indisponível */ }
  }

  async function signOut() {
    currentMembership = null;
    if (!configured) return;
    clearLocalHistory();
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

  async function getStoragePrices() {
    if (!configured) return [];
    await requireMembership();
    const { data, error } = await cloudClient()
      .from('device_storage_prices')
      .select('model,storage,bonus')
      .eq('store_id', settings.storeId);
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  }

  async function saveStoragePrice(model, storage, bonus) {
    const value = Number(bonus);
    if (!model || !storage || bonus === '' || bonus === null || !Number.isFinite(value) ||
        value < 0 || value > 1000000 || Number(value.toFixed(2)) !== value) {
      throw new Error('Valor inválido: use até duas casas decimais.');
    }
    if (!configured) throw new Error('Preços só podem ser salvos com o Supabase configurado.');
    const membership = await requireMembership(true);
    if (!['owner', 'admin'].includes(membership.role)) {
      throw new Error('Somente owner ou admin altera preços.');
    }
    const { error } = await cloudClient()
      .from('device_storage_prices')
      .upsert(
        { store_id: settings.storeId, model, storage, bonus: value, updated_at: new Date().toISOString() },
        { onConflict: 'store_id,model,storage' }
      );
    if (error) throw error;
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

  function readLocalJson(key, fallback) {
    try {
      const value = JSON.parse(storage?.getItem(key) || 'null');
      return value ?? clone(fallback);
    } catch {
      return clone(fallback);
    }
  }

  function writeLocalJson(key, value) {
    if (!storage) throw new Error('Armazenamento local indisponível.');
    storage.setItem(key, JSON.stringify(value));
  }

  async function requirePricingWrite() {
    const membership = await requireMembership();
    if (!pricingRoles.includes(membership.role)) {
      throw new Error('Somente owner ou admin podem alterar preços, regras e produtos.');
    }
  }

  // Modelos com valor-base e regras do cálculo (pricing_models + pricing_rules).
  async function getPricing() {
    if (!configured) {
      const prices = readLocalJson(LOCAL_PRICES_KEY, {});
      return {
        models: catalog.models.map((model, index) => ({
          model,
          basePrice: Number(prices[model] ?? catalog.baseByModel[model]),
          storages: [...catalog.storageByModel[model]],
          sortOrder: index + 1,
        })),
        rules: readLocalJson(LOCAL_RULES_KEY, defaultRules),
      };
    }
    await requireMembership();
    const [models, rules] = await Promise.all([
      cloudClient().from('pricing_models').select('model,base_price,storages,sort_order')
        .eq('store_id', settings.storeId).order('sort_order'),
      cloudClient().from('pricing_rules').select('rules').eq('store_id', settings.storeId).limit(1),
    ]);
    if (models.error) throw models.error;
    if (rules.error) throw rules.error;
    const rulesRow = Array.isArray(rules.data) ? rules.data[0] : rules.data;
    if (!Array.isArray(models.data) || !rulesRow?.rules) {
      throw new Error('Tabela de preços não encontrada. Rode o supabase/setup.sql atualizado.');
    }
    return {
      models: models.data.map(row => ({
        model: row.model,
        basePrice: Number(row.base_price),
        storages: Array.isArray(row.storages) ? row.storages : [],
        sortOrder: row.sort_order,
      })),
      rules: rulesRow.rules,
    };
  }

  // changes: [{ model, basePrice }] — só os modelos alterados.
  async function saveModelPrices(changes) {
    if (!Array.isArray(changes) || changes.some(item => typeof item?.model !== 'string' || !validAmount(item.basePrice))) {
      throw new Error('Preço inválido. Use valores entre R$ 0 e R$ 1.000.000.');
    }
    if (!configured) {
      const prices = readLocalJson(LOCAL_PRICES_KEY, {});
      for (const { model, basePrice } of changes) prices[model] = basePrice;
      writeLocalJson(LOCAL_PRICES_KEY, prices);
      return;
    }
    await requirePricingWrite();
    for (const { model, basePrice } of changes) {
      const { data, error } = await cloudClient().from('pricing_models')
        .update({ base_price: basePrice })
        .eq('store_id', settings.storeId).eq('model', model)
        .select('model');
      if (error) throw error;
      if (!data?.length) throw new Error(`O banco não confirmou o preço de ${model}.`);
    }
  }

  async function saveRules(value) {
    validateRules(value);
    if (!configured) {
      writeLocalJson(LOCAL_RULES_KEY, value);
      return;
    }
    await requirePricingWrite();
    const { data, error } = await cloudClient().from('pricing_rules')
      .update({ rules: value })
      .eq('store_id', settings.storeId)
      .select('store_id');
    if (error) throw error;
    if (!data?.length) throw new Error('O banco não confirmou as regras.');
  }

  async function getUpgradeProducts() {
    if (!configured) return readLocalJson(LOCAL_PRODUCTS_KEY, defaultUpgradeProducts.map((product, index) => ({ ...product, active: true, sortOrder: index + 1 })));
    await requireMembership();
    const { data, error } = await cloudClient().from('upgrade_products')
      .select('id,name,storage,price,active,sort_order')
      .eq('store_id', settings.storeId).order('sort_order');
    if (error) throw error;
    return (data || []).map(row => ({
      id: row.id, name: row.name, storage: row.storage, price: Number(row.price),
      active: Boolean(row.active), sortOrder: row.sort_order,
    }));
  }

  // Grava a lista completa: atualiza/insere os presentes e apaga os removidos.
  async function saveUpgradeProducts(products) {
    if (!Array.isArray(products) || products.length > 30) throw new Error('Lista de produtos inválida.');
    products.forEach(validateProduct);
    if (new Set(products.map(product => product.id)).size !== products.length) {
      throw new Error('Há produtos repetidos na lista.');
    }
    const list = products.map((product, index) => ({ ...product, name: product.name.trim(), sortOrder: index + 1 }));
    if (!configured) {
      writeLocalJson(LOCAL_PRODUCTS_KEY, list);
      return;
    }
    await requirePricingWrite();
    const { data: current, error: readError } = await cloudClient().from('upgrade_products')
      .select('id').eq('store_id', settings.storeId);
    if (readError) throw readError;
    if (list.length) {
      const { error } = await cloudClient().from('upgrade_products').upsert(list.map(product => ({
        store_id: settings.storeId, id: product.id, name: product.name, storage: product.storage,
        price: product.price, active: product.active, sort_order: product.sortOrder,
      })), { onConflict: 'store_id,id' });
      if (error) throw error;
    }
    const removed = (current || []).map(row => row.id).filter(id => !list.some(product => product.id === id));
    if (removed.length) {
      const { error } = await cloudClient().from('upgrade_products').delete()
        .eq('store_id', settings.storeId).in('id', removed);
      if (error) throw error;
    }
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
    getStoragePrices,
    saveStoragePrice,
    signedPhotoUrl,
    signPhotos,
    getPricing,
    saveModelPrices,
    saveRules,
    getUpgradeProducts,
    saveUpgradeProducts,
    onAuthStateChange,
  };
}

const repository = createAdminRepository();
export default repository;