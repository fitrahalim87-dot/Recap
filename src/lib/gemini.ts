import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function generateRecap(
  images: { data: string; mimeType: string }[], 
  context?: { 
    title?: string; 
    chapter?: string; 
    style?: 'santai' | 'formal';
    includeHook?: boolean;
    includeOutro?: boolean;
  }
) {
  const model = "gemini-3.5-flash";
  
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
