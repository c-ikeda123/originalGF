const EVENT_DURATIONS = {
  game_start: 1400,
  card_enter: 500,
  action: 900,
  hit_result: 850,
  damage: 1200,
  effect: 1150,
  ascension: 1900,
  field_clear: 350,
  turn_start: 850,
};

export function getPresentationDuration(event) {
  if (!event) return 0;
  if (event.type === 'card_enter') {
    return Math.max(EVENT_DURATIONS.card_enter, (event.cards?.length || 1) * 260 + 260);
  }
  return EVENT_DURATIONS[event.type] || 800;
}

export function getNewPresentationEvents(events, lastSeenId) {
  return (events || [])
    .filter(event => Number.isInteger(event.id) && event.id > lastSeenId)
    .sort((first, second) => first.id - second.id);
}

export function getLatestPresentationId(events, fallback = 0) {
  return Math.max(fallback, ...(events || []).map(event => Number.isInteger(event.id) ? event.id : 0));
}
