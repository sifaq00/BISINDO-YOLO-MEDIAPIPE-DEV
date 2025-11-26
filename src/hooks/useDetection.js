import { useRef, useState, useEffect } from "react";

const API_BASE = import.meta.env.VITE_API_BASE;
const DETECT_URL = `${API_BASE}/detect`;

// --- PENGATURAN KECEPATAN (LIMIT) ---
const MIN_INTERVAL_MS = 0; 

export function useDetection(videoRef, cameraOn, onDetections, handPresence) {
  const [fps, setFps] = useState(0);
  
  const sendingRef = useRef(false);
  const lastSendTime = useRef(0); 
  const fpsCount = useRef(0);
  const fpsLastT = useRef(performance.now());
  const animationFrameRef = useRef(null);

  // Kita simpan rasio resize di ref agar bisa dipakai saat data balik
  const resizeScaleRef = useRef(1); 

  // Helper snapshot: OTOMATIS RESIZE KE 640px
  const captureImage = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return null;

    // Target lebar untuk dikirim ke API
    const targetWidth = 480; 
    
    // Hitung Rasio (Misal: 640 / 1280 = 0.5)
    const scale = targetWidth / v.videoWidth;
    resizeScaleRef.current = scale; // Simpan rasionya!

    const targetHeight = v.videoHeight * scale;

    const cvs = document.createElement("canvas");
    cvs.width = targetWidth;
    cvs.height = targetHeight;
    
    cvs.getContext("2d").drawImage(v, 0, 0, targetWidth, targetHeight);
    
    return cvs.toDataURL("image/jpeg", 0.6); 
  };

  // Fungsi Kirim ke API
  const sendDetect = async () => {
    const now = performance.now();

    // --- STRATEGI BARU: GATEKEEPER ---
    // 1. Jika kamera mati -> Stop
    // 2. Jika sedang mengirim (sendingRef) -> Stop
    // 3. Jika TIDAK ADA TANGAN (handPresence false) -> Stop (Hemat API)
    if (!cameraOn || sendingRef.current || !handPresence) {
      return; 
    }

    if (now - lastSendTime.current < MIN_INTERVAL_MS) {
      return; 
    }
    
    const dataUrl = captureImage();
    if (!dataUrl) return;

    sendingRef.current = true;
    lastSendTime.current = now;

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
        const rawDetections = await res.json();
        
        // --- LOGIKA PERBAIKAN BBOX (UPSCALE) ---
        // Karena API mendeteksi di gambar kecil (640px),
        // Kita harus kembalikan koordinatnya ke ukuran asli video (1280px).
        // Caranya: Bagi koordinat dengan scale tadi. (x / 0.5 = 2x)
        const scale = resizeScaleRef.current;
        
        const scaledDetections = rawDetections.map(d => ({
          ...d,
          x1: d.x1 / scale,
          y1: d.y1 / scale,
          x2: d.x2 / scale,
          y2: d.y2 / scale
        }));

        if (onDetections) onDetections(scaledDetections); 

        // Hitung FPS Server
        fpsCount.current++;
        if (now - fpsLastT.current >= 1000) {
           setFps(fpsCount.current);
           fpsCount.current = 0;
           fpsLastT.current = now;
        }
      }
    } catch (e) {
      console.error("Detect Error:", e);
    } finally {
      sendingRef.current = false;
    }
  };

  // Loop Animation Frame
  useEffect(() => {
    const loop = () => {
      if (cameraOn) {
        sendDetect();
        animationFrameRef.current = requestAnimationFrame(loop);
      }
    };

    if (cameraOn) {
      loop();
    } else {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      setFps(0);
    }

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [cameraOn, handPresence]); // Tambahkan handPresence ke dependency

  return { fps };
}