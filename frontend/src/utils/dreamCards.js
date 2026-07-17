import dreamRules from '../../../shared/dreamRules.cjs';

const { isDreamAffected } = dreamRules;

export function isDreamAffectedCard(card, hasDream) {
  return Boolean(hasDream && isDreamAffected(card));
}

export function getDreamDisplayedCard(hand, index) {
  return hand[index];
}
