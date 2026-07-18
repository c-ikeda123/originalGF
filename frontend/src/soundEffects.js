import flashSounds from '../../shared/flashSounds.json';

const availableSounds = new Set(flashSounds);
const audioCache = new Map();
const baseUrl = '/godfield-flash/sounds';
const MASTER_VOLUME_KEY = 'gf_master_volume';

function readStoredMasterVolume() {
  if (typeof window === 'undefined') return 1;
  const stored = Number(window.localStorage.getItem(MASTER_VOLUME_KEY));
  return Number.isFinite(stored) ? Math.max(0, Math.min(1, stored)) : 1;
}

let masterVolume = readStoredMasterVolume();

export function getMasterVolume() {
  return masterVolume;
}

export function setMasterVolume(volume) {
  masterVolume = Math.max(0, Math.min(1, Number(volume) || 0));
  if (typeof window !== 'undefined') window.localStorage.setItem(MASTER_VOLUME_KEY, String(masterVolume));
}

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
  audio.volume = Math.max(0, Math.min(1, volume * masterVolume));
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
