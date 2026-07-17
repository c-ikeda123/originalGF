const FIXED_ACTION_EFFECTS = new Set(['exchange', 'sell']);

export function isFixedActionCard(card) {
  return FIXED_ACTION_EFFECTS.has(card?.effect);
}

export function getDreamDisplayedCard(hand, index, hasDream) {
  const realCard = hand[index];
  if (!hasDream || !realCard || isFixedActionCard(realCard) || hand.length < 2) return realCard;

  const value = [...String(realCard.instanceId || realCard.id)]
    .reduce((sum, character) => sum + character.charCodeAt(0), 0);
  if (value % 2 !== 0) return realCard;

  for (let offset = 1; offset < hand.length; offset += 1) {
    const decoy = hand[(index + offset) % hand.length];
    if (!isFixedActionCard(decoy)) return { ...decoy, instanceId: realCard.instanceId };
  }
  return realCard;
}
