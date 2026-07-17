const editableKeys = ['name', 'description', 'imageUrl'];

export function normalizeBaseCardEdit(baseCard, edit) {
  if (!baseCard || !edit || typeof edit !== 'object') return {};
  return Object.fromEntries(editableKeys.flatMap(key => {
    const value = edit[key];
    const defaultValue = typeof baseCard[key] === 'string' ? baseCard[key] : '';
    return typeof value === 'string' && value !== defaultValue ? [[key, value]] : [];
  }));
}

export function normalizeBaseCardEdits(baseCards, edits) {
  if (!edits || typeof edits !== 'object' || Array.isArray(edits)) return {};
  const byId = new Map(baseCards.map(card => [card.id, card]));
  return Object.fromEntries(Object.entries(edits).flatMap(([cardId, edit]) => {
    const normalized = normalizeBaseCardEdit(byId.get(cardId), edit);
    return Object.keys(normalized).length > 0 ? [[cardId, normalized]] : [];
  }));
}
