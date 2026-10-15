import http from 'node:http';
import mongoose from 'mongoose';
import { config, assertProductionConfig } from './config.js';
import { createApp } from './app.js';
import { setupSockets } from './sockets/index.js';

async function main() {
  assertProductionConfig();
  await mongoose.connect(config.mongoUri);
  console.log('MongoDB connected');

  const app = createApp();
  const server = http.createServer(app);
  const { tournaments } = setupSockets(server);
  await tournaments.startScheduler();

  server.listen(config.port, () => {
    console.log(`PlayArena API on port ${config.port}`);
    console.log(`Allowed frontend origins: ${config.clientUrls.join(', ')}`);
  });

  const shutdown = async () => {
    tournaments.stop();
    server.close();
    await mongoose.disconnect();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Failed to start', err);
  process.exit(1);
});
