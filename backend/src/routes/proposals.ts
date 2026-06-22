import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';

const router = Router();
const proposalsDir = path.resolve(__dirname, '..', '..', 'storage', 'propostas');

/**
 * GET /propostas/:filename
 * Serve a generated proposal HTML file.
 */
router.get('/:filename', (req: Request, res: Response) => {
  const { filename } = req.params;

  // Security: prevent path traversal
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return res.status(400).json({ error: 'Invalid filename' });
  }

  const filePath = path.join(proposalsDir, filename);

  // Check if file exists
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Proposal not found' });
  }

  // Serve the HTML file
  res.sendFile(filePath);
});

/**
 * GET /propostas/:filename/pdf
 * Future: Generate PDF version of the proposal
 */
router.get('/:filename/pdf', (_req: Request, res: Response) => {
  res.status(501).json({ error: 'PDF generation not yet implemented. Use the HTML version.' });
});

export default router;
