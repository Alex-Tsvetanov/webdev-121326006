import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { createServices } from './container.js';
import { createApp } from './http/app.js';

const config = loadConfig();
const services = createServices(config);

const app = createApp({
  ...services,
  config,
  staticDir: fileURLToPath(new URL('../public', import.meta.url)),
});

app.listen(config.port, () => console.log(`Listening on ${config.publicBaseUrl}`));
