import { useRef, useState, useCallback, useEffect } from "react";

export function useWebcam() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  const [cameraOn, setCameraOn] = useState(false);
  const [facing, setFacing] = useState("user"); // 'user' (depan) atau 'environment' (belakang)
  const [switching, setSwitching] = useState(false);
  
  // --- FITUR BARU: FLASH / TORCH ---
  const [flashOn, setFlashOn] = useState(false);
  const [supportsFlash, setSupportsFlash] = useState(false);

  // State FPS kamera
  const [camFps, setCamFps] = useState(0);
  
  // Variabel untuk hitung FPS
  const frameIdRef = useRef(null);
  const fpsFrameCount = useRef(0);
  const fpsLastTime = useRef(0);

  // --- 1. STOP CAMERA (Bersih-bersih) ---
  const stopWebcam = useCallback(() => {
    // Reset Flash
    setFlashOn(false);
    setSupportsFlash(false);

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

    // Stop Stream Hardware
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    setCameraOn(false);
  }, []);

  // --- 2. START CAMERA (Versi HD 16:9 + Cek Flash) ---
  const startWebcam = useCallback(async () => {
    // Bersihkan stream sebelumnya jika ada
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
    }

    setSwitching(true);

    try {
      // KONFIGURASI HD 16:9
      const constraints = {
        audio: false,
        video: {
          // Gunakan 'exact' untuk environment agar lebih memaksa ke kamera belakang utama (yang biasanya ada flash)
          facingMode: facing === "user" ? "user" : { exact: "environment" },
          width: { ideal: 1280 }, 
          height: { ideal: 720 },
          frameRate: { ideal: 30, max: 60 }
        }
      };

      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err) {
        // Fallback: Jika 'exact: environment' gagal (error Overconstrained), coba mode longgar
        if (facing === "environment") {
           console.warn("Gagal akses exact environment, mencoba mode fallback...");
           stream = await navigator.mediaDevices.getUserMedia({
             audio: false,
             video: { 
               facingMode: "environment",
               width: { ideal: 1280 }, 
               height: { ideal: 720 }
             }
           });
        } else {
          throw err;
        }
      }

      streamRef.current = stream;

      // --- LOGIKA CEK FLASH (TORCH) ---
      // Ambil track video yang aktif
      const track = stream.getVideoTracks()[0];
      // Cek kapabilitas hardware
      const capabilities = track.getCapabilities ? track.getCapabilities() : {};
      
      // Jika hardware mendukung 'torch', aktifkan tombol flash
      if (capabilities.torch) {
        setSupportsFlash(true);
      } else {
        setSupportsFlash(false);
      }
      setFlashOn(false); // Default mati saat baru nyala

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
    setSwitching(true);
    setFacing((prev) => (prev === "user" ? "environment" : "user"));
  }, []);

  // --- 4. TOGGLE FLASH (Fitur Baru) ---
  const toggleFlash = useCallback(async () => {
    if (streamRef.current) {
      const track = streamRef.current.getVideoTracks()[0];
      const capabilities = track.getCapabilities ? track.getCapabilities() : {};
      
      if (capabilities.torch) {
        try {
          // Terapkan setting torch tanpa mematikan kamera
          await track.applyConstraints({
            advanced: [{ torch: !flashOn }]
          });
          setFlashOn(!flashOn);
        } catch (err) {
          console.error("Gagal toggle flash:", err);
        }
      }
    }
  }, [flashOn]);

  // Effect: Restart kamera otomatis saat 'facing' berubah
  useEffect(() => {
    if (cameraOn) {
      startWebcam();
    }
  }, [facing]); 

  // --- 5. UTILS: FPS Counter Lokal ---
  const requestVideoFrameCallback = () => {
    const now = performance.now();
    
    fpsFrameCount.current++;

    if (now - fpsLastTime.current >= 500) {
      const currentFps = Math.round((fpsFrameCount.current * 1000) / (now - fpsLastTime.current));
      setCamFps(currentFps); 
      fpsFrameCount.current = 0;
      fpsLastTime.current = now;
    }
    
    if (streamRef.current) {
      frameIdRef.current = requestAnimationFrame(requestVideoFrameCallback);
    }
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
    switchCamera,
    // Return properti flash
    flashOn,
    supportsFlash,
    toggleFlash
  };
}