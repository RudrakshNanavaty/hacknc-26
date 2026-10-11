import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'maplibre-gl/dist/maplibre-gl.css';
import './styles.css';
import { App } from './App';
import { installSoundscape } from './ui/sound';

// The ocean bed and button sounds, on every page (they start on the first tap: browsers require a gesture).
installSoundscape();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
