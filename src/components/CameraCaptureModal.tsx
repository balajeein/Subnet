import React, { useState, useEffect, useRef } from 'react';
import {
  Camera,
  Video,
  Square,
  RefreshCw,
  Send,
  X,
  AlertTriangle,
} from 'lucide-react';

interface CameraCaptureModalProps {
  initialMode?: 'photo' | 'video';
  mode?: 'photo' | 'video';
  onClose: () => void;
  onSendMedia: (media: {
    fileName: string;
    mimeType: string;
    base64Data: string;
  }) => void;
}

export default function CameraCaptureModal({
  initialMode,
  mode: propMode,
  onClose,
  onSendMedia,
}: CameraCaptureModalProps): React.JSX.Element {
  // Mode state: allows user to freely toggle between Photo and Video inside the camera modal
  const [currentMode, setCurrentMode] = useState<'photo' | 'video'>(
    initialMode || propMode || 'photo'
  );

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);

  // Photo capture state
  const [capturedPhotoUrl, setCapturedPhotoUrl] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);

  // Video recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordedVideoUrl, setRecordedVideoUrl] = useState<string | null>(null);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);

  const [isSendingMedia, setIsSendingMedia] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const recordedVideoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Helper to convert Blob to Base64 in renderer without needing Node Buffer
  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        const commaIdx = dataUrl.indexOf(',');
        if (commaIdx >= 0) {
          resolve(dataUrl.slice(commaIdx + 1));
        } else {
          resolve(dataUrl);
        }
      };
      reader.onerror = () => reject(new Error('Failed to read media blob'));
      reader.readAsDataURL(blob);
    });
  };

  // Safely stop all camera & microphone tracks
  const stopTracks = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
    }
    if (stream) {
      stream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      setStream(null);
    }
    if (videoRef.current && videoRef.current.srcObject) {
      const activeStream = videoRef.current.srcObject as MediaStream;
      activeStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      videoRef.current.srcObject = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  // 1. Initialize camera & microphone stream based on currentMode
  useEffect(() => {
    let isCancelled = false;

    async function initCamera() {
      setIsInitializing(true);
      setPermissionError(null);

      // Check / request native macOS permissions via Electron IPC first
      if (window.subnet?.requestMediaPermissions) {
        try {
          const toRequest: Array<'camera' | 'microphone'> =
            currentMode === 'video' ? ['camera', 'microphone'] : ['camera'];
          const permRes = await window.subnet.requestMediaPermissions(toRequest);
          if (permRes && permRes.results && permRes.results.camera === false) {
            if (!isCancelled) {
              setPermissionError(
                'Camera permission is required. Please grant access in macOS System Settings > Privacy & Security > Camera.'
              );
              setIsInitializing(false);
            }
            return;
          }
        } catch (err) {
          console.warn('[Subnet:Camera] Native media permission request error:', err);
        }
      }

      try {
        let mediaStream: MediaStream;
        try {
          mediaStream = await navigator.mediaDevices.getUserMedia({
            video: {
              width: { ideal: 1280 },
              height: { ideal: 720 },
              facingMode: 'user',
            },
            audio: currentMode === 'video',
          });
        } catch (mediaErr: any) {
          // If video mode failed because of microphone (denied or no mic), retry video-only
          if (currentMode === 'video') {
            console.warn('[Subnet:Camera] Microphone capture failed, falling back to video-only stream:', mediaErr);
            mediaStream = await navigator.mediaDevices.getUserMedia({
              video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: 'user',
              },
              audio: false,
            });
          } else {
            throw mediaErr;
          }
        }

        if (isCancelled) {
          mediaStream.getTracks().forEach((t) => t.stop());
          return;
        }

        setStream(mediaStream);
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          // Explicitly play to prevent black paused frames
          videoRef.current.play().catch((playErr) => {
            console.warn('[Subnet:Camera] Video play error:', playErr);
          });
        }
        setIsInitializing(false);
      } catch (err: any) {
        if (!isCancelled) {
          console.error('[Subnet:Camera] Camera access error:', err);
          setIsInitializing(false);
          if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            setPermissionError(
              'Camera access was denied. Please allow camera access in macOS System Settings > Privacy & Security > Camera.'
            );
          } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
            setPermissionError('No camera found on this device.');
          } else {
            setPermissionError(err.message || 'Unable to access camera.');
          }
        }
      }
    }

    initCamera();

    return () => {
      isCancelled = true;
      stopTracks();
    };
  }, [currentMode]);

  // Blob URLs can be created before the preview element has mounted. Reload and
  // start playback once the recorded video has metadata available.
  useEffect(() => {
    const video = recordedVideoRef.current;
    if (!recordedVideoUrl || !video) return;

    const playPreview = () => {
      video.currentTime = 0;
      video.play().catch(() => {
        // Native controls remain available when autoplay is blocked.
      });
    };

    video.addEventListener('loadedmetadata', playPreview, { once: true });
    video.load();
    return () => video.removeEventListener('loadedmetadata', playPreview);
  }, [recordedVideoUrl]);

  // Handle escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleClose = () => {
    stopTracks();
    if (recordedVideoUrl) URL.revokeObjectURL(recordedVideoUrl);
    onClose();
  };

  // Switch between Photo and Video modes
  const handleSwitchMode = (newMode: 'photo' | 'video') => {
    if (newMode === currentMode || isRecording || isSendingMedia) return;
    // Clear any active previews when switching modes
    if (capturedPhotoUrl) {
      setCapturedPhotoUrl(null);
      setCapturedBlob(null);
    }
    if (recordedVideoUrl) {
      URL.revokeObjectURL(recordedVideoUrl);
      setRecordedVideoUrl(null);
      setRecordedBlob(null);
    }
    setCurrentMode(newMode);
  };

  // --- Photo capture ---
  const handleCapturePhoto = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;

    // Guard against unrendered/black video frames:
    // Ensure video is playing and readyState has sufficient data
    if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
      setPermissionError('Camera is still initializing. Please wait a moment and try again.');
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      setPermissionError('Failed to capture frame from camera.');
      return;
    }

    // Render exact current video frame onto canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    let dataUrl: string;
    try {
      dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    } catch (err: any) {
      setPermissionError('Failed to encode captured image.');
      return;
    }

    // Validate that dataUrl contains actual image data and not an empty/black frame
    if (!dataUrl || dataUrl.length < 200) {
      setPermissionError('Captured frame was empty. Please check your camera.');
      return;
    }

    // Create a Blob from the verified dataUrl
    try {
      const byteString = atob(dataUrl.split(',')[1]);
      const mimeString = dataUrl.split(',')[0].split(':')[1].split(';')[0];
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
      }
      const blob = new Blob([ab], { type: mimeString });

      // Using dataUrl directly for preview guarantees it renders the captured frame
      // without risk of premature object URL revocation or blank canvas artifacts
      setCapturedPhotoUrl(dataUrl);
      setCapturedBlob(blob);
    } catch (err: any) {
      console.error('[Subnet:Camera] Error creating Blob from photo:', err);
      setPermissionError('Failed to process captured photo.');
    }
  };

  const handleRetakePhoto = () => {
    setCapturedPhotoUrl(null);
    setCapturedBlob(null);
  };

  // --- Video recording ---
  const handleStartRecording = () => {
    if (!stream) return;
    recordedChunksRef.current = [];

    const options: MediaRecorderOptions = {};
    if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')) {
      options.mimeType = 'video/webm;codecs=vp8,opus';
    } else if (MediaRecorder.isTypeSupported('video/webm')) {
      options.mimeType = 'video/webm';
    } else if (MediaRecorder.isTypeSupported('video/mp4')) {
      options.mimeType = 'video/mp4';
    }

    try {
      const recorder = new MediaRecorder(stream, options);
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const mimeType = recorder.mimeType || options.mimeType || 'video/webm';
        const blob = new Blob(recordedChunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(blob);
        setRecordedVideoUrl(url);
        setRecordedBlob(blob);
      };

      recorder.start(250); // collect 250ms chunks
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingSeconds(0);

      timerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('[Subnet:Camera] Failed to start MediaRecorder:', err);
      setPermissionError('Failed to start video recording. Your browser might not support this video codec.');
    }
  };

  const handleStopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const handleRetakeVideo = () => {
    if (recordedVideoUrl) {
      URL.revokeObjectURL(recordedVideoUrl);
    }
    setRecordedVideoUrl(null);
    setRecordedBlob(null);
    setRecordingSeconds(0);
  };

  // --- Send confirmed media ---
  const handleConfirmSend = async () => {
    const blob = currentMode === 'photo' ? capturedBlob : recordedBlob;
    if (!blob || isSendingMedia) return;

    setIsSendingMedia(true);
    try {
      const base64Data = await blobToBase64(blob);
      const timestamp = Date.now();
      const isVideo = currentMode === 'video';
      const mimeType = isVideo ? (blob.type || 'video/webm') : 'image/jpeg';
      const ext = isVideo ? (mimeType.includes('mp4') ? 'mp4' : 'webm') : 'jpg';
      const fileName = `${currentMode}_${timestamp}.${ext}`;

      stopTracks();
      if (recordedVideoUrl) URL.revokeObjectURL(recordedVideoUrl);
      onSendMedia({ fileName, mimeType, base64Data });
    } catch (err: any) {
      console.error('[Subnet:Camera] Failed to process media for sending:', err);
    } finally {
      setIsSendingMedia(false);
    }
  };

  const formatDuration = (sec: number): string => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="camera-modal-backdrop" onClick={handleClose}>
      <div className="camera-modal-card" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header with Photo / Video Mode Switcher */}
        <div className="camera-modal-header">
          {/* Mode Tabs */}
          <div className="camera-mode-switcher" role="tablist">
            <button
              type="button"
              className={`camera-mode-tab ${currentMode === 'photo' ? 'active' : ''}`}
              onClick={() => handleSwitchMode('photo')}
              disabled={isRecording || isSendingMedia}
              role="tab"
              aria-selected={currentMode === 'photo'}
            >
              <Camera style={{ width: 14, height: 14 }} />
              <span>Photo</span>
            </button>
            <button
              type="button"
              className={`camera-mode-tab ${currentMode === 'video' ? 'active' : ''}`}
              onClick={() => handleSwitchMode('video')}
              disabled={isRecording || isSendingMedia}
              role="tab"
              aria-selected={currentMode === 'video'}
            >
              <Video style={{ width: 14, height: 14 }} />
              <span>Video</span>
            </button>
          </div>

          <button
            type="button"
            className="camera-modal-close-btn"
            onClick={handleClose}
            title="Cancel and close (Esc)"
          >
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        {/* Viewfinder or Preview */}
        <div className="camera-viewfinder-container">
          {permissionError ? (
            <div className="camera-error-state">
              <AlertTriangle style={{ width: 36, height: 36, color: '#f59e0b' }} />
              <h3>Camera Unavailable</h3>
              <p>{permissionError}</p>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setPermissionError(null);
                  setCurrentMode((m) => (m === 'photo' ? 'photo' : 'video'));
                }}
              >
                Retry
              </button>
            </div>
          ) : currentMode === 'photo' && capturedPhotoUrl ? (
            /* Photo preview: guaranteed to show actual captured frame */
            <img
              src={capturedPhotoUrl}
              alt="Captured preview"
              className="camera-captured-preview"
            />
          ) : currentMode === 'video' && recordedVideoUrl ? (
            /* Video preview */
            <video
              ref={recordedVideoRef}
              src={recordedVideoUrl}
              controls
              autoPlay
              muted
              playsInline
              preload="auto"
              className="camera-captured-preview recorded-video-preview"
            />
          ) : (
            /* Live camera stream */
            <div className="camera-live-wrap">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="camera-video-feed"
              />
              {isRecording && (
                <div className="recording-pill">
                  <span className="recording-dot-pulse" />
                  <span>REC {formatDuration(recordingSeconds)}</span>
                </div>
              )}
              {isInitializing && (
                <div className="camera-loading-overlay">
                  <span>Starting camera...</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Actions bar */}
        {!permissionError && (
          <div className="camera-modal-actions">
            {currentMode === 'photo' ? (
              capturedPhotoUrl ? (
                <>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={handleRetakePhoto}
                    disabled={isSendingMedia}
                  >
                    <RefreshCw style={{ width: 14, height: 14 }} />
                    <span>Retake</span>
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={handleConfirmSend}
                    disabled={isSendingMedia}
                  >
                    <Send style={{ width: 14, height: 14 }} />
                    <span>{isSendingMedia ? 'Sending...' : 'Send Photo'}</span>
                  </button>
                </>
              ) : (
                <>
                  <button type="button" className="btn-secondary" onClick={handleClose}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn-camera-capture"
                    onClick={handleCapturePhoto}
                    title="Capture photo"
                    aria-label="Capture photo"
                    disabled={isInitializing}
                  >
                    <div className="capture-inner-circle" />
                  </button>
                </>
              )
            ) : recordedVideoUrl ? (
              <>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleRetakeVideo}
                  disabled={isSendingMedia}
                >
                  <RefreshCw style={{ width: 14, height: 14 }} />
                  <span>Retake</span>
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleConfirmSend}
                  disabled={isSendingMedia}
                >
                  <Send style={{ width: 14, height: 14 }} />
                  <span>{isSendingMedia ? 'Sending...' : 'Send Video'}</span>
                </button>
              </>
            ) : isRecording ? (
              <button
                type="button"
                className="btn-recording-stop"
                onClick={handleStopRecording}
                title="Stop recording"
              >
                <Square style={{ width: 16, height: 16, fill: 'currentColor' }} />
                <span>Stop Recording</span>
              </button>
            ) : (
              <>
                <button type="button" className="btn-secondary" onClick={handleClose}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-recording-start"
                  onClick={handleStartRecording}
                  title="Start recording"
                  disabled={isInitializing}
                >
                  <div className="recording-start-circle" />
                  <span>Record</span>
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
