import { Router } from 'express';
import multer from 'multer';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

export function sttRouter({ openaiClient, model }) {
  const r = Router();

  r.post('/', upload.single('audio'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'audio file required (field: audio)' });
    if (!openaiClient) return res.status(503).json({ error: 'OpenAI client not configured' });
    try {
      // openai node sdk expects a File-like with .stream or .arrayBuffer. Pass a Blob-ish.
      const blob = new File([req.file.buffer], req.file.originalname || 'audio.webm', {
        type: req.file.mimetype || 'audio/webm',
      });
      const result = await openaiClient.audio.transcriptions.create({
        file: blob,
        model: model || 'whisper-1',
      });
      res.json({ text: result.text });
    } catch (err) {
      console.error('STT error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  return r;
}
