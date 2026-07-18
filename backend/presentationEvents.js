const MAX_PRESENTATION_EVENTS = 120;

function addPresentationEvent(room, type, details = {}) {
  room.presentationSeq = (room.presentationSeq || 0) + 1;
  const event = {
    ...details,
    id: room.presentationSeq,
    type,
    timestamp: Date.now(),
  };
  room.presentationEvents = [...(room.presentationEvents || []), event].slice(-MAX_PRESENTATION_EVENTS);
  return event;
}

function resetPresentationEvents(room) {
  room.presentationSeq = 0;
  room.presentationEvents = [];
}

function getCardPresentationLockMs(cardCount, miracleStockCount = 0) {
  return Math.max(500, Math.max(1, cardCount) * 260 + 260)
    + Math.max(0, miracleStockCount) * 650
    + 850;
}

function shouldPresentDamage(amount) {
  return Number(amount) > 0;
}

module.exports = {
  MAX_PRESENTATION_EVENTS,
  addPresentationEvent,
  getCardPresentationLockMs,
  resetPresentationEvents,
  shouldPresentDamage,
};
