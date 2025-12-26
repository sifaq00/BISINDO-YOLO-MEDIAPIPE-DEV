import { useRef, useState, useEffect } from "react";

const API_BASE = import.meta.env.VITE_API_BASE;
// Pastikan URL Websocket terbentuk dengan benar (http -> ws, https -> wss)
const WS_URL = API_BASE.replace(/^http/, "ws") + "/ws/detect";

// Deteksi apakah backend lokal atau remote
const IS_LOCAL =
  API_BASE.includes("localhost") || API_BASE.includes("127.0.0.1");

const TARGET_WIDTH_LOCAL = 480;
const TARGET_WIDTH_REMOTE = 320; // Resolusi kecil agar enteng di jaringan

const JPEG_QUALITY_LOCAL = 0.6;
const JPEG_QUALITY_REMOTE = 0.4; // Kualitas rendah agar paket data kecil

const MIN_INTERVAL_LOCAL = 0;
const MIN_INTERVAL_REMOTE = 200; // Batas 5 FPS agar backend CPU tidak meledak

const MIN_INTERVAL_MS = IS_LOCAL ? MIN_INTERVAL_LOCAL : MIN_INTERVAL_REMOTE;

export function useDetection(
  videoRef,
  cameraOn,
  onDetections,
  handPresence,
  landmarks
) {
  const [fps, setFps] = useState(0);

  const wsRef = useRef(null);
  const sendingRef = useRef(false);
  const lastSendTime = useRef(0);

  const fpsCount = useRef(0);
  const fpsLastT = useRef(performance.now());
  const animationFrameRef = useRef(null);

  // Simpan landmarks di ref agar tidak memicu re-render effect loop
  const landmarksRef = useRef(landmarks);
  useEffect(() => {
    landmarksRef.current = landmarks;
  }, [landmarks]);

  const roiRef = useRef(null);
  const wsErrorShownRef = useRef(false);
  const manualCloseRef = useRef(false);

  // === 1. Snapshot frame ===
  const captureImage = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return null;

    // Gunakan landmarks dari Ref yang paling update
    const currentLandmarks = landmarksRef.current;

    const targetWidth = IS_LOCAL ? TARGET_WIDTH_LOCAL : TARGET_WIDTH_REMOTE;
    const quality = IS_LOCAL ? JPEG_QUALITY_LOCAL : JPEG_QUALITY_REMOTE;

    const videoWidth = v.videoWidth;
    const videoHeight = v.videoHeight;

    let roiX = 0;
    let roiY = 0;
    let roiW = videoWidth;
    let roiH = videoHeight;

    if (currentLandmarks && currentLandmarks.length > 0) {
      let minX = 1, minY = 1, maxX = 0, maxY = 0;

      for (const hand of currentLandmarks) {
        for (const p of hand) {
          if (p.x < minX) minX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.x > maxX) maxX = p.x;
          if (p.y > maxY) maxY = p.y;
        }
      }

      roiX = minX * videoWidth;
      roiY = minY * videoHeight;
      roiW = (maxX - minX) * videoWidth;
      roiH = (maxY - minY) * videoHeight;

      const maxSide = Math.max(roiW, roiH);
      const marginScale = currentLandmarks.length > 1 ? 0.8 : 1.0;
      const margin = marginScale * maxSide;

      roiX -= margin;
      roiY -= margin;
      roiW += 2 * margin;
      roiH += 2 * margin;

      if (roiX < 0) { roiW += roiX; roiX = 0; }
      if (roiY < 0) { roiH += roiY; roiY = 0; }
      if (roiX + roiW > videoWidth) roiW = videoWidth - roiX;
      if (roiY + roiH > videoHeight) roiH = videoHeight - roiY;

      if (roiW < 10 || roiH < 10) {
        roiX = 0; roiY = 0; roiW = videoWidth; roiH = videoHeight;
      }
    }

    const scale = targetWidth / roiW;
    const targetHeight = roiH * scale;

    roiRef.current = { roiX, roiY, scale };

    const cvs = document.createElement("canvas");
    cvs.width = targetWidth;
    cvs.height = targetHeight;

    const ctx = cvs.getContext("2d");
    ctx.drawImage(v, roiX, roiY, roiW, roiH, 0, 0, targetWidth, targetHeight);

    return cvs.toDataURL("image/jpeg", quality);
  };

  // === 2. Setup WebSocket ===
  const connectWebSocket = () => {
    // FIX: Cek juga state CONNECTING (0) agar tidak spam bikin koneksi baru
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      const ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        console.log("✅ [WS] connected", { IS_LOCAL, API_BASE });
        wsErrorShownRef.current = false;
        manualCloseRef.current = false;
      };

      ws.onmessage = (event) => {
        try {
          const raw = JSON.parse(event.data);
          if (Array.isArray(raw)) {
            const now = performance.now();
            const roi = roiRef.current;

            const scaledDetections = raw.map((d) => {
              if (roi && roi.scale) {
                return {
                  ...d,
                  x1: roi.roiX + d.x1 / roi.scale,
                  y1: roi.roiY + d.y1 / roi.scale,
                  x2: roi.roiX + d.x2 / roi.scale,
                  y2: roi.roiY + d.y2 / roi.scale,
                };
              }
              return d;
            });

            if (onDetections) onDetections(scaledDetections);

            fpsCount.current++;
            if (now - fpsLastT.current >= 1000) {
              setFps(fpsCount.current);
              fpsCount.current = 0;
              fpsLastT.current = now;
            }
          } else if (raw && raw.error) {
            console.warn("WS detect error:", raw.error);
          }
        } catch (e) {
          console.error("[WS] parse error:", e);
        } finally {
          sendingRef.current = false; // Reset flag agar bisa kirim lagi
        }
      };

      ws.onerror = (err) => {
        console.error("❌ [WS] error:", err);
        sendingRef.current = false;
        if (!wsErrorShownRef.current && !manualCloseRef.current) {
          // Jangan alert jika errornya karena buffer penuh (insufficient resources)
          // alert("Gagal terhubung ke server..."); // Optional: disable alert biar gak ganggu
          wsErrorShownRef.current = true;
        }
      };

      ws.onclose = () => {
        console.log("❌ [WS] disconnected");
        wsRef.current = null;
        sendingRef.current = false;
        
        if (!manualCloseRef.current && !wsErrorShownRef.current) {
           // Silent retry is better for production
           // wsErrorShownRef.current = true; 
        }
        manualCloseRef.current = false;
      };

      wsRef.current = ws;
    } catch (e) {
      console.error("Failed to open WebSocket:", e);
      sendingRef.current = false;
    }
  };

  // === 3. Kirim Frame ===
  const sendDetectWS = () => {
    // Stop jika user mematikan kamera atau tidak ada tangan (hemat bandwidth)
    if (!cameraOn || !handPresence) return;
    
    // Stop jika sedang menunggu balasan dari backend (Stop-and-Wait)
    if (sendingRef.current) return;

    const now = performance.now();
    // Stop jika terlalu cepat (Throttling)
    if (now - lastSendTime.current < MIN_INTERVAL_MS) return;

    // Cek koneksi
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      connectWebSocket(); // Coba reconnect
      return;
    }

    const dataUrl = captureImage();
    if (!dataUrl) return;

    lastSendTime.current = now;
    sendingRef.current = true; // Kunci sampai ada balasan

    try {
      wsRef.current.send(JSON.stringify({ image: dataUrl }));
    } catch (e) {
      console.error("[WS] send error:", e);
      sendingRef.current = false;
    }
  };

  // === 4. Manajemen Koneksi ===
  useEffect(() => {
    if (cameraOn) {
      connectWebSocket();
    } else {
      if (wsRef.current) {
        manualCloseRef.current = true;
        wsRef.current.close();
        wsRef.current = null;
      }
      sendingRef.current = false;
      roiRef.current = null;
      setFps(0);
    }

    return () => {
      if (wsRef.current) {
        manualCloseRef.current = true;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [cameraOn]);

  // === 5. Loop Utama (Fixed) ===
  useEffect(() => {
    const loop = () => {
      if (cameraOn) {
        sendDetectWS();
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
    // HAPUS landmarks & handPresence dari dependency array!
    // Kita pakai landmarksRef dan handPresence diproses di dalam captureImage/sendDetectWS
  }, [cameraOn, handPresence]); // handPresence masih oke disini untuk start/stop logic, tapi landmarks jangan.

  return { fps };
}