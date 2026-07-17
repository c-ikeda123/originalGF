const FIXED_ACTION_EFFECTS = new Set(['exchange', 'sell']);

function isDreamAffected(card) {
  if (!card || card._learnedCast || FIXED_ACTION_EFFECTS.has(card.effect)) return false;
  const identifier = String(card.instanceId || card.id || '');
  if (!identifier) return false;
  const value = [...identifier].reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return value % 2 === 0;
}

export function isDreamAffectedCard(card, hasDream) {
  return Boolean(hasDream && isDreamAffected(card));
}

export function getDreamDisplayedCard(hand, index) {
  return hand[index];
}
