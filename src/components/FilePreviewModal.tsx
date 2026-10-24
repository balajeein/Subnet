import React, { useState } from 'react';
import { File, FileText, Film, Image as ImageIcon, Send, X } from 'lucide-react';

interface FilePreviewModalProps {
  file: {
    filePath: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    thumbnail?: string;
  };
  onClose: () => void;
  onConfirmSend: (text?: string) => void;
}

export default function FilePreviewModal({
  file,
  onClose,
  onConfirmSend,
}: FilePreviewModalProps): React.JSX.Element {
  const [caption, setCaption] = useState('');

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    if (mb < 1024) return `${mb.toFixed(1)} MB`;
    const gb = mb / 1024;
    return `${gb.toFixed(2)} GB`;
  };

  const getFileIcon = () => {
    if (file.mimeType.startsWith('image/')) {
      return <ImageIcon style={{ width: 28, height: 28, color: '#B58AE8' }} />;
    }
    if (file.mimeType.startsWith('video/')) {
      return <Film style={{ width: 28, height: 28, color: '#f43f5e' }} />;
    }
    if (file.mimeType === 'application/pdf' || file.mimeType.includes('text')) {
      return <FileText style={{ width: 28, height: 28, color: '#fbbf24' }} />;
    }
    return <File style={{ width: 28, height: 28, color: '#94a3b8' }} />;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirmSend(caption.trim() || undefined);
  };

  return (
    <div className="file-preview-backdrop" onClick={onClose}>
      <div className="file-preview-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="file-preview-header">
          <h3 className="file-preview-title">Send File</h3>
          <button
            type="button"
            className="file-preview-close-btn"
            onClick={onClose}
            title="Cancel"
          >
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        <div className="file-preview-body">
          {file.thumbnail ? (
            <div className="file-thumbnail-preview-wrap">
              <img src={file.thumbnail} alt={file.fileName} className="file-thumbnail-preview" />
            </div>
          ) : (
            <div className="file-icon-placeholder-wrap">{getFileIcon()}</div>
          )}

          <div className="file-meta-info">
            <span className="file-preview-name" title={file.fileName}>
              {file.fileName}
            </span>
            <span className="file-preview-size">
              {formatFileSize(file.fileSize)} • {file.mimeType}
            </span>
          </div>

          <form onSubmit={handleSubmit} className="file-caption-form">
            <input
              type="text"
              className="file-caption-input"
              placeholder="Add a message or caption... (optional)"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              autoFocus
            />

            <div className="file-preview-actions">
              <button type="button" className="btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="btn-primary">
                <Send style={{ width: 14, height: 14 }} />
                <span>Send</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
