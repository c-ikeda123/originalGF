import flashSounds from '../../shared/flashSounds.json';

const availableSounds = new Set(flashSounds);
const audioCache = new Map();
const baseUrl = '/godfield-flash/sounds';

function getAudio(name) {
  if (!availableSounds.has(name) || typeof Audio === 'undefined') return null;
  if (!audioCache.has(name)) {
    const audio = new Audio(`${baseUrl}/${name}.mp3`);
    audio.preload = 'auto';
    audioCache.set(name, audio);
  }
  return audioCache.get(name);
}

export function preloadSounds() {
  flashSounds.forEach(name => getAudio(name)?.load());
}

export function playSound(name, volume = 0.7) {
  const source = getAudio(name);
  if (!source) return;
  const audio = source.cloneNode();
  audio.volume = Math.max(0, Math.min(1, volume));
  audio.play().catch(() => {});
}

export function installUiSounds(root = document) {
  const onPointerDown = event => {
    const explicit = event.target.closest('[data-sound-down]');
    if (explicit?.dataset.soundDown) {
      playSound(explicit.dataset.soundDown, 0.55);
      return;
    }
    if (event.target.closest('.gf-card-square')) {
      playSound('card', 0.55);
      return;
    }
    if (event.target.closest('[data-target]')) {
      playSound('target', 0.55);
      return;
    }
    if (event.target.closest('a, [data-sound-cover]')) {
      playSound('open_cover', 0.5);
      return;
    }
    const button = event.target.closest('button, [role="button"]');
    if (button && !button.disabled) {
      playSound(button.closest('.learned-miracles') ? 'book_tab_down' : 'button_down', 0.5);
    }
  };

  const onChange = event => {
    if (event.target.matches('input, select, textarea')) playSound('toggle_down', 0.45);
  };

  root.addEventListener('pointerdown', onPointerDown);
  root.addEventListener('change', onChange);
  preloadSounds();

  return () => {
    root.removeEventListener('pointerdown', onPointerDown);
    root.removeEventListener('change', onChange);
  };
}
