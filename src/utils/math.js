// src/utils/math.js

// --- KONFIGURASI TRACKING ---

// Ambang batas tumpang tindih (0.3 artinya nempel 30% dianggap objek sama)
export const MATCH_IOU = 0.3;        

// Waktu hidup track jika objek hilang (DITURUNKAN dari 400 ke 200)
// Agar deteksi "hantu" cepat hilang saat tangan bergerak cepat
export const TRACK_TTL_MS = 1000;     

// Kecepatan animasi kotak mengejar tangan (DITURUNKAN dari 8 ke 5)
// Agar pergerakan terlihat lebih halus (cinematic) dan tidak gemetar
export const LERP_SPEED_PER_SEC = 5; 

// Batas minimal akurasi (BARU)
// Deteksi di bawah 60% dianggap sampah/noise dan dibuang
const MIN_SCORE = 0.60; 

// --- HELPER FUNCTIONS ---

export function classColorFromId(id) {
  // Menghasilkan warna unik berdasarkan ID kelas agar stabil
  const h = (Math.abs(id) * 137.508) % 360;
  return `hsl(${h}deg 90% 55%)`;
}

export function iou(a, b) {
  // Menghitung Intersection over Union (Seberapa nempel kotak A dan B)
  // a,b dalam format {x,y,w,h}
  const ax2 = a.x + a.w, ay2 = a.y + a.h;
  const bx2 = b.x + b.w, by2 = b.y + b.h;
  
  const ix = Math.max(0, Math.min(ax2, bx2) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(ay2, by2) - Math.max(a.y, b.y));
  
  const inter = ix * iy;
  const ua = a.w * a.h + b.w * b.h - inter;
  
  return ua <= 0 ? 0 : inter / ua;
}

// --- LOGIKA UTAMA TRACKING ---

export function matchDetectionsToTracks(currentTracks, newDetections, nextIdRef) {
  const now = performance.now();
  const tracks = [...currentTracks];

  // 1. Reset flag matched pada semua track lama
  tracks.forEach(tr => tr._matched = false);

  // 2. Format & FILTER deteksi baru
  //    Disini kita membuang deteksi yang score-nya jelek (< 0.60)
  const detBoxes = newDetections
    .filter(d => (d.score ?? 0) > MIN_SCORE) // <--- FILTER PENTING
    .map(d => ({
      x: d.x1, 
      y: d.y1, 
      w: d.x2 - d.x1, 
      h: d.y2 - d.y1,
      score: d.score ?? 0,
      classId: Math.round(d.classId ?? -1),
      className: d.className
    }));

  // 3. Greedy Matching (Mencocokkan deteksi baru ke track lama)
  for (const db of detBoxes) {
    let best = null;
    let bestIoU = 0;
    
    // Cari track lama yang paling cocok posisinya (IoU tertinggi)
    for (const tr of tracks) {
      // Jangan cocokkan jika sudah punya pasangan, atau beda kelas
      if (tr._matched || tr.classId !== db.classId) continue;
      
      const val = iou(tr.target, db);
      if (val > bestIoU) { 
        bestIoU = val; 
        best = tr; 
      }
    }

    // Jika ketemu pasangan yang pas
    if (best && bestIoU >= MATCH_IOU) {
      // Update target track tersebut ke posisi baru
      best.target = { x: db.x, y: db.y, w: db.w, h: db.h };
      
      // Update score dengan rata-rata (biar score gak lompat-lompat)
      best.score = best.score * 0.7 + db.score * 0.3; 
      
      best.lastSeen = now;
      best._matched = true;
    } else {
      // Jika tidak ketemu pasangan, buat TRACK BARU
      tracks.push({
        id: nextIdRef.current++,
        classId: db.classId,
        className: db.className,
        score: db.score,
        lastSeen: now,
        // Posisi awal langsung di tempat deteksi (belum ada animasi)
        display: { ...db }, 
        target: { ...db },
        _matched: true
      });
    }
  }

  // 4. Hapus track yang sudah kadaluwarsa (TTL)
  //    Track yang tidak di-update selama 200ms akan dihapus
  return tracks.filter(tr => (now - tr.lastSeen) <= TRACK_TTL_MS);
}