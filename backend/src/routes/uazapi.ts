import { Router, Request, Response } from 'express';
import { uazapiService } from '../services/uazapi';
import { config } from '../config';

const router = Router();

// In-memory store for instance tokens (in production, use DB)
// Map<instanceName, instanceToken>
const instanceStore: Map<string, string> = new Map();

// Pre-populate instance store with configured token if available
if (config.uazapi.instanceToken) {
  instanceStore.set('00PdbK', config.uazapi.instanceToken);
  instanceStore.set('uazapi-instance', config.uazapi.instanceToken);
  console.log('🔑 [UazAPI] Instance token pre-loaded from config');
}

/**
 * GET /uazapi/qrcode - Create instance and get QR Code for pairing
 * Query: ?instance=nome-da-instancia
 */
router.get('/qrcode', async (req: Request, res: Response) => {
  try {
    const instanceName = (req.query.instance as string) || 'mive-chatbot';

    // Step 1: Create instance via admin token
    const instance = await uazapiService.createInstance(instanceName);

    // Store the token
    instanceStore.set(instanceName, instance.token);

    // Step 2: Connect to get QR Code (no phone = QR Code)
    const connection = await uazapiService.connectInstance(instance.token);

    res.json({
      success: true,
      instanceName,
      instanceToken: instance.token,
      qrcode: connection.qrcode?.code,
      qrcodeBase64: connection.qrcode?.base64,
      pairingCode: connection.pairingCode,
      status: instance.status,
      message: connection.pairingCode
        ? 'Use o código de pareamento no WhatsApp (Configurações → Aparelhos conectados → Conectar)'
        : 'Escaneie o QR Code com seu WhatsApp (Configurações → Aparelhos conectados → Escanear QR)',
    });
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
 * POST /uazapi/pairing - Create instance with pairing code (using phone number)
 * Body: { instance: string, phone: string }
 */
router.post('/pairing', async (req: Request, res: Response) => {
  try {
    const instanceName = req.body.instance || 'mive-chatbot';
    const phone = req.body.phone || '';

    if (!phone) {
      res.status(400).json({ success: false, error: 'Número de telefone é obrigatório' });
      return;
    }

    const cleanPhone = phone.replace(/\D/g, '');
    const formattedPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;

    // Step 1: Create instance via admin token
    const instance = await uazapiService.createInstance(instanceName);
    instanceStore.set(instanceName, instance.token);

    // Step 2: Connect with phone number → generates pairing code
    const connection = await uazapiService.connectInstance(instance.token, formattedPhone);

    res.json({
      success: true,
      instanceName,
      instanceToken: instance.token,
      pairingCode: connection.pairingCode,
      qrcode: connection.qrcode?.code,
      status: instance.status,
      message: connection.pairingCode
        ? `Código de pareamento: ${connection.pairingCode}. Abra o WhatsApp → Configurações → Aparelhos conectados → Conectar`
        : 'QR Code gerado. Escaneie com seu WhatsApp.',
    });
  } catch (error: any) {
    const status = error.response?.status || 500;
    const detail = error.response?.data || error.message;
    res.status(status).json({
      success: false,
      error: 'Falha ao criar instância com pareamento',
      detail,
    });
  }
});

/**
 * POST /uazapi/connect - Connect an existing instance (already created on UazAPI dashboard)
 * Body: { token: string, phone?: string }
 * If phone provided → pairing code; if not → QR Code
 */
router.post('/connect', async (req: Request, res: Response) => {
  try {
    const token = req.body.token || '';
    const phone = req.body.phone || '';

    if (!token) {
      res.status(400).json({ success: false, error: 'Token da instância é obrigatório' });
      return;
    }

    let formattedPhone = '';
    if (phone) {
      const cleanPhone = phone.replace(/\D/g, '');
      formattedPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
    }

    instanceStore.set('uazapi-instance', token);

    const connection = await uazapiService.connectInstance(token, formattedPhone || undefined);

    res.json({
      success: true,
      qrcode: connection.qrcode?.code,
      qrcodeBase64: connection.qrcode?.base64,
      pairingCode: connection.pairingCode,
      status: connection.instance?.status || 'connecting',
      message: connection.pairingCode
        ? `Código de pareamento: ${connection.pairingCode}`
        : 'QR Code gerado! Escaneie com seu WhatsApp.',
    });
  } catch (error: any) {
    const status = error.response?.status || 500;
    const detail = error.response?.data || error.message;
    res.status(status).json({
      success: false,
      error: 'Falha ao conectar instância',
      detail,
    });
  }
});

/**
 * GET /uazapi/status - Check instance connection status
 * Query: ?token=instance-token
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    const token = (req.query.token as string) || '';

    if (!token) {
      res.status(400).json({ success: false, error: 'Token da instância é obrigatório (query: ?token=xxx)' });
      return;
    }

    const info = await uazapiService.getStatus(token);
    res.json({ success: true, data: info });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /uazapi/setup - Configure webhook for the instance
 * Body: { token: string, instance?: string }
 */
router.post('/setup', async (req: Request, res: Response) => {
  try {
    const token = req.body.token || '';
    const instanceName = req.body.instance || 'mive-chatbot';

    if (!token) {
      res.status(400).json({ success: false, error: 'Token da instância é obrigatório' });
      return;
    }

    const webhookUrl = `${config.uazapi.webhookBaseUrl}/uazapi/webhook`;

    await uazapiService.setWebhook(token, webhookUrl);
    res.json({
      success: true,
      message: `Webhook configurado para instância "${instanceName}"`,
      webhookUrl,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /uazapi/webhook - Receive incoming messages from UazAPI
 * Called by UazAPI when a message is received
 */
router.post('/webhook', async (req: Request, res: Response) => {
  // Always respond 200 immediately
  res.sendStatus(200);

  try {
    const body = req.body;
    console.log('📩 [UazAPI] Webhook received:', JSON.stringify(body).substring(0, 1500));

    // Handle UazAPI webhook format (from Bubble plugin)
    // Format: { BaseUrl, EventType, chat, message?, ... }
    const eventType = body.EventType || body.event || 'messages';
    const rawData = body.data || body.message || body.chat || body;

    // Only process messages events
    if (eventType !== 'messages') {
      console.log(`⏭️ [UazAPI] Ignoring event type: ${eventType}`);
      return;
    }

    // Extract phone from chat object or data
    const phoneRaw =
      body.chat?.phone ||
      body.chat?.wa_chatid ||
      rawData.chat?.phone ||
      rawData.chat?.wa_chatid ||
      rawData.key?.remoteJid ||
      rawData.from ||
      rawData.sender ||
      rawData.sender_pn ||
      '';

    const isGroup =
      body.chat?.wa_isGroup ||
      rawData.isGroup ||
      rawData.chat?.wa_isGroup ||
      phoneRaw.includes('@g.us') ||
      false;

    const phone = phoneRaw.replace(/[^0-9]/g, '').replace(/@.*$/, '') || '';

    // Extract text from various possible locations
    const text =
      rawData.text ||
      rawData.message?.conversation ||
      rawData.message?.extendedTextMessage?.text ||
      rawData.message?.imageMessage?.caption ||
      rawData.message?.videoMessage?.caption ||
      rawData.message?.documentMessage?.caption ||
      body.chat?.text ||
      body.text ||
      rawData.content ||
      '';

    // Ignore messages sent by the API itself
    const fromMe = rawData.fromMe || rawData.key?.fromMe || body.chat?.fromMe || false;
    if (fromMe) {
      console.log('⏭️ [UazAPI] Ignoring message sent by API (fromMe=true)');
      return;
    }

    // Ignore group messages
    if (isGroup) {
      console.log('⏭️ [UazAPI] Ignoring group message');
      return;
    }

    if (!text || !phone) {
      console.log('⚠️ [UazAPI] Webhook: missing text or phone', {
        hasText: !!text,
        hasPhone: !!phone,
        phoneRaw,
        eventType,
        bodyKeys: Object.keys(body).join(','),
      });
      return;
    }

    console.log(`📩 [UazAPI] Message from ${phone}: "${text.substring(0, 100)}"`);

    // Process with DeepSeek (same flow as Evolution API)
    const { deepseekService } = await import('../services/deepseek');
    const { query } = await import('../db/connection');

    // Find or create lead
    let leadResult = await query(
      'SELECT id, name, status FROM leads WHERE phone = $1',
      [phone]
    );

    let leadId: number;
    let leadName: string | null = null;

    if (leadResult.rows.length === 0) {
      const newLead = await query(
        `INSERT INTO leads (phone, status) VALUES ($1, 'new') RETURNING id, name`,
        [phone]
      );
      leadId = newLead.rows[0].id;
      leadName = newLead.rows[0].name;
      console.log(`🆕 [UazAPI] New lead created: ${leadId}`);
    } else {
      leadId = leadResult.rows[0].id;
      leadName = leadResult.rows[0].name;

      if (leadResult.rows[0].status === 'new') {
        await query('UPDATE leads SET status = $1, updated_at = NOW() WHERE id = $2', ['chatting', leadId]);
      }
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

    // Get lead profile
    const profileResult = await query(
      'SELECT * FROM lead_profiles WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 1',
      [leadId]
    );

    // Get lead interests
    const interestsResult = await query(
      'SELECT interest_type, interest_details FROM lead_interests WHERE lead_id = $1',
      [leadId]
    );

    // Process with DeepSeek
    const aiResponse = await deepseekService.processMessage({
      leadId,
      phone,
      leadName,
      message: text,
      conversationHistory,
      currentProfile: profileResult.rows[0] || null,
      currentInterests: interestsResult.rows,
    });

    if (aiResponse) {
      // Save assistant response
      await query(
        `INSERT INTO conversations (lead_id, role, content, stage_id, metadata) VALUES ($1, 'assistant', $2, $3, $4)`,
        [leadId, aiResponse.message, aiResponse.stage || null, JSON.stringify(aiResponse.metadata || {})]
      );

      // Update lead info if extracted
      if (aiResponse.extractedData) {
        await updateLeadData(leadId, aiResponse.extractedData);
      }

      // Handle qualification
      if (aiResponse.qualified !== undefined) {
        await handleQualification(leadId, aiResponse);
      }

      // Send response back via UazAPI
      // Try to find the instance token from store, or use env fallback
      const instanceName = body.instance || body.BaseUrl?.replace('https://', '').replace('.uazapi.com', '') || '';
      let token = instanceStore.get(instanceName);

      if (!token) {
        // Fallback: use env variable or try common instance names
        token = instanceStore.get('00PdbK') || instanceStore.get('uazapi-instance') || config.uazapi.instanceToken || '';
      }

      if (token) {
        instanceStore.set('00PdbK', token);
        const sent = await uazapiService.sendText(token, phone, aiResponse.message);
        if (sent) {
          console.log(`✅ [UazAPI] Response sent to ${phone}`);
        }
      } else {
        console.error('❌ [UazAPI] No token found to send response. Store tokens:', [...instanceStore.entries()].map(([k]) => k).join(','));
      }
    }
  } catch (error) {
    console.error('❌ [UazAPI] Error processing webhook:', error);
  }
});

/**
 * POST /uazapi/logout - Disconnect WhatsApp instance
 * Body: { token: string }
 */
router.post('/logout', async (req: Request, res: Response) => {
  try {
    const token = req.body.token || '';

    if (!token) {
      res.status(400).json({ success: false, error: 'Token da instância é obrigatório' });
      return;
    }

    await uazapiService.disconnectInstance(token);
    res.json({ success: true, message: 'Instância desconectada' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /uazapi/delete - Delete instance completely
 * Query: ?name=nome-da-instancia
 */
router.delete('/delete', async (req: Request, res: Response) => {
  try {
    const instanceName = (req.query.instance as string) || '';

    if (!instanceName) {
      res.status(400).json({ success: false, error: 'Nome da instância é obrigatório' });
      return;
    }

    await uazapiService.deleteInstance(instanceName);
    instanceStore.delete(instanceName);
    res.json({ success: true, message: `Instância "${instanceName}" deletada` });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// =============================================
// Helper functions (reused from webhook.ts logic)
// =============================================

async function updateLeadData(leadId: number, data: any) {
  const { query } = await import('../db/connection');
  const { name, email, investor_profile, experience, goal, timeline, monthly_value, interest, interest_details, allow_contact } = data;

  // Update lead basic info
  const updates: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (name) { updates.push(`name = $${paramIndex++}`); values.push(name); }
  if (email) { updates.push(`email = $${paramIndex++}`); values.push(email); }
  if (allow_contact !== undefined) { updates.push(`allow_contact = $${paramIndex++}`); values.push(allow_contact); }

  if (updates.length > 0) {
    values.push(leadId);
    await query(
      `UPDATE leads SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${paramIndex}`,
      values
    );
  }

  // Update/Insert profile
  if (investor_profile || experience || goal || timeline || monthly_value) {
    const existingProfile = await query('SELECT id FROM lead_profiles WHERE lead_id = $1', [leadId]);

    if (existingProfile.rows.length > 0) {
      const profileUpdates: string[] = [];
      const profileValues: any[] = [];
      let pIdx = 1;

      if (investor_profile) { profileUpdates.push(`investor_profile = $${pIdx++}`); profileValues.push(investor_profile); }
      if (experience) { profileUpdates.push(`experience = $${pIdx++}`); profileValues.push(experience); }
      if (goal) { profileUpdates.push(`goal = $${pIdx++}`); profileValues.push(goal); }
      if (timeline) { profileUpdates.push(`timeline = $${pIdx++}`); profileValues.push(timeline); }
      if (monthly_value) { profileUpdates.push(`monthly_value = $${pIdx++}`); profileValues.push(monthly_value); }

      if (profileUpdates.length > 0) {
        profileValues.push(leadId);
        await query(
          `UPDATE lead_profiles SET ${profileUpdates.join(', ')}, updated_at = NOW() WHERE lead_id = $${pIdx}`,
          profileValues
        );
      }
    } else {
      await query(
        `INSERT INTO lead_profiles (lead_id, investor_profile, experience, goal, timeline, monthly_value) 
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [leadId, investor_profile || null, experience || null, goal || null, timeline || null, monthly_value || null]
      );
    }
  }

  // Insert interests
  if (interest) {
    const interests = Array.isArray(interest) ? interest : [interest];
    for (const int of interests) {
      const exists = await query(
        'SELECT id FROM lead_interests WHERE lead_id = $1 AND interest_type = $2',
        [leadId, int]
      );
      if (exists.rows.length === 0) {
        await query(
          `INSERT INTO lead_interests (lead_id, interest_type, interest_details) VALUES ($1, $2, $3)`,
          [leadId, int, interest_details || null]
        );
      }
    }
  }
}

async function handleQualification(leadId: number, aiResponse: any) {
  const { query } = await import('../db/connection');
  const score = aiResponse.qualificationScore || 0;

  // Save summary
  await query(
    `INSERT INTO conversation_summaries (lead_id, extracted_info, qualification_score, qualified_at)
     VALUES ($1, $2, $3, $4)`,
    [
      leadId,
      JSON.stringify(aiResponse.extractedData || {}),
      score,
      aiResponse.qualified ? new Date().toISOString() : null,
    ]
  );

  if (aiResponse.qualified) {
    // Update lead status
    await query(
      "UPDATE leads SET status = 'qualified', updated_at = NOW() WHERE id = $1",
      [leadId]
    );

    console.log(`⭐ Lead ${leadId} QUALIFIED with score ${score}`);

    if (aiResponse.action === 'generate_proposal') {
      const { proposalGenerator } = await import('../services/proposal-generator');
      try {
        const leadData = await query('SELECT * FROM leads WHERE id = $1', [leadId]);
        const profileData = await query('SELECT * FROM lead_profiles WHERE lead_id = $1', [leadId]);
        const interestsData = await query('SELECT * FROM lead_interests WHERE lead_id = $1', [leadId]);

        const proposalUrl = await proposalGenerator.generate({
          lead: leadData.rows[0],
          profile: profileData.rows[0] || null,
          interests: interestsData.rows || [],
          extractedData: aiResponse.extractedData || {},
        });

        await query(
          "UPDATE conversation_summaries SET proposal_url = $1, updated_at = NOW() WHERE lead_id = $2",
          [proposalUrl, leadId]
        );

        console.log(`📄 Proposal generated for lead ${leadId}: ${proposalUrl}`);
      } catch (error) {
        console.error('❌ Failed to generate proposal:', error);
      }
    }
  }
}

export default router;
