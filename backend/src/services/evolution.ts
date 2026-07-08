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
  async sendText(phone: string, message: string, instanceName: string = 'kea-chatbot'): Promise<boolean> {
    try {
      // Format phone: remove non-digits, add DDI if needed
      const cleanPhone = phone.replace(/\D/g, '');
      const formattedPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;

      await axios.post(
        `${this.apiUrl}/message/sendText/${instanceName}`,
        {
          number: formattedPhone,
          text: message,
          delay: 1000,
        },
        { headers: this.headers, timeout: 15000 }
      );
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
}

export const evolutionService = new EvolutionService();
