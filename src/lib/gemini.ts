import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function generateRecap(
  images: { data: string; mimeType: string }[], 
  context?: { 
    title?: string; 
    chapter?: string; 
    maxWords?: number; 
    style?: 'santai' | 'formal';
    includeHook?: boolean;
    includeOutro?: boolean;
  }
) {
  const model = "gemini-3-flash-preview";
  
  const imageParts = images.map(img => {
    const base64Data = img.data?.includes(',') ? img.data.split(',')[1] : (img.data || '');
    return {
      inlineData: {
        data: base64Data,
        mimeType: img.mimeType
      }
    };
  });

  const contextInfo = (context?.title || context?.chapter) 
    ? `Manga ini berjudul "${context.title || 'Unknown'}" dan ini adalah Chapter ${context.chapter || 'N/A'}. ` 
    : '';

  const styleInstruction = context?.style === 'formal' 
    ? 'Gunakan gaya bahasa formal, baku, dan profesional seperti narasi dokumentari serius.'
    : `Gunakan gaya bahasa SANTAI, GAUL, dan SERU seperti YouTuber recap Indonesia. 
       Ciri khas: gunakan kata ganti seperti "cuy", "receh", "nyinyir", "gak apa-apa".
       Contoh gaya bahasa yang diinginkan:
       "Oke lanjut kita masuk ke part yang kedelapan cuy. Nah disini terlihat kalau di sepanjang jalan Ai seperti biasa langsung cerewet bahas hal random soal makanan gitu. Dan ya kali dengan semangat dia ngebahas tentang tiram goreng kesukaannya. Dia sampai ngebahas detail saus, dari yang rasa khas Inggris sampai ponzu yang segar, seolah-olah seperti lagi mereview makanan di acara TV gitu. Dan anehnya, justru dari ocehan receh itu, Eji ngerasa lebih tenang."`;

  const lengthInstruction = context?.maxWords 
    ? `PENTING: Panjang naskah TIDAK BOLEH LEBIH DARI ${context.maxWords} KATA.`
    : '';

  const hookInstruction = context?.includeHook 
    ? '- HOOK: Buat pembukaan yang sangat menarik (pancingan) di awal naskah untuk menarik perhatian penonton dalam 10 detik pertama.' 
    : 'JANGAN buat bagian Hook pembuka.';

  const outroInstruction = context?.includeOutro
    ? '- OUTRO: Buat kalimat penutup yang mengajak penonton berinteraksi (like/sub) dan berikan sedikit kesimpulan.'
    : 'JANGAN buat bagian kalimat Penutup/Outro.';

  const prompt = `
    Anda adalah asisten AI profesional yang ahli dalam membuat naskah recap manga untuk channel YouTube (seperti alur cerita manga/manhwa).
    
    ${contextInfo}
    ${styleInstruction}
    ${lengthInstruction}
    
    Tugas Anda:
    1. Baca dan pahami isi dari gambar-gambar manga yang diberikan SEARA SANGAT TELITI dan BERURUTAN (urutkan dari gambar pertama sampai terakhir).
    2. Tulis naskah recap dalam Bahasa Indonesia yang mengikuti ALUR KRONOLOGIS yang tepat berdasarkan urutan gambar tersebut. JANGAN melompat-lompat adegan.
    3. Struktur naskah harus mengikuti aturan ini:
       ${hookInstruction}
       - NARASI MENDETAIL: Ceritakan ulang isi cerita dengan detail tinggi. Jelaskan apa yang terjadi di setiap panel secara berurutan. Deskripsikan aksi, perubahan ekspresi wajah karakter, emosi yang meledak-ledak, dan suasana tempat atau pertarungan. Pastikan pembaca naskah bisa merasakan perkembangan cerita dari awal sampai akhir chapter.
       - CLIFFHANGER: Akhiran yang sangat menggantung dan membuat penasaran di bagian paling akhir gambar.
       ${outroInstruction}
    4. Pastikan alur cerita 100% logis dan akurat berdasarkan gambar yang diunggah.
    
    Berikan output berupa teks murni yang siap dibaca sebagai naskah video tanpa label label teknis (seperti [Hook], [Narasi], dll) kecuali diminta, pastikan mengalir secara natural.
  `;

  try {
    const maxRetries = 3;
    let attempt = 0;

    const executeWithRetry = async (): Promise<string | undefined> => {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: {
            parts: [
              ...imageParts,
              { text: prompt }
            ]
          },
        });
        return response.text;
      } catch (error: any) {
        const errorMessage = error?.message || "";
        const isRateLimit = errorMessage.includes("429") || errorMessage.includes("QUOTA");
        const isTransient = errorMessage.includes("500") || errorMessage.includes("503") || errorMessage.includes("fetch");

        if ((isRateLimit || isTransient) && attempt < maxRetries) {
          attempt++;
          // Exponential backoff: 2s, 4s, 8s
          const delay = Math.pow(2, attempt) * 1000;
          console.warn(`Attempt ${attempt} failed. Retrying in ${delay}ms...`, errorMessage);
          await new Promise(resolve => setTimeout(resolve, delay));
          return executeWithRetry();
        }
        throw error;
      }
    };

    return await executeWithRetry();
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    
    // Provide specific feedback based on error type
    const errorMessage = error?.message || "";
    
    if (errorMessage.includes("API_KEY_INVALID")) {
      throw new Error("Kunci API Gemini tidak valid. Mohon periksa konfigurasi API Anda.");
    }
    if (errorMessage.includes("429") || errorMessage.includes("QUOTA")) {
      throw new Error("Kuota API Gemini telah habis. Silakan coba lagi nanti.");
    }
    if (errorMessage.includes("network") || errorMessage.includes("fetch")) {
      throw new Error("Gagal terhubung ke layanan AI. Mohon periksa koneksi internet Anda.");
    }
    
    throw new Error("Terjadi kesalahan saat memproses naskah dengan AI. Silakan coba beberapa saat lagi.");
  }
}
