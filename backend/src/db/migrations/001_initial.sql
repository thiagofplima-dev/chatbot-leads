-- =============================================
-- Migration 001: Initial Schema
-- Chatbot de Qualificação de Leads
-- =============================================

-- Leads table
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

-- Lead profiles (extracted by DeepSeek)
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

-- Lead interests
CREATE TABLE IF NOT EXISTS lead_interests (
    id SERIAL PRIMARY KEY,
    lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    interest_type VARCHAR(50) NOT NULL,
    interest_details TEXT,
    score INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Conversations
CREATE TABLE IF NOT EXISTS conversations (
    id SERIAL PRIMARY KEY,
    lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    stage_id VARCHAR(50),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Conversation summaries (qualification data)
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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_lead_profiles_lead ON lead_profiles(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_interests_lead ON lead_interests(lead_id);
CREATE INDEX IF NOT EXISTS idx_conversations_lead ON conversations(lead_id);
CREATE INDEX IF NOT EXISTS idx_conversations_created ON conversations(lead_id, created_at);
CREATE INDEX IF NOT EXISTS idx_conversation_summaries_lead ON conversation_summaries(lead_id);
