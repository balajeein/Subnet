import React, { useState, useEffect } from 'react';
import { X, Download, FolderOpen, ZoomIn, ZoomOut } from 'lucide-react';

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
  onShowInFinder,
}: MediaViewerModalProps): React.JSX.Element {
  const [isZoomed, setIsZoomed] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

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

  const formatFileSize = (bytes?: number): string => {
    if (!bytes || bytes <= 0) return '';
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    if (mb < 1024) return `${mb.toFixed(1)} MB`;
    const gb = mb / 1024;
    return `${gb.toFixed(2)} GB`;
  };

  const handleDownloadAction = async () => {
    if (media.localPath && window.subnet?.saveFileAs) {
      try {
        setSaveStatus('Saving...');
        const res = await window.subnet.saveFileAs(media.localPath, media.fileName);
        if (res.success && res.savedPath) {
          setSaveStatus('Saved!');
          setTimeout(() => setSaveStatus(null), 2500);
        } else if (res.canceled) {
          setSaveStatus(null);
        } else {
          setSaveStatus(res.error || 'Failed to save');
          setTimeout(() => setSaveStatus(null), 3000);
        }
      } catch (err: any) {
        setSaveStatus(err.message || 'Error saving file');
        setTimeout(() => setSaveStatus(null), 3000);
      }
    } else if (media.transferId && onDownload) {
      onDownload(media.transferId);
      setSaveStatus('Downloading...');
      setTimeout(() => setSaveStatus(null), 2500);
    }
  };

  return (
    <div
      className="media-viewer-backdrop"
      onClick={onClose}
      role="dialog"
      aria-label={`View ${media.fileName}`}
    >
      <div className="media-viewer-container" onClick={(e) => e.stopPropagation()}>
        {/* Header Bar */}
        <div className="media-viewer-header">
          <div className="media-viewer-info">
            <span className="media-viewer-filename" title={media.fileName}>
              {media.fileName}
            </span>
            {media.fileSize ? (
              <span className="media-viewer-filesize">
                {formatFileSize(media.fileSize)}
              </span>
            ) : null}
            {saveStatus && <span className="media-viewer-save-badge">{saveStatus}</span>}
          </div>

          <div className="media-viewer-controls">
            {isImage && (
              <button
                type="button"
                className="media-viewer-btn"
                onClick={() => setIsZoomed((prev) => !prev)}
                title={isZoomed ? 'Fit to window' : 'View actual size (100%)'}
                aria-label={isZoomed ? 'Fit to window' : 'View actual size'}
              >
                {isZoomed ? (
                  <ZoomOut style={{ width: 17, height: 17 }} />
                ) : (
                  <ZoomIn style={{ width: 17, height: 17 }} />
                )}
                <span>{isZoomed ? 'Fit' : '100%'}</span>
              </button>
            )}

            {(media.localPath || media.transferId) && (
              <button
                type="button"
                className="media-viewer-btn"
                onClick={handleDownloadAction}
                title="Save file to computer"
                aria-label="Download or save file"
              >
                <Download style={{ width: 17, height: 17 }} />
                <span>Save As</span>
              </button>
            )}

            {media.localPath && onShowInFinder && (
              <button
                type="button"
                className="media-viewer-btn"
                onClick={() => onShowInFinder(media.localPath!)}
                title="Show in Finder"
                aria-label="Show in Finder"
              >
                <FolderOpen style={{ width: 17, height: 17 }} />
                <span>Finder</span>
              </button>
            )}

            <button
              type="button"
              className="media-viewer-close-btn"
              onClick={onClose}
              title="Close viewer (Esc)"
              aria-label="Close"
            >
              <X style={{ width: 19, height: 19 }} />
            </button>
          </div>
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
                onClick={handleDownloadAction}
              >
                <Download style={{ width: 15, height: 15 }} />
                <span>Download {media.fileName}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
