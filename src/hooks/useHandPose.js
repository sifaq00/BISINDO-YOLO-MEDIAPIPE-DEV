import { useEffect, useState } from "react"; // HAPUS useRef
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";

export function useHandPose(videoRef, cameraOn) {
  const [handLandmarker, setHandLandmarker] = useState(null);
  const [handPresence, setHandPresence] = useState(false);
  const [landmarks, setLandmarks] = useState([]);

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
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          numHands: 2,
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5
        });
        setHandLandmarker(landmarker);
      } catch (error) {
        console.error("MediaPipe Init Error:", error);
      }
    };
    initMediaPipe();
  }, []);

  // 2. Loop Deteksi
  useEffect(() => {
    let rafId;
    let lastVideoTime = -1;

    const detect = () => {
      if (cameraOn && videoRef.current && handLandmarker) {
        const video = videoRef.current;
        if (video.currentTime !== lastVideoTime && video.readyState >= 2) {
          lastVideoTime = video.currentTime;
          try {
            const result = handLandmarker.detectForVideo(video, performance.now());
            
            // Cek apakah ada landmarks
            if (result.landmarks && result.landmarks.length > 0) {
              setHandPresence(true);
              setLandmarks(result.landmarks);
            } else {
              setHandPresence(false);
              setLandmarks([]);
            }
          // PERBAIKAN: Hapus '(e)' jika tidak dipakai, cukup 'catch' saja
          } catch { 
            /* ignore */ 
          }
        }
      } else {
        setHandPresence(false);
        setLandmarks([]);
      }
      rafId = requestAnimationFrame(detect);
    };

    if (cameraOn) detect();
    return () => cancelAnimationFrame(rafId);
  }, [cameraOn, handLandmarker]);

  return { handPresence, landmarks };
}