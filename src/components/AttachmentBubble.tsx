import React, { useState, useRef, useEffect } from 'react';
import {
  Download,
  FolderOpen,
  ExternalLink,
  File,
  FileText,
  Film,
  Image as ImageIcon,
  X,
  RefreshCw,
  MoreVertical,
  ChevronDown,
  Maximize2,
} from 'lucide-react';
import type { FileAttachmentMetadata, FileTransferProgress } from '../types/subnet';

interface AttachmentBubbleProps {
  attachment: FileAttachmentMetadata;
  isMe: boolean;
  localPath?: string;
  transferStatus?: 'idle' | 'transferring' | 'downloaded' | 'failed' | 'cancelled';
  progress?: FileTransferProgress;
  onDownload: (transferId: string) => void;
  onCancel: (transferId: string) => void;
  onShowInFinder: (filePath: string) => void;
  onOpenFile: (filePath: string) => void;
  onViewMedia?: (media: {
    url: string;
    fileName: string;
    fileSize?: number;
    mimeType: string;
    localPath?: string;
    transferId?: string;
  }) => void;
}

export default function AttachmentBubble({
  attachment,
  isMe,
  localPath,
  transferStatus,
  progress,
  onDownload,
  onCancel,
  onShowInFinder,
  onOpenFile,
  onViewMedia,
}: AttachmentBubbleProps): React.JSX.Element {
  const [showMenu, setShowMenu] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown menu on click outside
  useEffect(() => {
    if (!showMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMenu]);

  const formatFileSize = (bytes?: number): string => {
    if (!bytes || bytes <= 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    if (mb < 1024) return `${mb.toFixed(1)} MB`;
    const gb = mb / 1024;
    return `${gb.toFixed(2)} GB`;
  };

  const isDownloading = progress?.status === 'transferring';
  const isCompleted =
    progress?.status === 'completed' ||
    transferStatus === 'downloaded' ||
    Boolean(localPath);
  const activeLocalPath = progress?.localPath || localPath;
  const isFailed = progress?.status === 'failed' || transferStatus === 'failed';

  const isImage = attachment.mimeType.startsWith('image/');
  const isVideo = attachment.mimeType.startsWith('video/');
  const isMedia = isImage || isVideo;

  // Resolve media display source
  const getMediaUrl = (): string => {
    if (activeLocalPath) {
      if (
        activeLocalPath.startsWith('http://') ||
        activeLocalPath.startsWith('https://') ||
        activeLocalPath.startsWith('data:')
      ) {
        return activeLocalPath;
      }
      if (typeof window !== 'undefined' && window.subnet?.isElectron) {
        return `subnet-media://${encodeURI(activeLocalPath)}`;
      }
      return attachment.thumbnail || `subnet-media://${encodeURI(activeLocalPath)}`;
    }
    return attachment.thumbnail || '';
  };

  const mediaUrl = getMediaUrl();

  const handleMediaClick = (e: React.MouseEvent) => {
    // Only open the in-app full size viewer if media is available
    e.stopPropagation();
    if (onViewMedia && (mediaUrl || activeLocalPath)) {
      onViewMedia({
        url: mediaUrl,
        fileName: attachment.fileName,
        fileSize: attachment.fileSize,
        mimeType: attachment.mimeType,
        localPath: activeLocalPath,
        transferId: attachment.transferId,
      });
    }
  };

  const handleDownloadOrSave = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setShowMenu(false);

    if (activeLocalPath && window.subnet?.saveFileAs) {
      try {
        setSaveStatus('Saving...');
        const res = await window.subnet.saveFileAs(activeLocalPath, attachment.fileName);
        if (res.success && res.savedPath) {
          setSaveStatus('Saved');
          setTimeout(() => setSaveStatus(null), 2500);
        } else if (res.canceled) {
          setSaveStatus(null);
        } else {
          setSaveStatus(res.error || 'Failed to save');
          setTimeout(() => setSaveStatus(null), 3000);
        }
      } catch (err: any) {
        setSaveStatus(err.message || 'Save failed');
        setTimeout(() => setSaveStatus(null), 3000);
      }
    } else {
      onDownload(attachment.transferId);
    }
  };

  const getFileIcon = () => {
    if (isImage) {
      return <ImageIcon style={{ width: 18, height: 18, color: '#B58AE8' }} />;
    }
    if (isVideo) {
      return <Film style={{ width: 18, height: 18, color: '#f43f5e' }} />;
    }
    if (attachment.mimeType === 'application/pdf' || attachment.mimeType.includes('text')) {
      return <FileText style={{ width: 18, height: 18, color: '#fbbf24' }} />;
    }
    return <File style={{ width: 18, height: 18, color: '#94a3b8' }} />;
  };

  // =========================================================================
  // 1. WhatsApp-Style Media Message (Image or Video)
  // =========================================================================
  if (isMedia) {
    return (
      <div className={`media-bubble-wrap ${isMe ? 'outgoing' : 'incoming'}`}>
        <div className="media-bubble-card">
          {/* Top-Right WhatsApp-style action menu */}
          <div className="media-top-action-bar" ref={menuRef}>
            <button
              type="button"
              className={`media-menu-trigger-btn ${showMenu ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu((prev) => !prev);
              }}
              title="Media options"
              aria-label="Media options"
              aria-expanded={showMenu}
            >
              <ChevronDown style={{ width: 14, height: 14 }} />
            </button>

            {showMenu && (
              <div className="media-dropdown-menu" role="menu" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  className="media-dropdown-item"
                  role="menuitem"
                  onClick={handleDownloadOrSave}
                >
                  <Download style={{ width: 14, height: 14 }} />
                  <span>{activeLocalPath ? 'Save As...' : 'Download'}</span>
                </button>

                {onViewMedia && (
                  <button
                    type="button"
                    className="media-dropdown-item"
                    role="menuitem"
                    onClick={(e) => {
                      setShowMenu(false);
                      handleMediaClick(e);
                    }}
                  >
                    <Maximize2 style={{ width: 14, height: 14 }} />
                    <span>View Full Size</span>
                  </button>
                )}

                {activeLocalPath && (
                  <>
                    <button
                      type="button"
                      className="media-dropdown-item"
                      role="menuitem"
                      onClick={() => {
                        setShowMenu(false);
                        onShowInFinder(activeLocalPath);
                      }}
                    >
                      <FolderOpen style={{ width: 14, height: 14 }} />
                      <span>Show in Finder</span>
                    </button>
                    <button
                      type="button"
                      className="media-dropdown-item"
                      role="menuitem"
                      onClick={() => {
                        setShowMenu(false);
                        onOpenFile(activeLocalPath);
                      }}
                    >
                      <ExternalLink style={{ width: 14, height: 14 }} />
                      <span>Open in Default App</span>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Media Content Area */}
          <div
            className={`media-viewport-container ${isCompleted ? 'clickable' : ''}`}
            onClick={isCompleted ? handleMediaClick : undefined}
          >
            {isImage ? (
              <img
                src={mediaUrl}
                alt={attachment.fileName}
                className="media-image-content"
                loading="lazy"
                onError={(e) => {
                  if (attachment.thumbnail && e.currentTarget.src !== attachment.thumbnail) {
                    e.currentTarget.src = attachment.thumbnail;
                  }
                }}
              />
            ) : isVideo && isCompleted && activeLocalPath ? (
              <video
                src={mediaUrl}
                controls
                playsInline
                preload="metadata"
                className="media-video-content"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              /* Video placeholder / poster before download */
              <div className="media-video-placeholder">
                {attachment.thumbnail ? (
                  <img
                    src={attachment.thumbnail}
                    alt={attachment.fileName}
                    className="media-image-content"
                  />
                ) : (
                  <Film style={{ width: 44, height: 44, color: 'rgba(255, 255, 255, 0.7)' }} />
                )}
              </div>
            )}

            {/* Centered Download Button overlay (when received and not yet downloaded) */}
            {!isCompleted && !isDownloading && !isMe && (
              <div className="media-download-overlay" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  className="media-center-download-btn"
                  onClick={() => onDownload(attachment.transferId)}
                  title={`Download ${attachment.fileName} (${formatFileSize(attachment.fileSize)})`}
                  aria-label="Download media"
                >
                  <Download style={{ width: 22, height: 22 }} />
                </button>
                <span className="media-overlay-size-tag">
                  {formatFileSize(attachment.fileSize)}
                </span>
              </div>
            )}

            {/* Downloading Progress Indicator Overlay */}
            {isDownloading && progress && (
              <div className="media-download-overlay" onClick={(e) => e.stopPropagation()}>
                <div className="media-download-progress-box">
                  <div className="media-progress-circular-ring">
                    <span className="media-progress-text">{progress.percent}%</span>
                  </div>
                  <button
                    type="button"
                    className="media-cancel-download-btn"
                    onClick={() => onCancel(attachment.transferId)}
                    title="Cancel download"
                  >
                    <X style={{ width: 14, height: 14 }} />
                  </button>
                </div>
              </div>
            )}

            {/* Transfer failed overlay */}
            {isFailed && !isDownloading && (
              <div className="media-download-overlay" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  className="media-center-download-btn retry"
                  onClick={() => onDownload(attachment.transferId)}
                  title="Retry download"
                >
                  <RefreshCw style={{ width: 20, height: 20 }} />
                </button>
                <span className="media-overlay-size-tag error">Transfer Failed</span>
              </div>
            )}
          </div>

          {/* Compact Metadata Footer */}
          <div className="media-bubble-meta-row">
            <span className="media-meta-filename" title={attachment.fileName}>
              {attachment.fileName}
            </span>
            <span className="media-meta-dot">•</span>
            <span className="media-meta-size">
              {formatFileSize(attachment.fileSize)}
            </span>
            {saveStatus && <span className="media-save-status-pill">{saveStatus}</span>}
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // 2. Generic Documents, Archives & Non-Media Attachments
  // =========================================================================
  return (
    <div className="attachment-bubble-card">
      <div className="attachment-bubble-info-row">
        <div className="attachment-type-icon">{getFileIcon()}</div>
        <div className="attachment-info-texts">
          <span className="attachment-filename" title={attachment.fileName}>
            {attachment.fileName}
          </span>
          <span className="attachment-filesize">
            {formatFileSize(attachment.fileSize)}
          </span>
        </div>

        {/* Top-Right Menu for generic files */}
        <div className="generic-attachment-menu-wrap" ref={menuRef}>
          <button
            type="button"
            className="attachment-quick-menu-btn"
            onClick={() => setShowMenu((prev) => !prev)}
            title="Options"
            aria-label="Options"
          >
            <MoreVertical style={{ width: 14, height: 14 }} />
          </button>
          {showMenu && (
            <div className="media-dropdown-menu right" role="menu">
              <button
                type="button"
                className="media-dropdown-item"
                role="menuitem"
                onClick={handleDownloadOrSave}
              >
                <Download style={{ width: 14, height: 14 }} />
                <span>{activeLocalPath ? 'Save As...' : 'Download'}</span>
              </button>
              {activeLocalPath && (
                <>
                  <button
                    type="button"
                    className="media-dropdown-item"
                    role="menuitem"
                    onClick={() => {
                      setShowMenu(false);
                      onShowInFinder(activeLocalPath);
                    }}
                  >
                    <FolderOpen style={{ width: 14, height: 14 }} />
                    <span>Show in Finder</span>
                  </button>
                  <button
                    type="button"
                    className="media-dropdown-item"
                    role="menuitem"
                    onClick={() => {
                      setShowMenu(false);
                      onOpenFile(activeLocalPath);
                    }}
                  >
                    <ExternalLink style={{ width: 14, height: 14 }} />
                    <span>Open</span>
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Transfer Progress bar (when active) */}
      {isDownloading && progress && (
        <div className="attachment-progress-wrap">
          <div className="attachment-progress-bar-bg">
            <div
              className="attachment-progress-bar-fill"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
          <div className="attachment-progress-stats">
            <span>
              {progress.percent}% ({formatFileSize(progress.transferredBytes)} of{' '}
              {formatFileSize(progress.totalBytes)})
            </span>
            <button
              type="button"
              className="attachment-cancel-btn"
              onClick={() => onCancel(attachment.transferId)}
              title="Cancel transfer"
            >
              <X style={{ width: 12, height: 12 }} />
            </button>
          </div>
        </div>
      )}

      {/* Action buttons footer */}
      <div className="attachment-bubble-actions">
        {isCompleted && activeLocalPath ? (
          <div className="attachment-completed-actions">
            <button
              type="button"
              className="btn-attachment-action"
              onClick={() => onShowInFinder(activeLocalPath)}
              title="Show in Finder"
            >
              <FolderOpen style={{ width: 13, height: 13 }} />
              <span>Finder</span>
            </button>
            <button
              type="button"
              className="btn-attachment-action"
              onClick={() => onOpenFile(activeLocalPath)}
              title="Open File"
            >
              <ExternalLink style={{ width: 13, height: 13 }} />
              <span>Open</span>
            </button>
            <button
              type="button"
              className="btn-attachment-action"
              onClick={handleDownloadOrSave}
              title="Save a copy"
            >
              <Download style={{ width: 13, height: 13 }} />
              <span>Save As</span>
            </button>
            {saveStatus && <span className="media-save-status-pill">{saveStatus}</span>}
          </div>
        ) : isDownloading ? null : isFailed ? (
          <div className="attachment-failed-actions">
            <span className="attachment-failed-tag">Transfer failed</span>
            <button
              type="button"
              className="btn-attachment-action"
              onClick={() => onDownload(attachment.transferId)}
            >
              <RefreshCw style={{ width: 13, height: 13 }} />
              <span>Retry</span>
            </button>
          </div>
        ) : isMe ? (
          <div className="attachment-completed-actions">
            <span className="attachment-sent-tag">Shared File</span>
            <button
              type="button"
              className="btn-attachment-action"
              onClick={handleDownloadOrSave}
              title="Save a copy"
            >
              <Download style={{ width: 13, height: 13 }} />
              <span>Save As</span>
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="btn-attachment-download"
            onClick={() => onDownload(attachment.transferId)}
          >
            <Download style={{ width: 14, height: 14 }} />
            <span>Download ({formatFileSize(attachment.fileSize)})</span>
          </button>
        )}
      </div>
    </div>
  );
}
