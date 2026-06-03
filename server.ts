import "dotenv/config";
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

const app = express();
const PORT = 3000;

// Set up larger limit for JSON parsing to support multiple base64-encoded manga panels
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// Endpoint to generate manga recap from images
app.post("/api/recap", async (req, res) => {
  try {
    const { images, context } = req.body;
    
    if (!images || !Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ error: "Missing or invalid images" });
    }

    const model = "gemini-3.5-flash";

    const imageParts = images.map((img: { data: string; mimeType: string }) => {
      // Extract clean base64 data
      let base64Data = img.data || '';
      if (base64Data.includes(',')) {
        base64Data = base64Data.split(',')[1];
      }
      base64Data = base64Data.trim();

      // Normalize common MIME type anomalies
      let mimeType = img.mimeType ? img.mimeType.toLowerCase().trim() : 'image/jpeg';
      if (mimeType === 'image/jpg') {
        mimeType = 'image/jpeg';
      }
      const supportedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
      if (!supportedMimes.includes(mimeType)) {
        mimeType = 'image/jpeg'; // fallback
      }

      return {
        inlineData: {
          data: base64Data,
          mimeType: mimeType
        }
      };
    });

    const contextInfo = (context?.title || context?.chapter) 
      ? `Manga ini berjudul "${context.title || 'Unknown'}" dan ini adalah Chapter ${context.chapter || 'N/A'}. ` 
      : '';

    const styleInstruction = context?.style === 'formal' 
      ? 'Gunakan gaya bahasa formal, baku, dan profesional.'
      : `Gunakan gaya bahasa SANTAI, GAUL, dan SERU. Ciri khas: gunakan kata ganti seperti "cuy", "gak apa-apa", dll.`;

    const hookInstruction = context?.includeHook 
      ? '- HOOK / INTRO: Buat pembukaan sangat singkat yang menarik di awal naskah (maksimal 2 kalimat, hindari basa-basi panjang).' 
      : 'JANGAN BUAT BAGIAN PENDAHULUAN/HOOK APAPUN. Langsung mulai dari dialog/narasi panel pertama cerita tanpa kata pengantar.';

    const outroInstruction = context?.includeOutro
      ? '- OUTRO: Buat kalimat penutup singkat yang mengajak interaksi (seperti subscribe/like) dan kesimpulan cerita.'
      : 'JANGAN BUAT BAGIAN PENUTUP/OUTRO APAPUN. Naskah harus selesai tepat di panel terakhir adegan.';

    const prompt = `
    Anda adalah asisten AI profesional yang ahli dalam membuat naskah recap manga/komik untuk pengisi suara/narator video.
    
    ${contextInfo}
    ${styleInstruction}
    
    Tugas Anda & Aturan Sangat Penting:
    1. **JANGAN MERANGKUM DAN JANGAN BASA-BASI**: Langsung bahas ke inti cerita dari panel awal. Naskah tidak boleh bertele-tele, tidak boleh ada salam pengantar berlebihan ("Halo guys", "Selamat datang kembali", dsb) ataupun ringkasan umum. Mulailah langsung dengan menceritakan adegan yang terjadi di panel pertama.
    2. **PEMBACAAN DARI KANAN KE KIRI**: Perlu diingat bahwa komik/manga ini dibaca dari KANAN KE KIRI. Susun urutan narasi dan percakapan mengikuti arah membaca manga (kanan ke kiri) pada setiap halaman panel yang diberikan.
    3. **SEMUA TEKS HARUS MASUK SECARA NARATIF (JANGAN ULANG VERBATIM/LANGSUNG)**: Semua informasi, percakapan, dialog, dan teks gelembung ucapan yang tercetak di gambar PANEL harus dimasukkan secara utuh ke dalam naskah. Namun, JANGAN menulis ulang kalimat karakter secara verbatim/kata-patah langsung (misalnya, jangan menulis: "Namaku Amy"). Sebaliknya, jelaskan maksud dan situasinya dalam bentuk narasi (misalnya, ubah menjadi: "kita diperlihatkan seorang gadis bernama Amy"). Seluruh informasi dan isi percakapan harus tersampaikan lengkap di dalam penjelasan naratif tersebut tanpa ada yang terlewatkan.
    4. **HILANGKAN EFEK GAMBAR, FOKUS ALUR PERTARUNGAN**: Untuk efek visual atau teks efek suara layaknya tebasan pedang, tembakan, ledakan, dsb (seperti sfx "trank", "bang", "whush"), tidak perlu dituliskan kata bunyinya. Sebagai gantinya, ceritakan secara langsung, mengalir, dan detail bagaimana gerakan serangannya, bagaimana pertarungannya berjalan, serta bagaimana aksi tersebut terjadi di antara karakter.
    5. **SEOLAH SUDAH SANGAT MENGERTI ALUR CERITA**: Tulis narasi naskah dengan nada suara yang mantap dan seolah-olah Anda sebagai narator sudah sangat mengerti dan memahami seluruh alur cerita luar-dalam (omniscient narrator).
    
    ${hookInstruction}
    - NARASI PER PANEL: Ceritakan kembali adegan demi adegan secara mendetail dengan menyerap seluruh dialog karakter yang ada di gambar.
    ${outroInstruction}
    
    Berikan output akhir berupa teks murni Bahasa Indonesia yang siap dibaca sebagai naskah video. JANGAN tampilkan label teknis apapun (seperti [Hook], [Narasi], [Panel 1], dll), tapi mengalirlah secara langsung dan alami.
    `;

    const response = await ai.models.generateContent({
      model,
      contents: {
        parts: [
          ...imageParts,
          { text: prompt }
        ]
      },
    });

    res.json({ text: response.text });
  } catch (error: any) {
    console.error("Gemini API Error on Server:", error);
    const errorMessage = error?.message || "";
    let userFriendlyError = "Terjadi kesalahan saat memproses naskah dengan AI. Silakan coba beberapa saat lagi.";
    
    if (errorMessage.includes("API_KEY_INVALID") || errorMessage.includes("API key not valid")) {
      userFriendlyError = "Kunci API Gemini tidak valid. Mohon periksa konfigurasi API Anda di Settings > Secrets.";
    } else if (errorMessage.includes("429") || errorMessage.includes("QUOTA") || errorMessage.includes("quota")) {
      userFriendlyError = "Kuota API Gemini telah habis atau terkena pembatasan laju. Silakan coba lagi nanti.";
    } else if (errorMessage.includes("Unable to process input image")) {
      userFriendlyError = "Gambar panel komik gagal diproses oleh AI. Mohon pastikan file Anda berupa gambar yang valid (JPG, PNG, atau WebP) dan berukuran wajar.";
    } else if (errorMessage.includes("network") || errorMessage.includes("fetch")) {
      userFriendlyError = "Gagal terhubung ke layanan AI Google. Mohon periksa koneksi internet Anda.";
    }
    
    res.status(500).json({ error: userFriendlyError, raw: errorMessage });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
