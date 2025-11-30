import React, { useEffect, useRef, useState } from 'react';
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { HandInteractionState } from '../types';

interface HandTrackerProps {
  onUpdate: (state: Partial<HandInteractionState>) => void;
}

export const HandTracker: React.FC<HandTrackerProps> = ({ onUpdate }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isReady, setIsReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cameraLabel, setCameraLabel] = useState<string>("");
  const [debugStats, setDebugStats] = useState<string>("");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [currentDeviceIndex, setCurrentDeviceIndex] = useState(0);

  const lastVideoTimeRef = useRef(-1);
  const requestRef = useRef<number>(0);
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  
  // 节流控制：降低检测频率以提升性能
  const lastDetectTimeRef = useRef(0);
  const DETECT_INTERVAL_MS = 50; // 限制为约20FPS的检测频率

  useEffect(() => {
    let mounted = true;

    const initHandLandmarker = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
        );

        if (!mounted) return;

        const handLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          numHands: 1
        });

        if (!mounted) return;

        handLandmarkerRef.current = handLandmarker;
        setIsReady(true);

        // 先请求摄像头权限，这样才能获取到设备名称
        try {
          const tempStream = await navigator.mediaDevices.getUserMedia({ video: true });
          tempStream.getTracks().forEach(track => track.stop()); // 立即停止，只是为了获取权限
        } catch (err) {
          console.warn('获取摄像头权限失败:', err);
        }

        // 现在枚举设备，可以获取到完整的设备名称
        const allDevices = await navigator.mediaDevices.enumerateDevices();
        const allVideoDevices = allDevices.filter(device => device.kind === 'videoinput');
        
        // 优先真实摄像头，但保留所有设备供切换
        const virtualCameraKeywords = ['virtual', 'obs', 'webcast', 'screen', 'capture', 'manycam', 'snap'];
        const realCameras = allVideoDevices.filter(device => {
          const label = device.label.toLowerCase();
          return !virtualCameraKeywords.some(keyword => label.includes(keyword));
        });
        
        console.log('所有摄像头:', allVideoDevices.map(d => d.label));
        console.log('真实摄像头:', realCameras.map(d => d.label));

        // 保存所有设备供用户切换
        setDevices(allVideoDevices);

        let targetCamera;
        let targetIndex = 0;
        if (realCameras.length > 0) {
          // 优先使用真实摄像头
          targetCamera = realCameras[0];
          // 找到在所有设备中的索引
          targetIndex = allVideoDevices.findIndex(d => d.deviceId === targetCamera.deviceId);
        } else if (allVideoDevices.length > 0) {
          // 如果没有真实摄像头，使用第一个可用的
          targetCamera = allVideoDevices[0];
          console.warn('未找到真实摄像头，使用:', targetCamera.label);
        }

        if (targetCamera) {
          startWebcam(targetCamera.deviceId);
          setCurrentDeviceIndex(targetIndex);
        } else {
          setErrorMessage("No cameras found");
        }

      } catch (e: any) {
        console.error("Error initializing hand tracker:", e);
        setErrorMessage(`AI Init Failed: ${e.message || e}`);
      }
    };

    initHandLandmarker();

    // Watchdog to ensure loop is running
    const watchdogInterval = setInterval(() => {
      if (isReady && videoRef.current && !videoRef.current.paused) {
        // If loop seems stuck (time hasn't updated in 1s), kick it
        const now = performance.now();
        // We can't easily check the internal loop timestamp, but we can check if debugStats is empty
        // or we can just blindly call requestAnimationFrame if we suspect it died.
        // Safer: just call predictWebcam. It has checks.
        // But we need to be careful not to spawn double loops.
        // Let's just update the debug text if it looks dead.
        if (videoRef.current.readyState >= 2) {
          // Force a frame
          predictWebcam();
        }
      }
    }, 2000);

    return () => {
      mounted = false;
      clearInterval(watchdogInterval);
      if (handLandmarkerRef.current) {
        handLandmarkerRef.current.close();
      }
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
      // Stop camera tracks
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [isReady]); // Re-run watchdog if isReady changes

  const startWebcam = async (deviceId?: string) => {
    // Stop existing tracks
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
    }

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        // Cancel any existing loop to prevent duplicates
        if (requestRef.current) {
          cancelAnimationFrame(requestRef.current);
        }

        const constraints: MediaStreamConstraints = {
          video: {
            width: 320,
            height: 240,
            // Use deviceId if provided, otherwise default to user facing
            ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'user' })
          }
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);

        // Get track label
        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
          setCameraLabel(videoTrack.label);
        }

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          // Explicit play and error handling
          try {
            await videoRef.current.play();
            setErrorMessage(null); // Clear errors on success
          } catch (playErr: any) {
            console.error("Video play error:", playErr);
            setErrorMessage(`Play Error: ${playErr.message || playErr}`);
          }

          // Remove old listener to avoid duplicates
          videoRef.current.removeEventListener("loadeddata", predictWebcam);
          videoRef.current.addEventListener("loadeddata", predictWebcam);

          // Kickstart if already ready
          if (videoRef.current.readyState >= 2) {
            predictWebcam();
          }
        }
      } catch (err: any) {
        console.error("Webcam permission denied or error:", err);
        setErrorMessage(`Camera Error: ${err.message || err}`);
      }
    } else {
      setErrorMessage("Camera API not supported");
    }
  };

  const switchCamera = () => {
    if (devices.length <= 1) return;

    const nextIndex = (currentDeviceIndex + 1) % devices.length;
    setCurrentDeviceIndex(nextIndex);
    startWebcam(devices[nextIndex].deviceId);
  };

  const drawLandmarks = (ctx: CanvasRenderingContext2D, landmarks: any[]) => {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    // Connections
    const connections = [
      [0, 1], [1, 2], [2, 3], [3, 4], // Thumb
      [0, 5], [5, 6], [6, 7], [7, 8], // Index
      [0, 9], [9, 10], [10, 11], [11, 12], // Middle
      [0, 13], [13, 14], [14, 15], [15, 16], // Ring
      [0, 17], [17, 18], [18, 19], [19, 20] // Pinky
    ];

    ctx.lineWidth = 2;
    ctx.strokeStyle = '#00ff00'; // Green lines

    connections.forEach(([start, end]) => {
      const p1 = landmarks[start];
      const p2 = landmarks[end];
      ctx.beginPath();
      ctx.moveTo(p1.x * ctx.canvas.width, p1.y * ctx.canvas.height);
      ctx.lineTo(p2.x * ctx.canvas.width, p2.y * ctx.canvas.height);
      ctx.stroke();
    });

    // Points
    ctx.fillStyle = '#ff0000'; // Red dots
    landmarks.forEach(lm => {
      ctx.beginPath();
      ctx.arc(lm.x * ctx.canvas.width, lm.y * ctx.canvas.height, 3, 0, 2 * Math.PI);
      ctx.fill();
    });
  };

  const predictWebcam = async () => {
    if (!handLandmarkerRef.current || !videoRef.current) return;

    // Check if video is valid
    if (videoRef.current.videoWidth === 0 || videoRef.current.videoHeight === 0) {
      requestRef.current = requestAnimationFrame(predictWebcam);
      return;
    }

    const currentTime = performance.now();
    
    // 节流：限制检测频率
    if (currentTime - lastDetectTimeRef.current < DETECT_INTERVAL_MS) {
      requestRef.current = requestAnimationFrame(predictWebcam);
      return;
    }
    lastDetectTimeRef.current = currentTime;

    try {
      const startTimeMs = currentTime;
      const results = handLandmarkerRef.current.detectForVideo(videoRef.current, startTimeMs);

      // Update debug stats with hand count
      const handCount = results.landmarks ? results.landmarks.length : 0;
      setDebugStats(
        `Hands: ${handCount}\n` +
        `Res: ${videoRef.current.videoWidth}x${videoRef.current.videoHeight}\n` +
        `State: ${videoRef.current.readyState}\n` +
        `T: ${startTimeMs.toFixed(0)}`
      );

      if (results.landmarks && results.landmarks.length > 0) {
        const landmarks = results.landmarks[0];

        // Draw landmarks
        if (canvasRef.current) {
          const ctx = canvasRef.current.getContext('2d');
          if (ctx) {
            // Match canvas size to video size
            if (canvasRef.current.width !== videoRef.current.videoWidth ||
              canvasRef.current.height !== videoRef.current.videoHeight) {
              canvasRef.current.width = videoRef.current.videoWidth;
              canvasRef.current.height = videoRef.current.videoHeight;
            }
            drawLandmarks(ctx, landmarks);
          }
        }

        // --- 1. Gesture Recognition ---
        let extensionSum = 0;
        const fingers = [8, 12, 16, 20]; // Index, Middle, Ring, Pinky
        const wrist = landmarks[0];

        const dist = (p1: any, p2: any) => Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2) + Math.pow(p1.z - p2.z, 2));

        fingers.forEach(tipIdx => {
          const tip = landmarks[tipIdx];
          const mcp = landmarks[tipIdx - 3];
          const dTip = dist(tip, wrist);
          const dMcp = dist(mcp, wrist);

          if (dTip > dMcp * 1.5) extensionSum += 1;
        });

        const isFist = extensionSum <= 1;
        const isOpen = extensionSum >= 3;

        let gesture: 'FIST' | 'OPEN' | 'NONE' = 'NONE';
        if (isFist) gesture = 'FIST';
        else if (isOpen) gesture = 'OPEN';

        // --- 2. Distance Estimation ---
        let minX = 1, maxX = 0, minY = 1, maxY = 0;
        let sumX = 0, sumY = 0;

        landmarks.forEach(lm => {
          if (lm.x < minX) minX = lm.x;
          if (lm.x > maxX) maxX = lm.x;
          if (lm.y < minY) minY = lm.y;
          if (lm.y > maxY) maxY = lm.y;
          sumX += lm.x;
          sumY += lm.y;
        });

        const width = maxX - minX;
        const height = maxY - minY;
        const area = width * height;
        const handDistance = Math.min(Math.max((area - 0.05) / 0.25, 0), 1);

        // --- 3. Position Estimation (Centroid) ---
        // MediaPipe X is 0 (left of image) to 1 (right of image)
        // Since we are likely mirroring the video element with CSS, the user sees themselves mirrored.
        // A user moving their hand to the RIGHT of the screen means they are moving towards x=1 on the screen.
        // But physically, for the camera (front facing), moving "right" in the mirrored reflection means the object moved to the camera's LEFT.
        // MediaPipe coordinates are based on the source image.
        // Source Image: User moves physical right -> Camera sees movement to Left (x -> 0).
        // Mirrored Video CSS: Flips x.
        // We want the interaction to match the mirrored video.
        // If user sees hand on Right (Screen X=1), we want Screen X=1.
        // Source X=0 corresponds to Screen X=1.
        // So ScreenX = 1 - SourceX.

        const avgX = sumX / landmarks.length;
        const avgY = sumY / landmarks.length;

        onUpdate({
          isActive: true,
          gesture,
          handDistance,
          handPosition: { x: 1 - avgX, y: avgY }
        });
      } else {
        onUpdate({ isActive: false });
        // Clear canvas if no hands
        if (canvasRef.current) {
          const ctx = canvasRef.current.getContext('2d');
          if (ctx) ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        }
      }
    } catch (e) {
      console.error("Prediction error:", e);
      // Don't set error message here to avoid spamming UI, but log it
    }

    requestRef.current = requestAnimationFrame(predictWebcam);
  };

  return (
    <div className="absolute bottom-6 right-6 z-50 flex flex-col items-end gap-2">
      {/* Camera Switch Button */}
      {devices.length > 0 && (
        <button
          onClick={switchCamera}
          className="px-3 py-1 bg-cyan-600/80 hover:bg-cyan-500 text-white text-xs font-mono rounded shadow backdrop-blur transition-colors"
        >
          切换摄像头 ({currentDeviceIndex + 1}/{devices.length})
        </button>
      )}

      <div className="relative overflow-hidden rounded-lg border border-white/20 shadow-lg bg-black/50 backdrop-blur">
        <video
          ref={videoRef}
          className="w-48 h-36 object-cover transform -scale-x-100 opacity-80 border-2 border-red-500"
          autoPlay
          playsInline
          muted
        />
        <canvas
          ref={canvasRef}
          className="absolute top-0 left-0 w-full h-full object-cover transform -scale-x-100 pointer-events-none"
        />
        <div className="absolute top-1 left-2 flex flex-col gap-1 pointer-events-none">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isReady ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`}></div>
            <span className="text-xs text-white/90 font-mono font-bold">AI VISION</span>
          </div>
          {cameraLabel && (
            <span className="text-xs text-white/80 font-mono max-w-[180px] truncate bg-black/40 px-1">
              {cameraLabel}
            </span>
          )}
          {errorMessage && (
            <span className="text-xs text-red-400 font-mono bg-black/90 px-1 rounded border border-red-500/50">
              {errorMessage}
            </span>
          )}
          <pre className="text-xs text-cyan-300 font-mono bg-black/60 p-1 rounded">
            {debugStats || "Waiting for loop..."}
          </pre>
          {!isReady && !errorMessage && (
            <span className="text-xs text-yellow-400 font-mono animate-pulse">Initializing...</span>
          )}
        </div>
      </div>
    </div>
  );
};