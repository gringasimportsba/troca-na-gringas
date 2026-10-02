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
