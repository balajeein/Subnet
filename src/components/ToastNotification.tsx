import React from 'react';
import { Laptop, MessageSquare, Check, X, CheckCircle2 } from 'lucide-react';
import type { Invitation } from '../types/subnet';

export interface ToastItem {
  id: string;
  type: 'invitation' | 'info';
  invitation?: Invitation;
  message?: string;
}

interface ToastNotificationProps {
  toasts: ToastItem[];
  processingIds: Set<string>;
  onAccept: (invitation: Invitation) => void;
  onDecline: (invitation: Invitation) => void;
  onDismiss: (toastId: string) => void;
  onOpenRequests: () => void;
}

export default function ToastNotification({
  toasts,
  processingIds,
  onAccept,
  onDecline,
  onDismiss,
  onOpenRequests,
}: ToastNotificationProps): React.JSX.Element | null {
  if (toasts.length === 0) return null;

  return (
    <div className="toast-stack-container" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => {
        if (toast.type === 'info') {
          return (
            <div key={toast.id} className="toast-item toast-info">
              <CheckCircle2 style={{ width: 16, height: 16, color: '#36B987', flexShrink: 0 }} />
              <span className="toast-info-text">{toast.message}</span>
              <button
                type="button"
                className="toast-close-btn"
                onClick={() => onDismiss(toast.id)}
                title="Dismiss"
              >
                <X style={{ width: 14, height: 14 }} />
              </button>
            </div>
          );
        }

        const inv = toast.invitation;
        if (!inv) return null;
        const isProcessing = processingIds.has(inv.id);

        return (
          <div key={toast.id} className="toast-item toast-invitation">
            <div className="toast-header">
              <div className="toast-tag" onClick={onOpenRequests} role="button" tabIndex={0}>
                <MessageSquare style={{ width: 12, height: 12, color: '#B58AE8' }} />
                <span>New Chat Request</span>
              </div>
              <button
                type="button"
                className="toast-close-btn"
                onClick={() => onDismiss(toast.id)}
                title="Dismiss toast"
              >
                <X style={{ width: 14, height: 14 }} />
              </button>
            </div>

            <div
              className="toast-body"
              onClick={onOpenRequests}
              role="button"
              tabIndex={0}
              title="Click to view in Requests"
            >
              <div className="toast-avatar">
                <Laptop style={{ width: 16, height: 16, color: '#B58AE8' }} />
              </div>
              <div className="toast-meta">
                <span className="toast-sender">{inv.senderName}</span>
                <p className="toast-preview">{inv.text}</p>
              </div>
            </div>

            <div className="toast-footer">
              <div className="toast-actions">
                <button
                  type="button"
                  className="toast-btn toast-decline-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDecline(inv);
                  }}
                  disabled={isProcessing}
                  title="Decline request"
                >
                  <X style={{ width: 13, height: 13 }} />
                  <span>Decline</span>
                </button>
                <button
                  type="button"
                  className="toast-btn toast-accept-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAccept(inv);
                  }}
                  disabled={isProcessing}
                  title="Accept request"
                >
                  <Check style={{ width: 13, height: 13 }} />
                  <span>{isProcessing ? 'Accepting...' : 'Accept'}</span>
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
