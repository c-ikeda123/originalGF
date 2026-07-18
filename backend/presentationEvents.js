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

module.exports = {
  MAX_PRESENTATION_EVENTS,
  addPresentationEvent,
  resetPresentationEvents,
};
