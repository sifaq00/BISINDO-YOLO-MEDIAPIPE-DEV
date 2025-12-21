import { useRef, useState, useEffect } from "react";

const API_BASE = import.meta.env.VITE_API_BASE;
const WS_URL = API_BASE.replace("http", "ws") + "/ws/detect";

// Deteksi apakah backend lokal atau remote (Cloudflare / internet)
const IS_LOCAL =
  API_BASE.includes("localhost") || API_BASE.includes("127.0.0.1");

// Konfigurasi berbeda untuk lokal vs remote
const TARGET_WIDTH_LOCAL = 480;
const TARGET_WIDTH_REMOTE = 320;

const JPEG_QUALITY_LOCAL = 0.6;
const JPEG_QUALITY_REMOTE = 0.4;

// Interval minimal antar frame (ms)
const MIN_INTERVAL_LOCAL = 0; // lokal: gaspol
const MIN_INTERVAL_REMOTE = 200; // remote: untuk tes responsif di HP

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

  // Info ROI terakhir yang dipakai saat mengirim frame ke server
  // { roiX, roiY, scale }
  const roiRef = useRef(null);

  // Flag untuk manajemen alert & jenis close
  const wsErrorShownRef = useRef(false);   // supaya alert tidak spam
  const manualCloseRef = useRef(false);    // menandai close yang sengaja (matikan kamera / pindah halaman)

  // === 1. Snapshot frame → DataURL (crop pakai landmarks) ===
  const captureImage = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return null;

    const targetWidth = IS_LOCAL ? TARGET_WIDTH_LOCAL : TARGET_WIDTH_REMOTE;
    const quality = IS_LOCAL ? JPEG_QUALITY_LOCAL : JPEG_QUALITY_REMOTE;

    const videoWidth = v.videoWidth;
    const videoHeight = v.videoHeight;

    // Default: full-frame
    let roiX = 0;
    let roiY = 0;
    let roiW = videoWidth;
    let roiH = videoHeight;

    // Kalau ada landmarks dari MediaPipe → hitung bounding box tangan
    if (landmarks && landmarks.length > 0) {
      // Gabungkan semua titik dari semua tangan (single-hand & two-hand)
      let minX = 1;
      let minY = 1;
      let maxX = 0;
      let maxY = 0;

      for (const hand of landmarks) {
        for (const p of hand) {
          if (p.x < minX) minX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.x > maxX) maxX = p.x;
          if (p.y > maxY) maxY = p.y;
        }
      }

      // Normalized (0–1) → pixel video
      roiX = minX * videoWidth;
      roiY = minY * videoHeight;
      roiW = (maxX - minX) * videoWidth;
      roiH = (maxY - minY) * videoHeight;

      // Tambah margin biar tangan + sedikit lengan dan konteks nggak kepotong
      const maxSide = Math.max(roiW, roiH);

      // Kalau dua tangan, kasih margin sedikit lebih besar
      const marginScale = landmarks.length > 1 ? 0.8 : 1.0; // 2 tangan: 0.8, 1 tangan: 1.0
      const margin = marginScale * maxSide;

      roiX -= margin;
      roiY -= margin;
      roiW += 2 * margin;
      roiH += 2 * margin;

      // Clamp ke dalam frame video
      if (roiX < 0) {
        roiW += roiX;
        roiX = 0;
      }
      if (roiY < 0) {
        roiH += roiY;
        roiY = 0;
      }
      if (roiX + roiW > videoWidth) {
        roiW = videoWidth - roiX;
      }
      if (roiY + roiH > videoHeight) {
        roiH = videoHeight - roiY;
      }

      // Kalau ROI terlalu kecil/aneh, fallback ke full-frame
      if (roiW < 10 || roiH < 10) {
        roiX = 0;
        roiY = 0;
        roiW = videoWidth;
        roiH = videoHeight;
      }
    }

    // Scale uniform: targetWidth = roiW * scale
    const scale = targetWidth / roiW;
    const targetHeight = roiH * scale;

    // Simpan info ROI + scale buat mapping balik bbox
    roiRef.current = { roiX, roiY, scale };

    const cvs = document.createElement("canvas");
    cvs.width = targetWidth;
    cvs.height = targetHeight;

    const ctx = cvs.getContext("2d");
    ctx.drawImage(v, roiX, roiY, roiW, roiH, 0, 0, targetWidth, targetHeight);

    return cvs.toDataURL("image/jpeg", quality);
  };

  // === 2. Setup / connect WebSocket ===
  const connectWebSocket = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      const ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        console.log("✅ [WS] connected", { IS_LOCAL, API_BASE });
        // koneksi sukses → reset flag error
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
              // Kalau sempat nyimpan ROI & scale, mapping balik ke koordinat video
              if (roi && roi.scale) {
                const { roiX, roiY, scale } = roi;

                const x1 = roiX + d.x1 / scale;
                const y1 = roiY + d.y1 / scale;
                const x2 = roiX + d.x2 / scale;
                const y2 = roiY + d.y2 / scale;

                return {
                  ...d,
                  x1,
                  y1,
                  x2,
                  y2,
                };
              }

              // Fallback: kalau entah kenapa ROI nggak ada, pakai apa adanya
              return d;
            });

            if (onDetections) onDetections(scaledDetections);

            // FPS server (frame yang bener-bener diproses)
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
          // Apapun yang terjadi, frame sebelumnya resmi selesai
          sendingRef.current = false;
        }
      };

      ws.onerror = (err) => {
        console.error("❌ [WS] error:", err);
        sendingRef.current = false;

        // Error WS (bukan close manual) → tampilkan alert sekali
        if (!wsErrorShownRef.current && !manualCloseRef.current) {
          alert(
            "Gagal terhubung ke server deteksi (WebSocket). Pastikan backend FastAPI sedang berjalan dan alamat API benar."
          );
          wsErrorShownRef.current = true;
        }
      };

      ws.onclose = () => {
        console.log("❌ [WS] disconnected");
        wsRef.current = null;
        sendingRef.current = false;

        // Kalau close-nya BUKAN karena kita sendiri (manualCloseRef = false)
        // baru tampilkan alert sekali
        if (!manualCloseRef.current && !wsErrorShownRef.current) {
          alert(
            "Koneksi ke server deteksi terputus. Pastikan backend FastAPI sedang berjalan dan koneksi jaringan stabil."
          );
          wsErrorShownRef.current = true;
        }

        // Setelah onclose, anggap close sudah diproses
        manualCloseRef.current = false;
      };

      wsRef.current = ws;
    } catch (e) {
      console.error("Failed to open WebSocket:", e);
      sendingRef.current = false;

      if (!wsErrorShownRef.current) {
        alert(
          "Gagal membuka koneksi WebSocket. Periksa kembali backend dan konfigurasi VITE_API_BASE."
        );
        wsErrorShownRef.current = true;
      }
    }
  };

  // === 3. Kirim 1 frame → tunggu respons ===
  const sendDetectWS = () => {
    const now = performance.now();

    // GATEKEEPER: sama seperti REST
    if (!cameraOn || !handPresence) return;
    if (sendingRef.current) return;
    if (now - lastSendTime.current < MIN_INTERVAL_MS) return;

    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      connectWebSocket();
      return;
    }

    const dataUrl = captureImage();
    if (!dataUrl) return;

    lastSendTime.current = now;
    sendingRef.current = true;

    try {
      wsRef.current.send(JSON.stringify({ image: dataUrl }));
    } catch (e) {
      console.error("[WS] send error:", e);
      sendingRef.current = false;
    }
  };

  // === 4. Manajemen connect / disconnect saat kamera ON/OFF ===
  useEffect(() => {
    if (cameraOn) {
      connectWebSocket();
    } else {
      // Kamera dimatikan → ini close normal (jangan alert)
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
      // Cleanup saat unmount / pindah halaman → juga close normal
      if (wsRef.current) {
        manualCloseRef.current = true;
        wsRef.current.close();
        wsRef.current = null;
      }
      sendingRef.current = false;
      roiRef.current = null;
    };
  }, [cameraOn]);

  // === 5. Loop requestAnimationFrame: kirim frame kalau kamera ON ===
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
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      setFps(0);
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [cameraOn, handPresence, landmarks]);

  return { fps };
}
