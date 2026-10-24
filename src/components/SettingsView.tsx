import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Upload,
  RotateCcw,
  Check,
  X,
  Camera,
  ShieldCheck,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Copy,
  RefreshCw,
  Cpu,
} from 'lucide-react';
import type { LocalProfile, UserSettings, NetworkStatus } from '../types/subnet';
import { PRESET_AVATARS, getPresetAvatar } from '../utils/avatars';
import UserAvatar from './UserAvatar';

interface SettingsViewProps {
  localProfile: LocalProfile | null;
  settings: UserSettings;
  networkStatus: NetworkStatus | null;
  discoveredPeersCount: number;
  connectedPeersCount?: number;
  onUpdateSettings: (newSettings: Partial<UserSettings>) => Promise<UserSettings>;
  onRefreshTechnicalDetails?: () => Promise<void>;
  onClose: () => void;
  onShowToast: (message: string) => void;
}

export default function SettingsView({
  localProfile,
  settings,
  networkStatus,
  discoveredPeersCount,
  connectedPeersCount,
  onUpdateSettings,
  onRefreshTechnicalDetails,
  onClose,
  onShowToast,
}: SettingsViewProps): React.JSX.Element {
  // Modal state for changing profile picture
  const [isChangingPicture, setIsChangingPicture] = useState(false);
  const [tempAvatarType, setTempAvatarType] = useState<'default' | 'preset' | 'custom'>(settings.avatarType);
  const [tempAvatarValue, setTempAvatarValue] = useState<string>(settings.avatarValue);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Technical Details collapsible state (collapsed by default)
  const [isTechDetailsOpen, setIsTechDetailsOpen] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    setTempAvatarType(settings.avatarType);
    setTempAvatarValue(settings.avatarValue);
  }, [settings.avatarType, settings.avatarValue]);

  const handleOpenPicker = () => {
    setTempAvatarType(settings.avatarType);
    setTempAvatarValue(settings.avatarValue);
    setAvatarError(null);
    setIsChangingPicture(true);
  };

  const handleCancel = () => {
    setTempAvatarType(settings.avatarType);
    setTempAvatarValue(settings.avatarValue);
    setAvatarError(null);
    setIsChangingPicture(false);
  };

  const handleApply = async () => {
    setIsSaving(true);
    setAvatarError(null);
    try {
      await onUpdateSettings({
        avatarType: tempAvatarType,
        avatarValue: tempAvatarValue,
      });
      setIsChangingPicture(false);
      onShowToast('Profile picture updated across local network');
    } catch (err: any) {
      setAvatarError(err.message || 'Failed to update profile picture');
    } finally {
      setIsSaving(false);
    }
  };

  const handleChooseFromMac = async () => {
    setAvatarError(null);
    try {
      if (window.subnet?.selectAvatarFile) {
        const res = await window.subnet.selectAvatarFile();
        if (res.success && res.dataUrl) {
          setTempAvatarType('custom');
          setTempAvatarValue(res.dataUrl);
        } else if (res.error && res.error !== 'Selection cancelled') {
          setAvatarError(res.error);
        }
      }
    } catch (err: any) {
      setAvatarError(err.message || 'Failed to select image from Mac');
    }
  };

  const handleResetToDefault = async () => {
    setIsSaving(true);
    setAvatarError(null);
    try {
      await onUpdateSettings({
        avatarType: 'default',
        avatarValue: '',
      });
      setTempAvatarType('default');
      setTempAvatarValue('');
      setIsChangingPicture(false);
      onShowToast('Profile picture reset to default device icon');
    } catch (err: any) {
      setAvatarError(err.message || 'Failed to reset profile picture');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopy = async (fieldKey: string, value: string, label: string) => {
    if (!value || value === 'Unavailable') return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(fieldKey);
      onShowToast(`Copied ${label} to clipboard`);
      setTimeout(() => {
        setCopiedField((curr) => (curr === fieldKey ? null : curr));
      }, 2000);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
      onShowToast(`Failed to copy ${label}`);
    }
  };

  const handleRefresh = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isRefreshing || !onRefreshTechnicalDetails) return;
    setIsRefreshing(true);
    try {
      await onRefreshTechnicalDetails();
      onShowToast('Technical details refreshed');
    } catch (err: any) {
      onShowToast(err?.message || 'Failed to refresh technical details');
    } finally {
      setIsRefreshing(false);
    }
  };

  const currentPreset = settings.avatarType === 'preset' ? getPresetAvatar(settings.avatarValue) : null;

  const localIpDisplay = networkStatus?.localIp || 'Unavailable';
  const portDisplay = networkStatus?.port ? String(networkStatus.port) : 'Unavailable';
  const peerIdDisplay = localProfile?.id || 'Unavailable';
  const networkStatusDisplay = networkStatus
    ? networkStatus.isRunning
      ? 'Active'
      : 'Inactive'
    : 'Unavailable';
  const isNetworkActive = Boolean(networkStatus?.isRunning);
  const discoveredPeersDisplay =
    typeof discoveredPeersCount === 'number'
      ? `${discoveredPeersCount} ${discoveredPeersCount === 1 ? 'peer' : 'peers'} discovered`
      : 'Unavailable';
  const connectedPeersDisplay =
    typeof connectedPeersCount === 'number'
      ? `${connectedPeersCount} ${connectedPeersCount === 1 ? 'peer' : 'peers'} connected`
      : 'Unavailable';

  return (
    <div className="profile-settings-container">
      {/* Top Header */}
      <div className="profile-settings-header">
        <button
          type="button"
          className="settings-back-btn"
          onClick={onClose}
          title="Back to Radar"
        >
          <ArrowLeft style={{ width: 18, height: 18 }} />
        </button>
        <div>
          <h1 className="profile-settings-title">Profile</h1>
          <p className="profile-settings-subtitle">Manage your local profile picture and network identity</p>
        </div>
      </div>

      <div className="profile-settings-scroll">
        <div className="profile-card main-identity-card">
          {/* Identity Section */}
          <div className="profile-hero-row">
            <div className="profile-hero-avatar-wrap">
              <UserAvatar
                avatarType={settings.avatarType}
                avatarValue={settings.avatarValue}
                size={80}
                fallbackIconColor="#38bdf8"
              />
              <button
                type="button"
                className="profile-camera-btn"
                onClick={handleOpenPicker}
                title="Change profile picture"
              >
                <Camera style={{ width: 14, height: 14 }} />
              </button>
            </div>

            <div className="profile-hero-info">
              <div className="profile-name-row">
                <h2 className="profile-display-name">{localProfile?.name || 'Local Mac'}</h2>
                <span className="profile-device-badge">Read-only Identity</span>
              </div>
              <p className="profile-identity-desc">
                Derived from your macOS computer name. Visible to peers on your local network.
              </p>
              <div className="profile-status-desc">
                {settings.avatarType === 'preset' && currentPreset ? (
                  <span className="avatar-status-pill">
                    <Sparkles style={{ width: 13, height: 13, color: '#38bdf8' }} />
                    Preset Avatar: {currentPreset.name}
                  </span>
                ) : settings.avatarType === 'custom' ? (
                  <span className="avatar-status-pill">
                    <Check style={{ width: 13, height: 13, color: '#10b981' }} />
                    Custom Image Avatar
                  </span>
                ) : (
                  <span className="avatar-status-pill">
                    <ShieldCheck style={{ width: 13, height: 13, color: '#94a3b8' }} />
                    Default Device Icon
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="profile-actions-row">
            <button
              type="button"
              className="btn-change-picture"
              onClick={handleOpenPicker}
            >
              <Camera style={{ width: 15, height: 15 }} />
              <span>Change Profile Picture</span>
            </button>

            {settings.avatarType !== 'default' && (
              <button
                type="button"
                className="btn-reset-default"
                onClick={handleResetToDefault}
                disabled={isSaving}
              >
                <RotateCcw style={{ width: 14, height: 14 }} />
                <span>Reset to Default</span>
              </button>
            )}
          </div>
        </div>

        {/* Technical Details Collapsible Card */}
        <div className="profile-card technical-details-card">
          <div
            className="tech-details-header"
            role="button"
            tabIndex={0}
            onClick={() => setIsTechDetailsOpen((prev) => !prev)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setIsTechDetailsOpen((prev) => !prev);
              }
            }}
            aria-expanded={isTechDetailsOpen}
          >
            <div className="tech-toggle-left">
              <div className="tech-toggle-icon-wrap">
                <Cpu style={{ width: 18, height: 18, color: '#38bdf8' }} />
              </div>
              <div className="tech-toggle-meta">
                <h3 className="tech-details-title">General</h3>
                <p className="tech-details-subtitle">
                  Diagnostics, local node identifiers, and LAN discovery metrics
                </p>
              </div>
            </div>

            <div className="tech-toggle-actions">
              {onRefreshTechnicalDetails && (
                <button
                  type="button"
                  className="tech-refresh-btn"
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  title="Refresh technical diagnostic information"
                >
                  <RefreshCw
                    className={isRefreshing ? 'spinning' : ''}
                    style={{ width: 13, height: 13 }}
                  />
                  <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
                </button>
              )}
              <div className="tech-chevron-wrap">
                {isTechDetailsOpen ? (
                  <ChevronUp style={{ width: 18, height: 18, color: '#94a3b8' }} />
                ) : (
                  <ChevronDown style={{ width: 18, height: 18, color: '#94a3b8' }} />
                )}
              </div>
            </div>
          </div>

          {isTechDetailsOpen && (
            <div className="tech-details-body">
              <div className="tech-details-grid">
                {/* 1. Network Status */}
                <div className="tech-detail-row">
                  <div className="tech-detail-label-col">
                    <span className="tech-detail-label">Network Status</span>
                    <span className="tech-detail-hint">Subnet local networking engine state</span>
                  </div>
                  <div className="tech-detail-value-col">
                    <span className="tech-status-pill">
                      <span className={`status-dot ${isNetworkActive ? 'active' : ''}`} />
                      <span className="tech-status-label">{networkStatusDisplay}</span>
                    </span>
                  </div>
                </div>

                {/* 2. Local IP Address */}
                <div className="tech-detail-row">
                  <div className="tech-detail-label-col">
                    <span className="tech-detail-label">Local IP Address</span>
                    <span className="tech-detail-hint">Current LAN IP address used by Subnet</span>
                  </div>
                  <div className="tech-detail-value-col">
                    <span className="tech-code-value">{localIpDisplay}</span>
                    {localIpDisplay !== 'Unavailable' && (
                      <button
                        type="button"
                        className={`tech-copy-btn ${copiedField === 'ip' ? 'copied' : ''}`}
                        onClick={() => handleCopy('ip', localIpDisplay, 'Local IP')}
                        title={copiedField === 'ip' ? 'Copied!' : 'Copy Local IP'}
                      >
                        {copiedField === 'ip' ? (
                          <Check style={{ width: 12, height: 12, color: '#10b981' }} />
                        ) : (
                          <Copy style={{ width: 12, height: 12 }} />
                        )}
                        <span>{copiedField === 'ip' ? 'Copied' : 'Copy'}</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* 3. Listening Port */}
                <div className="tech-detail-row">
                  <div className="tech-detail-label-col">
                    <span className="tech-detail-label">Listening Port</span>
                    <span className="tech-detail-hint">Local port bound by Subnet WebSocket service</span>
                  </div>
                  <div className="tech-detail-value-col">
                    <span className="tech-code-value">{portDisplay}</span>
                    {portDisplay !== 'Unavailable' && (
                      <button
                        type="button"
                        className={`tech-copy-btn ${copiedField === 'port' ? 'copied' : ''}`}
                        onClick={() => handleCopy('port', portDisplay, 'Listening Port')}
                        title={copiedField === 'port' ? 'Copied!' : 'Copy Port'}
                      >
                        {copiedField === 'port' ? (
                          <Check style={{ width: 12, height: 12, color: '#10b981' }} />
                        ) : (
                          <Copy style={{ width: 12, height: 12 }} />
                        )}
                        <span>{copiedField === 'port' ? 'Copied' : 'Copy'}</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* 4. Local Peer ID */}
                <div className="tech-detail-row">
                  <div className="tech-detail-label-col">
                    <span className="tech-detail-label">Local Peer ID</span>
                    <span className="tech-detail-hint">Cryptographic identifier for this local device</span>
                  </div>
                  <div className="tech-detail-value-col">
                    <span className="tech-code-value tech-code-id" title={peerIdDisplay}>
                      {peerIdDisplay}
                    </span>
                    {peerIdDisplay !== 'Unavailable' && (
                      <button
                        type="button"
                        className={`tech-copy-btn ${copiedField === 'id' ? 'copied' : ''}`}
                        onClick={() => handleCopy('id', peerIdDisplay, 'Peer ID')}
                        title={copiedField === 'id' ? 'Copied!' : 'Copy Peer ID'}
                      >
                        {copiedField === 'id' ? (
                          <Check style={{ width: 12, height: 12, color: '#10b981' }} />
                        ) : (
                          <Copy style={{ width: 12, height: 12 }} />
                        )}
                        <span>{copiedField === 'id' ? 'Copied' : 'Copy'}</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* 5. Nearby Peers */}
                <div className="tech-detail-row">
                  <div className="tech-detail-label-col">
                    <span className="tech-detail-label">Nearby Peers</span>
                    <span className="tech-detail-hint">Unique discovered remote Subnet peers on LAN</span>
                  </div>
                  <div className="tech-detail-value-col">
                    <span className="tech-metric-value">{discoveredPeersDisplay}</span>
                  </div>
                </div>

                {/* 6. Connected Peers */}
                <div className="tech-detail-row">
                  <div className="tech-detail-label-col">
                    <span className="tech-detail-label">Connected Peers</span>
                    <span className="tech-detail-hint">Successfully connected remote peer sessions</span>
                  </div>
                  <div className="tech-detail-value-col">
                    <span className="tech-metric-value">{connectedPeersDisplay}</span>
                  </div>
                </div>

                {/* 7. Transport */}
                <div className="tech-detail-row">
                  <div className="tech-detail-label-col">
                    <span className="tech-detail-label">Transport</span>
                    <span className="tech-detail-hint">Underlying active data transport layer</span>
                  </div>
                  <div className="tech-detail-value-col">
                    <span className="tech-metric-badge">WebSocket over LAN</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Change Picture Modal / Sheet */}
        {isChangingPicture && (
          <div className="invitation-backdrop" onClick={handleCancel}>
            <div className="invitation-modal-card avatar-picker-modal" onClick={(e) => e.stopPropagation()}>
              <div className="invitation-header">
                <span className="invitation-badge">
                  <Camera style={{ width: 14, height: 14 }} />
                  <span>Customize Profile Picture</span>
                </span>
                <button type="button" className="picker-modal-close" onClick={handleCancel}>
                  <X style={{ width: 16, height: 16 }} />
                </button>
              </div>

              {avatarError && (
                <div className="avatar-error-banner">
                  <span>{avatarError}</span>
                </div>
              )}

              {/* Live Preview */}
              <div className="picker-preview-section">
                <div className="picker-preview-avatar">
                  <UserAvatar
                    avatarType={tempAvatarType}
                    avatarValue={tempAvatarValue}
                    size={64}
                    fallbackIconColor="#38bdf8"
                  />
                </div>
                <div className="picker-preview-meta">
                  <h4>Avatar Preview</h4>
                  <p>
                    {tempAvatarType === 'preset'
                      ? (getPresetAvatar(tempAvatarValue)?.name || 'Illustrated Preset')
                      : tempAvatarType === 'custom'
                        ? 'Custom Uploaded Picture'
                        : 'Default Device Icon'}
                  </p>
                </div>
              </div>

              {/* Choose from Mac native picker */}
              <div className="picker-mac-section">
                <button
                  type="button"
                  className="btn-choose-mac"
                  onClick={handleChooseFromMac}
                >
                  <Upload style={{ width: 16, height: 16 }} />
                  <span>Choose from Mac...</span>
                </button>
                <span className="picker-hint">PNG, JPEG, WebP, or GIF (max 10MB)</span>
              </div>

              {/* Preset illustrated avatars grid */}
              <div className="preset-grid-section">
                <label className="section-label">Or choose an illustrated avatar:</label>
                <div className="preset-avatar-grid">
                  {PRESET_AVATARS.map((preset) => {
                    const isSelected = tempAvatarType === 'preset' && tempAvatarValue === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        className={`preset-grid-item ${isSelected ? 'selected' : ''}`}
                        onClick={() => {
                          setTempAvatarType('preset');
                          setTempAvatarValue(preset.id);
                        }}
                        title={preset.name}
                      >
                        <div className="preset-item-svg">
                          {preset.svg({ size: 40 })}
                        </div>
                        <span className="preset-item-name">{preset.name}</span>
                        {isSelected && (
                          <div className="preset-selected-check">
                            <Check style={{ width: 11, height: 11, color: '#ffffff' }} />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Modal Actions */}
              <div className="picker-modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setTempAvatarType('default');
                    setTempAvatarValue('');
                  }}
                  title="Select default device icon"
                >
                  Reset to Default
                </button>
                <div className="picker-actions-right">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={handleCancel}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={handleApply}
                    disabled={isSaving}
                  >
                    Apply
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
