import 'dotenv/config';
process.env.DISABLE_HMR = process.env.DISABLE_HMR || 'true';
import http from 'http';
import express, { type Request, type Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY belum dikonfigurasi di environment server.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '12mb' }));

  // Endpoint 1: Scan daftar nama dari foto catatan atau screenshot WhatsApp
  app.post('/api/gemini/scan-names', async (req: Request, res: Response) => {
    try {
      const { imageBase64, mimeType } = req.body as {
        imageBase64?: string;
        mimeType?: string;
      };

      if (!imageBase64 || !mimeType) {
        res.status(400).json({ error: 'Gambar tidak valid atau kosong.' });
        return;
      }

      const ai = getGeminiClient();
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType,
                data: imageBase64,
              },
            },
            {
              text: 'Ekstrak semua nama pemain badminton dari gambar ini (bisa berupa catatan tulisan tangan, papan tulis, atau screenshot daftar hadir grup WhatsApp). Abaikan nomor urut, emoji, jam, keterangan lunas/bayar, atau kata-kata non-nama seperti "List Mabar" atau "Kurang 2". Kembalikan hanya daftar nama bersih.',
            },
          ],
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              names: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Daftar nama pemain yang terdeteksi.',
              },
            },
            required: ['names'],
          },
        },
      });

      const raw = (response.text ?? '{}').trim();
      const parsed = JSON.parse(raw) as { names?: string[] };
      const cleanNames = (parsed.names ?? [])
        .map((n) => n.trim())
        .filter((n) => n.length > 0);

      res.json({ names: cleanNames });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal memindai gambar dengan Gemini.';
      console.error('scan-names error:', err);
      res.status(500).json({ error: message });
    }
  });

  // Endpoint 2: Ringkasan sesi bergaya komentator olahraga
  app.post('/api/gemini/session-summary', async (req: Request, res: Response) => {
    try {
      const { sessionStats } = req.body as { sessionStats?: unknown };
      if (!sessionStats) {
        res.status(400).json({ error: 'Data statistik sesi diperlukan.' });
        return;
      }

      const ai = getGeminiClient();
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Buat ringkasan sesi mabar badminton yang seru, hangat, dan lucu bergaya komentator olahraga Indonesia berdasarkan data statistik berikut:\n${JSON.stringify(sessionStats, null, 2)}`,
        config: {
          systemInstruction:
            'Kamu adalah komentator badminton Indonesia yang enerjik dan akrab untuk acara main bareng (mabar) santai. Sebutkan MVP hari ini, pasangan paling solid, momen ketat/deuce jika ada, dan apresiasi semua pemain dalam 2-3 paragraf singkat berbahasa Indonesia yang natural tanpa markdown berlebihan.',
        },
      });

      res.json({ summary: (response.text ?? '').trim() });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal membuat ringkasan sesi.';
      console.error('session-summary error:', err);
      res.status(500).json({ error: message });
    }
  });

  // Endpoint 3: Saran pasangan seimbang berdasarkan statistik
  app.post('/api/gemini/suggest-pairs', async (req: Request, res: Response) => {
    try {
      const { players } = req.body as { players?: unknown };
      if (!players) {
        res.status(400).json({ error: 'Daftar pemain diperlukan.' });
        return;
      }

      const ai = getGeminiClient();
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Analisa statistik pemain aktif berikut dan buatkan rekomendasi susunan pasangan 2 vs 2 yang paling seimbang dan seru:\n${JSON.stringify(players, null, 2)}`,
        config: {
          systemInstruction:
            'Pasangkan pemain kuat dengan pemain yang statistiknya lebih rendah agar pertandingan 2 vs 2 seimbang. Jawab dalam JSON sesuai skema dengan bahasa Indonesia yang jelas.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              teamA: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: '2 nama pemain untuk Tim A',
              },
              teamB: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: '2 nama pemain untuk Tim B',
              },
              alasan: {
                type: Type.STRING,
                description: 'Alasan singkat mengapa susunan ini seimbang',
              },
            },
            required: ['teamA', 'teamB', 'alasan'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      res.json(parsed);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal membuat saran pasangan.';
      console.error('suggest-pairs error:', err);
      res.status(500).json({ error: message });
    }
  });

  const httpServer = http.createServer(app);
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        watch: null,
      },
      appType: 'spa',
    });
    app.get('/@vite/client', async (_req, res, next) => {
      try {
        const transformed = await vite.transformRequest('/@vite/client');
        if (!transformed?.code) {
          next();
          return;
        }
        const safeCode = transformed.code.replace(
          'transport.connect(createHMRHandler(handleMessage));',
          'transport.send = async () => {}; transport.invoke = async () => undefined;'
        );
        res.type('application/javascript').send(safeCode);
      } catch (err) {
        next(err);
      }
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`SmashBoard server berjalan di http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Gagal menjalankan server:', err);
  process.exit(1);
});
