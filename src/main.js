import { fileURLToPath } from 'node:url';
import { loadConfig, missingSettings } from './config.js';
import { createServices } from './container.js';
import { createApp } from './http/app.js';

const config = loadConfig();
const missing = missingSettings(config);
if (missing.length) {
  console.error(`Cannot start: set ${missing.join(' and ')} in the environment. See .env.example.`);
  process.exit(1);
}
const services = createServices(config);

const app = createApp({
  ...services,
  config,
  staticDir: fileURLToPath(new URL('../public', import.meta.url)),
});

app.listen(config.port, () => console.log(`Listening on ${config.publicBaseUrl}`));
