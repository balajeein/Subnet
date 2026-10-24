import React, { useState, useEffect, useRef } from 'react';
import { Camera, Video, Square, RefreshCw, Send, X, AlertTriangle } from 'lucide-react';

interface CameraCaptureModalProps {
  mode: 'photo' | 'video';
  onClose: () => void;
  onSendMedia: (media: {
    fileName: string;
    mimeType: string;
    base64Data: string;
  }) => void;
}

export default function CameraCaptureModal({
  mode,
  onClose,
  onSendMedia,
}: CameraCaptureModalProps): React.JSX.Element {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  // Photo capture state
  const [capturedPhotoUrl, setCapturedPhotoUrl] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);

  // Video recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordedVideoUrl, setRecordedVideoUrl] = useState<string | null>(null);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Stop all camera & mic tracks safely
  const stopTracks = () => {
    if (stream) {
      stream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      setStream(null);
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  // 1. Initialize camera stream
  useEffect(() => {
    let isCancelled = false;

    async function initCamera() {
      try {
        const constraints: MediaStreamConstraints = {
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'user',
          },
          audio: mode === 'video',
        };

        const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
        if (isCancelled) {
          mediaStream.getTracks().forEach((t) => t.stop());
          return;
        }

        setStream(mediaStream);
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      } catch (err: any) {
        if (!isCancelled) {
          console.error('[Subnet:Camera] Camera access error:', err);
          if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            setPermissionError('Camera permission was denied. Please allow camera access in macOS System Settings.');
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
  }, [mode]);

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
    if (capturedPhotoUrl) URL.revokeObjectURL(capturedPhotoUrl);
    if (recordedVideoUrl) URL.revokeObjectURL(recordedVideoUrl);
    onClose();
  };

  // --- Photo capture ---
  const handleCapturePhoto = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          setCapturedPhotoUrl(url);
          setCapturedBlob(blob);
        }
      },
      'image/jpeg',
      0.85
    );
  };

  const handleRetakePhoto = () => {
    if (capturedPhotoUrl) {
      URL.revokeObjectURL(capturedPhotoUrl);
    }
    setCapturedPhotoUrl(null);
    setCapturedBlob(null);
  };

  // --- Video recording ---
  const handleStartRecording = () => {
    if (!stream) return;
    recordedChunksRef.current = [];

    const options: MediaRecorderOptions = {
      mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
        ? 'video/webm;codecs=vp8,opus'
        : 'video/webm',
    };

    try {
      const recorder = new MediaRecorder(stream, options);
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
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
    const blob = mode === 'photo' ? capturedBlob : recordedBlob;
    if (!blob) return;

    const arrayBuffer = await blob.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString('base64');

    const timestamp = Date.now();
    const fileName =
      mode === 'photo'
        ? `photo_${timestamp}.jpg`
        : `video_${timestamp}.webm`;
    const mimeType = mode === 'photo' ? 'image/jpeg' : 'video/webm';

    stopTracks();
    onSendMedia({ fileName, mimeType, base64Data });
  };

  const formatDuration = (sec: number): string => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="camera-modal-backdrop" onClick={handleClose}>
      <div className="camera-modal-card" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="camera-modal-header">
          <div className="camera-modal-title">
            {mode === 'photo' ? (
              <>
                <Camera style={{ width: 17, height: 17, color: '#38bdf8' }} />
                <span>Take Photo</span>
              </>
            ) : (
              <>
                <Video style={{ width: 17, height: 17, color: '#f43f5e' }} />
                <span>Record Video</span>
              </>
            )}
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
              <button type="button" className="btn-secondary" onClick={handleClose}>
                Close
              </button>
            </div>
          ) : mode === 'photo' && capturedPhotoUrl ? (
            /* Photo preview */
            <img src={capturedPhotoUrl} alt="Captured preview" className="camera-captured-preview" />
          ) : mode === 'video' && recordedVideoUrl ? (
            /* Video preview */
            <video src={recordedVideoUrl} controls autoPlay className="camera-captured-preview" />
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
            </div>
          )}
        </div>

        {/* Actions bar */}
        {!permissionError && (
          <div className="camera-modal-actions">
            {mode === 'photo' ? (
              capturedPhotoUrl ? (
                <>
                  <button type="button" className="btn-secondary" onClick={handleRetakePhoto}>
                    <RefreshCw style={{ width: 14, height: 14 }} />
                    <span>Retake</span>
                  </button>
                  <button type="button" className="btn-primary" onClick={handleConfirmSend}>
                    <Send style={{ width: 14, height: 14 }} />
                    <span>Send Photo</span>
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
                  >
                    <div className="capture-inner-circle" />
                  </button>
                </>
              )
            ) : recordedVideoUrl ? (
              <>
                <button type="button" className="btn-secondary" onClick={handleRetakeVideo}>
                  <RefreshCw style={{ width: 14, height: 14 }} />
                  <span>Retake</span>
                </button>
                <button type="button" className="btn-primary" onClick={handleConfirmSend}>
                  <Send style={{ width: 14, height: 14 }} />
                  <span>Send Video</span>
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
