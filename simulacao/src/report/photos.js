// Panel photos (dados/capturas/painel/*.jpg) chosen for a report: the ones taken inside the
// report period, spread over time, embedded as data URIs so the HTML and PDF stand alone.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { listPhotos, photoDir } from '../panel/capture.js';

const NAME = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z\.jpg$/;
export const MAX_REPORT_PHOTOS = 8;

/** Photo files are named after the ISO time with ":" and "." replaced by "-". */
export function photoTime(name) {
  const m = NAME.exec(name);
  return m ? Date.parse(`${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z`) : null;
}

export function choosePhotos(names, { from, to, max = MAX_REPORT_PHOTOS }) {
  const inside = names.filter((n) => {
    const t = photoTime(n);
    return t !== null && t >= from && t <= to;
  }).sort();
  if (inside.length <= max) return inside;
  // Evenly spaced picks, always keeping the first and the last.
  return Array.from({ length: max }, (_, i) => inside[Math.round((i * (inside.length - 1)) / (max - 1))]);
}

export function loadReportPhotos(dataDir, { from, to }) {
  return choosePhotos(listPhotos(dataDir), { from: +from, to: +to }).map((name) => ({
    takenAt: new Date(photoTime(name)).toISOString(),
    src: `data:image/jpeg;base64,${readFileSync(path.join(photoDir(dataDir), name)).toString('base64')}`,
  }));
}
