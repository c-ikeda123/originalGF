const COMBINATION_TYPES = new Set(['weapon', 'accessory', 'miracle', 'item']);
const DEFENSE_TYPES = new Set(['ring', 'defense_item', 'accessory']);

function isDefenseCard(card) {
  return Boolean(card && (
    (card.defense || 0) > 0
    || card.defenseEffect
    || card.reactiveEffect
    || DEFENSE_TYPES.has(card.type)
  ));
}

export function canAddCardToSelection(selectedCards, nextCard, phase, hasFlash = false) {
  if (!nextCard || selectedCards.length === 0) return Boolean(nextCard);
  const cards = [...selectedCards, nextCard];

  if (phase === 'defense') {
    if (hasFlash && cards.length > 1) return false;
    return cards.some(isDefenseCard)
      && cards.every(card => isDefenseCard(card) || card.supportEffect === 'magic_free');
  }
  if (phase !== 'main') return false;

  const sellCards = cards.filter(card => card.effect === 'sell');
  if (sellCards.length > 0) return cards.length === 2 && sellCards.length === 1;
  if (cards.some(card => card.type === 'trade' || ['armor', 'ring', 'defense_item'].includes(card.type))) return false;
  if (!cards.every(card => COMBINATION_TYPES.has(card.type))) return false;

  const baseAttacks = cards.filter(card => card.attack > 0 && !card.additive && card.supportEffect !== 'magic_free');
  const actionMiracles = cards.filter(card => card.type === 'miracle' && card.attack <= 0 && !card.additive);
  const attackCombination = baseAttacks.length <= 1
    && actionMiracles.length === 0
    && cards.every(card => card.attack > 0 || card.additive || card.supportEffect === 'magic_free')
    && cards.every(card => card.type !== 'item' || ['magic_free', 'increase_attack'].includes(card.supportEffect));
  const magicFreeAction = actionMiracles.length === 1
    && cards.every(card => card === actionMiracles[0] || card.supportEffect === 'magic_free');
  return attackCombination || magicFreeAction;
}

export function getNextCardSelection(selectedIndices, nextIndex, hand, phase, hasFlash = false) {
  if (selectedIndices.includes(nextIndex)) {
    return selectedIndices.filter(index => index !== nextIndex);
  }

  const selectedCards = selectedIndices.map(index => hand[index]).filter(Boolean);
  if (!canAddCardToSelection(selectedCards, hand[nextIndex], phase, hasFlash)) {
    return [nextIndex];
  }
  return [...selectedIndices, nextIndex].sort((a, b) => a - b);
}

export function getDefenseTotal(cards) {
  return cards.reduce((total, card) => total + Math.max(0, Number(card?.defense) || 0), 0);
}
