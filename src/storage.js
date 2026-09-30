import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

function validDestination(value) {
  if (typeof value !== 'string' || !/^https?:\/\//i.test(value) || /[\x00-\x20\x7f]/.test(value)) return false;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && Boolean(url.hostname);
  } catch { return false; }
}
export { validDestination };

function validateSnapshot(snapshot) {
  if (!snapshot || snapshot.version !== 1 || !snapshot.links ||
      typeof snapshot.links !== 'object' || Array.isArray(snapshot.links) ||
      Object.entries(snapshot.links).some(([code, destination]) =>
        !/^[A-Za-z0-9_-]+$/.test(code) || !validDestination(destination))) {
    throw new Error('Invalid storage snapshot');
  }
  return snapshot;
}

async function flushDirectory(directory) {
  const handle = await open(directory, 'r');
  try { await handle.sync(); } finally { await handle.close(); }
}

export async function initializeStorage(directory) {
  await mkdir(directory, { recursive: true });
  // Exclusive creation refuses to replace an existing snapshot, including corrupt data.
  const handle = await open(join(directory, 'links.json'), 'wx', 0o600);
  try {
    await handle.writeFile(JSON.stringify({ version: 1, links: {} }) + '\n');
    await handle.sync();
  } finally { await handle.close(); }
  await flushDirectory(directory);
}

export class LinkStorage {
  #queue = Promise.resolve();
  constructor(directory, generateCode = () => randomBytes(9).toString('base64url')) {
    this.directory = directory;
    this.generateCode = generateCode;
  }
  #serialize(operation) {
    const result = this.#queue.then(operation);
    this.#queue = result.catch(() => {});
    return result;
  }
  async #read() {
    return validateSnapshot(JSON.parse(await readFile(join(this.directory, 'links.json'), 'utf8')));
  }
  read() { return this.#serialize(() => this.#read()); }
  lookup(code) {
    return this.#serialize(async () => {
      const snapshot = await this.#read();
      return Object.hasOwn(snapshot.links, code) ? snapshot.links[code] : undefined;
    });
  }
  create(destination) {
    return this.#serialize(async () => {
      const snapshot = await this.#read();
      let code;
      do { code = this.generateCode(); } while (Object.hasOwn(snapshot.links, code));
      Object.defineProperty(snapshot.links, code, { value: destination, enumerable: true, configurable: true, writable: true });
      const temporary = join(this.directory, `.links-${randomBytes(16).toString('hex')}.tmp`);
      let handle;
      let created = false;
      try {
        handle = await open(temporary, 'wx', 0o600);
        created = true;
        await handle.writeFile(JSON.stringify(snapshot) + '\n');
        await handle.sync();
        await handle.close();
        handle = undefined;
        await rename(temporary, join(this.directory, 'links.json'));
        await flushDirectory(this.directory);
      } finally {
        if (handle) await handle.close().catch(() => {});
        if (created) await unlink(temporary).catch(() => {});
      }
      return code;
    });
  }
}
