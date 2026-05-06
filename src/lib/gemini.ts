import { GoogleGenAI } from "@google/genai";

export async function verifyApiKey(key: string): Promise<boolean> {
  try {
    const ai = new GoogleGenAI({ apiKey: key });
    const model = ai.models.get({ model: "gemini-3-flash-preview" });
    // Simple prompt to verify key
    await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: { parts: [{ text: "hi" }] }
    });
    return true;
  } catch (error) {
    console.error("API Key verification failed:", error);
    return false;
  }
}

export async function generateRecap(
  images: { data: string; mimeType: string }[], 
  context?: { 
    title?: string; 
    chapter?: string; 
    maxWords?: number; 
    minWords?: number; 
    style?: 'santai' | 'formal';
    includeHook?: boolean;
    includeOutro?: boolean;
    language?: string;
    apiKeys?: string[];
    activeKeyIndex?: number;
    onChunk?: (chunk: string) => void;
  }
) {
  const model = "gemini-3-flash-preview";
  const outputLanguage = context?.language || 'Indonesia';
  const apiKeys = context?.apiKeys || [];
  let currentKeyIndex = context?.activeKeyIndex || 0;

  const contextInfo = (context?.title || context?.chapter) 
    ? `Manga ini berjudul "${context.title || 'Unknown'}" dan ini adalah Chapter ${context.chapter || 'N/A'}. ` 
    : '';

  const styleInstruction = context?.style === 'formal' 
    ? 'Gunakan gaya bahasa formal, baku, dan profesional seperti narasi dokumentari serius.'
    : `Gunakan gaya bahasa SANTAI, GAUL, dan SERU seperti YouTuber recap Indonesia. 
       Ciri khas: gunakan kata ganti seperti "cuy", "receh", "nyinyir", "gak apa-apa".`;

  let lengthInstruction = '';
  if (context?.minWords && context?.maxWords) {
    lengthInstruction = `PENTING: Panjang naskah HARUS DI ANTARA ${context.minWords} SAMPAI ${context.maxWords} KATA.`;
  } else if (context?.maxWords) {
    lengthInstruction = `PENTING: Panjang naskah TIDAK BOLEH LEBIH DARI ${context.maxWords} KATA.`;
  } else if (context?.minWords) {
    lengthInstruction = `PENTING: Panjang naskah MINIMAL HARUS ${context.minWords} KATA.`;
  }

  const hookInstruction = context?.includeHook 
    ? '- HOOK: Buat pembukaan yang sangat menarik (pancingan) di awal naskah untuk menarik perhatian penonton dalam 10 detik pertama.' 
    : 'JANGAN buat bagian Hook pembuka.';

  const outroInstruction = context?.includeOutro
    ? '- OUTRO: Buat kalimat penutup yang mengajak penonton berinteraksi (like/sub) dan berikan sedikit kesimpulan.'
    : 'JANGAN buat bagian kalimat Penutup/Outro.';

  const prompt = `
    Anda adalah asisten AI profesional yang ahli dalam membuat naskah recap manga untuk channel YouTube.
    
    ${contextInfo}
    ${styleInstruction}
    ${lengthInstruction}
    
    ATURAN PENTING:
    - JANGAN menuliskan judul, sub-judul, atau label bagian (seperti "**Judul**", "Bagian 1", atau label "- NARASI").
    - JANGAN gunakan format markdown tebal (bold) untuk kalimat pembuka atau judul.
    - Langsung mulai naskah dengan narasi alur cerita agar audiens langsung terbawa suasana.
    
    Tugas Anda:
    1. Baca dan pahami isi dari gambar-gambar manga yang diberikan SECARA SANGAT TELITI dan BERURUTAN.
    2. Tulis naskah recap dalam Bahasa ${outputLanguage} yang mengikuti ALUR KRONOLOGIS yang tepat.
    3. Struktur naskah:
       ${hookInstruction}
       - NARASI MENDETAIL: Ceritakan ulang isi cerita dengan detail tinggi. Langsung bercerita tanpa judul.
       - CLIFFHANGER: Akhiran yang sangat menggantung di bagian akhir gambar.
       ${outroInstruction}
  `;

  const executeWithRetry = async (attempt: number, keyIndex: number): Promise<string | undefined> => {
    const finalApiKey = apiKeys[keyIndex];

    if (!finalApiKey || finalApiKey.trim() === "") {
        if (keyIndex + 1 < apiKeys.length) {
            return executeWithRetry(0, keyIndex + 1);
        }
        throw new Error("API Key Gemini tidak ditemukan atau tidak valid. Silakan masukkan API Key Anda di menu Pengaturan.");
    }

    const ai = new GoogleGenAI({ apiKey: finalApiKey });

    try {
      const imageParts = images.map(img => {
        const base64Data = img.data?.includes(',') ? img.data.split(',')[1] : (img.data || '');
        return {
          inlineData: {
            data: base64Data,
            mimeType: img.mimeType
          }
        };
      });

      const response = await ai.models.generateContentStream({
        model,
        contents: {
          parts: [
            ...imageParts,
            { text: prompt }
          ]
        },
      });

      let fullText = "";
      for await (const chunk of response) {
        const text = chunk.text;
        if (text) {
          fullText += text;
          if (context?.onChunk) {
            context.onChunk(text);
          }
        }
      }

      return fullText;

    } catch (error: any) {
      const errorMessage = error?.message || "";
      const status = error?.status || 0;
      
      // Categorize errors for better UX
      const isInvalidKey = status === 401 || errorMessage.includes("API_KEY_INVALID") || errorMessage.includes("not valid");
      const isQuotaExceeded = status === 429 || errorMessage.includes("QUOTA_EXCEEDED") || errorMessage.includes("rate limit");
      const isForbidden = status === 403 || errorMessage.includes("PERMISSION_DENIED");
      const isTransient = status >= 500 || errorMessage.includes("fetch") || errorMessage.includes("network");

      // Handle Key Rotation / Retries
      if ((isQuotaExceeded || isTransient) && keyIndex + 1 < apiKeys.length) {
        console.warn(`Key #${keyIndex + 1} hit an issue (${status}). Switching to key #${keyIndex + 2}...`);
        return executeWithRetry(0, keyIndex + 1);
      }

      if (isTransient && attempt < 2) {
        const delay = Math.pow(2, attempt + 1) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
        return executeWithRetry(attempt + 1, keyIndex);
      }

      // Throw descriptive errors
      if (isInvalidKey) {
        throw new Error(`API Key #${keyIndex + 1} tidak valid atau salah. Periksa kembali di Pengaturan.`);
      }
      if (isQuotaExceeded) {
        throw new Error(`Kuota untuk API Key #${keyIndex + 1} telah habis (Rate Limit). Coba gunakan Key lain atau tunggu beberapa saat.`);
      }
      if (isForbidden) {
        throw new Error(`Akses ditolak untuk API Key #${keyIndex + 1}. Pastikan API Gemini sudah diaktifkan di Google Cloud Console.`);
      }
      if (isTransient) {
        throw new Error(`Gangguan jaringan atau server Gemini sedang sibuk. Silakan coba lagi sebentar lagi.`);
      }

      throw new Error(`Terjadi kesalahan pada Key #${keyIndex + 1}: ${errorMessage}`);
    }
  };

  return await executeWithRetry(0, currentKeyIndex);
}
