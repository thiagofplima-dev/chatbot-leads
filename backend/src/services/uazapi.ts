import axios from 'axios';
import { config } from '../config';

export interface UazapiInstance {
  name: string;
  token: string;
  status: 'disconnected' | 'connecting' | 'connected' | 'hibernated';
  adminField01?: string;
  adminField02?: string;
}

export interface UazapiConnectResponse {
  instance: UazapiInstance;
  qrcode?: {
    code: string;
    base64: string;
    count: number;
  };
  pairingCode?: string;
}

class UazapiService {
  private baseUrl: string;
  private adminToken: string;

  constructor() {
    this.baseUrl = config.uazapi.baseUrl;
    this.adminToken = config.uazapi.adminToken;
  }

  private get headers() {
    return { 'Content-Type': 'application/json' };
  }

  /**
   * Create a new WhatsApp instance
   * POST /instance/create (requires admintoken)
   */
  async createInstance(name: string, metadata?: { adminField01?: string; adminField02?: string }): Promise<UazapiInstance> {
    try {
      const response = await axios.post(
        `${this.baseUrl}/instance/create`,
        { name, ...metadata },
        { headers: { ...this.headers, admintoken: this.adminToken }, timeout: 15000 }
      );
      console.log(`✅ UazAPI instance "${name}" created`);
      return response.data;
    } catch (error: any) {
      console.error('❌ UazAPI create instance error:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Connect instance to WhatsApp — generates QR Code or pairing code
   * POST /instance/connect (requires instance token)
   * If phone is provided → pairing code; if omitted → QR Code
   */
  async connectInstance(instanceToken: string, phone?: string): Promise<UazapiConnectResponse> {
    try {
      const body: any = {};
      if (phone) body.phone = phone;
      body.browser = 'auto';

      const response = await axios.post(
        `${this.baseUrl}/instance/connect`,
        body,
        { headers: { ...this.headers, token: instanceToken }, timeout: 30000 }
      );
      return response.data;
    } catch (error: any) {
      console.error('❌ UazAPI connect instance error:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Check instance connection status
   * GET /instance/status (requires instance token)
   */
  async getStatus(instanceToken: string): Promise<{ status: string; instance: UazapiInstance }> {
    try {
      const response = await axios.get(
        `${this.baseUrl}/instance/status`,
        { headers: { ...this.headers, token: instanceToken }, timeout: 10000 }
      );
      return response.data;
    } catch (error: any) {
      console.error('❌ UazAPI status error:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Send a text message
   * POST /send/text (requires instance token)
   */
  async sendText(
    instanceToken: string,
    phone: string,
    text: string,
    options?: {
      delay?: number;
      readchat?: boolean;
      readmessages?: boolean;
      replyid?: string;
      mentions?: string;
      track_source?: string;
      track_id?: string;
    }
  ): Promise<boolean> {
    try {
      const cleanPhone = phone.replace(/\D/g, '');
      const formattedPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;

      console.log(`📤 [UazAPI] Sending text to ${formattedPhone}`);

      await axios.post(
        `${this.baseUrl}/send/text`,
        {
          number: formattedPhone,
          text,
          delay: options?.delay ?? 500,
          readchat: options?.readchat ?? true,
          readmessages: options?.readmessages ?? false,
          replyid: options?.replyid,
          mentions: options?.mentions,
          track_source: options?.track_source ?? 'chatbot',
          track_id: options?.track_id,
        },
        { headers: { ...this.headers, token: instanceToken }, timeout: 30000 }
      );

      console.log(`✅ [UazAPI] Text sent to ${formattedPhone}`);
      return true;
    } catch (error: any) {
      console.error('❌ UazAPI send text error:', error.response?.data || error.message);
      return false;
    }
  }

  /**
   * Send a media message (image, video, audio, document)
   * POST /send/media (requires instance token)
   */
  async sendMedia(
    instanceToken: string,
    phone: string,
    type: 'image' | 'video' | 'audio' | 'document',
    mediaUrl: string,
    caption?: string,
    filename?: string
  ): Promise<boolean> {
    try {
      const cleanPhone = phone.replace(/\D/g, '');
      const formattedPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;

      console.log(`📤 [UazAPI] Sending ${type} to ${formattedPhone}`);

      const body: any = {
        number: formattedPhone,
        type,
        media: mediaUrl,
      };
      if (caption) body.caption = caption;
      if (filename) body.filename = filename;

      await axios.post(
        `${this.baseUrl}/send/media`,
        body,
        { headers: { ...this.headers, token: instanceToken }, timeout: 60000 }
      );

      console.log(`✅ [UazAPI] ${type} sent to ${formattedPhone}`);
      return true;
    } catch (error: any) {
      console.error('❌ UazAPI send media error:', error.response?.data || error.message);
      return false;
    }
  }

  /**
   * Configure webhook for the instance
   * POST /webhook (requires instance token)
   */
  async setWebhook(
    instanceToken: string,
    webhookUrl: string,
    events: string[] = ['messages', 'connection'],
    excludeMessages: string[] = ['wasSentByApi']
  ): Promise<void> {
    try {
      const response = await axios.post(
        `${this.baseUrl}/webhook`,
        {
          url: webhookUrl,
          events,
          excludeMessages,
        },
        { headers: { ...this.headers, token: instanceToken }, timeout: 15000 }
      );
      console.log(`✅ [UazAPI] Webhook configured → ${webhookUrl}`, JSON.stringify(response.data).substring(0, 200));
    } catch (error: any) {
      console.error('❌ UazAPI webhook error:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Get webhook configuration for the instance
   * GET /webhook (requires instance token)
   */
  async getWebhook(instanceToken: string): Promise<any> {
    try {
      const response = await axios.get(
        `${this.baseUrl}/webhook`,
        { headers: { ...this.headers, token: instanceToken }, timeout: 10000 }
      );
      return response.data;
    } catch (error: any) {
      console.error('❌ UazAPI get webhook error:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Disconnect instance from WhatsApp
   * POST /instance/disconnect (requires instance token)
   */
  async disconnectInstance(instanceToken: string): Promise<void> {
    try {
      await axios.post(
        `${this.baseUrl}/instance/disconnect`,
        {},
        { headers: { ...this.headers, token: instanceToken }, timeout: 15000 }
      );
      console.log(`✅ [UazAPI] Instance disconnected`);
    } catch (error: any) {
      console.error('❌ UazAPI disconnect error:', error.response?.data || error.message);
    }
  }

  /**
   * Delete instance completely
   * DELETE /instance/delete?name=xxx (requires admintoken)
   */
  async deleteInstance(name: string): Promise<void> {
    try {
      await axios.delete(
        `${this.baseUrl}/instance/delete`,
        {
          params: { name },
          headers: { ...this.headers, admintoken: this.adminToken },
          timeout: 15000,
        }
      );
      console.log(`✅ [UazAPI] Instance "${name}" deleted`);
    } catch (error: any) {
      console.error('❌ UazAPI delete error:', error.response?.data || error.message);
    }
  }
}

export const uazapiService = new UazapiService();
