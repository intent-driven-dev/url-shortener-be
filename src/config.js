import { resolve } from 'node:path';

export function storageDirectory(env = process.env) {
  return resolve(env.STORAGE_DIR || './data');
}

export function configuration(env = process.env) {
  if (!/^\d+$/.test(env.PORT || '') || Number(env.PORT) < 1 || Number(env.PORT) > 65535) {
    throw new Error('PORT must be an integer from 1 through 65535');
  }
  let origin;
  try {
    origin = new URL(env.PUBLIC_LINK_ORIGIN);
  } catch {
    throw new Error('PUBLIC_LINK_ORIGIN must be an absolute HTTP(S) origin');
  }
  if (!['http:', 'https:'].includes(origin.protocol) || !origin.hostname ||
      origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) {
    throw new Error('PUBLIC_LINK_ORIGIN must have no credentials, path, query, or fragment');
  }
  return { port: Number(env.PORT), publicLinkOrigin: origin.origin, storageDir: storageDirectory(env) };
}
