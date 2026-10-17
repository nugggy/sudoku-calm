// Cat Sort background work: builds endless levels and finds hint plans (both can take a few seconds).
import { newLevel, encodeLevel, solvePath } from './sort-engine.js';

self.onmessage = (e) => {
  const { id, type, level, state } = e.data;
  if (type === 'hint') self.postMessage({ id, path: solvePath(state) });
  else self.postMessage({ id, level, data: encodeLevel(newLevel(level)) });
};
