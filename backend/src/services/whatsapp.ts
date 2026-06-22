import axios, { AxiosInstance } from 'axios';
import { config } from '../config';

class WhatsAppService {
  private api: AxiosInstance;

  constructor() {
    this.api = axios.create({
      baseURL: `https://graph.facebook.com/${config.whatsapp.apiVersion}/${config.whatsapp.phoneNumberId}`,
      headers: {
        Authorization: `Bearer ${config.whatsapp.token}`,
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Send a text message via WhatsApp Business API
   */
  async sendText(to: string, text: string): Promise<boolean> {
    try {
      await this.api.post('/messages', {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { preview_url: false, body: text },
      });
      console.log(`✅ WhatsApp message sent to ${to}`);
      return true;
    } catch (error: any) {
      console.error(`❌ Failed to send WhatsApp message to ${to}:`, error.response?.data || error.message);
      return false;
    }
  }

  /**
   * Send a text message with a preview URL
   */
  async sendTextWithLink(to: string, text: string, linkUrl?: string): Promise<boolean> {
    try {
      const body = linkUrl ? `${text}\n\n${linkUrl}` : text;
      await this.api.post('/messages', {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { preview_url: true, body },
      });
      console.log(`✅ WhatsApp message with link sent to ${to}`);
      return true;
    } catch (error: any) {
      console.error(`❌ Failed to send WhatsApp message to ${to}:`, error.response?.data || error.message);
      return false;
    }
  }

  /**
   * Send a document (PDF, etc.) via WhatsApp
   */
  async sendDocument(to: string, documentUrl: string, filename: string, caption?: string): Promise<boolean> {
    try {
      await this.api.post('/messages', {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'document',
        document: {
          link: documentUrl,
          filename,
          caption: caption || '',
        },
      });
      console.log(`✅ WhatsApp document sent to ${to}: ${filename}`);
      return true;
    } catch (error: any) {
      console.error(`❌ Failed to send document to ${to}:`, error.response?.data || error.message);
      return false;
    }
  }

  /**
   * Mark a message as read
   */
  async markAsRead(messageId: string): Promise<void> {
    try {
      await this.api.post('/messages', {
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
      });
    } catch (error) {
      // Non-critical, just log
      console.debug('Could not mark message as read');
    }
  }

  /**
   * Send interactive buttons message
   */
  async sendButtons(to: string, text: string, buttons: { id: string; title: string }[]): Promise<boolean> {
    try {
      await this.api.post('/messages', {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text },
          action: {
            buttons: buttons.slice(0, 3).map((btn) => ({
              type: 'reply',
              reply: { id: btn.id, title: btn.title.substring(0, 20) },
            })),
          },
        },
      });
      console.log(`✅ WhatsApp buttons sent to ${to}`);
      return true;
    } catch (error: any) {
      console.error(`❌ Failed to send buttons to ${to}:`, error.response?.data || error.message);
      return false;
    }
  }
}

export const whatsappService = new WhatsAppService();
