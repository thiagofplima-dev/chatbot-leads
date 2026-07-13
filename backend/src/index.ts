import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config';
import { testConnection, pool } from './db/connection';
import { globalRateLimit } from './middleware/rateLimit';
import webhookRoutes from './routes/webhook';
import evolutionRoutes from './routes/evolution';
import pairingRoutes from './routes/pairing';
import viewRoutes from './routes/view';
import proposalRoutes from './routes/proposals';

const app = express();

// Trust proxy for Railway deployment (required for rate limiting behind reverse proxy)
app.set('trust proxy', 1);

// =============================================
// Middleware
// =============================================
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(globalRateLimit);

// Raw body parser for webhook (must come BEFORE express.json)
// Accepts any content type to handle various WhatsApp payload formats
app.use('/webhook', 
  express.raw({ type: '*/*', limit: '1mb' }),
  (req: any, _res, next) => {
    try {
      if (req.body && Buffer.isBuffer(req.body) && req.body.length > 0) {
        const rawBody = req.body.toString('utf-8');
        console.log(`📦 Webhook raw body (${rawBody.length} chars): ${rawBody.substring(0, 200)}`);
        req.rawBody = rawBody;
        
        // Try to parse as JSON, but don't fail if it's not
        try {
          req.body = JSON.parse(rawBody);
          (req as any)._body = true;
        } catch (jsonErr) {
          // Body is not JSON - might be form-urlencoded or other format
          console.log('⚠️ Webhook body is not JSON, keeping as raw string');
          req.body = { raw: rawBody };
          (req as any)._body = true;
        }
      }
    } catch (e) {
      console.error('❌ Webhook body processing error:', e);
    }
    next();
  }
);

// Parse JSON bodies for all other routes
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

// Evolution API routes (WhatsApp QR Code)
app.use('/evolution', evolutionRoutes);

// WhatsApp pairing code route
app.use('/pairing', pairingRoutes);

// QR Code viewer page
app.use('/view', viewRoutes);

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
  // Run migrations automatically
  await runMigrations();

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

/**
 * Run database migrations automatically on startup
 */
async function runMigrations() {
  try {
    // Create migrations tracking table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // Define migrations inline (avoid file system dependencies)
    const migrations: Record<string, string> = {
      '001_initial.sql': `
CREATE TABLE IF NOT EXISTS leads (
    id SERIAL PRIMARY KEY,
    phone VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(255),
    email VARCHAR(255),
    status VARCHAR(20) NOT NULL DEFAULT 'new'
        CHECK (status IN ('new', 'chatting', 'qualified', 'converted', 'discarded')),
    allow_contact BOOLEAN DEFAULT true,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lead_profiles (
    id SERIAL PRIMARY KEY,
    lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    investor_profile VARCHAR(30)
        CHECK (investor_profile IN ('conservador', 'moderado', 'agressivo')),
    experience TEXT,
    goal TEXT,
    timeline VARCHAR(30)
        CHECK (timeline IN ('curto_prazo', 'medio_prazo', 'longo_prazo')),
    monthly_value NUMERIC(15, 2),
    income_range VARCHAR(50),
    risk_tolerance INTEGER CHECK (risk_tolerance BETWEEN 1 AND 5),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lead_interests (
    id SERIAL PRIMARY KEY,
    lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    interest_type VARCHAR(50) NOT NULL,
    interest_details TEXT,
    score INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conversations (
    id SERIAL PRIMARY KEY,
    lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    stage_id VARCHAR(50),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conversation_summaries (
    id SERIAL PRIMARY KEY,
    lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    extracted_info JSONB DEFAULT '{}',
    qualification_score NUMERIC(5, 2),
    qualified_at TIMESTAMP WITH TIME ZONE,
    proposal_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_lead_profiles_lead ON lead_profiles(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_interests_lead ON lead_interests(lead_id);
CREATE INDEX IF NOT EXISTS idx_conversations_lead ON conversations(lead_id);
CREATE INDEX IF NOT EXISTS idx_conversations_created ON conversations(lead_id, created_at);
CREATE INDEX IF NOT EXISTS idx_conversation_summaries_lead ON conversation_summaries(lead_id);
`,
    };

    for (const [filename, sql] of Object.entries(migrations)) {
      const { rows } = await pool.query(
        'SELECT id FROM _migrations WHERE filename = $1',
        [filename]
      );

      if (rows.length > 0) {
        console.log(`  ⏭️ Migration ${filename} already executed, skipping.`);
        continue;
      }

      console.log(`  🔄 Running migration: ${filename}...`);
      await pool.query(sql);
      await pool.query(
        'INSERT INTO _migrations (filename) VALUES ($1)',
        [filename]
      );
      console.log(`  ✅ Migration ${filename} completed.`);
    }
  } catch (error) {
    console.error('❌ Migration error:', error);
  }
}
