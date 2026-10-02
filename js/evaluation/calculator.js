const deviceEntries = [
  ['iPhone 11', 900, ['64 GB', '128 GB', '256 GB']],
  ['iPhone 11 Pro', 1150, ['64 GB', '256 GB', '512 GB']],
  ['iPhone 11 Pro Max', 1350, ['64 GB', '256 GB', '512 GB']],
  ['iPhone 12', 1250, ['64 GB', '128 GB', '256 GB']],
  ['iPhone 12 Pro', 1550, ['128 GB', '256 GB', '512 GB']],
  ['iPhone 12 Pro Max', 1800, ['128 GB', '256 GB', '512 GB']],
  ['iPhone 13', 1750, ['128 GB', '256 GB', '512 GB']],
  ['iPhone 13 Pro', 2200, ['128 GB', '256 GB', '512 GB', '1 TB']],
  ['iPhone 13 Pro Max', 2500, ['128 GB', '256 GB', '512 GB', '1 TB']],
  ['iPhone 14', 2250, ['128 GB', '256 GB', '512 GB']],
  ['iPhone 14 Pro', 2850, ['128 GB', '256 GB', '512 GB', '1 TB']],
  ['iPhone 14 Pro Max', 3250, ['128 GB', '256 GB', '512 GB', '1 TB']],
  ['iPhone 15', 2800, ['128 GB', '256 GB', '512 GB']],
  ['iPhone 15 Pro', 3650, ['128 GB', '256 GB', '512 GB', '1 TB']],
  ['iPhone 15 Pro Max', 4250, ['256 GB', '512 GB', '1 TB']],
  ['iPhone 16', 3500, ['128 GB', '256 GB', '512 GB']],
  ['iPhone 16 Pro', 4550, ['128 GB', '256 GB', '512 GB', '1 TB']],
  ['iPhone 16 Pro Max', 5350, ['256 GB', '512 GB', '1 TB']],
  ['iPhone 17', 4300, ['256 GB', '512 GB']],
  ['iPhone 17 Pro', 5700, ['256 GB', '512 GB', '1 TB']],
  ['iPhone 17 Pro Max', 6500, ['256 GB', '512 GB', '1 TB', '2 TB']],
  ['iPhone 18 Pro', 6900, ['256 GB', '512 GB', '1 TB']],
  ['iPhone 18 Pro Max', 7800, ['256 GB', '512 GB', '1 TB', '2 TB']],
];

const models = Object.freeze(deviceEntries.map(([model]) => model));
const storageByModel = Object.freeze(Object.fromEntries(
  deviceEntries.map(([model, , storage]) => [model, Object.freeze([...storage])]),
));
const baseByModel = Object.freeze(Object.fromEntries(
  deviceEntries.map(([model, price]) => [model, price]),
));
const upgradeProducts = Object.freeze([
  Object.freeze({ id: '18pro', name: 'iPhone 18 Pro', storage: '256GB', price: 8499 }),
  Object.freeze({ id: '18promax', name: 'iPhone 18 Pro Max', storage: '256GB', price: 9499 }),
  Object.freeze({ id: 'undecided', name: 'Ainda não decidi', storage: '', price: null }),
]);

export const catalog = Object.freeze({
  models,
  storageByModel,
  baseByModel,
  upgradeProducts,
});

export const rules = Object.freeze({
  storageBonus: Object.freeze({ '64 GB': 0, '128 GB': 100, '256 GB': 250, '512 GB': 500, '1 TB': 800, '2 TB': 1200 }),
  conditionDiscount: Object.freeze({ Excelente: 0, Bom: 100, Regular: 300, Danificado: 0 }),
  screenDiscount: Object.freeze({
    'Sim, perfeitamente': 0,
    'Possui riscos/manchas': 180,
    'Está trincada': 0,
    'Possui problema no touch': 0,
    'Tela já foi substituída': 220,
  }),
  issueDiscount: Object.freeze({
    'Face ID / Touch ID': 0,
    'Câmeras': 350,
    'Alto-falantes': 160,
    'Microfones': 160,
    'Botões': 120,
    'Wi‑Fi / Bluetooth': 300,
    Carregamento: 250,
  }),
  manualReasons: Object.freeze({
    condition: Object.freeze(['Danificado']),
    screen: Object.freeze(['Está trincada', 'Possui problema no touch']),
    issues: Object.freeze(['Face ID / Touch ID']),
  }),
  // Faixas avaliadas em ordem: vale a primeira cuja bateria mínima é atingida.
  batteryDiscount: Object.freeze([
    Object.freeze({ min: 90, amount: 0 }),
    Object.freeze({ min: 85, amount: 100 }),
    Object.freeze({ min: 80, amount: 220 }),
    Object.freeze({ min: 0, amount: 400 }),
  ]),
  repairDiscount: 100,
  maximumDiscountRate: 0.30,
});

