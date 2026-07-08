import { Router, Request, Response } from 'express';
import { evolutionService } from '../services/evolution';

const router = Router();

/**
 * GET /evolution/qrcode - Generate QR Code to connect WhatsApp
 */
router.get('/qrcode', async (req: Request, res: Response) => {
  try {
    const instanceName = (req.query.instance as string) || 'kea-chatbot';
    
    const result = await evolutionService.createInstance(instanceName);
    
    if (result.qrcode) {
      res.json({
        success: true,
        instanceName: result.instance.instanceName,
        apikey: result.instance.apikey,
        qrcode: result.qrcode.code,
        qrcodeBase64: result.qrcode.base64,
        message: 'Escaneie o QR Code com seu WhatsApp (Configurações → Aparelhos conectados → Escanear QR)',
      });
    } else {
      // Instance might already be connected
      res.json({
        success: true,
        instanceName: result.instance.instanceName,
        status: result.instance.status,
        message: 'Instância já está conectada!',
      });
    }
  } catch (error: any) {
    const status = error.response?.status || 500;
    const detail = error.response?.data || error.message;
    res.status(status).json({
      success: false,
      error: 'Falha ao criar instância',
      detail,
    });
  }
});

/**
 * GET /evolution/status - Check WhatsApp connection status
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    const info = await evolutionService.getInstanceInfo();
    res.json({ success: true, instances: info });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /evolution/logout - Disconnect WhatsApp
 */
router.post('/logout', async (req: Request, res: Response) => {
  try {
    const instanceName = (req.body.instance as string) || 'kea-chatbot';
    await evolutionService.logoutInstance(instanceName);
    res.json({ success: true, message: 'Instância desconectada' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /evolution/webhook - Receive incoming messages from Evolution API
 */
router.post('/webhook', async (req: Request, res: Response) => {
  // Always respond 200 immediately
  res.sendStatus(200);

  try {
    const body = req.body;
    console.log('📩 Evolution webhook received:', JSON.stringify(body).substring(0, 200));

    // Extract message from Evolution API format
    const data = body.data || body;
    const message = data.message || data;
    const remoteJid = message.key?.remoteJid || data.from;
    const text = message.message?.conversation || message.message?.extendedTextMessage?.text || data.text || '';
    const phone = remoteJid?.replace(/[^0-9]/g, '')?.replace(/@.*$/, '') || '';

    if (!text || !phone) {
      console.log('⚠️ Evolution webhook: missing text or phone');
      return;
    }

    console.log(`📩 Message from ${phone}: "${text.substring(0, 100)}"`);

    // Process with DeepSeek
    const { deepseekService } = await import('../services/deepseek');
    const { query } = await import('../db/connection');

    // Find or create lead
    let leadResult = await query(
      'SELECT id, name, status FROM leads WHERE phone = $1',
      [phone]
    );

    let leadId: number;
    if (leadResult.rows.length === 0) {
      const newLead = await query(
        `INSERT INTO leads (phone, status) VALUES ($1, 'new') RETURNING id, name`,
        [phone]
      );
      leadId = newLead.rows[0].id;
    } else {
      leadId = leadResult.rows[0].id;
    }

    // Save user message
    await query(
      `INSERT INTO conversations (lead_id, role, content) VALUES ($1, 'user', $2)`,
      [leadId, text]
    );

    // Get conversation history
    const historyResult = await query(
      `SELECT role, content FROM conversations WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [leadId]
    );
    const conversationHistory = historyResult.rows.reverse();

    // Process with DeepSeek
    const aiResponse = await deepseekService.processMessage({
      leadId,
      phone,
      leadName: null,
      message: text,
      conversationHistory,
      currentProfile: null,
      currentInterests: [],
    });

    if (aiResponse) {
      // Save assistant response
      await query(
        `INSERT INTO conversations (lead_id, role, content, stage_id, metadata) VALUES ($1, 'assistant', $2, $3, $4)`,
        [leadId, aiResponse.message, aiResponse.stage || null, JSON.stringify(aiResponse.metadata || {})]
      );

      // Send response via Evolution API
      await evolutionService.sendText(phone, aiResponse.message);
    }
  } catch (error) {
    console.error('❌ Error processing Evolution webhook:', error);
  }
});

export default router;
