import http from 'node:http';
import mongoose from 'mongoose';
import { config, assertProductionConfig } from './config.js';
import { createApp } from './app.js';
import { setupSockets } from './sockets/index.js';
import { startPaymentReconciler, availableGateways } from './services/payments/index.js';

async function main() {
  assertProductionConfig();
  await mongoose.connect(config.mongoUri);
  console.log('MongoDB connected');

  const app = createApp();
  const server = http.createServer(app);
  const { tournaments } = setupSockets(server);
  app.locals.tournaments = tournaments; // routes use it to delete live tournaments
  await tournaments.startScheduler();
  const stopReconciler = startPaymentReconciler();
  console.log(`Payment options: ${availableGateways().map((g) => g.id).join(', ') || 'none'}`);

  server.listen(config.port, () => {
    console.log(`MivoPlay API on port ${config.port}`);
    console.log(`Allowed frontend origins: ${config.clientUrls.join(', ')}`);
  });

  const shutdown = async () => {
    tournaments.stop();
    stopReconciler();
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
