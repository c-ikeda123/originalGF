export const CROP_VIEW_SIZE = 360;

export function getCropMetrics(width, height, zoom = 1) {
  if (!(width > 0) || !(height > 0)) return null;
  const scale = Math.max(CROP_VIEW_SIZE / width, CROP_VIEW_SIZE / height) * Math.max(1, zoom);
  const renderedWidth = width * scale;
  const renderedHeight = height * scale;
  return {
    scale,
    renderedWidth,
    renderedHeight,
    maxX: Math.max(0, (renderedWidth - CROP_VIEW_SIZE) / 2),
    maxY: Math.max(0, (renderedHeight - CROP_VIEW_SIZE) / 2),
  };
}

export function clampCropPosition(position, metrics) {
  if (!metrics) return { x: 0, y: 0 };
  const clampAxis = (value, maximum) => maximum > 0
    ? Math.max(-maximum, Math.min(maximum, value))
    : 0;
  return {
    x: clampAxis(position.x, metrics.maxX),
    y: clampAxis(position.y, metrics.maxY),
  };
}
