import { useRef, useState, useEffect } from "react";

const API_BASE = import.meta.env.VITE_API_BASE;
// ✅ UBAH dari HTTP ke WebSocket
const WS_URL = API_BASE. replace("http", "ws") + "/ws/detect";

// --- PENGATURAN KECEPATAN (LIMIT) ---
const MIN_INTERVAL_MS = 0; 

export function useDetection(videoRef, cameraOn, onDetections, handPresence) {
  const [fps, setFps] = useState(0);
  
  const wsRef = useRef(null); // ✅ Reference ke WebSocket
  const sendingRef = useRef(false);
  const lastSendTime = useRef(0); 
  const fpsCount = useRef(0);
  const fpsLastT = useRef(performance.now());
  const animationFrameRef = useRef(null);

  // Simpan rasio resize untuk upscale bbox
  const resizeScaleRef = useRef(1); 

  // ✅ FUNGSI BARU: Convert canvas ke JPEG binary (bukan base64!)
  const captureImageAsJpeg = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return null;

    const targetWidth = 480; 
    const scale = targetWidth / v.videoWidth;
    resizeScaleRef.current = scale;

    const targetHeight = v.videoHeight * scale;

    const cvs = document.createElement("canvas");
    cvs.width = targetWidth;
    cvs.height = targetHeight;
    
    cvs.getContext("2d"). drawImage(v, 0, 0, targetWidth, targetHeight);
    
    // ✅ Return sebagai Blob JPEG (bukan data URL string)
    return new Promise((resolve) => {
      cvs.toBlob(resolve, "image/jpeg", 0.8); // Quality 0.8 = good balance
    });
  };

  // ✅ FUNGSI BARU: Connect ke WebSocket
  const connectWebSocket = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      return; // Sudah connect
    }

    try {
      wsRef.current = new WebSocket(WS_URL);
      wsRef.current.binaryType = "arraybuffer"; // Receive binary data
      
      wsRef.current.onopen = () => {
        console.log("✅ WebSocket connected to backend");
      };

      wsRef.current.onmessage = (event) => {
        try {
          // Backend mengirim JSON dengan detections
          const data = JSON.parse(event.data);
          
          if (data.detections) {
            // Upscale coordinates ke ukuran asli video
            const scale = resizeScaleRef.current;
            const scaledDetections = data.detections.map(d => ({
              ...d,
              x1: d.x1 / scale,
              y1: d. y1 / scale,
              x2: d.x2 / scale,
              y2: d.y2 / scale
            }));

            if (onDetections) onDetections(scaledDetections);

            // Update FPS counter
            fpsCount.current++;
            const now = performance.now();
            if (now - fpsLastT.current >= 1000) {
              setFps(fpsCount.current);
              fpsCount.current = 0;
              fpsLastT.current = now;
            }
          }
        } catch (e) {
          console.error("WebSocket message parse error:", e);
        }
      };

      wsRef.current.onerror = (error) => {
        console.error("❌ WebSocket error:", error);
      };

      wsRef.current. onclose = () => {
        console.log("❌ WebSocket disconnected");
        wsRef.current = null;
      };
    } catch (e) {
      console.error("Failed to connect WebSocket:", e);
    }
  };

  // ✅ FUNGSI BARU: Kirim frame via WebSocket
  const sendDetectViaWebSocket = async () => {
    const now = performance.now();

    // Gatekeeper checks
    if (! cameraOn || sendingRef.current || !handPresence) {
      return; 
    }

    if (now - lastSendTime. current < MIN_INTERVAL_MS) {
      return; 
    }

    // Pastikan WebSocket connected
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.warn("⚠️ WebSocket not connected, attempting reconnect...");
      connectWebSocket();
      return;
    }
    
    sendingRef.current = true;
    lastSendTime.current = now;

    try {
      // ✅ Capture frame sebagai JPEG binary
      const jpegBlob = await captureImageAsJpeg();
      if (!jpegBlob) {
        sendingRef.current = false;
        return;
      }

      // ✅ Kirim binary ke WebSocket (bukan base64!)
      wsRef.current.send(jpegBlob);

    } catch (e) {
      console.error("Send error:", e);
    } finally {
      sendingRef.current = false;
    }
  };

  // ✅ Connect WebSocket saat kamera nyala
  useEffect(() => {
    if (cameraOn) {
      connectWebSocket();
    } else {
      // Disconnect saat kamera mati
      if (wsRef. current) {
        wsRef. current.close();
        wsRef.current = null;
      }
      setFps(0);
    }

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [cameraOn]);

  // Loop untuk mengirim frame
  useEffect(() => {
    const loop = () => {
      if (cameraOn) {
        sendDetectViaWebSocket();
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
  }, [cameraOn, handPresence]);

  return { fps };
}