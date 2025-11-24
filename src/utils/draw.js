import { classColorFromId, LERP_SPEED_PER_SEC, TRACK_TTL_MS } from "./math";

const MAX_CANVAS_DPR = 1.5;
const FONT_SCALE = 4.0;

// --- FUNGSI BARU: GAMBAR SKELETON MEDIAPIPE ---
export function drawSkeleton(ctx, landmarks, video, isMirrored, isMobile) {
  if (!landmarks || landmarks.length === 0 || !video || !ctx) return;

  // Hitung Skala (Logic Hybrid Cover/Contain untuk menyesuaikan dengan WebcamDetection)
  const rect = ctx.canvas.getBoundingClientRect();
  const wCss = rect.width;
  const hCss = rect.height;
  const vw = video.videoWidth || 640;
  const vh = video.videoHeight || 480;
  
  // Gunakan Math.min (Contain) untuk Mobile, Math.max (Cover) untuk Desktop
  const scale = isMobile ? Math.min(wCss / vw, hCss / vh) : Math.max(wCss / vw, hCss / vh);
  
  const drawW = vw * scale;
  const drawH = vh * scale;
  const offX = (wCss - drawW) / 2;
  const offY = (hCss - drawH) / 2;

  // Definisi koneksi antar jari (pairs of landmark indices)
  const connections = [
    [0, 1], [1, 2], [2, 3], [3, 4],         // Jempol
    [0, 5], [5, 6], [6, 7], [7, 8],         // Telunjuk
    [5, 9], [9, 10], [10, 11], [11, 12],    // Tengah
    [9, 13], [13, 14], [14, 15], [15, 16],  // Manis
    [13, 17], [0, 17], [17, 18], [18, 19], [19, 20] // Kelingking
  ];

  ctx.lineWidth = 2;
  
  for (const hand of landmarks) {
    // Gambar Garis (Tulang)
    ctx.strokeStyle = "rgba(255, 255, 255, 0.9)"; 
    ctx.beginPath();
    for (const [startIdx, endIdx] of connections) {
      const start = hand[startIdx];
      const end = hand[endIdx];

      let x1 = offX + start.x * video.videoWidth * scale;
      let y1 = offY + start.y * video.videoHeight * scale;
      let x2 = offX + end.x * video.videoWidth * scale;
      let y2 = offY + end.y * video.videoHeight * scale;

      if (isMirrored) {
        x1 = wCss - x1;
        x2 = wCss - x2;
      }
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
    }
    ctx.stroke();

    // Gambar Titik (Sendi)
    ctx.fillStyle = "red";
    for (const point of hand) {
      let x = offX + point.x * video.videoWidth * scale;
      const y = offY + point.y * video.videoHeight * scale;
      if (isMirrored) x = wCss - x;
      
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, 2 * Math.PI);
      ctx.fill();
    }
  }
}

// --- FUNGSI DRAW OVERLAY (UNTUK YOLO) ---
export function drawOverlay(ctx, canvas, video, tracksRef, labels, isMirrored = false, isMobile = false, shouldClear = true) {
  if (!video || !canvas || !ctx) return;

  const rect = canvas.getBoundingClientRect();
  const wCss = rect.width;
  const hCss = rect.height;

  const dpr = Math.min(MAX_CANVAS_DPR, window.devicePixelRatio || 1);
  if (canvas.width !== Math.round(wCss * dpr) || canvas.height !== Math.round(hCss * dpr)) {
    canvas.width = Math.round(wCss * dpr);
    canvas.height = Math.round(hCss * dpr);
  }
  
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  
  // PENTING: Hanya clear jika diminta. 
  // Di WebcamDetection, kita biarkan ini true (default) karena ini dipanggil pertama kali.
  if (shouldClear) {
    ctx.clearRect(0, 0, wCss, hCss);
  }

  const vw = video.videoWidth || 640;
  const vh = video.videoHeight || 480;
  const scale = isMobile ? Math.min(wCss / vw, hCss / vh) : Math.max(wCss / vw, hCss / vh);
  const drawW = vw * scale;
  const drawH = vh * scale;
  const offX = (wCss - drawW) / 2;
  const offY = (hCss - drawH) / 2;

  // ... Logic LERP untuk Bounding Box YOLO ...
  
  const minSide = Math.min(drawW, drawH);
  const lineW = Math.max(6, Math.round(minSide / 110));
  const fontPx = Math.max(20, Math.round(lineW * FONT_SCALE));
  const padX = Math.max(10, Math.round(lineW * 2.0));
  const padY = Math.max(6, Math.round(lineW * 1.2));

  ctx.textBaseline = "top";
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;
  ctx.font = `600 ${fontPx}px Inter, Arial, sans-serif`;

  const now = performance.now();
  let tracks = tracksRef.current.filter(tr => (now - tr.lastSeen) <= TRACK_TTL_MS);
  const dt = 0.016; 
  const k = 1 - Math.exp(-LERP_SPEED_PER_SEC * dt);

  for (const tr of tracks) {
    tr.display.x += (tr.target.x - tr.display.x) * k;
    tr.display.y += (tr.target.y - tr.display.y) * k;
    tr.display.w += (tr.target.w - tr.display.w) * k;
    tr.display.h += (tr.target.h - tr.display.h) * k;

    const { x, y, w, h } = tr.display;
    let sx = offX + x * scale;
    const sy = offY + y * scale;
    const sw = w * scale;
    const sh = h * scale;

    if (isMirrored) {
      sx = wCss - sx - sw;
    }

    const color = classColorFromId(tr.classId);
    ctx.lineWidth = lineW;
    ctx.strokeStyle = color;
    ctx.strokeRect(sx, sy, sw, sh);

    const label = tr.className ?? labels[tr.classId] ?? `cls ${tr.classId}`;
    const text = `${label} (${tr.score.toFixed(2)})`;
    const tw = ctx.measureText(text).width;
    const th = fontPx + padY;

    let lx = sx - Math.floor(lineW / 2);
    let ly = sy - th - lineW;
    if (ly < offY + lineW) ly = sy + lineW;

    ctx.fillStyle = color;
    ctx.fillRect(lx, ly, tw + padX, th);
    ctx.fillStyle = "#000";
    ctx.fillText(text, lx + Math.round(padX / 2), ly + Math.round((th - fontPx) / 2));
  }
  tracksRef.current = tracks;
}