/**
 * POST /evolution/pairing - Generate pairing code (numeric) instead of QR
 * Body: { "phone": "5511959464151" }
 */
import { Router, Request, Response } from 'express';
import { evolutionService } from '../services/evolution';

const router = Router();

router.post('/pairing', async (req: Request, res: Response) => {
  try {
    const phone = req.body.phone?.replace(/\D/g, '') || '5511959464151';
    const instanceName = req.body.instance || 'kea-chatbot';
    
    const result = await evolutionService.createPairingCode(instanceName, phone);
    
    if (result.pairingCode) {
      return res.json({
        success: true,
        instanceName,
        pairingCode: result.pairingCode,
        message: `Abra WhatsApp > 3 pontinhos > Aparelhos conectados > Conectar > Conectar com número de telefone > Digite: ${result.pairingCode}`,
      });
    }
    
    res.json({ success: false, error: 'Falha ao gerar código de pareamento' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
