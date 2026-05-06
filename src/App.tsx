import { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'motion/react';
import { Upload, X, Loader2, Sparkles, Copy, Trash2, FileText, History as HistoryIcon, Hash, BookOpen, Clock, ChevronDown, ChevronUp, Maximize, Minimize, Settings, Globe, Key } from 'lucide-react';
import { generateRecap } from './lib/gemini';

interface MangaImage {
  file: File;
  preview: string;
}

interface MangaBatch {
  id: string;
  title: string;
  chapter: string;
  images: MangaImage[];
  recap: string | null;
  loading: boolean;
  error: string | null;
  wordCount: number;
}

interface HistoryEntry {
  id: string;
  title: string;
  chapter: string;
  recap: string;
  wordCount: number;
  date: string;
  thumbnail: string; // Storing first image preview
}

interface DropzoneProps {
  batchId: string;
  isUploading: boolean;
  onFilesAdded: (batchId: string, files: File[]) => void;
}

function BatchDropzone({ batchId, isUploading, onFilesAdded }: DropzoneProps) {
  const onDrop = useCallback((acceptedFiles: File[]) => {
    // Limit to 200 files
    const limitedFiles = acceptedFiles.slice(0, 200);
    onFilesAdded(batchId, limitedFiles);
  }, [batchId, onFilesAdded]);
 
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/jpeg': [],
      'image/png': [],
      'image/webp': []
    },
    multiple: true
  } as any);
 
  return (
    <div 
      {...getRootProps()} 
      className={`rounded-2xl border-2 border-dashed transition-all duration-500 p-10 flex flex-col items-center justify-center text-center gap-4 cursor-pointer group
        ${isDragActive 
          ? 'border-indigo-500 bg-indigo-50/30' 
          : 'border-slate-100 bg-slate-50/30 hover:border-indigo-200 hover:bg-slate-50'}`}
    >
      <input {...getInputProps()} />
      <div className={`p-4 rounded-2xl transition-all duration-500 ring-4 ring-transparent ${isUploading ? 'bg-slate-900 text-white scale-110' : 'bg-slate-800 text-indigo-400 shadow-2xl shadow-black/20 group-hover:scale-110 group-hover:text-indigo-300'}`}>
        {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
      </div>
      <div className="space-y-1">
        <p className="text-xs font-extrabold text-slate-100 uppercase tracking-[0.1em]">
          {isUploading ? 'Memproses Berkas...' : isDragActive ? 'Lepas di Sini' : 'Tarik Panel Manga Ke Sini'}
        </p>
        <p className="text-[10px] text-slate-500 font-medium">PNG, JPG, WEBP (Max 1024px)</p>
      </div>
    </div>
  );
}

