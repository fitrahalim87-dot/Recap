import { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'motion/react';
import { Upload, X, Loader2, Sparkles, Copy, Trash2, FileText, History as HistoryIcon, Hash, BookOpen, Clock, ChevronDown, ChevronUp } from 'lucide-react';
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
    onFilesAdded(batchId, acceptedFiles);
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
      className={`rounded-xl border-2 border-dashed transition-all duration-300 p-8 flex flex-col items-center justify-center text-center gap-3
        ${isDragActive ? 'border-zinc-900 bg-zinc-900/5' : 'border-zinc-100 bg-zinc-50/50 hover:border-zinc-200 hover:bg-zinc-50'}`}
    >
      <input {...getInputProps()} />
      <div className={`p-3 rounded-full transition-all duration-300 ${isUploading ? 'bg-zinc-900 text-white scale-110' : 'bg-white text-zinc-300 shadow-sm'}`}>
        {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
      </div>
      <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">
        {isUploading ? 'Uploading...' : isDragActive ? 'Release to upload' : 'Drop panels here'}
      </p>
    </div>
  );
}

export default function App() {
  const [batches, setBatches] = useState<MangaBatch[]>([
    {
      id: 'default',
      title: '',
      chapter: '',
      images: [],
      recap: null,
      loading: false,
      error: null,
      wordCount: 0
    }
  ]);
  const [activeBatchId, setActiveBatchId] = useState<string>('default');
  
  const [maxWords, setMaxWords] = useState<number>(300);
  const [style, setStyle] = useState<'santai' | 'formal'>('santai');
  const [includeHook, setIncludeHook] = useState(true);
  const [includeOutro, setIncludeOutro] = useState(true);
  
  const [isProcessingBatch, setIsProcessingBatch] = useState(false);
  const [isUploadingImages, setIsUploadingImages] = useState(false);
  const [copiedBatchId, setCopiedBatchId] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const activeBatch = batches.find(b => b.id === activeBatchId) || batches[0];

  // Load history from localStorage on mount
  useEffect(() => {
    const savedHistory = localStorage.getItem('manga_recap_history');
    if (savedHistory) {
      try {
        setHistory(JSON.parse(savedHistory));
      } catch (e) {
        console.error("Failed to parse history", e);
      }
    }
  }, []);

  // Save history to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('manga_recap_history', JSON.stringify(history));
  }, [history]);

  const handleFilesAdded = useCallback(async (batchId: string, acceptedFiles: File[]) => {
    setIsUploadingImages(true);
    await new Promise(resolve => setTimeout(resolve, 800));
    
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

  const addBatch = () => {
    const newId = Date.now().toString();
    setBatches(prev => [
      ...prev,
      {
        id: newId,
        title: '',
        chapter: '',
        images: [],
        recap: null,
        loading: false,
        error: null,
        wordCount: 0
      }
    ]);
    setActiveBatchId(newId);
  };

  const removeBatch = (id: string) => {
    if (batches.length === 1) {
      // Clear last batch instead of removing
      clearBatch(id);
      return;
    }
    
    setBatches(prev => {
      const filtered = prev.filter(b => b.id !== id);
      const batchToRemove = prev.find(b => b.id === id);
      batchToRemove?.images.forEach(img => URL.revokeObjectURL(img.preview));
      
      if (activeBatchId === id) {
        setActiveBatchId(filtered[0].id);
      }
      return filtered;
    });
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
          const MAX_WIDTH = 1024;
          const MAX_HEIGHT = 1024;
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
    const batch = batches.find(b => b.id === batchId);
    if (!batch || batch.images.length === 0) return;
    
    setBatches(prev => prev.map(b => b.id === batchId ? { ...b, loading: true, error: null, recap: null } : b));
    
    try {
      const imageData = await Promise.all(batch.images.map(img => optimizeImage(img.file)));

      const result = await generateRecap(imageData, { 
        title: batch.title, 
        chapter: batch.chapter, 
        maxWords, 
        style,
        includeHook,
        includeOutro
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

  const handleGenerateAll = async () => {
    const eligibleBatches = batches.filter(b => b.images.length > 0 && !b.loading);
    if (eligibleBatches.length === 0) return;
    
    setIsProcessingBatch(true);
    // Process sequentially to avoid heavy rate limits or context issues
    for (const batch of eligibleBatches) {
      await handleGenerateBatch(batch.id);
    }
    setIsProcessingBatch(false);
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
    <div className="min-h-screen bg-zinc-50 p-4 md:p-8 max-w-5xl mx-auto space-y-12 pb-32">
      {/* Header */}
      <header className="flex flex-col md:flex-row justify-between items-center gap-8 py-6">
        <div className="text-center md:text-left space-y-2">
          <div className="flex items-center justify-center md:justify-start gap-3">
             <div className="px-3 py-1 bg-zinc-900 rounded-lg">
                <span className="font-sans text-xs font-bold text-white uppercase tracking-widest">
                  Aniki ID
                </span>
             </div>
             <div className="h-px w-8 bg-zinc-200"></div>
          </div>
          <h1 className="font-sans text-4xl md:text-5xl font-extrabold tracking-tight text-zinc-900">
            Anime Kingdom
          </h1>
          <p className="font-sans text-sm text-zinc-500 font-medium">
            Generate your manga scripts instantly with AI.
          </p>
        </div>
        
        <button 
          onClick={() => setShowHistory(!showHistory)}
          className={`flex items-center gap-2 font-sans font-semibold text-sm py-2.5 px-5 rounded-xl transition-all duration-300
            ${showHistory 
              ? 'bg-zinc-900 text-white shadow-lg shadow-zinc-200' 
              : 'bg-white text-zinc-900 border border-zinc-200 hover:border-zinc-900 hover:bg-zinc-50 shadow-sm'}`}
        >
          <HistoryIcon className="w-4 h-4" />
          History ({history.length})
        </button>
      </header>

      {/* Main Content */}
      <div className="grid grid-cols-1 gap-12">
        
        {/* Global Settings */}
        <section className="clean-card p-6 md:p-8 space-y-6">
          <div className="flex items-center gap-2 mb-2">
            <h2 className="text-sm font-bold text-zinc-900 uppercase tracking-widest flex items-center gap-2">
              <Sparkles className="w-4 h-4" /> Global Settings
            </h2>
            <div className="flex-1 h-px bg-zinc-100"></div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="space-y-3">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                <FileText className="w-3.5 h-3.5" /> Script Length
              </label>
              <select 
                value={maxWords}
                onChange={(e) => setMaxWords(Number(e.target.value))}
                className="standard-input w-full py-3 cursor-pointer appearance-none"
              >
                <option value={100}>100 Words (Blitz)</option>
                <option value={300}>300 Words (Standard)</option>
                <option value={500}>500 Words (Deep)</option>
                <option value={800}>800 Words (Epic)</option>
                <option value={1500}>1500 Words (Unlimited)</option>
              </select>
            </div>
            <div className="space-y-3 col-span-1 md:col-span-2">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5" /> Narration Preference
              </label>
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1 flex bg-zinc-100/50 rounded-xl p-1 border border-zinc-200">
                  <button 
                    onClick={() => setStyle('santai')}
                    className={`flex-1 py-2 font-sans font-semibold text-xs rounded-lg transition-all
                      ${style === 'santai' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-400 hover:text-zinc-600'}`}
                  >
                    Casual
                  </button>
                  <button 
                    onClick={() => setStyle('formal')}
                    className={`flex-1 py-2 font-sans font-semibold text-xs rounded-lg transition-all
                      ${style === 'formal' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-400 hover:text-zinc-600'}`}
                  >
                    Formal
                  </button>
                </div>
                <div className="flex-1 flex items-center justify-around bg-zinc-100/50 rounded-xl p-1 border border-zinc-200">
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <input 
                      type="checkbox" 
                      checked={includeHook} 
                      onChange={() => setIncludeHook(!includeHook)}
                      className="w-4 h-4 rounded border-zinc-200 text-zinc-900 focus:ring-zinc-900"
                    />
                    <span className="text-xs font-bold text-zinc-500 group-hover:text-zinc-900 transition-colors uppercase tracking-widest">Hook</span>
                  </label>
                  <div className="w-px h-4 bg-zinc-200"></div>
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <input 
                      type="checkbox" 
                      checked={includeOutro} 
                      onChange={() => setIncludeOutro(!includeOutro)}
                      className="w-4 h-4 rounded border-zinc-200 text-zinc-900 focus:ring-zinc-900"
                    />
                    <span className="text-xs font-bold text-zinc-500 group-hover:text-zinc-900 transition-colors uppercase tracking-widest">Outro</span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </section>
        
        {/* Batches Manager */}
        <section className="space-y-8">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-extrabold text-zinc-900">
              Manga Batches <span className="text-zinc-300 font-normal ml-2">({batches.length})</span>
            </h2>
            <div className="flex items-center gap-4">
               <button 
                onClick={handleGenerateAll}
                disabled={isProcessingBatch || batches.every(b => b.images.length === 0)}
                className="text-xs font-bold bg-zinc-900 text-white px-5 py-2.5 rounded-xl hover:bg-zinc-800 disabled:opacity-30 transition-all flex items-center gap-2 shadow-lg shadow-zinc-200"
              >
                {isProcessingBatch ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                Generate All
              </button>
              <button 
                onClick={addBatch}
                className="text-xs font-bold text-zinc-900 border border-zinc-200 bg-white px-5 py-2.5 rounded-xl hover:border-zinc-900 transition-all flex items-center gap-2"
              >
                <Upload className="w-3.5 h-3.5" />
                Add New Batch
              </button>
            </div>
          </div>

          <div className="space-y-12">
            {batches.map((batch, index) => (
              <motion.div 
                key={batch.id}
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className={`clean-card overflow-hidden transition-all duration-500 ${activeBatchId === batch.id ? 'ring-2 ring-zinc-900 border-transparent shadow-xl' : 'hover:border-zinc-300'}`}
                onClick={() => setActiveBatchId(batch.id)}
              >
                {/* Batch Header */}
                <div className={`p-6 border-b border-zinc-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 ${activeBatchId === batch.id ? 'bg-zinc-50/50' : 'bg-white'}`}>
                  <div className="flex items-center gap-6 flex-1 w-full">
                    <div className="w-12 h-12 rounded-xl bg-zinc-900 text-white flex items-center justify-center font-display text-xl shrink-0 shadow-lg shadow-zinc-200">
                      {index + 1}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1">
                       <input 
                          type="text"
                          placeholder="Manga Title..."
                          value={batch.title}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => setBatches(prev => prev.map(b => b.id === batch.id ? { ...b, title: e.target.value } : b))}
                          className="bg-transparent border-none focus:ring-0 font-sans font-extrabold text-xl p-0 placeholder:text-zinc-200 w-full"
                        />
                         <input 
                          type="text"
                          placeholder="Chapter..."
                          value={batch.chapter}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => setBatches(prev => prev.map(b => b.id === batch.id ? { ...b, chapter: e.target.value } : b))}
                          className="bg-transparent border-none focus:ring-0 font-sans font-bold text-sm text-zinc-400 p-0 placeholder:text-zinc-200 w-full"
                        />
                    </div>
                  </div>
                  <div className="flex items-center gap-3 w-full md:w-auto justify-end">
                    {batch.images.length > 0 && !batch.recap && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleGenerateBatch(batch.id); }}
                        disabled={batch.loading}
                        className="text-[10px] font-bold bg-zinc-900 text-white px-4 py-2 rounded-lg hover:bg-zinc-800 transition-all flex items-center gap-2 disabled:opacity-30"
                      >
                        {batch.loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                        Generate
                      </button>
                    )}
                    <button 
                      onClick={(e) => { e.stopPropagation(); removeBatch(batch.id); }}
                      className="p-2 text-zinc-300 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Batch Body */}
                <div className="p-6 md:p-8 space-y-8">
                  {/* Images Area */}
                  {!batch.recap && (
                    <div className="space-y-6">
                      <BatchDropzone 
                        batchId={batch.id}
                        isUploading={isUploadingImages && activeBatchId === batch.id}
                        onFilesAdded={handleFilesAdded}
                      />

                      <AnimatePresence>
                        {batch.images.length > 0 && (
                          <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-2"
                          >
                            {batch.images.map((img, i) => (
                              <div key={img.preview} className="relative aspect-square rounded-lg overflow-hidden bg-zinc-50 border border-zinc-100 group">
                                <img src={img.preview} alt="p" className="w-full h-full object-cover" />
                                <button 
                                  onClick={(e) => { e.stopPropagation(); removeImage(batch.id, i); }}
                                  className="absolute inset-0 bg-red-500/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}

                  {/* Recap Loading */}
                  {batch.loading && (
                    <div className="py-12 flex flex-col items-center gap-4">
                      <Loader2 className="w-8 h-8 animate-spin text-zinc-900" />
                      <p className="text-xs font-bold text-zinc-400 uppercase tracking-[0.3em] animate-pulse">Drafting script...</p>
                    </div>
                  )}

                  {/* Recap Result */}
                  {batch.recap && (
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="space-y-6"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4 text-[9px] font-bold text-zinc-400 uppercase tracking-widest">
                          <span className="flex items-center gap-1">
                            <Hash className="w-3 h-3" /> {batch.wordCount} words
                          </span>
                          <div className="w-1 h-1 bg-zinc-200 rounded-full"></div>
                          <span className="text-green-500">Completed</span>
                        </div>
                        <div className="flex gap-2">
                           <button 
                            onClick={(e) => { e.stopPropagation(); copyToClipboard(batch.recap!, batch.id); }}
                            className={`flex items-center gap-2 text-[10px] font-bold px-4 py-2 rounded-lg transition-all
                              ${copiedBatchId === batch.id 
                                ? 'bg-green-500 text-white' 
                                : 'bg-white text-zinc-900 border border-zinc-200 hover:border-zinc-900'}`}
                          >
                            <Copy className="w-3 h-3" />
                            {copiedBatchId === batch.id ? 'Copied' : 'Copy'}
                          </button>
                           <button 
                            onClick={(e) => { e.stopPropagation(); setBatches(prev => prev.map(b => b.id === batch.id ? { ...b, recap: null } : b)); }}
                            className="text-[10px] font-bold border border-zinc-200 px-4 py-2 rounded-lg hover:bg-zinc-50"
                          >
                            Edit
                          </button>
                        </div>
                      </div>
                      <div className="bg-zinc-50 p-6 md:p-8 rounded-xl text-zinc-800 text-sm leading-relaxed font-sans border border-zinc-100 italic">
                        {batch.recap}
                      </div>
                    </motion.div>
                  )}

                  {/* Error State */}
                  {batch.error && (
                    <div className="p-6 bg-red-50 rounded-xl border border-red-100 text-center space-y-3">
                       <p className="text-xs font-bold text-red-600 tracking-wide">{batch.error}</p>
                       <button 
                        onClick={(e) => { e.stopPropagation(); handleGenerateBatch(batch.id); }}
                        className="text-[10px] font-bold uppercase tracking-widest text-red-600 bg-white px-4 py-2 rounded-lg shadow-sm"
                       >
                         Try Again
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
        <section className="space-y-8 pt-16 border-t border-zinc-100">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
               <h2 className="text-2xl font-extrabold text-zinc-900 flex items-center gap-3">
                 History
               </h2>
               <p className="text-xs text-zinc-400 font-medium">Your previous generated scripts are saved here locally.</p>
            </div>
            <button 
              onClick={() => setShowHistory(!showHistory)}
              className="text-xs font-bold text-zinc-400 hover:text-zinc-900 transition-colors uppercase tracking-[0.2em] flex items-center gap-2"
            >
              {showHistory ? <><ChevronUp className="w-4 h-4" /> Hide</> : <><ChevronDown className="w-4 h-4" /> Show ({history.length})</>}
            </button>
          </div>

          <AnimatePresence>
            {showHistory && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                {history.length === 0 ? (
                  <div className="p-20 text-center rounded-2xl border border-dashed border-zinc-200">
                    <p className="text-sm text-zinc-400 font-medium">Your script history will appear here.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {history.map((item) => (
                      <motion.div 
                        key={item.id}
                        layout
                        className="clean-card p-5 group hover:border-zinc-900 transition-all duration-300"
                      >
                        <div className="flex gap-5">
                          <div className="w-20 h-24 rounded-lg bg-zinc-50 overflow-hidden shrink-0 border border-zinc-100">
                            <img src={item.thumbnail} alt="thumb" className="w-full h-full object-cover grayscale opacity-80 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-500" />
                          </div>
                          <div className="flex-1 flex flex-col justify-between overflow-hidden">
                            <div className="space-y-1">
                               <h3 className="text-base font-bold text-zinc-900 truncate group-hover:text-zinc-900 transition-colors">{item.title}</h3>
                               <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Chapter {item.chapter}</p>
                            </div>
                            <div className="flex items-center gap-3">
                               <span className="text-[9px] font-bold bg-zinc-100 text-zinc-500 px-2 py-1 rounded-md uppercase">{item.wordCount} words</span>
                               <span className="text-[9px] font-bold text-zinc-300 uppercase">{item.date}</span>
                            </div>
                          </div>
                        </div>
                        
                        <div className="pt-6 space-y-4">
                          <div className="flex gap-2">
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
                                  window.scrollTo({ top: 0, behavior: 'smooth' });
                                }}
                                className="flex-1 text-[11px] font-bold bg-zinc-900 text-white py-2.5 rounded-lg hover:bg-zinc-800 transition-colors uppercase tracking-widest"
                             >
                               Load Script
                             </button>
                             <button 
                                onClick={() => deleteHistoryItem(item.id)}
                                className="px-4 flex items-center justify-center rounded-lg border border-zinc-100 text-zinc-300 hover:text-red-500 hover:bg-red-50 hover:border-red-100 transition-all"
                             >
                               <Trash2 className="w-4 h-4" />
                             </button>
                          </div>
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
      <footer className="pt-20 text-center space-y-4">
         <div className="h-px w-20 bg-zinc-200 mx-auto"></div>
         <p className="text-[10px] font-bold text-zinc-300 uppercase tracking-[0.5em]">AniKi Kingdom v2.0</p>
      </footer>

      {/* Floating Action Component for Mobile */}
      <button 
        onClick={() => setShowHistory(!showHistory)}
        className="fixed bottom-8 right-8 md:hidden bg-zinc-900 text-white p-5 z-50 rounded-2xl shadow-xl active:scale-95 transition-transform"
      >
        <HistoryIcon className="w-6 h-6" />
      </button>
    </div>
  );
}
