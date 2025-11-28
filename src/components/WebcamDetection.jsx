import { useEffect, useRef, useState } from "react";
import { Camera, X, Zap, ZapOff, Video, RefreshCw, StopCircle, Scan } from "lucide-react"; 
import labels from "../utils/labels.json";
import { useWebcam } from "../hooks/useWebcam";
import { useDetection } from "../hooks/useDetection";
import { useHandPose } from "../hooks/useHandPose"; 
import { matchDetectionsToTracks } from "../utils/math";
import { drawOverlay } from "../utils/draw"; 

export default function WebcamDetection() {
  const { 
    videoRef, canvasRef, cameraOn, facing, switching, camFps, 
    flashOn, supportsFlash, toggleFlash,
    startWebcam, stopWebcam, switchCamera 
  } = useWebcam();

  // 1. MediaPipe Logic (Tanpa Visual, hanya ambil statusnya)
  const { handPresence, landmarks } = useHandPose(videoRef, cameraOn);

  const tracksRef = useRef([]);
  const nextTrackId = useRef(1);
  const [isMobile, setIsMobile] = useState(false);
  
  // State lokal untuk memicu re-render UI (border warna) saat ada deteksi YOLO
  const [hasDetections, setHasDetections] = useState(false);

  // --- FITUR BARU: WAKE LOCK (ANTI SLEEP) ---
  const wakeLockRef = useRef(null);

  const requestWakeLock = async () => {
    if ('wakeLock' in navigator) {
      try {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
      } catch (err) {
        console.warn("Gagal mengaktifkan Wake Lock:", err);
      }
    }
  };

  const releaseWakeLock = async () => {
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
      } catch (err) {
        console.warn("Gagal melepas Wake Lock:", err);
      }
    }
  };

  // Effect: Aktifkan Wake Lock saat kamera menyala
  useEffect(() => {
    if (cameraOn) {
      requestWakeLock();
    } else {
      releaseWakeLock();
    }

    // Cleanup saat komponen di-unmount atau tab ditutup
    return () => {
      releaseWakeLock();
    };
  }, [cameraOn]);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleDetections = (detections) => {
    tracksRef.current = matchDetectionsToTracks(tracksRef.current, detections, nextTrackId);
    // Update status deteksi untuk UI
    setHasDetections(tracksRef.current.length > 0);
  };

  // Pass 'handPresence' agar API hanya dipanggil saat ada tangan
  const { fps: serverFps } = useDetection(
  videoRef,
  cameraOn,
  handleDetections,
  handPresence,
  landmarks
  );

  const isMirrored = facing === "user";

  // 2. Loop Gambar (Hanya Kotak YOLO)
  useEffect(() => {
    let rafId;
    const loop = () => {
      if (cameraOn && canvasRef.current && videoRef.current) {
        const ctx = canvasRef.current.getContext("2d");
        
        // Sync manual state UI jika track kosong (opsional safety check)
        if (tracksRef.current.length === 0 && hasDetections) setHasDetections(false);

        // Hanya gambar overlay kotak (drawSkeleton DIHAPUS agar bersih)
        drawOverlay(ctx, canvasRef.current, videoRef.current, tracksRef, labels, isMirrored, isMobile);
      }
      rafId = requestAnimationFrame(loop);
    };

    if (cameraOn) loop();
    else if (canvasRef.current) {
      const ctx = canvasRef.current.getContext("2d");
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
    return () => cancelAnimationFrame(rafId);
  }, [cameraOn, isMirrored, isMobile, hasDetections]); 

  // --- LOGIKA WARNA BORDER DINAMIS ---
  const getBorderClass = () => {
    if (!cameraOn) return "border-gray-800";
    
    // Prioritas 1: Hijau jika YOLO mendeteksi huruf/objek
    if (hasDetections) return "border-green-500 shadow-[0_0_30px_rgba(34,197,94,0.4)]";
    
    // Prioritas 2: Kuning jika MediaPipe mendeteksi tangan (sedang memproses/menunggu API)
    if (handPresence) return "border-yellow-400 shadow-[0_0_30px_rgba(250,204,21,0.4)]";
    
    // Default: Abu-abu (Idle/Tidak ada tangan)
    return "border-gray-800";
  };

  // --- PERBAIKAN CONTAINER MOBILE (100dvh) ---
  const containerClass = isMobile && cameraOn
    ? "fixed inset-0 z-50 bg-black flex flex-col items-center justify-center h-[100dvh]" // <-- Menggunakan h-[100dvh] agar pas di browser HP
    : `relative w-full max-w-4xl mx-auto bg-gray-900 rounded-3xl overflow-hidden shadow-2xl border-4 transition-all duration-300 ${getBorderClass()} aspect-[3/4] md:aspect-video`;

  const objectFitClass = isMobile ? "object-contain" : "object-cover";

  return (
    <div className="w-full p-4 flex justify-center">
      <div className={containerClass}>

        {/* --- HEADER MOBILE (FPS TAMPIL DISINI) --- */}
        {isMobile && cameraOn && (
          <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-start z-[60] bg-gradient-to-b from-black/80 to-transparent">
            <div className="flex flex-col gap-1">
              <span className="text-white font-bold text-lg tracking-wider drop-shadow-md">BISINDO</span>
              
              <div className="flex flex-col gap-1 mt-1">
                 {/* Indikator MediaPipe (MP) */}
                 <div className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono w-fit backdrop-blur-sm ${handPresence ? "bg-yellow-500/30 text-yellow-200 border border-yellow-500/30" : "bg-black/40 text-gray-400 border border-white/10"}`}>
                    <Scan size={10} /> MP: {handPresence ? "ON" : "OFF"}
                 </div>

                 {/* Baris FPS (Camera & API) */}
                 <div className="flex gap-2 text-[10px] text-gray-300 font-mono">
                    <span className="bg-black/40 px-2 py-0.5 rounded flex items-center gap-1 border border-white/10 backdrop-blur-sm">
                      <Video size={10} className="text-green-400" /> CAM: {camFps}
                    </span>
                    <span className="bg-black/40 px-2 py-0.5 rounded flex items-center gap-1 border border-white/10 backdrop-blur-sm">
                      <Zap size={10} className="text-yellow-400" /> API: {serverFps}
                    </span>
                 </div>
              </div>
            </div>

            <button 
              onClick={stopWebcam}
              className="p-2 bg-black/40 text-white rounded-full hover:bg-white/20 transition backdrop-blur-md border border-white/10"
            >
              <X size={20} />
            </button>
          </div>
        )}

        <video
          ref={videoRef}
          autoPlay 
          muted 
          playsInline
          style={{ transform: isMirrored ? "scaleX(-1)" : "none" }} 
          className={`absolute inset-0 w-full h-full ${objectFitClass} z-10 transition-opacity duration-300 bg-black ${!cameraOn ? 'opacity-0' : 'opacity-100'}`}
        />
        
        <canvas
          ref={canvasRef}
          className={`absolute inset-0 w-full h-full ${objectFitClass} pointer-events-none z-20`}
        />

        {/* --- LAYAR AWAL (KAMERA MATI) --- */}
        {!cameraOn && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900 z-30 px-4 text-center">
            <div className="w-20 h-20 bg-indigo-600/20 rounded-full flex items-center justify-center mb-6 ring-1 ring-indigo-500/50">
              <Camera size={40} className="text-indigo-400" />
            </div>
            <h3 className="text-2xl font-bold text-white mb-2">Mulai Deteksi</h3>
            <p className="text-gray-400 text-sm max-w-xs mb-8 leading-relaxed">
              Arahkan kamera ke tangan Anda. Pastikan pencahayaan cukup terang.
            </p>
            <button
              onClick={startWebcam}
              className="px-8 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-full font-semibold shadow-lg shadow-indigo-500/30 transition-all active:scale-95 flex items-center gap-2 group"
            >
              <Video size={20} className="group-hover:animate-pulse" />
              Nyalakan Kamera
            </button>
          </div>
        )}

        {/* --- LAYAR KAMERA NYALA --- */}
        {cameraOn && (
          <>
            {/* STATUS BADGE DESKTOP (Hanya tampil di layar besar) */}
            {!isMobile && (
              <div className="absolute top-4 left-4 z-30 flex flex-col gap-2">
                 <div className={`px-3 py-1.5 rounded-lg text-xs font-bold backdrop-blur-md border border-white/10 flex items-center gap-2 transition-colors ${
                    hasDetections 
                      ? "bg-green-500/20 text-green-300 border-green-500/30" 
                      : handPresence 
                        ? "bg-yellow-500/20 text-yellow-300 border-yellow-500/30 animate-pulse" 
                        : "bg-black/60 text-gray-400"
                 }`}>
                    <div className={`w-2 h-2 rounded-full ${hasDetections ? "bg-green-400" : handPresence ? "bg-yellow-400" : "bg-gray-500"}`} />
                    {hasDetections ? "TERDETEKSI" : handPresence ? "MEMPROSES..." : "MENUNGGU TANGAN"}
                 </div>

                 <div className="flex gap-2">
                    <div className="bg-black/60 backdrop-blur-md text-gray-300 px-3 py-1 rounded-lg text-xs font-mono border border-white/10">
                       CAM: {camFps}
                    </div>
                    <div className="bg-black/60 backdrop-blur-md text-yellow-400 px-3 py-1 rounded-lg text-xs font-mono border border-white/10">
                       API: {serverFps}
                    </div>
                 </div>
              </div>
            )}

            {/* POPUP STATUS MOBILE (Kecil di tengah saat menunggu) */}
            {isMobile && handPresence && !hasDetections && (
               <div className="absolute top-1/4 left-1/2 -translate-x-1/2 z-30">
                  <span className="bg-black/50 backdrop-blur text-yellow-300 text-[10px] px-3 py-1 rounded-full border border-yellow-500/30 animate-pulse whitespace-nowrap">
                    Menganalisis...
                  </span>
               </div>
            )}

            {/* CONTROLS BAR (Tombol Bawah) */}
            <div className={`absolute z-30 w-full flex flex-col items-center justify-end pb-8 ${isMobile ? 'bottom-0 h-40 bg-gradient-to-t from-black/90 to-transparent' : 'bottom-4'}`}>
              <div className="flex items-center gap-6">
                <button
                  onClick={() => switchCamera(facing === "user" ? "environment" : "user")}
                  disabled={switching}
                  className={`p-3 rounded-full bg-white/10 text-white hover:bg-white/20 backdrop-blur-md transition-all ${switching ? 'opacity-50 cursor-wait' : ''}`}
                >
                  <RefreshCw size={isMobile ? 24 : 20} className={switching ? "animate-spin" : ""} />
                </button>

                {isMobile ? (
                  <button onClick={stopWebcam} className="w-16 h-16 rounded-full border-4 border-white flex items-center justify-center bg-red-500 hover:bg-red-600 shadow-lg shadow-red-900/50 transition-transform active:scale-95">
                    <div className="w-6 h-6 bg-white rounded-sm" />
                  </button>
                ) : (
                  <button onClick={stopWebcam} className="px-6 py-3 bg-red-500/90 hover:bg-red-600 text-white rounded-full text-sm font-medium backdrop-blur-sm transition-all shadow-lg flex items-center gap-2 active:scale-95">
                    <StopCircle size={18} />
                    Matikan Kamera
                  </button>
                )}

                {isMobile && supportsFlash ? (
                  <button
                    onClick={toggleFlash}
                    className={`p-3 rounded-full ${flashOn ? 'bg-yellow-400 text-black' : 'bg-white/10 text-white'} hover:bg-white/20 backdrop-blur-md transition-all`}
                  >
                    {flashOn ? <Zap size={24} fill="currentColor" /> : <ZapOff size={24} />}
                  </button>
                ) : (
                  <div className="w-12 h-12" /> 
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}