export default function App() {
  const [batches, setBatches] = useState<MangaBatch[]>([
    {
      id: 'main-workspace',
      title: '',
      chapter: '',
      images: [],
      recap: null,
      loading: false,
      error: null,
      wordCount: 0
    }
  ]);
  const [activeBatchId, setActiveBatchId] = useState<string>('main-workspace');
  
  const [maxWords, setMaxWords] = useState<number>(1500);
  const [minWords, setMinWords] = useState<number>(300);
  const [style, setStyle] = useState<'santai' | 'formal'>('santai');
  const [includeHook, setIncludeHook] = useState(true);
  const [includeOutro, setIncludeOutro] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [language, setLanguage] = useState<string>('Indonesia');
  const [apiKeys, setApiKeys] = useState<string[]>(['', '', '']);
  const [activeKeyIndex, setActiveKeyIndex] = useState(0);
  const [apiKeyErrors, setApiKeyErrors] = useState<string[]>(['', '', '']);

  const validateApiKey = (key: string): string => {
    if (!key.trim()) return '';
    // Standard Gemini/Google Cloud keys start with AIzaSy and are typically 39 chars
    const pattern = /^AIzaSy[A-Za-z0-9_-]{33}$/;
    if (!key.startsWith('AIzaSy')) return 'Kunci harus diawali dengan "AIzaSy"';
    if (key.length !== 39) return `Panjang kunci tidak valid (${key.length}/39)`;
    if (!pattern.test(key)) return 'Format kunci mengandung karakter ilegal';
    return '';
  };
  const [showSettings, setShowSettings] = useState(false);
  
  const [isProcessingBatch, setIsProcessingBatch] = useState(false);
  const [isUploadingImages, setIsUploadingImages] = useState(false);
  const [copiedBatchId, setCopiedBatchId] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const activeBatch = batches.find(b => b.id === activeBatchId) || batches[0];

  // Load settings from localStorage on mount
  useEffect(() => {
    const savedHistory = localStorage.getItem('manga_recap_history');
    if (savedHistory) {
      try {
        setHistory(JSON.parse(savedHistory));
      } catch (e) {
        console.error("Failed to parse history", e);
      }
    }
    
    const savedKeys = localStorage.getItem('gemini_api_keys');
    if (savedKeys) {
      try {
        const parsed = JSON.parse(savedKeys);
        if (Array.isArray(parsed)) {
          setApiKeys(prev => {
            const next = [...prev];
            parsed.forEach((k, i) => { if (i < 3) next[i] = k; });
            return next;
          });
        }
      } catch (e) {
        console.error("Failed to parse API keys", e);
      }
    }
  }, []);

  // Save history to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('manga_recap_history', JSON.stringify(history));
  }, [history]);

  const handleFilesAdded = useCallback(async (batchId: string, acceptedFiles: File[]) => {
    setIsUploadingImages(true);
    
    const newImages = acceptedFiles.map(file => ({
      file,
      preview: URL.createObjectURL(file)
    }));
    
    setBatches(prev => prev.map(b => 
      b.id === batchId 
        ? { ...b, images: [...b.images, ...newImages] } 
        : b
    ));
    setIsUploadingImages(false);
  }, []);

  const removeImage = (batchId: string, imageIndex: number) => {
    setBatches(prev => prev.map(b => {
      if (b.id !== batchId) return b;
      const updatedImages = [...b.images];
      URL.revokeObjectURL(updatedImages[imageIndex].preview);
      updatedImages.splice(imageIndex, 1);
      return { ...b, images: updatedImages };
    }));
  };

  const clearBatch = (id: string) => {
    setBatches(prev => prev.map(b => {
      if (b.id !== id) return b;
      b.images.forEach(img => URL.revokeObjectURL(img.preview));
      return {
        ...b,
        title: '',
        chapter: '',
        images: [],
        recap: null,
        loading: false,
        error: null,
        wordCount: 0
      };
    }));
  };

  const handleGenerateAllAction = () => {
    handleGenerateBatch('main-workspace');
  };

  const [verifyingKeys, setVerifyingKeys] = useState<boolean[]>([false, false, false]);
  const [keyStatus, setKeyStatus] = useState<('valid' | 'invalid' | null)[]>([null, null, null]);

  const handleVerifyKey = async (index: number) => {
    const key = apiKeys[index];
    if (!key.trim()) return;
    
    setVerifyingKeys(prev => { const next = [...prev]; next[index] = true; return next; });
    
    try {
      const isValid = await import('./lib/gemini').then(m => m.verifyApiKey(key));
      setKeyStatus(prev => { const next = [...prev]; next[index] = isValid ? 'valid' : 'invalid'; return next; });
    } catch (e) {
      setKeyStatus(prev => { const next = [...prev]; next[index] = 'invalid'; return next; });
    } finally {
      setVerifyingKeys(prev => { const next = [...prev]; next[index] = false; return next; });
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable full-screen mode: ${err.message}`);
      });
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const countWords = (text: string | null | undefined) => {
    if (!text) return 0;
    return text.toString().trim().split(/\s+/).filter(word => word.length > 0).length;
  };

  const optimizeImage = async (file: File): Promise<{ data: string; mimeType: string }> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 800;
          const MAX_HEIGHT = 800;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);

          // Compress to JPEG with 0.8 quality
          const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
          resolve({ data: dataUrl, mimeType: 'image/jpeg' });
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    });
  };

  const handleGenerateBatch = async (batchId: string) => {
    const hasAnyKey = apiKeys.some(k => k && k.trim() !== "");
    if (!hasAnyKey) {
      setShowSettings(true);
      alert("Mohon masukkan setidaknya satu API Key Gemini Anda di menu Pengaturan.");
      return;
    }

    const batch = batches.find(b => b.id === batchId);
    if (!batch || batch.images.length === 0) return;
    
    setBatches(prev => prev.map(b => b.id === batchId ? { ...b, loading: true, error: null, recap: null } : b));
    
    try {
      const imageData = await Promise.all(batch.images.map(img => optimizeImage(img.file)));

      const result = await generateRecap(imageData, { 
        title: batch.title, 
        chapter: batch.chapter, 
        maxWords, 
        minWords,
        style,
        includeHook,
        includeOutro,
        language,
        apiKeys,
        activeKeyIndex,
        onChunk: (chunk) => {
          setBatches(prev => prev.map(b => {
             if (b.id !== batchId) return b;
             const updatedRecap = (b.recap || '') + chunk;
             return { 
               ...b, 
               recap: updatedRecap,
               wordCount: countWords(updatedRecap)
             };
          }));
        }
      });
      
      const finalRecap = result || "Gagal membuat recap. Coba lagi.";
      const wordCount = countWords(finalRecap);

      setBatches(prev => prev.map(b => 
        b.id === batchId 
          ? { ...b, recap: finalRecap, loading: false, wordCount } 
          : b
      ));

      // Save to history
      const firstImageBase64 = imageData[0].data;
      const newEntry: HistoryEntry = {
        id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
        title: batch.title || 'Tanpa Judul',
        chapter: batch.chapter || 'N/A',
        recap: finalRecap,
        wordCount,
        date: new Date().toLocaleString('id-ID'),
        thumbnail: firstImageBase64
      };

      setHistory(prev => [newEntry, ...prev]);
      
    } catch (error: any) {
      console.error(error);
      setBatches(prev => prev.map(b => 
        b.id === batchId 
          ? { ...b, loading: false, error: error.message || "Waduh, ada masalah teknis nih." } 
          : b
      ));
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedBatchId(id);
    setTimeout(() => setCopiedBatchId(null), 2000);
  };

  const deleteHistoryItem = (id: string) => {
    setHistory(prev => prev.filter(item => item.id !== id));
  };

  return (
    <div className="min-h-screen bg-slate-950 p-4 md:p-8 max-w-6xl mx-auto space-y-12 pb-32 selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* Background Decoration */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
        <div className="absolute -top-[10%] -left-[5%] w-[40%] h-[40%] bg-indigo-900/10 blur-[120px] rounded-full"></div>
        <div className="absolute top-[20%] -right-[10%] w-[30%] h-[30%] bg-blue-900/5 blur-[100px] rounded-full"></div>
      </div>

      {/* Header */}
      <header className="flex flex-col md:flex-row justify-between items-center gap-8 py-8 pt-4">
        <div className="text-center md:text-left space-y-1">
          <div className="flex items-center justify-center md:justify-start gap-3 mb-1">
             <div className="px-2.5 py-1 bg-indigo-600 rounded-lg shadow-lg shadow-indigo-900/40">
                <span className="font-sans text-[9px] font-extrabold text-white uppercase tracking-[0.2em]">
                  AniKi Studio
                </span>
             </div>
             <div className="h-px w-6 bg-slate-700"></div>
          </div>
          <h1 className="font-display text-4xl md:text-5xl font-extrabold tracking-tight text-white">
            Manga <span className="text-indigo-400">Recap</span>
          </h1>
          <p className="font-sans text-sm text-slate-300 font-medium tracking-tight">
            Transmutasikan gambar manga menjadi naskah narasi profesional.
          </p>
        </div>
        
        <div className="flex items-center gap-3 backdrop-blur-md p-1.5 bg-slate-900/40 border border-slate-800 rounded-[1.25rem] shadow-sm">
          <button 
            onClick={() => setShowSettings(true)}
            className="flex items-center justify-center w-11 h-11 bg-slate-800 text-slate-400 rounded-[0.9rem] hover:text-indigo-400 transition-all hover:bg-slate-700 active:scale-95 group"
            title="Pengaturan Bahasa"
          >
            <Settings className="w-5 h-5 group-hover:rotate-45 transition-transform duration-500" />
          </button>
          
          <button 
            onClick={toggleFullscreen}
            className="flex items-center justify-center w-11 h-11 bg-slate-800 text-slate-400 rounded-[0.9rem] hover:text-indigo-400 transition-all hover:bg-slate-700 active:scale-95"
            title={isFullscreen ? "Keluar Layar Penuh" : "Layar Penuh"}
          >
            {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
          </button>
          
          <button 
            onClick={() => setShowHistory(!showHistory)}
            className={`flex items-center gap-2 font-sans font-bold text-xs py-3 px-6 rounded-[0.9rem] transition-all duration-300
              ${showHistory 
                ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-900/20' 
                : 'bg-slate-800 text-slate-100 border border-slate-700 hover:border-indigo-500 hover:text-indigo-400'}`}
          >
            <HistoryIcon className="w-4 h-4" />
            Riwayat <span className="opacity-40">({history.length})</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="grid grid-cols-1 gap-12">
        
        {/* Global Settings */}
        <section className="studio-card p-6 md:p-10">
          <div className="flex items-center gap-3 mb-8">
            <div className="p-2.5 bg-indigo-500/10 text-indigo-400 rounded-xl">
              <Sparkles className="w-5 h-5" />
            </div>
            <h2 className="text-sm font-extrabold text-slate-100 uppercase tracking-[0.15em]">
              Konfigurasi Narasi
            </h2>
            <div className="flex-1 h-px bg-slate-800 ml-4"></div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
            <div className="space-y-4">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2 px-1">
                <Hash className="w-3.5 h-3.5 text-indigo-400" /> Kata Minimal
              </label>
              <div className="relative">
                <select 
                  value={minWords}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setMinWords(val);
                    if (val > maxWords) setMaxWords(val);
                  }}
                  className="studio-input w-full py-4 cursor-pointer appearance-none pr-10"
                >
                  <option value={100} className="bg-[#0f172a]">100 Kata</option>
                  <option value={300} className="bg-[#0f172a]">300 Kata</option>
                  <option value={500} className="bg-[#0f172a]">500 Kata</option>
                  <option value={800} className="bg-[#0f172a]">800 Kata</option>
                  <option value={1000} className="bg-[#0f172a]">1000 Kata</option>
                  <option value={1500} className="bg-[#0f172a]">1500 Kata</option>
                  <option value={2000} className="bg-[#0f172a]">2000 Kata</option>
                </select>
                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              </div>
            </div>
            <div className="space-y-4">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2 px-1">
                <FileText className="w-3.5 h-3.5 text-indigo-400" /> Kata Maksimal
              </label>
              <div className="relative">
                <select 
                  value={maxWords}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setMaxWords(val);
                    if (val < minWords) setMinWords(val);
                  }}
                  className="studio-input w-full py-4 cursor-pointer appearance-none pr-10"
                >
                  <option value={300} className="bg-[#0f172a]">300 Kata (Standar)</option>
                  <option value={500} className="bg-[#0f172a]">500 Kata (Dalam)</option>
                  <option value={800} className="bg-[#0f172a]">800 Kata (Epik)</option>
                  <option value={1500} className="bg-[#0f172a]">1500 Kata (Sangat Panjang)</option>
                  <option value={2000} className="bg-[#0f172a]">2000 Kata (Ultimate)</option>
                  <option value={3000} className="bg-[#0f172a]">3000 Kata (Legendaris)</option>
                </select>
                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              </div>
            </div>
            <div className="space-y-4 col-span-1 md:col-span-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2 px-1">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" /> Gaya & Struktur
              </label>
              <div className="flex flex-col sm:flex-row gap-6">
                <div className="flex-1 flex bg-slate-900/80 rounded-2xl p-1.5 border border-slate-700/60 shadow-inner">
                  <button 
                    onClick={() => setStyle('santai')}
                    className={`flex-1 py-3 font-sans font-bold text-xs rounded-xl transition-all duration-300
                      ${style === 'santai' ? 'bg-slate-800 text-indigo-300 shadow-lg' : 'text-slate-500 hover:text-slate-400'}`}
                  >
                    Santai
                  </button>
                  <button 
                    onClick={() => setStyle('formal')}
                    className={`flex-1 py-3 font-sans font-bold text-xs rounded-xl transition-all duration-300
                      ${style === 'formal' ? 'bg-slate-800 text-indigo-300 shadow-lg' : 'text-slate-500 hover:text-slate-400'}`}
                  >
                    Formal
                  </button>
                </div>
                <div className="flex-1 flex items-center justify-around bg-slate-900/80 rounded-2xl p-1.5 border border-slate-700/60 shadow-inner">
                  <label className="flex items-center gap-3 cursor-pointer group px-4">
                    <input 
                      type="checkbox" 
                      checked={includeHook} 
                      onChange={() => setIncludeHook(!includeHook)}
                      className="w-5 h-5 rounded-lg border-slate-700 bg-slate-800 text-indigo-500 focus:ring-indigo-500/50 focus:ring-offset-0 transition-all cursor-pointer"
                    />
                    <span className="text-[10px] font-extrabold text-slate-400 group-hover:text-indigo-400 transition-colors uppercase tracking-widest">Hook</span>
                  </label>
                  <div className="w-px h-6 bg-slate-700"></div>
                  <label className="flex items-center gap-3 cursor-pointer group px-4">
                    <input 
                      type="checkbox" 
                      checked={includeOutro} 
                      onChange={() => setIncludeOutro(!includeOutro)}
                      className="w-5 h-5 rounded-lg border-slate-700 bg-slate-800 text-indigo-500 focus:ring-indigo-500/50 focus:ring-offset-0 transition-all cursor-pointer"
                    />
                    <span className="text-[10px] font-extrabold text-slate-400 group-hover:text-indigo-400 transition-colors uppercase tracking-widest">Outro</span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </section>
        
        {/* Main Workspace */}
        <section className="space-y-8">
          <div className="flex items-center justify-between px-2">
            <div>
              <h2 className="text-2xl font-extrabold text-slate-100 tracking-tight">
                Studio Workspace <span className="text-slate-600 font-normal ml-1">({batches[0]?.images.length || 0}/200)</span>
              </h2>
            </div>
            {batches[0]?.images.length > 0 && (
              <button 
                onClick={() => setBatches([{ ...batches[0], images: [], recap: null, error: null, wordCount: 0 }])}
                className="text-[10px] font-extrabold text-slate-500 hover:text-red-400 px-4 py-2 transition-all uppercase tracking-widest active:scale-95 flex items-center gap-2"
              >
                <Trash2 className="w-3.5 h-3.5" /> Bersihkan Panel
              </button>
            )}
          </div>

          <div className="space-y-12 pb-10">
            {batches.map((batch) => (
              <motion.div 
                key={batch.id}
                layout
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="studio-card shadow-2xl shadow-indigo-900/20 border-indigo-500/20"
              >
                {/* Batch Header */}
                <div className={`p-6 md:p-8 border-b border-slate-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-8 ${activeBatchId === batch.id ? 'bg-slate-800/30' : 'bg-slate-900/40'}`}>
                  <div className="flex items-center gap-6 flex-1 w-full">
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-display text-2xl shrink-0 transition-all duration-500 shadow-xl
                      ${activeBatchId === batch.id ? 'bg-indigo-600 text-white shadow-indigo-950/40 rotate-3' : 'bg-slate-800 text-slate-500 shadow-slate-950/20'}`}>
                      <FileText className="w-7 h-7" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1">
                       <div className="space-y-1">
                         <label className="text-[9px] font-extrabold text-slate-500 uppercase tracking-widest block px-0.5">Judul</label>
                         <input 
                            type="text"
                            placeholder="Judul Manga..."
                            value={batch.title}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => setBatches(prev => prev.map(b => b.id === batch.id ? { ...b, title: e.target.value } : b))}
                            className="bg-transparent border-none focus:ring-0 font-sans font-extrabold text-xl p-0 placeholder:text-slate-700 text-slate-100 w-full"
                          />
                       </div>
                       <div className="space-y-1">
                         <label className="text-[9px] font-extrabold text-slate-500 uppercase tracking-widest block px-0.5">Chapter</label>
                         <input 
                            type="text"
                            placeholder="Nomor Chapter..."
                            value={batch.chapter}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => setBatches(prev => prev.map(b => b.id === batch.id ? { ...b, chapter: e.target.value } : b))}
                            className="bg-transparent border-none focus:ring-0 font-sans font-bold text-sm text-slate-500 p-0 placeholder:text-slate-700 w-full"
                          />
                       </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 w-full md:w-auto justify-end">
                    {batch.images.length > 0 && !batch.recap && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleGenerateBatch(batch.id); }}
                        disabled={batch.loading || !apiKeys.some(k => k.trim())}
                        className="btn-primary py-3 px-6 !rounded-xl text-xs"
                      >
                        {batch.loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                        {apiKeys.some(k => k.trim()) ? 'Buat Naskah Sekarang' : 'Butuh Key'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Batch Body */}
                <div className="p-6 md:p-10 space-y-8">
                  {/* Images Area */}
                  {!batch.recap && (
                    <div className="space-y-8">
                      <BatchDropzone 
                        batchId={batch.id}
                        isUploading={isUploadingImages && activeBatchId === batch.id}
                        onFilesAdded={handleFilesAdded}
                      />

                      <AnimatePresence>
                        {batch.images.length > 0 && (
                          <motion.div 
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12 gap-3"
                          >
                             {batch.images.map((img, i) => (
                              <div key={img.preview} className="relative aspect-[3/4] rounded-xl overflow-hidden bg-slate-800 border border-slate-700 group shadow-lg">
                                <img src={img.preview} alt="panel" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                                <div className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); removeImage(batch.id, i); }}
                                    className="p-2.5 bg-red-600 text-white rounded-full hover:bg-red-500 transition-all hover:scale-110 active:scale-95"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                                <div className="absolute top-1 left-1 bg-slate-900/90 backdrop-blur-sm px-1.5 py-0.5 rounded-md text-[8px] font-bold text-slate-300 shadow-sm border border-slate-700">
                                  {i + 1}
                                </div>
                              </div>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}

                   {/* Recap Loading */}
                  {batch.loading && (
                    <div className="py-20 flex flex-col items-center gap-6">
                      <div className="relative">
                        <div className="absolute inset-0 bg-indigo-500/10 blur-2xl rounded-full scale-110 animate-pulse"></div>
                        <Loader2 className="w-12 h-12 animate-spin text-indigo-500 relative z-10" />
                      </div>
                      <div className="text-center space-y-2">
                        <p className="text-xs font-extrabold text-slate-100 uppercase tracking-[0.3em] animate-pulse">Menghaluskan Alur...</p>
                        <p className="text-[10px] text-slate-500 font-medium tracking-tight">Analisis AI sedang berjalan</p>
                      </div>
                    </div>
                  )}

                  {/* Recap Result */}
                  {batch.recap && (
                    <motion.div 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-8"
                    >
                      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 md:p-6 bg-slate-800/40 rounded-[2rem] border border-slate-800 shadow-inner">
                        <div className="flex items-center gap-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-2">
                           <div className="flex items-center gap-2 bg-slate-900/60 px-3 py-1.5 rounded-full shadow-lg border border-slate-700 transition-all hover:border-indigo-500/50">
                             <Hash className="w-3.5 h-3.5 text-indigo-400" /> 
                             <span className="text-slate-100">{batch.wordCount} kata</span>
                           </div>
                           <div className="w-1.5 h-1.5 bg-slate-700 rounded-full"></div>
                           <span className="text-emerald-400 font-extrabold flex items-center gap-1.5 tracking-widest">
                             <Sparkles className="w-3 h-3" /> Berhasil
                           </span>
                         </div>
                         <div className="flex items-center gap-3">
                            <button 
                             onClick={(e) => { e.stopPropagation(); copyToClipboard(batch.recap!, batch.id); }}
                             className={`btn-secondary py-2.5 px-6 !rounded-xl text-[10px] !shadow-none
                               ${copiedBatchId === batch.id 
                                 ? '!bg-emerald-600 !text-white !border-emerald-600' 
                                 : ''}`}
                           >
                             <Copy className="w-3.5 h-3.5" />
                             {copiedBatchId === batch.id ? 'Tersalin' : 'Salin Naskah'}
                           </button>
                            <button 
                             onClick={(e) => { e.stopPropagation(); setBatches(prev => prev.map(b => b.id === batch.id ? { ...b, recap: null } : b)); }}
                             className="w-10 h-10 bg-white border border-slate-200 rounded-xl flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:border-indigo-200 transition-all shadow-sm"
                             title="Edit Naskah"
                           >
                             <FileText className="w-4 h-4" />
                           </button>
                        </div>
                      </div>
                      <div className="relative group/text">
                        <div className="absolute -inset-4 bg-indigo-500/10 rounded-[2.5rem] blur-2xl opacity-0 group-hover/text:opacity-100 transition-opacity duration-700"></div>
                        <div className="relative bg-slate-900 p-8 md:p-12 rounded-[2.5rem] text-slate-100 text-base leading-[1.8] font-sans border border-slate-800 italic whitespace-pre-wrap shadow-2xl">
                          {batch.recap}
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* Error State */}
                  {batch.error && (
                    <div className="p-8 bg-red-500/5 rounded-[2rem] border border-red-500/20 text-center space-y-4 backdrop-blur-sm">
                       <div className="w-12 h-12 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mx-auto mb-2">
                         <X className="w-6 h-6" />
                       </div>
                       <div className="space-y-1">
                         <p className="text-[10px] font-extrabold text-red-500 uppercase tracking-[0.2em]">Terjadi Galat</p>
                         <p className="text-xs font-medium text-slate-300 leading-relaxed max-w-sm mx-auto">{batch.error}</p>
                       </div>
                       <button 
                        onClick={(e) => { e.stopPropagation(); handleGenerateBatch(batch.id); }}
                        className="text-[10px] font-extrabold uppercase tracking-widest text-white bg-red-600 hover:bg-red-500 px-6 py-2.5 rounded-xl transition-all active:scale-95 shadow-lg shadow-red-900/20"
                       >
                         Coba Lagi
                       </button>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Action Trigger - Removed singular trigger, integrated into batches */}

        {/* History Section */}
        <section className="space-y-10 pt-24 border-t border-slate-900">
          <div className="flex items-center justify-between px-2">
            <div className="space-y-2 text-left">
               <h2 className="text-3xl font-extrabold text-white tracking-tight flex items-center gap-3">
                 Studio Archive
               </h2>
               <p className="text-sm text-slate-400 font-medium tracking-tight">Kompilasi naskah yang telah Anda buat tersimpan aman di penyimpanan lokal.</p>
            </div>
            <button 
              onClick={() => setShowHistory(!showHistory)}
              className="group flex items-center gap-3 text-xs font-extrabold text-slate-500 hover:text-indigo-400 transition-all uppercase tracking-widest"
            >
              {showHistory ? (
                <>Sembunyikan <ChevronUp className="w-5 h-5 group-hover:-translate-y-1 transition-transform" /></>
              ) : (
                <>Tampilkan ({history.length}) <ChevronDown className="w-5 h-5 group-hover:translate-y-1 transition-transform" /></>
              )}
            </button>
          </div>

          <AnimatePresence>
            {showHistory && (
              <motion.div 
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 30 }}
                className="overflow-hidden"
              >
                {history.length === 0 ? (
                  <div className="p-24 text-center rounded-[3rem] border-2 border-dashed border-slate-800 bg-slate-900/20">
                    <HistoryIcon className="w-10 h-10 text-slate-800 mx-auto mb-4" />
                    <p className="text-xs text-slate-500 font-extrabold uppercase tracking-widest">Arsip Kosong</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {history.map((item) => (
                      <motion.div 
                        key={item.id}
                        layout
                        className="studio-card p-6 group/item"
                      >
                        <div className="flex gap-6">
                          <div className="w-24 h-32 rounded-2xl bg-slate-800 overflow-hidden shrink-0 border border-slate-700 shadow-sm relative">
                            <img src={item.thumbnail} alt="thumb" className="w-full h-full object-cover grayscale transition-all duration-700 group-hover/item:grayscale-0 group-hover/item:scale-110" />
                            <div className="absolute inset-0 bg-indigo-900/10 mix-blend-overlay"></div>
                          </div>
                          <div className="flex-1 flex flex-col justify-between py-1 overflow-hidden">
                            <div className="space-y-2">
                               <h3 className="text-lg font-extrabold text-slate-100 truncate leading-tight group-hover/item:text-indigo-400 transition-colors">{item.title}</h3>
                               <div className="flex items-center gap-2">
                                 <span className="px-2 py-0.5 bg-indigo-500/10 text-indigo-400 rounded-md text-[9px] font-extrabold uppercase tracking-widest">Ch. {item.chapter}</span>
                               </div>
                            </div>
                            <div className="flex items-center gap-4">
                               <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                 <BookOpen className="w-3.5 h-3.5" /> {item.wordCount} Kata
                               </div>
                               <div className="w-1 h-1 bg-slate-800 rounded-full"></div>
                               <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                 <Clock className="w-3.5 h-3.5" /> {item.date.split(',')[0]}
                               </div>
                            </div>
                          </div>
                        </div>
                        
                        <div className="pt-6 flex gap-3">
                          <button 
                            onClick={() => {
                              setBatches(prev => {
                                const updated = [...prev];
                                updated[0] = {
                                  ...updated[0],
                                  title: item.title,
                                  chapter: item.chapter,
                                  recap: item.recap,
                                  wordCount: item.wordCount,
                                  images: [] 
                                };
                                return updated;
                              });
                              setActiveBatchId(batches[0].id);
                              window.scrollTo({ top: 300, behavior: 'smooth' });
                            }}
                            className="flex-1 btn-secondary !py-2.5 !text-[10px] uppercase tracking-widest !rounded-xl"
                          >
                            Buka Kembali
                          </button>
                          <button 
                             onClick={() => copyToClipboard(item.recap, item.id)}
                             className={`p-2.5 rounded-xl border transition-all active:scale-90
                               ${copiedBatchId === item.id 
                                 ? 'bg-emerald-600 text-white border-emerald-600' 
                                 : 'bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-500 hover:text-slate-100 shadow-sm'}`}
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                          <button 
                             onClick={() => deleteHistoryItem(item.id)}
                             className="p-2.5 border border-slate-700 rounded-xl text-slate-500 hover:text-red-400 hover:border-red-400/30 hover:bg-red-400/10 transition-all active:scale-90"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </div>

       {/* Footer Branding */}
       <footer className="pt-24 pb-12 text-center space-y-6">
          <div className="h-px w-20 bg-slate-800 mx-auto opacity-50"></div>
          <div className="flex flex-col items-center gap-2">
            <p className="text-[10px] font-extrabold text-slate-500 uppercase tracking-[0.5em]">AniKi Studio Creator Platform</p>
            <p className="text-[9px] text-slate-600 font-medium tracking-tight">Build v2.1.0 • Midnight Creator Edition</p>
          </div>
       </footer>

       {/* Floating Action Component for Mobile */}
       <button 
         onClick={() => setShowHistory(!showHistory)}
         className="fixed bottom-8 right-8 md:hidden bg-indigo-600 text-white p-5 z-50 rounded-2xl shadow-2xl active:scale-95 transition-all hover:bg-indigo-500 ring-4 ring-slate-900"
       >
         <HistoryIcon className="w-6 h-6" />
       </button>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSettings(false)}
              className="fixed inset-0 bg-slate-950/60 backdrop-blur-md z-[60]"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 30 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-slate-900 rounded-[2.5rem] shadow-[0_32px_64px_rgba(0,0,0,0.4)] z-[70] p-10 space-y-10 max-h-[90vh] overflow-y-auto border border-slate-800"
            >
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <h3 className="text-2xl font-extrabold text-slate-100 tracking-tight">
                    Pengaturan
                  </h3>
                  <p className="text-[11px] text-slate-500 font-medium">Konfigurasi kunci akses dan bahasa studio.</p>
                </div>
                <button 
                  onClick={() => setShowSettings(false)}
                  className="w-10 h-10 flex items-center justify-center hover:bg-slate-800 rounded-full transition-colors text-slate-500 hover:text-slate-100"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* API Key Section */}
              <div className="space-y-6">
                <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                  <Key className="w-4 h-4 text-indigo-500" /> Kunci Akses Gemini (Wajib)
                </label>
                
                <div className="space-y-4">
                  {apiKeys.map((key, idx) => (
                    <div key={idx} className="space-y-1.5 group">
                      <div className="flex items-center justify-between px-1">
                        <span className="text-[9px] font-extrabold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                           Slot {idx + 1} {idx === activeKeyIndex && key.trim() && !apiKeyErrors[idx] && <span className="text-indigo-400 font-bold">(Utama)</span>}
                           {keyStatus[idx] === 'valid' && <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />}
                           {keyStatus[idx] === 'invalid' && <span className="w-1.5 h-1.5 bg-red-500 rounded-full" />}
                        </span>
                        <button 
                          onClick={() => handleVerifyKey(idx)}
                          disabled={!key.trim() || apiKeyErrors[idx] || verifyingKeys[idx]}
                          className={`text-[8px] font-bold uppercase tracking-widest px-3 py-1 rounded-md transition-all
                            ${keyStatus[idx] === 'valid' ? 'text-emerald-400 bg-emerald-500/10' : 
                              keyStatus[idx] === 'invalid' ? 'text-red-400 bg-red-500/10' : 
                              'text-indigo-400 hover:text-indigo-300 bg-indigo-500/5'}`}
                        >
                          {verifyingKeys[idx] ? 'Mengecek...' : keyStatus[idx] === 'valid' ? 'Konek Berhasil' : keyStatus[idx] === 'invalid' ? 'Gagal' : 'Cek Koneksi'}
                        </button>
                      </div>
                      <div className="relative">
                        <input 
                          type="password"
                          placeholder="Masukkan Key AIzaSy..."
                          value={key}
                          onChange={(e) => {
                            const val = e.target.value;
                            const next = [...apiKeys];
                            next[idx] = val;
                            setApiKeys(next);
                            
                            const nextErrors = [...apiKeyErrors];
                            nextErrors[idx] = validateApiKey(val);
                            setApiKeyErrors(nextErrors);
                            // Reset verification status on change
                            setKeyStatus(prev => { const n = [...prev]; n[idx] = null; return n; });
                          }}
                          className={`studio-input w-full pr-12 text-sm py-4 border-2 ${apiKeyErrors[idx] ? 'border-red-500/50 focus:border-red-500' : 'border-slate-800'}`}
                        />
                        {key && (
                          <button 
                            onClick={() => {
                              const next = [...apiKeys];
                              next[idx] = '';
                              setApiKeys(next);
                              const nextErrors = [...apiKeyErrors];
                              nextErrors[idx] = '';
                              setApiKeyErrors(nextErrors);
                            }}
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-red-400 transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      {apiKeyErrors[idx] && (
                        <p className="text-[10px] text-red-400 font-bold px-1 animate-in fade-in slide-in-from-top-1">
                          {apiKeyErrors[idx]}
                        </p>
                      )}
                    </div>
                  ))}
                </div>

                {!apiKeys.some(k => k.trim()) && (
                  <p className="text-[10px] text-red-400 font-extrabold animate-pulse bg-red-500/10 p-3 rounded-xl border border-red-500/20">
                    Satu kunci akses diperlukan untuk mengaktifkan AI.
                  </p>
                )}
                
                <div className="p-5 bg-indigo-500/10 rounded-2xl border border-indigo-500/20">
                  <p className="text-[10px] text-indigo-300 leading-relaxed font-semibold">
                    Kunci Anda terenkripsi secara lokal di browser ini. Kami menyarankan menggunakan 3 kunci berbeda untuk menghindari batasan penggunaan.
                  </p>
                </div>
              </div>

              <div className="space-y-6">
                <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                  <Globe className="w-4 h-4 text-indigo-500" /> Target Bahasa
                </label>
                <div className="grid grid-cols-1 gap-2.5">
                    { [
                      { id: 'Indonesia', name: 'Bahasa Indonesia', region: 'ID' },
                      { id: 'Inggris', name: 'English', region: 'UK/US' },
                      { id: 'Malaysia', name: 'Bahasa Malaysia', region: 'MY' },
                      { id: 'India', name: 'Hindi', region: 'IN' },
                      { id: 'Brazil', name: 'Português', region: 'BR' },
                    ].map((lang) => (
                      <button
                        key={lang.id}
                        onClick={() => setLanguage(lang.id)}
                        className={`flex items-center justify-between p-4 rounded-2xl transition-all duration-300 border-2
                          ${language === lang.id 
                            ? 'bg-slate-800 border-indigo-500/50 text-white shadow-xl shadow-black/40' 
                            : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-700 hover:text-slate-300'}`}
                      >
                        <div className="text-left flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-[10px] 
                            ${language === lang.id ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-500'}`}>
                            {lang.region}
                          </div>
                          <p className="font-extrabold text-xs">{lang.name}</p>
                        </div>
                        {language === lang.id && (
                          <motion.div layoutId="active-tick" className="w-2 h-2 rounded-full bg-indigo-400" />
                        )}
                      </button>
                    ))}
                </div>
              </div>

              <button 
                onClick={() => {
                  localStorage.setItem('gemini_api_keys', JSON.stringify(apiKeys));
                  setShowSettings(false);
                }}
                className="btn-primary w-full shadow-2xl shadow-indigo-200"
              >
                Terapkan Perubahan
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
