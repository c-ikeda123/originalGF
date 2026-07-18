import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CROP_VIEW_SIZE, clampCropPosition, getCropMetrics } from '../utils/squareCrop';

const OUTPUT_SIZE = 512;

export default function SquareImageCropper({ disabled = false, onCrop }) {
  const [source, setSource] = useState('');
  const [fileName, setFileName] = useState('');
  const [imageSize, setImageSize] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const imageRef = useRef(null);
  const viewportRef = useRef(null);
  const dragRef = useRef(null);
  const metrics = useMemo(
    () => imageSize ? getCropMetrics(imageSize.width, imageSize.height, zoom) : null,
    [imageSize, zoom],
  );

  useEffect(() => () => {
    if (source) URL.revokeObjectURL(source);
  }, [source]);

  const close = () => {
    setSource('');
    setFileName('');
    setImageSize(null);
    setZoom(1);
    setPosition({ x: 0, y: 0 });
    dragRef.current = null;
  };

  const selectFile = event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setSource(URL.createObjectURL(file));
    setFileName(file.name);
    setImageSize(null);
    setZoom(1);
    setPosition({ x: 0, y: 0 });
  };

  const changeZoom = value => {
    const nextZoom = Math.max(1, Math.min(3, Number(value)));
    const nextMetrics = imageSize ? getCropMetrics(imageSize.width, imageSize.height, nextZoom) : null;
    setZoom(nextZoom);
    setPosition(current => clampCropPosition(current, nextMetrics));
  };

  const startDrag = event => {
    if (!metrics) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      position,
    };
  };

  const moveDrag = event => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !metrics) return;
    const viewportWidth = viewportRef.current?.getBoundingClientRect().width || CROP_VIEW_SIZE;
    const ratio = CROP_VIEW_SIZE / viewportWidth;
    setPosition(clampCropPosition({
      x: drag.position.x + (event.clientX - drag.x) * ratio,
      y: drag.position.y + (event.clientY - drag.y) * ratio,
    }, metrics));
  };

  const finishDrag = event => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  };

  const applyCrop = () => {
    const image = imageRef.current;
    if (!image || !metrics) return;
    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const outputScale = OUTPUT_SIZE / CROP_VIEW_SIZE;
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
    context.drawImage(
      image,
      (CROP_VIEW_SIZE / 2 - metrics.renderedWidth / 2 + position.x) * outputScale,
      (CROP_VIEW_SIZE / 2 - metrics.renderedHeight / 2 + position.y) * outputScale,
      metrics.renderedWidth * outputScale,
      metrics.renderedHeight * outputScale,
    );
    onCrop(canvas.toDataURL('image/jpeg', 0.82));
    close();
  };

  return (
    <>
      <input className="input-field square-crop-file" type="file" accept="image/*" disabled={disabled} onChange={selectFile} />
      {source && (
        <div className="square-crop-overlay" role="dialog" aria-modal="true" aria-label="画像を正方形に切り抜く" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
          <div className="square-crop-dialog">
            <div className="square-crop-heading">
              <div><strong>正方形にトリミング</strong><small>{fileName}</small></div>
              <button type="button" className="square-crop-close" aria-label="キャンセル" onClick={close}>×</button>
            </div>
            <p className="square-crop-help">画像をドラッグして位置を調整してください。ホイールでも拡大できます。</p>
            <div
              ref={viewportRef}
              className={`square-crop-viewport ${dragRef.current ? 'dragging' : ''}`}
              onPointerDown={startDrag}
              onPointerMove={moveDrag}
              onPointerUp={finishDrag}
              onPointerCancel={finishDrag}
              onWheel={event => {
                event.preventDefault();
                changeZoom(zoom + (event.deltaY < 0 ? 0.1 : -0.1));
              }}
            >
              <img
                ref={imageRef}
                src={source}
                alt="トリミング対象"
                draggable="false"
                onLoad={event => setImageSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
                style={metrics ? {
                  width: `${metrics.renderedWidth / CROP_VIEW_SIZE * 100}%`,
                  height: `${metrics.renderedHeight / CROP_VIEW_SIZE * 100}%`,
                  left: `calc(50% + ${position.x / CROP_VIEW_SIZE * 100}%)`,
                  top: `calc(50% + ${position.y / CROP_VIEW_SIZE * 100}%)`,
                  transform: 'translate(-50%, -50%)',
                } : undefined}
              />
              <div className="square-crop-grid" />
            </div>
            <label className="square-crop-zoom">
              <span>拡大</span>
              <input type="range" min="1" max="3" step="0.01" value={zoom} onChange={event => changeZoom(event.target.value)} />
              <output>{Math.round(zoom * 100)}%</output>
            </label>
            <div className="square-crop-actions">
              <button type="button" className="btn btn-secondary" onClick={() => { setZoom(1); setPosition({ x: 0, y: 0 }); }}>位置をリセット</button>
              <span />
              <button type="button" className="btn btn-secondary" onClick={close}>キャンセル</button>
              <button type="button" className="btn" disabled={!metrics} onClick={applyCrop}>この範囲で決定</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