function batteryPenalty(value) {
  if (value === 'Não informado') {
    return { amount: 0, label: 'Bateria não informada', manual: true };
  }
  if (!Number.isInteger(value) || value < 50 || value > 100) {
    throw new Error('Saúde da bateria inválida.');
  }
  const amount = rules.batteryDiscount.find(tier => value >= tier.min).amount;
  return { amount, label: `Bateria ${value}%`, manual: false };
}

export function calculate(state, prices = catalog.baseByModel) {
  const basePrice = Number(prices[state.model]);
  const storageBonus = rules.storageBonus[state.storage];
  if (!Number.isFinite(basePrice) || storageBonus === undefined) {
    throw new Error('Modelo ou capacidade inválidos para o cálculo.');
  }

  const base = basePrice + storageBonus;
  let totalDiscount = 0;
  const lines = [];
  const reasons = [];
  const addDiscount = (label, amount = 0) => {
    if (amount > 0) {
      totalDiscount += amount;
      lines.push({ label, amount });
    }
  };

  const battery = batteryPenalty(state.battery);
  addDiscount(battery.label, battery.amount);
  if (battery.manual) reasons.push('Saúde da bateria não informada');

  addDiscount(`Estado físico: ${state.condition}`, rules.conditionDiscount[state.condition]);
  if (rules.manualReasons.condition.includes(state.condition)) reasons.push('Estado físico danificado');

  addDiscount(`Tela: ${state.screen}`, rules.screenDiscount[state.screen]);
  if (rules.manualReasons.screen.includes(state.screen)) reasons.push(`Tela: ${state.screen}`);

  for (const issue of state.issues) {
    if (!Object.hasOwn(rules.issueDiscount, issue)) throw new Error('Função informada inválida.');
    addDiscount(`Função: ${issue}`, rules.issueDiscount[issue]);
    if (rules.manualReasons.issues.includes(issue)) reasons.push(`${issue} com problema`);
  }

  if (state.repair === 'Sim') addDiscount('Histórico de manutenção', rules.repairDiscount);
  if (state.partAlert === 'Sim') reasons.push('Aviso de peça no sistema');
  if (state.partAlert === 'Não sei') reasons.push('Alerta de peça precisa ser verificado');

  const cap = Math.round(base * rules.maximumDiscountRate);
  if (totalDiscount > cap) reasons.push(`Descontos ultrapassam ${Math.round(rules.maximumDiscountRate * 100)}% do valor-base`);
  const estimated = Math.max(0, base - Math.min(totalDiscount, cap));
  const manual = [...new Set(reasons)];

  return { base, totalDiscount, cap, estimated, manual, lines, isManual: manual.length > 0 };
}

export function calculateUpgrade(productId, tradeValue) {
  const product = catalog.upgradeProducts.find(item => item.id === productId);
  if (!product) throw new Error('Escolha um upgrade válido.');
  if (!Number.isFinite(tradeValue) || tradeValue < 0) throw new Error('Crédito de troca inválido.');

  const difference = product.price === null ? null : Math.max(0, product.price - tradeValue);
  return {
    productId: product.id,
    productName: product.name,
    storage: product.storage,
    price: product.price,
    tradeValue,
    difference,
    creditOver: product.price === null ? null : Math.max(0, tradeValue - product.price),
    installment: difference === null ? null : difference / 12,
  };
}
