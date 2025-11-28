import { useRef, useState } from "react";
import { Upload, Image as ImageIcon, Loader2, XCircle, Download } from "lucide-react";
import labels from "../utils/labels.json";

// ====== Konfigurasi Backend ======
const API_BASE = import.meta.env.VITE_API_BASE;
const DETECT_URL = `${API_BASE}/detect`;

// Fungsi warna kustom 
function classColorFromId(id) {
  const h = (Math.abs(id) * 137.508) % 360;
  return `hsl(${h}deg 90% 55%)`;
}

export default function ImageDetection() {
  const canvasRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [detections, setDetections] = useState([]);

  // --- 1. PROSES GAMBAR (Resize -> Draw -> Send) ---
  const processImage = (file) => {
    if (!file) return;
    
    setLoading(true);
    setImageLoaded(false);
    setDetections([]);

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        // LOGIC RESIZE: Resize ke lebar 640px agar ringan dikirim ke API
        const targetWidth = 640;
        const scale = targetWidth / img.width;
        const targetHeight = img.height * scale;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");

        // Set ukuran canvas sesuai hasil resize
        canvas.width = targetWidth;
        canvas.height = targetHeight;

        // Gambar foto asli yang sudah di-resize ke canvas
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
        setImageLoaded(true);

        // Ambil Data URL dari gambar kecil ini (Kompresi JPEG 0.7)
        const resizedDataUrl = canvas.toDataURL("image/jpeg", 0.7);

        // Kirim ke API
        sendToApi(resizedDataUrl, ctx);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  // --- 2. KIRIM KE API ---
  const sendToApi = async (dataUrl, ctx) => {
    try {
      const res = await fetch(DETECT_URL, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true", 
        },
        body: JSON.stringify({ image: dataUrl }),
      });

      if (res.ok) {
        const result = await res.json();
        setDetections(result);
        // Gambar kotak hasil deteksi
        drawBoxes(ctx, result);
      } else {
        console.error("Server error:", res.status);
        alert("Gagal deteksi: Server error " + res.status);
      }
    } catch (error) {
      console.error("Fetch error:", error);
      alert("Gagal menghubungi server. Pastikan backend nyala.");
    } finally {
      setLoading(false);
    }
  };

  // --- 3. GAMBAR KOTAK ---
  const drawBoxes = (ctx, detections) => {
    const fontPx = 20; 
    const padX = 10;
    const padY = 6;
    
    ctx.textBaseline = "top";
    ctx.lineJoin = "round";
    ctx.miterLimit = 2;
    ctx.font = `600 ${fontPx}px Inter, Arial, sans-serif`;

    detections.forEach((d) => {
      const x = d.x1;
      const y = d.y1;
      const bw = d.x2 - d.x1;
      const bh = d.y2 - d.y1;
      
      const classId = Math.round(d.classId ?? -1);
      const color = classColorFromId(classId); 

      // BBox
      ctx.lineWidth = 4;
      ctx.strokeStyle = color;
      ctx.strokeRect(x, y, bw, bh);

      // Label
      const labelStr = d.className ?? labels[classId] ?? `cls ${classId}`;
      const text = `${labelStr} (${(d.score ?? 0).toFixed(2)})`;

      const tw = ctx.measureText(text).width;
      const th = fontPx + padY;

      let lx = x - 2;
      let ly = y - th - 4;
      if (ly < 0) ly = y + 4; 

      ctx.fillStyle = color;
      ctx.fillRect(lx, ly, tw + padX, th);

      ctx.fillStyle = "#000"; 
      ctx.fillText(text, lx + Math.round(padX / 2), ly + Math.round((th - fontPx) / 2));
    });
  };

  // --- FITUR: DOWNLOAD GAMBAR ---
  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const link = document.createElement('a');
    link.download = `bisindo-result-${Date.now()}.jpg`; 
    link.href = canvas.toDataURL('image/jpeg', 1.0); 
    link.click();
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      processImage(e.target.files[0]);
    }
  };

  const handleReset = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setImageLoaded(false);
    setDetections([]);
    
    const input = document.getElementById("image-upload");
    if (input) input.value = "";
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-4 flex flex-col items-center min-h-[60vh]">
      
      {/* --- AREA UPLOAD --- */}
      <div className="w-full mb-6">
        <label
          htmlFor="image-upload"
          className={`relative cursor-pointer w-full flex flex-col items-center justify-center border-2 border-dashed rounded-3xl transition-all duration-300 
            h-40 sm:h-48 md:h-56 lg:h-64  /* Responsive Height */
            ${loading 
              ? "border-gray-600 bg-gray-800/50 cursor-wait" 
              : "border-gray-600 hover:border-indigo-500 hover:bg-gray-800"
            }`}
        >
          {loading ? (
            <div className="flex flex-col items-center animate-pulse">
              <Loader2 size={40} className="text-indigo-500 animate-spin mb-2" />
              <p className="text-gray-400 font-medium text-center px-4">Sedang Menganalisis...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center text-gray-400 group-hover:text-indigo-400 transition-colors text-center px-4">
              <Upload size={32} className="mb-3 text-gray-500 sm:w-10 sm:h-10" />
              <p className="font-semibold text-base sm:text-lg text-gray-300">Klik untuk Upload Gambar</p>
              <p className="text-xs sm:text-sm text-gray-500 mt-1">JPEG, PNG (Max 5MB)</p>
            </div>
          )}
          
          <input
            id="image-upload"
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
            disabled={loading}
          />
        </label>
      </div>

      {/* --- AREA HASIL (CANVAS RESPONSIVE) --- */}
      <div className={`relative w-full max-w-2xl rounded-2xl overflow-hidden shadow-2xl border border-gray-700 bg-black transition-all duration-500 ${imageLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10 hidden'}`}>
        
        <canvas
          ref={canvasRef}
          className="w-full h-auto block object-contain"
        />
        
        {/* Action Buttons (Mobile Friendly Sizing) */}
        {!loading && imageLoaded && (
          <div className="absolute top-3 right-3 flex gap-3">
            
            {/* Tombol Download */}
            <button
              onClick={handleDownload}
              className="p-3 sm:p-2 bg-black/60 text-white/80 hover:text-white hover:bg-green-500/80 rounded-full backdrop-blur-md transition-all shadow-lg active:scale-90"
              title="Download Hasil"
            >
              <Download size={20} className="sm:w-6 sm:h-6" />
            </button>

            {/* Tombol Reset */}
            <button
              onClick={handleReset}
              className="p-3 sm:p-2 bg-black/60 text-white/80 hover:text-white hover:bg-red-500/80 rounded-full backdrop-blur-md transition-all shadow-lg active:scale-90"
              title="Hapus Gambar"
            >
              <XCircle size={20} className="sm:w-6 sm:h-6" />
            </button>
          </div>
        )}
      </div>

      {/* --- HASIL DETEKSI TEXT (Badge Wrapping) --- */}
      {detections.length > 0 && (
        <div className="mt-6 p-4 sm:p-5 bg-gray-800/80 backdrop-blur-sm rounded-2xl border border-gray-700 w-full max-w-2xl animate-fade-in-up">
          <h3 className="text-white font-bold mb-3 sm:mb-4 flex items-center gap-2 text-base sm:text-lg">
            <ImageIcon size={20} className="text-indigo-400" />
            Hasil Deteksi:
          </h3>
          <div className="flex flex-wrap gap-2 sm:gap-3">
            {detections.map((det, idx) => {
                const badgeColor = classColorFromId(det.classId);
                return (
                  <span 
                    key={idx} 
                    className="px-2 py-1 sm:px-3 sm:py-1.5 text-white rounded-lg text-xs sm:text-sm font-bold shadow-sm border border-white/10 flex items-center"
                    style={{ backgroundColor: badgeColor }}
                  >
                    {det.className} 
                    <span className="opacity-75 text-[10px] sm:text-xs ml-1.5 bg-black/20 px-1 rounded">
                      {Math.round(det.score * 100)}%
                    </span>
                  </span>
                );
            })}
          </div>
        </div>
      )}

    </div>
  );
}