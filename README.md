# 🤖 Chatbot de Qualificação de Leads — WhatsApp + n8n + DeepSeek

Chatbot inteligente para WhatsApp que **apresenta produtos financeiros** e **qualifica leads** usando DeepSeek (via n8n), com geração automática de propostas personalizadas.

## 🏗️ Arquitetura

```
WhatsApp → Meta API → Backend (Node.js) → n8n (DeepSeek) → PostgreSQL
                                ↓
                      Gera Proposta → WhatsApp
```

## 📁 Estrutura do Projeto

```
c:\Chatbot\
├── backend/
│   ├── src/
│   │   ├── index.ts                 # Entry point Express
│   │   ├── config/
│   │   │   ├── index.ts             # Variáveis de ambiente
│   │   │   └── flow-config.json     # 🔧 EDITÁVEL — Fluxo de perguntas
│   │   ├── routes/
│   │   │   ├── webhook.ts           # Webhook WhatsApp (Meta)
│   │   │   └── proposals.ts         # Servir propostas geradas
│   │   ├── services/
│   │   │   ├── whatsapp.ts          # WhatsApp Business API
│   │   │   ├── n8n.ts              # Cliente n8n
│   │   │   └── proposal-generator.ts # Gerador de propostas
│   │   ├── middleware/
│   │   │   ├── auth.ts             # Verificação webhook Meta
│   │   │   └── rateLimit.ts        # Rate limiting
│   │   └── db/
│   │       ├── connection.ts       # Pool PostgreSQL
│   │       ├── migrate.ts          # Runner de migrations
│   │       └── migrations/
│   │           └── 001_initial.sql  # Schema inicial
│   ├── templates/
│   │   └── proposta-template.html   # Template da proposta v2
│   ├── storage/
│   │   └── propostas/              # Propostas geradas
│   ├── Dockerfile
│   ├── package.json
│   └── tsconfig.json
├── n8n-workflows/
│   ├── process-message.json         # Workflow principal
│   └── notify-qualified-lead.json   # Workflow de notificação
├── docker-compose.yml               # Ambiente local
├── .env.example
└── README.md
```

## 🔧 Fluxo de Perguntas (Customizável)

Edite **`backend/src/config/flow-config.json`** para alterar:

| O que mudar | Como fazer |
|---|---|
| **Ordem das perguntas** | Reordene o array `stages` |
| **Texto das perguntas** | Edite `prompt_instruction` de cada estágio |
| **Adicionar nova pergunta** | Crie um novo objeto em `stages` |
| **Critérios de qualificação** | Ajuste `min_score_to_qualify` |
| **Produtos/serviços** | Edite o array `services` |

## 🚀 Setup Rápido (Local)

### Pré-requisitos
- Docker e Docker Compose
- Node.js 20+
- Conta WhatsApp Business API (Meta)
- Chave de API DeepSeek

### 1. Configure as variáveis de ambiente

```bash
cp .env.example .env
# Edite .env com suas credenciais:
# - WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_VERIFY_TOKEN
```

### 2. Suba os serviços

```bash
docker-compose up -d
```

Isso inicia:
| Serviço | Acesso |
|---|---|
| **Backend API** | http://localhost:3000 |
| **n8n** | http://localhost:5678 |
| **PostgreSQL** | localhost:5432 |

### 3. Configure o n8n

1. Acesse http://localhost:5678
2. Crie sua conta de admin
3. Configure as credenciais:
   - **DeepSeek API**: Adicione a chave da API do DeepSeek
   - **PostgreSQL**: Configure com os dados do `.env`
4. Importe os workflows:
   - `n8n-workflows/process-message.json`
   - `n8n-workflows/notify-qualified-lead.json`
5. Ative os workflows (botão "Active")

### 4. Configure o Webhook no Meta

1. No Meta for Developers > Seu App > WhatsApp > Configuration
2. Callback URL: `https://SEU-DOMINIO/webhook`
3. Verify Token: O mesmo do `WHATSAPP_VERIFY_TOKEN`
4. Inscreva-se no campo `messages`

### 5. Teste

```bash
# Health check
curl http://localhost:3000/health

# Simular webhook do WhatsApp
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{"entry":[{"changes":[{"value":{"messages":[{"from":"5511999999999","type":"text","text":{"body":"Olá!"}}]}}]}]}'
```

## 🚢 Deploy no Railway

### Serviços no Railway

Crie 3 serviços no mesmo Railway Project:

| Serviço | Tipo | Fonte |
|---|---|---|
| **PostgreSQL** | Database | Railway PostgreSQL addon |
| **n8n** | Docker Image | `docker.n8n.io/n8nio/n8n` |
| **Backend** | GitHub Repo | Seu repositório (Dockerfile) |

### Variáveis de Ambiente no Railway

**Backend:**
```
NODE_ENV=production
WHATSAPP_TOKEN=seu_token
WHATSAPP_PHONE_NUMBER_ID=seu_id
WHATSAPP_VERIFY_TOKEN=seu_token
WHATSAPP_API_VERSION=v21.0
N8N_WEBHOOK_URL=http://n8n:5678/webhook
DB_HOST=<postgres-service-name>.railway.internal
DB_PORT=5432
DB_NAME=railway
DB_USER=postgres
DB_PASSWORD=senha_do_railway
NOTIFICATION_TYPE=database
```

**n8n:**
```
DB_TYPE=postgresdb
DB_POSTGRESDB_HOST=<postgres-service-name>.railway.internal
DB_POSTGRESDB_PORT=5432
DB_POSTGRESDB_DATABASE=railway
DB_POSTGRESDB_USER=postgres
DB_POSTGRESDB_PASSWORD=senha_do_railway
N8N_ENCRYPTION_KEY=uma_chave_segura_aqui
GENERIC_TIMEZONE=America/Sao_Paulo
WEBHOOK_URL=https://n8n.seu-dominio.railway.app/
```

### Domínios

- Backend: Gere um domínio público (necessário para webhook do Meta)
- n8n: Gere um domínio público (opcional, para acesso ao painel)

## 📄 Geração de Propostas

Quando um lead é qualificado, automaticamente:

1. O backend lê o template `proposta-template.html` (cópia do Standalone v2)
2. Injeta os dados: nome, patrimônio, perfil de risco, interesses
3. Gera um HTML personalizado em `storage/propostas/`
4. Retorna o link público → enviado via WhatsApp

### Personalizar o Template

Substitua o arquivo `backend/templates/proposta-template.html` por uma nova versão quando disponível.

## 🔄 Fluxo da Conversa

```
1. Boas-vindas → "Olá! Como posso ajudar?"
2. Apresentação → "Trabalhamos com [serviços]..."
3. Perfil → "Qual seu perfil de investidor?"
4. Objetivo → "Qual seu objetivo financeiro?"
5. Contato → "Pode compartilhar seu e-mail?"
6. Qualificação → DeepSeek avalia critérios
   ├── ✅ Qualificado → Gera proposta + notifica time
   └── ❌ Não qualificado → Encaminha para time comercial
```

> 💡 **Tudo configurável** no `flow-config.json`!

## 🛠️ Tecnologias

| Componente | Tecnologia |
|---|---|
| Backend | Node.js + TypeScript + Express |
| IA | DeepSeek Flash (via n8n) |
| Workflows | n8n |
| Banco | PostgreSQL |
| WhatsApp | WhatsApp Business API (Meta) |
| Deploy | Docker → Railway |
| Template | HTML/CSS/JS (Web Components) |
