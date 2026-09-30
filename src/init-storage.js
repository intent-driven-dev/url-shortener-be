import { storageDirectory } from './config.js';
import { initializeStorage } from './storage.js';

try {
  const directory = storageDirectory();
  await initializeStorage(directory);
  console.log(`Initialized ${directory}/links.json`);
} catch (error) {
  console.error(`Storage initialization failed: ${error.message}`);
  process.exitCode = 1;
}
