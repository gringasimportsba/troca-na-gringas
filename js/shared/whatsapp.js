import { config } from '../config.js';

function configuredNumber() {
  const number = String(config.whatsappNumber || '').replace(/\D/g, '');
  if (number.length < 10 || number.length > 15) {
    throw new Error('Número do WhatsApp não configurado corretamente em js/config.js.');
  }
  return number;
}

export function whatsappUrl(message) {
  return `https://wa.me/${configuredNumber()}?text=${encodeURIComponent(String(message || '').trim())}`;
}

export function generalWhatsappUrl() {
  return whatsappUrl('Olá, Gringas! Quero saber mais sobre a troca do meu iPhone.');
}

export function evaluationWhatsappUrl(record, formattedValue) {
  return whatsappUrl(
    `Olá, Gringas! Quero continuar minha troca. Avaliação: ${record.id}. ` +
    `Aparelho: ${record.device.model} ${record.device.storage}. ` +
    `Crédito estimado: ${formattedValue}.`
  );
}

// Contingência: o envio para a nuvem falhou, então a avaliação vai completa pela mensagem.
export function evaluationFallbackWhatsappUrl(state, formattedValue) {
  const battery = typeof state.battery === 'number' ? `${state.battery}%` : 'não informada';
  return whatsappUrl([
    'Olá, Gringas! Fiz a avaliação no site, mas o envio falhou. Seguem os dados:',
    `Nome: ${state.name}`,
    `WhatsApp: ${state.phone}`,
    `Aparelho: ${state.model} ${state.storage} • bateria ${battery}`,
    `Estado: ${state.condition} • Tela: ${state.screen}`,
    `Funções com problema: ${state.issues.join(', ') || 'nenhuma'}`,
    `Manutenção: ${state.repair} • Aviso de peça: ${state.partAlert}`,
    `Garantia Apple: ${state.warranty || 'não informada'}`,
    `Acompanha: ${state.accessories.join(', ') || 'somente o aparelho'}`,
    state.notes ? `Observações: ${state.notes}` : '',
    `Estimativa do site: ${formattedValue}`,
    'Posso enviar as fotos por aqui.',
  ].filter(Boolean).join('\n'));
}

export function upgradeWhatsappUrl(record, formattedTradeValue, formattedDifference) {
  const upgrade = record.upgrade;
  const difference = upgrade.difference === null
    ? ''
    : ` Diferença estimada: ${formattedDifference}.`;
  return whatsappUrl(
    `Olá, Gringas! Quero continuar minha troca. Avaliação: ${record.id}. ` +
    `Crédito estimado: ${formattedTradeValue}. ` +
    `Interesse: ${upgrade.productName} ${upgrade.storage}.${difference}`
  );
}
