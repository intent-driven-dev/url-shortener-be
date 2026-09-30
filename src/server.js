import { configuration } from './config.js';
import { createApp } from './app.js';
import { LinkStorage } from './storage.js';

const config = configuration();
const server = createApp({ storage: new LinkStorage(config.storageDir), publicLinkOrigin: config.publicLinkOrigin })
  .listen(config.port, '127.0.0.1', () => console.log(`Listening on http://127.0.0.1:${config.port}`));
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => server.close());
}
