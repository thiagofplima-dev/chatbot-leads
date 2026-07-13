import { Router, Request, Response } from 'express';
import { evolutionService } from '../services/evolution';

const router = Router();

router.get('/qrcode', async (req: Request, res: Response) => {
  try {
    const instanceName = (req.query.instance as string) || 'kea-whatsapp';
    const result = await evolutionService.createInstance(instanceName);
    
    if (result.base64 || result.qrcodeBase64) {
      const b64 = (result.base64 || result.qrcodeBase64).replace('data:image/png;base64,', '');
      
      res.send(`<!DOCTYPE html>
<html>
<head><title>QR Code WhatsApp</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{display:flex;justify-content:center;align-items:center;min-height:100vh;font-family:sans-serif;background:#f0f2f5}
  .card{background:#fff;border-radius:16px;padding:40px;text-align:center;box-shadow:0 2px 20px rgba(0,0,0,.1)}
  h2{color:#075e54;margin-bottom:8px}
  p{color:#667781;margin-bottom:24px;font-size:14px}
  img{width:350px;height:350px;border:3px solid #25D366;border-radius:12px}
  .steps{text-align:left;margin-top:24px;padding:16px;background:#f0f2f5;border-radius:8px;font-size:14px;color:#333}
  .steps li{margin:8px 0}
  .refresh{margin-top:16px;color:#25D366;cursor:pointer;font-size:13px}
</style>
</head>
<body>
<div class="card">
  <h2>📱 Conectar WhatsApp</h2>
  <p>Escaneie o QR Code com seu WhatsApp</p>
  <img src="data:image/png;base64,${b64}" alt="QR Code"/>
  <div class="steps">
    <strong>Passos:</strong>
    <ol>
      <li>Abra o WhatsApp no celular</li>
      <li>Toque em <strong>⋮ (3 pontinhos)</strong></li>
      <li>Vá em <strong>Aparelhos conectados</strong></li>
      <li>Toque em <strong>Conectar um aparelho</strong></li>
      <li>Aponte a câmera para o QR Code</li>
    </ol>
  </div>
  <div class="refresh" onclick="location.reload()">🔄 Gerar novo QR Code</div>
</div>
<script>
  // Auto-refresh every 30s
  setTimeout(function() {
    fetch('/view/qrcode?instance=${instanceName}&check=true').then(r=>r.json()).then(d=>{
      if(d.status==='open') location.href='/?connected=true';
      else location.reload();
    });
  }, 30000);
</script>
</body>
</html>`);
    } else {
      res.send(`<html><body><h2>Instância "${instanceName}" já conectada!</h2><p>Status: ${result.connectionStatus || 'open'}</p></body></html>`);
    }
  } catch (error: any) {
    res.status(500).send(`<html><body><h2>Erro</h2><p>${error.message}</p></body></html>`);
  }
});

// Endpoint para verificar status
router.get('/check', async (req: Request, res: Response) => {
  try {
    const info = await evolutionService.getInstanceInfo();
    const instance = info.find((i: any) => i.name === (req.query.instance || 'kea-whatsapp'));
    res.json({ status: instance?.connectionStatus || 'not_found' });
  } catch {
    res.json({ status: 'error' });
  }
});

export default router;
