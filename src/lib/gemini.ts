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
  try {
    const response = await fetch("/api/recap", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        images,
        context
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Server returned status ${response.status}`);
    }

    const data = await response.json();
    return data.text;
  } catch (error: any) {
    console.error("Client recap helper error:", error);
    throw new Error(error.message || "Gagal menghubungkan ke server untuk memproses naskah dengan AI.");
  }
}
