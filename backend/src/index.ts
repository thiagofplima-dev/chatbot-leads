import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { config } from './config';
import { testConnection } from './db/connection';
import { globalRateLimit } from './middleware/rateLimit';
import webhookRoutes from './routes/webhook';
import proposalRoutes from './routes/proposals';

const app = express();

// =============================================
// Middleware
// =============================================
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(globalRateLimit);

// Parse JSON bodies (but keep raw for webhook signature verification)
app.use(express.json({
  verify: (req: any, _res, buf) => {
    req.rawBody = buf.toString();
  },
}));

// =============================================
// Routes
// =============================================

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv,
  });
});

// WhatsApp webhook routes
app.use('/webhook', webhookRoutes);

// Proposal routes
app.use('/propostas', proposalRoutes);

// =============================================
// Error handling
// =============================================
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// =============================================
// Start server
// =============================================
async function start() {
  // Test database connection
  const dbConnected = await testConnection();
  if (!dbConnected && !config.isDev) {
    console.warn('⚠️ Could not connect to PostgreSQL. Some features may not work.');
  }

  app.listen(config.port, () => {
    console.log(`
╔══════════════════════════════════════════╗
║  🤖 Chatbot Leads - Backend             ║
║  Status: 🟢 Running                     ║
║  Port: ${String(config.port).padEnd(32)}║
║  Env: ${config.nodeEnv.padEnd(35)}║
║  DB: ${dbConnected ? '✅ Connected' : '❌ Disconnected'.padEnd(30)}║
╚══════════════════════════════════════════╝
    `);
  });
}

start().catch(console.error);

export default app;
