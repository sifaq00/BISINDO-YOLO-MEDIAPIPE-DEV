import { useRef, useState, useCallback, useEffect } from "react";

export function useWebcam() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  const [cameraOn, setCameraOn] = useState(false);
  const [facing, setFacing] = useState("user"); // 'user' (depan) atau 'environment' (belakang)
  const [switching, setSwitching] = useState(false);
  
  // State FPS kamera (bukan YOLO)
  const [camFps, setCamFps] = useState(0);
  
  // Variabel untuk hitung FPS biar gak kedip-kedip angkanya
  const frameIdRef = useRef(null);
  const fpsFrameCount = useRef(0);
  const fpsLastTime = useRef(0);

  // --- 1. STOP CAMERA (Bersih-bersih) ---
  const stopWebcam = useCallback(() => {
    // Stop Loop FPS
    if (frameIdRef.current) {
      cancelAnimationFrame(frameIdRef.current);
      frameIdRef.current = null;
    }
    setCamFps(0);
    fpsFrameCount.current = 0;
    fpsLastTime.current = 0;

    // Stop Video Element
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }

    // Stop Stream Hardware (Lampu kamera mati)
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    setCameraOn(false);
  }, []);

  // --- 2. START CAMERA (Versi HD 16:9) ---
  const startWebcam = useCallback(async () => {
    // Pastikan bersih dulu sebelum mulai baru
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
    }

    setSwitching(true);

    try {
      // KONFIGURASI HD 16:9
      // Kita minta 1280x720 agar tampilan Desktop Full Screen & Ganteng
      const constraints = {
        audio: false,
        video: {
          facingMode: facing,
          // 👇 REQUEST HD DISINI
          width: { ideal: 1280 }, 
          height: { ideal: 720 },
          frameRate: { ideal: 30, max: 60 }
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        
        // Tunggu sampai video siap diputar
        videoRef.current.onloadedmetadata = async () => {
          try {
            await videoRef.current.play();
            setCameraOn(true);
            
            // Reset counter FPS
            fpsLastTime.current = performance.now();
            fpsFrameCount.current = 0;
            
            // Mulai hitung FPS Kamera lokal
            requestVideoFrameCallback(); 
          } catch (playErr) {
            console.error("Video play error:", playErr);
            alert("Gagal memutar video: " + playErr.message);
          }
        };
      }
    } catch (err) {
      console.error("Gagal akses kamera:", err);
      alert(`Kamera Error: ${err.name} - ${err.message}\nCek izin browser atau HTTPS.`);
      setCameraOn(false);
    } finally {
      setSwitching(false);
    }
  }, [facing]);

  // --- 3. SWITCH CAMERA ---
  const switchCamera = useCallback(() => {
    setFacing((prev) => (prev === "user" ? "environment" : "user"));
  }, []);

  // Effect: Restart kamera otomatis saat 'facing' berubah
  useEffect(() => {
    if (cameraOn) {
      startWebcam();
    }
  }, [facing]); 

  // --- 4. UTILS: FPS Counter Lokal ---
  const requestVideoFrameCallback = () => {
    const now = performance.now();
    
    // Tambah counter setiap frame
    fpsFrameCount.current++;

    // Cek apakah sudah lewat 500ms (0.5 detik)?
    if (now - fpsLastTime.current >= 500) {
      // Hitung FPS rata-rata selama 0.5 detik terakhir
      const currentFps = Math.round((fpsFrameCount.current * 1000) / (now - fpsLastTime.current));
      
      setCamFps(currentFps); 
      
      // Reset timer
      fpsFrameCount.current = 0;
      fpsLastTime.current = now;
    }
    
    // Lanjut loop
    frameIdRef.current = requestAnimationFrame(requestVideoFrameCallback);
  };

  // Cleanup saat unmount
  useEffect(() => {
    return () => stopWebcam();
  }, [stopWebcam]);

  return {
    videoRef,
    canvasRef,
    cameraOn,
    facing,
    switching,
    camFps,
    startWebcam,
    stopWebcam,
    switchCamera
  };
}