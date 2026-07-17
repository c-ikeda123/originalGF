const DEFENSE_TYPES = new Set(['armor', 'ring', 'defense_item', 'accessory', 'miracle']);
const DISEASES = ['cold', 'fever', 'hell', 'heaven'];

function validateCardPlay(cards, phase, ailments = []) {
  if (!cards.length) return { valid: false, message: 'カードを選択してください。' };

  if (phase === 'defense') {
    if (ailments.includes('flash') && cards.length > 1) {
      return { valid: false, message: '閃光状態では防御神器を1つしか使えません。' };
    }
    if (!cards.every(card => DEFENSE_TYPES.has(card.type) && (card.type !== 'miracle' || card.defense > 0))) {
      return { valid: false, message: '防御中に使用できる神器を選んでください。' };
    }
    return { valid: true };
  }

  if (phase !== 'main') return { valid: false, message: '現在は神器を使用できません。' };

  const isSell = cards.length === 2 && cards.some(card => card.effect === 'sell');
  if (isSell) return { valid: true };
  if (cards.some(card => ['armor', 'ring', 'defense_item'].includes(card.type))) {
    return { valid: false, message: '防具は攻撃を受けた防御時にだけ使用できます。' };
  }
  if (cards.length === 1) return { valid: true };

  const combinationTypes = new Set(['weapon', 'accessory', 'miracle']);
  const hasAttack = cards.some(card => card.attack > 0);
  return hasAttack && cards.every(card => combinationTypes.has(card.type))
    ? { valid: true }
    : { valid: false, message: 'この組み合わせでは使用できません。' };
}

function rollAttack(card, defenderAilments = [], random = Math.random) {
  if (card.target === 'all' && defenderAilments.includes('darkcloud')) {
    return { hit: true, outcome: 'unavoidable', roll: null };
  }
  const roll = random() * 100;
  return { hit: roll < (card.hitRate ?? 100), outcome: roll < (card.hitRate ?? 100) ? 'hit' : 'evade', roll };
}

function applyAilment(player, ailment) {
  if (!ailment) return null;
  if (DISEASES.includes(ailment)) {
    const currentIndex = DISEASES.findIndex(value => player.ailments.includes(value));
    const incomingIndex = DISEASES.indexOf(ailment);
    const nextIndex = currentIndex < 0 ? incomingIndex : Math.min(DISEASES.length - 1, Math.max(incomingIndex, currentIndex + 1));
    player.ailments = player.ailments.filter(value => !DISEASES.includes(value));
    player.ailments.push(DISEASES[nextIndex]);
    return DISEASES[nextIndex];
  }
  if (!player.ailments.includes(ailment)) player.ailments.push(ailment);
  return ailment;
}

function cureAilments(player, ailments) {
  const cured = ailments === 'all' ? [...player.ailments] : player.ailments.filter(value => ailments.includes(value));
  player.ailments = ailments === 'all' ? [] : player.ailments.filter(value => !ailments.includes(value));
  return cured;
}

function processEndOfTurnAilments(player, random = Math.random) {
  const result = { hpChange: 0, progressedTo: null, fatal: false };
  const diseaseIndex = DISEASES.findIndex(value => player.ailments.includes(value));
  if (diseaseIndex < 0 || player.hp <= 0) return result;

  const hpChanges = [-1, -2, -5, 5];
  result.hpChange = hpChanges[diseaseIndex];
  player.hp += result.hpChange;

  if (random() < 0.05) {
    if (diseaseIndex === DISEASES.length - 1) {
      player.hp = 0;
      result.fatal = true;
    } else {
      player.ailments = player.ailments.filter(value => !DISEASES.includes(value));
      result.progressedTo = DISEASES[diseaseIndex + 1];
      player.ailments.push(result.progressedTo);
    }
  }
  return result;
}

module.exports = {
  applyAilment,
  cureAilments,
  processEndOfTurnAilments,
  rollAttack,
  validateCardPlay,
};
