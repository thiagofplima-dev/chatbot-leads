import { Router, Request, Response } from 'express';
import { verifyWebhook, verifySignature } from '../middleware/auth';
import { webhookRateLimit } from '../middleware/rateLimit';
import { query } from '../db/connection';
import { whatsappService } from '../services/whatsapp';
import { n8nService } from '../services/n8n';

const router = Router();

/**
 * GET /webhook - WhatsApp Webhook Verification
 * Called by Meta to verify the webhook endpoint.
 */
router.get('/', verifyWebhook);

/**
 * POST /webhook - Receive WhatsApp messages
 * Called by Meta when a user sends a message to the WhatsApp Business number.
 */
router.post('/', webhookRateLimit, verifySignature, async (req: Request, res: Response) => {
  // Always respond 200 to Meta immediately
  res.sendStatus(200);

  try {
    const body = req.body;

    // Validate webhook payload structure
    if (!body?.entry?.[0]?.changes?.[0]?.value) {
      console.log('⚠️ Invalid webhook payload (no changes)');
      return;
    }

    const value = body.entry[0].changes[0].value;
    const messages = value.messages;

    // Ignore non-message events (status updates, etc.)
    if (!messages || messages.length === 0) {
      return;
    }

    const msg = messages[0];
    const phone = msg.from;

    // Ignore messages that are not text
    if (msg.type !== 'text') {
      console.log(`⚠️ Unsupported message type: ${msg.type} from ${phone}`);
      return;
    }

    const text = msg.text.body.trim();
    console.log(`📩 Message from ${phone}: "${text.substring(0, 100)}"`);

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
      console.log(`🆕 New lead created: ${leadId}`);
    } else {
      leadId = leadResult.rows[0].id;
      leadName = leadResult.rows[0].name;

      // Update status to chatting if it's still 'new'
      if (leadResult.rows[0].status === 'new') {
        await query('UPDATE leads SET status = $1, updated_at = NOW() WHERE id = $2', ['chatting', leadId]);
      }
    }

    // Save user message to conversation history
    await query(
      `INSERT INTO conversations (lead_id, role, content) VALUES ($1, 'user', $2)`,
      [leadId, text]
    );

    // Get conversation history (last 20 messages)
    const historyResult = await query(
      `SELECT role, content FROM conversations WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [leadId]
    );
    const conversationHistory = historyResult.rows.reverse();

    // Get lead profile if exists
    const profileResult = await query(
      'SELECT * FROM lead_profiles WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 1',
      [leadId]
    );

    // Get lead interests
    const interestsResult = await query(
      'SELECT interest_type, interest_details FROM lead_interests WHERE lead_id = $1',
      [leadId]
    );

    // Send to n8n for AI processing
    const n8nResponse = await n8nService.processMessage({
      leadId,
      phone,
      leadName,
      message: text,
      conversationHistory,
      currentProfile: profileResult.rows[0] || null,
      currentInterests: interestsResult.rows,
    });

    if (n8nResponse) {
      // Save assistant response
      await query(
        `INSERT INTO conversations (lead_id, role, content, stage_id, metadata) VALUES ($1, 'assistant', $2, $3, $4)`,
        [leadId, n8nResponse.message, n8nResponse.stage || null, JSON.stringify(n8nResponse.metadata || {})]
      );

      // Update lead info if extracted
      if (n8nResponse.extractedData) {
        await updateLeadData(leadId, n8nResponse.extractedData);
      }

      // Handle qualification result
      if (n8nResponse.qualified !== undefined) {
        await handleQualification(leadId, n8nResponse);
      }

      // Send response via WhatsApp
      await whatsappService.sendText(phone, n8nResponse.message);
    }
  } catch (error) {
    console.error('❌ Error processing webhook:', error);
  }
});

/**
 * Update lead data based on extracted information from n8n/DeepSeek
 */
async function updateLeadData(leadId: number, data: any) {
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

/**
 * Handle lead qualification result
 */
async function handleQualification(leadId: number, n8nResponse: any) {
  const score = n8nResponse.qualificationScore || 0;

  // Save summary
  await query(
    `INSERT INTO conversation_summaries (lead_id, extracted_info, qualification_score, qualified_at)
     VALUES ($1, $2, $3, $4)`,
    [
      leadId,
      JSON.stringify(n8nResponse.extractedData || {}),
      score,
      n8nResponse.qualified ? new Date().toISOString() : null,
    ]
  );

  if (n8nResponse.qualified) {
    // Update lead status
    await query(
      "UPDATE leads SET status = 'qualified', updated_at = NOW() WHERE id = $1",
      [leadId]
    );

    console.log(`⭐ Lead ${leadId} QUALIFIED with score ${score}`);

    // Generate proposal if needed
    if (n8nResponse.action === 'generate_proposal') {
      try {
        const { proposalGenerator } = await import('../services/proposal-generator');
        const leadData = await query('SELECT * FROM leads WHERE id = $1', [leadId]);
        const profileData = await query('SELECT * FROM lead_profiles WHERE lead_id = $1', [leadId]);
        const interestsData = await query('SELECT * FROM lead_interests WHERE lead_id = $1', [leadId]);

        const proposalUrl = await proposalGenerator.generate({
          lead: leadData.rows[0],
          profile: profileData.rows[0] || null,
          interests: interestsData.rows || [],
          extractedData: n8nResponse.extractedData || {},
        });

        // Save proposal URL
        await query(
          "UPDATE conversation_summaries SET proposal_url = $1, updated_at = NOW() WHERE lead_id = $2",
          [proposalUrl, leadId]
        );

        console.log(`📄 Proposal generated for lead ${leadId}: ${proposalUrl}`);
      } catch (error) {
        console.error('❌ Failed to generate proposal:', error);
      }
    }
  } else {
    console.log(`📋 Lead ${leadId} not qualified (score: ${score})`);
  }

  // Send notification
  await notifyTeam(leadId, n8nResponse);
}

/**
 * Send notification about qualified lead
 */
async function notifyTeam(leadId: number, n8nResponse: any) {
  const leadResult = await query('SELECT * FROM leads WHERE id = $1', [leadId]);
  const lead = leadResult.rows[0];
  const score = n8nResponse.qualificationScore || 0;

  const message = `
🔔 *Novo Lead${n8nResponse.qualified ? ' QUALIFICADO' : ''}*
Nome: ${lead.name || 'Não informado'}
Telefone: ${lead.phone}
Status: ${n8nResponse.qualified ? '✅ Qualificado' : '📋 Não qualificado'}
Score: ${score}
Interesse: ${n8nResponse.extractedData?.interest || 'N/A'}
Perfil: ${n8nResponse.extractedData?.investor_profile || 'N/A'}
  `.trim();

  console.log('📬 Notification:', message);

  const { config } = await import('../config');

  // Send via configured notification type
  switch (config.notification.type) {
    case 'telegram':
      if (config.notification.telegramBotToken && config.notification.telegramChatId) {
        try {
          const axios = (await import('axios')).default;
          await axios.post(
            `https://api.telegram.org/bot${config.notification.telegramBotToken}/sendMessage`,
            {
              chat_id: config.notification.telegramChatId,
              text: message,
              parse_mode: 'Markdown',
            }
          );
        } catch (error) {
          console.error('❌ Telegram notification failed:', error);
        }
      }
      break;

    case 'webhook':
      if (config.notification.webhookUrl) {
        try {
          const axios = (await import('axios')).default;
          await axios.post(config.notification.webhookUrl, { lead, score, qualified: n8nResponse.qualified });
        } catch (error) {
          console.error('❌ Webhook notification failed:', error);
        }
      }
      break;

    case 'email':
      console.log('📧 Email notification not implemented yet. Configure SMTP.');
      break;

    case 'database':
    default:
      // Already saved to database, just log
      break;
  }
}

export default router;
