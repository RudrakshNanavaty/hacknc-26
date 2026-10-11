// The sound switch on pages without the stage's toolbar (landing, studio, lobby): the ocean bed and every sound.
import { useSound } from './sound';

export function SoundToggle() {
  const sound = useSound();
  return (
    <button
      type="button" className="gel gel-icon sound-fab" onClick={sound.toggle} aria-pressed={sound.on}
      title={sound.on ? 'Sound on: ocean ambience and button sounds (tap to mute)' : 'Sound off (tap for ocean ambience)'}
    >
      {sound.on ? '🔊' : '🔇'}
    </button>
  );
}
