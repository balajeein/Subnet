import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';

export interface ViewingMedia {
  url: string;
  fileName: string;
  fileSize?: number;
  mimeType: string;
  localPath?: string;
  transferId?: string;
}

interface MediaViewerModalProps {
  media: ViewingMedia;
  onClose: () => void;
  onDownload?: (transferId: string) => void;
  onShowInFinder?: (filePath: string) => void;
}

export default function MediaViewerModal({
  media,
  onClose,
  onDownload,
}: MediaViewerModalProps): React.JSX.Element {
  const [isZoomed, setIsZoomed] = useState(false);

  const isVideo = media.mimeType.startsWith('video/');
  const isImage = media.mimeType.startsWith('image/');

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="media-viewer-backdrop"
      onClick={onClose}
      role="dialog"
      aria-label={`View ${media.fileName}`}
    >
      <div className="media-viewer-container" onClick={(e) => e.stopPropagation()}>
        {/* Minimal Header Bar */}
        <div className="media-viewer-header">
          <button
            type="button"
            className="media-viewer-close-btn"
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onClose();
            }}
            onMouseDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onClose();
            }}
            onClick={(event) => {
              event.stopPropagation();
              onClose();
            }}
            title="Close viewer (Esc)"
            aria-label="Close"
          >
            <X style={{ width: 19, height: 19 }} />
          </button>
        </div>

        {/* Viewport */}
        <div className={`media-viewer-viewport ${isZoomed ? 'zoomed' : ''}`}>
          {isImage ? (
            <img
              src={media.url}
              alt={media.fileName}
              className={`media-viewer-image ${isZoomed ? 'actual-size' : 'fit-window'}`}
              onClick={() => setIsZoomed((prev) => !prev)}
            />
          ) : isVideo ? (
            <video
              src={media.url}
              controls
              autoPlay
              playsInline
              className="media-viewer-video"
            />
          ) : (
            <div className="media-viewer-unsupported">
              <p>Preview not available for this file type.</p>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => media.transferId && onDownload?.(media.transferId)}
              >
                <span>Download</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
