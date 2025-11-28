import { useEffect, useState, useRef } from "react";
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";

export function useHandPose(videoRef, cameraOn) {
  const [handLandmarker, setHandLandmarker] = useState(null);
  const [handPresence, setHandPresence] = useState(false);
  const [landmarks, setLandmarks] = useState([]);

  // --- 0. Debounce state (disimpan di ref, bukan state UI) ---
  const handOnCountRef = useRef(0);
  const handOffCountRef = useRef(0);
  const presenceRef = useRef(false); // nilai "stabil" terakhir untuk handPresence

  // Deteksi simple: mobile vs desktop (dipakai untuk threshold)
  const isMobile =
    typeof navigator !== "undefined" &&
    /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent || "");

  // Mobile: lebih agresif (lebih cepat ON/OFF)
  const ON_THRESHOLD = isMobile ? 1 : 2;   // butuh 1–2 frame berturut-turut "ada tangan"
  const OFF_THRESHOLD = isMobile ? 2 : 3;  // butuh 2–3 frame "tidak ada tangan"

  // 1. Init MediaPipe
  useEffect(() => {
    const initMediaPipe = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
        );
        const landmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numHands: 2,
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
        setHandLandmarker(landmarker);
      } catch (error) {
        console.error("MediaPipe Init Error:", error);
      }
    };
    initMediaPipe();
  }, []);

  // 2. Loop Deteksi + Debounce
  useEffect(() => {
    let rafId;
    let lastVideoTime = -1;

    const detect = () => {
      if (cameraOn && videoRef.current && handLandmarker) {
        const video = videoRef.current;
        if (video.currentTime !== lastVideoTime && video.readyState >= 2) {
          lastVideoTime = video.currentTime;
          try {
            const result = handLandmarker.detectForVideo(
              video,
              performance.now()
            );

            const hasHand =
              result.landmarks && result.landmarks.length > 0;

            // Landmarks tetap update setiap frame (kalau ada),
            // supaya cropping ROI tetap akurat begitu handPresence sudah true.
            if (hasHand) {
              setLandmarks(result.landmarks);
            } else {
              setLandmarks([]);
            }

            // --- Debounce ON/OFF untuk handPresence ---
            if (hasHand) {
              handOnCountRef.current += 1;
              handOffCountRef.current = 0;

              if (
                !presenceRef.current &&
                handOnCountRef.current >= ON_THRESHOLD
              ) {
                presenceRef.current = true;
                setHandPresence(true);
              }
            } else {
              handOffCountRef.current += 1;
              handOnCountRef.current = 0;

              if (
                presenceRef.current &&
                handOffCountRef.current >= OFF_THRESHOLD
              ) {
                presenceRef.current = false;
                setHandPresence(false);
              }
            }
          } catch {
            // ignore error
          }
        }
      } else {
        // Kamera mati / landmarker belum siap: reset state & counter
        if (presenceRef.current) {
          presenceRef.current = false;
          setHandPresence(false);
        }
        setLandmarks([]);
        handOnCountRef.current = 0;
        handOffCountRef.current = 0;
      }
      rafId = requestAnimationFrame(detect);
    };

    if (cameraOn) detect();
    return () => cancelAnimationFrame(rafId);
  }, [cameraOn, handLandmarker, ON_THRESHOLD, OFF_THRESHOLD]);

  return { handPresence, landmarks };
}
