import React from 'react';
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
}: AttachmentBubbleProps): React.JSX.Element {
  const formatFileSize = (bytes: number): string => {
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

  const getFileIcon = () => {
    if (attachment.mimeType.startsWith('image/')) {
      return <ImageIcon style={{ width: 18, height: 18, color: '#38bdf8' }} />;
    }
    if (attachment.mimeType.startsWith('video/')) {
      return <Film style={{ width: 18, height: 18, color: '#f43f5e' }} />;
    }
    if (attachment.mimeType === 'application/pdf' || attachment.mimeType.includes('text')) {
      return <FileText style={{ width: 18, height: 18, color: '#fbbf24' }} />;
    }
    return <File style={{ width: 18, height: 18, color: '#94a3b8' }} />;
  };

  return (
    <div className="attachment-bubble-card">
      {/* Thumbnail for image or video preview */}
      {attachment.thumbnail && (
        <div className="attachment-bubble-thumbnail-wrap">
          <img
            src={attachment.thumbnail}
            alt={attachment.fileName}
            className="attachment-bubble-image"
          />
        </div>
      )}

      {/* Main file info header */}
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
              <span>Show in Finder</span>
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
              <span>Retry Download</span>
            </button>
          </div>
        ) : isMe ? (
          <span className="attachment-sent-tag">Shared File</span>
        ) : (
          <button
            type="button"
            className="btn-attachment-download"
            onClick={() => onDownload(attachment.transferId)}
          >
            <Download style={{ width: 14, height: 14 }} />
            <span>Download</span>
          </button>
        )}
      </div>
    </div>
  );
}
