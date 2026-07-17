const FIXED_ACTION_EFFECTS = new Set(['exchange', 'sell']);

function isFixedActionCard(card) {
  return FIXED_ACTION_EFFECTS.has(card?.effect);
}

function isDreamAffected(card) {
  if (!card || card._learnedCast || isFixedActionCard(card)) return false;
  const identifier = String(card.instanceId || card.id || '');
  if (!identifier) return false;
  const value = [...identifier].reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return value % 2 === 0;
}

function getDreamCardGroup(card, phase = 'main') {
  if (!card || isFixedActionCard(card)) return null;
  if (phase === 'defense') {
    const canDefend = (card.defense || 0) > 0
      || card.defenseEffect || card.reactiveEffect
      || ['ring', 'defense_item', 'accessory'].includes(card.type);
    if (!canDefend) return card.supportEffect === 'magic_free' ? 'defense:support:magic_free' : null;
    return `defense:${card.type}:${card.attribute || 'none'}`;
  }
  if (['armor', 'ring', 'defense_item'].includes(card.type)) return null;
  if (card.supportEffect) return `support:${card.type}:${card.supportEffect}`;
  if ((card.attack || 0) > 0) return `attack:${card.type}:${card.additive ? 'additive' : 'base'}`;
  if (card.type === 'item') {
    if (card.healHp) return 'item:heal_hp';
    if (card.healMp) return 'item:heal_mp';
    if (card.moneyGain) return 'item:money';
    if (card.cureAilments) return 'item:cure';
    if (card.removeItems) return 'item:remove_items';
    if (card.removeMiracles) return 'item:remove_miracles';
    if (card.setAssistant) return 'item:assistant';
    if (card.randomHp) return 'item:random_hp';
    if (card.mystery) return 'item:mystery';
  }
  if (card.type === 'miracle') {
    if (card.ailmentInflict) return 'miracle:ailment';
    if (card.healHp) return 'miracle:heal_hp';
    if (card.moneyGain) return 'miracle:money';
    if (card.cureAilments) return 'miracle:cure';
    if (card.setAssistant) return 'miracle:assistant';
  }
  if (card.effect) return `effect:${card.type}:${card.effect}`;
  return null;
}

function resolveDreamCard(card, pool, phase = 'main', random = Math.random) {
  if (!isDreamAffected(card)) return { card, affected: false, changed: false, originalCard: card };
  const group = getDreamCardGroup(card, phase);
  const candidates = group
    ? pool.filter(candidate => candidate.id !== card.id && getDreamCardGroup(candidate, phase) === group)
    : [];
  if (!candidates.length || random() < 0.5) {
    return { card, affected: true, changed: false, originalCard: card };
  }
  const candidate = candidates[Math.floor(random() * candidates.length)];
  return {
    card: { ...candidate, instanceId: card.instanceId },
    affected: true,
    changed: true,
    originalCard: card,
  };
}

module.exports = {
  getDreamCardGroup,
  isDreamAffected,
  isFixedActionCard,
  resolveDreamCard,
};
