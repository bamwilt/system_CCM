import app from './app';
import { env } from './config/env';
import { closePool } from './config/database';

const server = app.listen(env.port, env.host, () => {
  console.log(`SGPM Backend running on http://${env.host}:${env.port}`);
  console.log(`Environment: ${env.nodeEnv}`);
  console.log(`Database: ${env.db.host}:${env.db.port}/${env.db.name}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  server.close(async () => {
    await closePool();
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  server.close(async () => {
    await closePool();
    process.exit(0);
  });
});

export default server;
