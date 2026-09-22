/**
 * Entry point for webhook alert router
 */

require('dotenv').config();
const { AlertRouter, createServer } = require('./webhook-alert-router');

const PORT = process.env.PORT || 3000;

const alertRouter = new AlertRouter();
const app = createServer(alertRouter);

app.listen(PORT, () => {
  alertRouter.log('info', `✓ Alert Router running on http://localhost:${PORT}`);
  alertRouter.log('info', 'Endpoints:');
  alertRouter.log('info', '  POST /webhook - Route incoming alerts');
  alertRouter.log('info', '  GET /health - Health check');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  alertRouter.log('info', 'SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  alertRouter.log('info', 'SIGINT received, shutting down gracefully');
  process.exit(0);
});
