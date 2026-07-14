import axios from 'axios';
import { config } from '../config';

export interface EvolutionInstance {
  instance: {
    instanceName: string;
    status: string;
    serverUrl: string;
    apikey: string;
  };
  qrcode?: {
    pairingCode: string;
    code: string;
    base64: string;
    count: number;
  };
}

class EvolutionService {
  private apiUrl: string;
  private apiKey: string;

  constructor() {
    this.apiUrl = config.evolution.apiUrl;
    this.apiKey = config.evolution.apiKey;
  }

  private get headers() {
    return {
      'apikey': this.apiKey,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Create a new WhatsApp instance and get QR Code
   */
  async createInstance(instanceName: string = 'kea-chatbot'): Promise<any> {
    try {
      // Step 1: Try to create instance (may fail if already exists)
      try {
        await axios.post(
          `${this.apiUrl}/instance/create`,
          {
            instanceName,
            integration: 'WHATSAPP-BAILEYS',
          },
          { headers: this.headers, timeout: 30000 }
        );
      } catch (createErr: any) {
        // Ignore "already in use" error
        if (!createErr.response?.data?.response?.message?.[0]?.includes('already in use')) {
          throw createErr;
        }
      }

      // Step 2: Connect to get QR Code
      const response = await axios.get(
        `${this.apiUrl}/instance/connect/${instanceName}`,
        { headers: this.headers, timeout: 30000 }
      );
      return response.data;
    } catch (error: any) {
      console.error('❌ Evolution API create instance error:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Get instance info and QR Code if not connected
   */
  async getInstanceInfo(instanceName: string = 'kea-chatbot'): Promise<any> {
    try {
      const response = await axios.get(
        `${this.apiUrl}/instance/fetchInstances`,
        { headers: this.headers, timeout: 10000 }
      );
      return response.data;
    } catch (error: any) {
      console.error('❌ Evolution API fetch error:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Send a text message via Evolution API
   */
  async sendText(phone: string, message: string, instanceName: string = 'mive-bot'): Promise<boolean> {
    try {
      // Format phone: remove non-digits, add DDI if needed
      const cleanPhone = phone.replace(/\D/g, '');
      const formattedPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;

      console.log(`📤 Sending to ${formattedPhone} via instance ${instanceName}`);

      const response = await axios.post(
        `${this.apiUrl}/message/sendText/${instanceName}`,
        {
          number: formattedPhone,
          text: message,
          delay: 500,
        },
        { headers: this.headers, timeout: 60000 }
      );
      console.log(`✅ Message sent:`, response.data?.key?.id || 'ok');
      return true;
    } catch (error: any) {
      console.error('❌ Evolution API send error:', error.response?.data || error.message);
      return false;
    }
  }

  /**
   * Logout/disconnect an instance
   */
  async logoutInstance(instanceName: string = 'kea-chatbot'): Promise<void> {
    try {
      await axios.delete(
        `${this.apiUrl}/instance/logout/${instanceName}`,
        { headers: this.headers, timeout: 10000 }
      );
    } catch (error: any) {
      console.error('❌ Evolution API logout error:', error.response?.data || error.message);
    }
  }

  /**
   * Delete an instance completely
   */
  async deleteInstance(instanceName: string = 'kea-chatbot'): Promise<void> {
    try {
      await axios.delete(
        `${this.apiUrl}/instance/delete/${instanceName}`,
        { headers: this.headers, timeout: 10000 }
      );
      console.log(`✅ Instance ${instanceName} deleted`);
    } catch (error: any) {
      console.error('❌ Evolution API delete error:', error.response?.data || error.message);
    }
  }

  /**
   * Create pairing code instead of QR Code
   */
  async createPairingCode(instanceName: string, phone: string): Promise<any> {
    try {
      // Create instance if not exists
      try {
        await axios.post(
          `${this.apiUrl}/instance/create`,
          { instanceName, integration: 'WHATSAPP-BAILEYS' },
          { headers: this.headers, timeout: 30000 }
        );
      } catch (e: any) {
        if (!e.response?.data?.response?.message?.[0]?.includes('already in use')) throw e;
      }
      
      // Request pairing code
      const response = await axios.post(
        `${this.apiUrl}/instance/connect/${instanceName}`,
        { number: phone },
        { headers: this.headers, timeout: 30000 }
      );
      return response.data;
    } catch (error: any) {
      console.error('❌ Evolution API pairing error:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Set webhook for instance to receive messages
   * Endpoint correto: POST {baseUrl}/webhook/instance
   */
  async setWebhook(instanceName: string = 'kea-whatsapp'): Promise<void> {
    try {
      const webhookUrl = 'https://chatbot-leads-production.up.railway.app/evolution/webhook';
      
      const response = await axios.post(
        `${this.apiUrl}/webhook/set/${instanceName}`,
        {
          webhook: {
            enabled: true,
            url: webhookUrl,
            byEvents: false,
            base64: false,
            events: ['MESSAGES_UPSERT', 'SEND_MESSAGE', 'CONNECTION_UPDATE'],
          }
        },
        { headers: this.headers, timeout: 15000 }
      );
      console.log(`✅ Webhook configured for ${instanceName}`, JSON.stringify(response.data));
    } catch (error: any) {
      console.error('❌ Evolution API webhook error:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Find webhook configuration for an instance
   * GET {baseUrl}/webhook/find/{instanceName}
   */
  async findWebhook(instanceName: string = 'kea-whatsapp'): Promise<any> {
    try {
      const response = await axios.get(
        `${this.apiUrl}/webhook/find/${instanceName}`,
        { headers: this.headers, timeout: 10000 }
      );
      return response.data;
    } catch (error: any) {
      console.error('❌ Evolution API find webhook error:', error.response?.data || error.message);
      throw error;
    }
  }
}

export const evolutionService = new EvolutionService();
