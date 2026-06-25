import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env') });

export const config = {
  // Server
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isDev: (process.env.NODE_ENV || 'development') === 'development',

  // WhatsApp Business API (Meta)
  whatsapp: {
    token: process.env.WHATSAPP_TOKEN || '',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || 'meu_token_seguro',
    apiVersion: process.env.WHATSAPP_API_VERSION || 'v21.0',
    businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '',
    get baseUrl() {
      return `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}`;
    },
    appSecret: process.env.WHATSAPP_APP_SECRET || '',
  },

  // n8n
  n8n: {
    webhookUrl: process.env.N8N_WEBHOOK_URL || 'http://localhost:5678/webhook',
    apiKey: process.env.N8N_API_KEY || '',
  },

  // PostgreSQL
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'chatbot_leads',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  },

  // Lead Notification
  notification: {
    type: process.env.NOTIFICATION_TYPE || 'database',
    emailTo: process.env.NOTIFICATION_EMAIL_TO || '',
    telegramBotToken: process.env.NOTIFICATION_TELEGRAM_BOT_TOKEN || '',
    telegramChatId: process.env.NOTIFICATION_TELEGRAM_CHAT_ID || '',
    webhookUrl: process.env.NOTIFICATION_WEBHOOK_URL || '',
  },
};
