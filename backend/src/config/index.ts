import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env') });

export const config = {
  // Server
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isDev: (process.env.NODE_ENV || 'development') === 'development',

  // UazAPI (WhatsApp API)
  uazapi: {
    baseUrl: process.env.UAZAPI_BASE_URL || 'https://mivecw.uazapi.com',
    adminToken: process.env.UAZAPI_ADMIN_TOKEN || '',
    instanceToken: process.env.UAZAPI_INSTANCE_TOKEN || '',
    webhookBaseUrl: process.env.UAZAPI_WEBHOOK_BASE_URL || 'https://chatbot-leads-production.up.railway.app',
  },

  // DeepSeek AI
  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY || 'sk-948dd4228f944335bf1597c161a1fda1',
    baseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',
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
