import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { config } from '../config';

/**
 * WhatsApp Webhook Verification (GET /webhook)
 * Meta sends a GET request to verify the webhook endpoint.
 */
export function verifyWebhook(req: Request, res: Response): void {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === config.whatsapp.verifyToken) {
    console.log('✅ Webhook verified by Meta');
    res.status(200).send(challenge);
  } else {
    console.warn('❌ Webhook verification failed');
    res.status(403).send('Verification failed');
  }
}

/**
 * Verify WhatsApp webhook signature (POST /webhook)
 * Validates the X-Hub-Signature-256 header to ensure the request came from Meta.
 */
export function verifySignature(req: Request, res: Response, next: NextFunction): void {
  // Skip signature verification in dev mode
  if (config.isDev || !config.whatsapp.appSecret) {
    console.log('⚠️ Skipping signature verification (dev mode or no app secret)');
    return next();
  }

  const signature = req.headers['x-hub-signature-256'] as string;
  if (!signature) {
    console.warn('⚠️ Missing webhook signature');
    res.status(401).json({ error: 'Missing signature' });
    return;
  }

  const payload = req.rawBody || JSON.stringify(req.body);
  const expectedSignature = crypto
    .createHmac('sha256', config.whatsapp.appSecret)
    .update(payload)
    .digest('hex');

  const receivedSignature = signature.replace('sha256=', '');

  if (expectedSignature !== receivedSignature) {
    console.warn('⚠️ Invalid webhook signature');
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  next();
}
