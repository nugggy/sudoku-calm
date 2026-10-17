// Builds endless Cat Sort levels off the main thread (some take a few seconds).
import { newLevel, encodeLevel } from './sort-engine.js';

self.onmessage = (e) => {
  const { id, level } = e.data;
  self.postMessage({ id, level, data: encodeLevel(newLevel(level)) });
};
