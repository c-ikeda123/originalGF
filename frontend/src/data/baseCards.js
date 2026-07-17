import baseCards from '../../../shared/baseCards.json';

export const GF_BASE_CARDS = baseCards;

export const getBaseCardsWithEdits = () => {
  const edits = JSON.parse(localStorage.getItem('gf_base_cards_edits') || '{}');
  return GF_BASE_CARDS.map(card => edits[card.id] ? { ...card, ...edits[card.id] } : card);
};
