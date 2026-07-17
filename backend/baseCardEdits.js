const EDITABLE_KEYS = ['name', 'description', 'imageUrl'];

function normalizeBaseCardEdit(baseCard, edit) {
  if (!baseCard || !edit || typeof edit !== 'object') return {};
  const normalized = {};
  for (const key of EDITABLE_KEYS) {
    const value = edit[key];
    const defaultValue = typeof baseCard[key] === 'string' ? baseCard[key] : '';
    if (typeof value === 'string' && value !== defaultValue) normalized[key] = value;
  }
  return normalized;
}

function normalizeBaseCardEdits(baseCards, edits) {
  if (!edits || typeof edits !== 'object' || Array.isArray(edits)) return {};
  const byId = new Map(baseCards.map(card => [card.id, card]));
  const normalized = {};
  for (const [cardId, edit] of Object.entries(edits)) {
    const patch = normalizeBaseCardEdit(byId.get(cardId), edit);
    if (Object.keys(patch).length > 0) normalized[cardId] = patch;
  }
  return normalized;
}

module.exports = { normalizeBaseCardEdit, normalizeBaseCardEdits };
