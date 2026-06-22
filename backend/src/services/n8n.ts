import axios from 'axios';
import { config } from '../config';

export interface ProcessMessageInput {
  leadId: number;
  phone: string;
  leadName: string | null;
  message: string;
  conversationHistory: { role: string; content: string }[];
  currentProfile: any;
  currentInterests: any[];
}

export interface N8nResponse {
  message: string;
  stage?: string;
  qualified?: boolean;
  qualificationScore?: number;
  action?: 'generate_proposal' | 'notify_team' | 'continue';
  extractedData?: {
    name?: string;
    email?: string;
    investor_profile?: string;
    experience?: string;
    goal?: string;
    timeline?: string;
    monthly_value?: number;
    interest?: string | string[];
    interest_details?: string;
    allow_contact?: boolean;
    [key: string]: any;
  };
  metadata?: Record<string, any>;
}

class N8nService {
  private webhookUrl: string;

  constructor() {
    this.webhookUrl = config.n8n.webhookUrl;
  }

  /**
   * Send a message to n8n for AI processing via DeepSeek
   */
  async processMessage(input: ProcessMessageInput): Promise<N8nResponse | null> {
    try {
      const payload = {
        leadId: input.leadId,
        phone: input.phone,
        leadName: input.leadName,
        message: input.message,
        conversationHistory: input.conversationHistory,
        currentProfile: input.currentProfile,
        currentInterests: input.currentInterests,
      };

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (config.n8n.apiKey) {
        headers['X-API-Key'] = config.n8n.apiKey;
      }

      const response = await axios.post<N8nResponse>(
        `${this.webhookUrl}/process-message`,
        payload,
        { headers, timeout: 30000 }
      );

      return response.data;
    } catch (error: any) {
      if (error.code === 'ECONNREFUSED' || error.code === 'ECONNABORTED') {
        // Fallback: if n8n is not available, return a simple response
        console.warn('⚠️ n8n not available, using fallback response');
        return {
          message: 'Olá! Obrigado pela sua mensagem. Um dos nossos especialistas entrará em contato em breve.',
          stage: 'fallback',
          qualified: false,
          action: 'notify_team',
        };
      }

      console.error('❌ n8n processing error:', error.response?.data || error.message);
      return null;
    }
  }

  /**
   * Trigger n8n workflow for proposal notification
   */
  async triggerProposalNotification(leadId: number, phone: string, proposalUrl: string): Promise<void> {
    try {
      await axios.post(
        `${this.webhookUrl}/notify-qualified-lead`,
        { leadId, phone, proposalUrl },
        { timeout: 10000 }
      );
      console.log(`✅ n8n proposal notification triggered for lead ${leadId}`);
    } catch (error) {
      console.error('❌ n8n notification trigger failed:', error);
    }
  }
}

export const n8nService = new N8nService();
