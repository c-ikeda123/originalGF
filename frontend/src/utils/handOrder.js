export function mergeHandOrder(currentOrder, hand) {
  const handIds = hand.map(card => card.instanceId);
  const availableIds = new Set(handIds);
  const keptIds = currentOrder.filter(instanceId => availableIds.has(instanceId));
  const keptSet = new Set(keptIds);
  return [...keptIds, ...handIds.filter(instanceId => !keptSet.has(instanceId))];
}

export function moveHandCard(order, draggedId, targetId) {
  const fromIndex = order.indexOf(draggedId);
  const targetIndex = order.indexOf(targetId);
  if (fromIndex < 0 || targetIndex < 0 || fromIndex === targetIndex) return order;
  const nextOrder = [...order];
  nextOrder.splice(fromIndex, 1);
  nextOrder.splice(targetIndex, 0, draggedId);
  return nextOrder;
}

export function getHandDetailLeft(displayIndex, columns = 8, columnStep = 83, maxLeft = 361) {
  const safeIndex = Math.max(0, Number(displayIndex) || 0);
  return Math.min((safeIndex % columns) * columnStep, maxLeft);
}
