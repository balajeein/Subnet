import React, { useState, useEffect } from 'react';
import {
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
  User,
  Eye,
  EyeOff,
  // Sun,
  // Moon,
  // Monitor,
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
  onShowToast: (message: string) => void;
}

type MediaPermission = 'not-determined' | 'granted' | 'denied' | 'restricted' | 'unknown';

export default function SettingsView({
  localProfile,
  settings,
  networkStatus,
  discoveredPeersCount,
  connectedPeersCount,
  onUpdateSettings,
  onRefreshTechnicalDetails,
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
  const [mediaPermissions, setMediaPermissions] = useState<{
    camera: MediaPermission;
    microphone: MediaPermission;
  }>({ camera: 'unknown', microphone: 'unknown' });
  const [isRefreshingPermissions, setIsRefreshingPermissions] = useState(false);

  useEffect(() => {
    setTempAvatarType(settings.avatarType);
    setTempAvatarValue(settings.avatarValue);
  }, [settings.avatarType, settings.avatarValue]);

  const refreshPermissions = async () => {
    if (!window.subnet?.checkMediaPermissions) return;
    setIsRefreshingPermissions(true);
    try {
      const [camera, microphone] = await Promise.all([
        window.subnet.checkMediaPermissions('camera'),
        window.subnet.checkMediaPermissions('microphone'),
      ]);
      setMediaPermissions({ camera: camera.status, microphone: microphone.status });
    } catch (err) {
      console.error('Failed to check media permissions:', err);
      setMediaPermissions({ camera: 'unknown', microphone: 'unknown' });
    } finally {
      setIsRefreshingPermissions(false);
    }
  };

  useEffect(() => {
    void refreshPermissions();
  }, []);

  const requestPermission = async (type: 'camera' | 'microphone') => {
    if (!window.subnet?.requestMediaPermissions) return;
    try {
      await window.subnet.requestMediaPermissions([type]);
      await refreshPermissions();
    } catch (err: any) {
      onShowToast(err?.message || `Could not request ${type} access`);
    }
  };

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

  const [isLoadingSystemAvatar, setIsLoadingSystemAvatar] = useState(false);

  const handleUseSystemPhoto = async () => {
    setAvatarError(null);
    setIsLoadingSystemAvatar(true);
    try {
      if (window.subnet?.getSystemAvatar) {
        const res = await window.subnet.getSystemAvatar();
        if (res.success && res.dataUrl) {
          setTempAvatarType('custom');
          setTempAvatarValue(res.dataUrl);
          onShowToast('Loaded system account photo');
        } else {
          setAvatarError(res.error || 'No system account photo available.');
        }
      } else {
        setAvatarError('System photo extraction is not available in this environment.');
      }
    } catch (err: any) {
      setAvatarError(err.message || 'Failed to retrieve system account photo');
    } finally {
      setIsLoadingSystemAvatar(false);
    }
  };

  const handleToggleSharing = async () => {
    const current = settings.shareAvatarWithPeers !== false;
    const nextVal = !current;
    try {
      await onUpdateSettings({ shareAvatarWithPeers: nextVal });
      onShowToast(nextVal ? 'Avatar sharing enabled for LAN users' : 'Avatar sharing disabled (users see pastel initials)');
    } catch (err: any) {
      onShowToast(err.message || 'Failed to update sharing preference');
    }
  };

  const handleToggleDiscoverability = async () => {
    const nextValue = settings.peopleCanFindMe === false;
    try {
      await onUpdateSettings({ peopleCanFindMe: nextValue });
      onShowToast(nextValue ? 'People can find you nearby' : 'You are hidden from nearby users');
    } catch (err: any) {
      onShowToast(err.message || 'Failed to update visibility');
    }
  };

  /*
  const handleThemeChange = async (theme: NonNullable<UserSettings['theme']>) => {
    if (settings.theme === theme) return;
    try {
      await onUpdateSettings({ theme });
      onShowToast(`${theme[0].toUpperCase()}${theme.slice(1)} theme enabled`);
    } catch (err: any) {
      onShowToast(err.message || 'Failed to update theme');
    }
  };
  */

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
      let defaultType: 'default' | 'custom' = 'default';
      let defaultValue = '';
      if (window.subnet?.getSystemAvatar) {
        const sys = await window.subnet.getSystemAvatar();
        if (sys.success && sys.dataUrl) {
          defaultType = 'custom';
          defaultValue = sys.dataUrl;
        }
      }
      await onUpdateSettings({
        avatarType: defaultType,
        avatarValue: defaultValue,
      });
      setTempAvatarType(defaultType);
      setTempAvatarValue(defaultValue);
      setIsChangingPicture(false);
      onShowToast(
        defaultType === 'custom'
          ? 'Reset to device account profile picture'
          : 'Reset to default pastel avatar'
      );
    } catch (err: any) {
      setAvatarError(err.message || 'Failed to reset profile picture');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopy = async (fieldKey: string, value: string, label: string) => {
    if (!value || value === 'Unavailable') return;
    try {
      const result = window.subnet?.copyText
        ? await window.subnet.copyText(value)
        : await navigator.clipboard.writeText(value).then(() => ({ success: true, error: undefined }));
      if (!result?.success) throw new Error(result?.error || 'Clipboard write failed');
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
  // const selectedTheme = settings.theme || 'system';

  const localIpDisplay = networkStatus?.localIp || 'Unavailable';
  const portDisplay = networkStatus?.port ? String(networkStatus.port) : 'Unavailable';
  const filePortDisplay = networkStatus?.filePort ? String(networkStatus.filePort) : 'Unavailable';
  const portModeDisplay = networkStatus?.portMode === 'fixed'
    ? 'Fixed'
    : networkStatus?.portMode === 'fallback'
      ? 'Fallback'
      : networkStatus?.portMode === 'ephemeral'
        ? 'Automatic'
        : 'Unavailable';
  const discoveryDisplay = networkStatus?.discovery
    ? `Bonjour ${networkStatus.discovery.bonjour} · UDP ${networkStatus.discovery.udp}`
    : 'Unavailable';
  const firewallHints = networkStatus?.firewallHints || [];
  const peerIdDisplay = localProfile?.id || 'Unavailable';
  const networkStatusDisplay = networkStatus
    ? networkStatus.isRunning
      ? 'Active'
      : 'Inactive'
    : 'Unavailable';
  const isNetworkActive = Boolean(networkStatus?.isRunning);
  const discoveredPeersDisplay =
    typeof discoveredPeersCount === 'number'
      ? `${discoveredPeersCount} ${discoveredPeersCount === 1 ? 'user' : 'users'} discovered`
      : 'Unavailable';
  const connectedPeersDisplay =
    typeof connectedPeersCount === 'number'
      ? `${connectedPeersCount} ${connectedPeersCount === 1 ? 'user' : 'users'} connected`
      : 'Unavailable';

  const permissionLabel = (status: MediaPermission) => {
    switch (status) {
      case 'granted':
        return 'Allowed';
      case 'denied':
        return 'Blocked';
      case 'restricted':
        return 'Restricted';
      case 'not-determined':
        return 'Not enabled';
      default:
        return 'Check settings';
    }
  };

  return (
    <div className="profile-settings-container">
      {/* Top Header */}
      <div className="profile-settings-header">
        <div>
          <h1 className="profile-settings-title">Profile</h1>
          <p className="profile-settings-subtitle">Your profile for nearby Subnet users</p>
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
                fallbackIconColor="#B58AE8"
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
                <h2 className="profile-display-name">{localProfile?.name || 'This device'}</h2>
                <span className="profile-device-badge">Device profile</span>
              </div>
              <p className="profile-identity-desc">
                Your device name is shared when you are discoverable.
              </p>
              <div className="profile-status-desc">
                {settings.avatarType === 'preset' && currentPreset ? (
                  <span className="avatar-status-pill">
                    <Sparkles style={{ width: 13, height: 13, color: '#B58AE8' }} />
                    Preset Avatar: {currentPreset.name}
                  </span>
                ) : settings.avatarType === 'custom' ? (
                  <span className="avatar-status-pill">
                    <Check style={{ width: 13, height: 13, color: '#10b981' }} />
                    Custom Profile Photo
                  </span>
                ) : (
                  <span className="avatar-status-pill">
                    <ShieldCheck style={{ width: 13, height: 13, color: '#94a3b8' }} />
                    Default Pastel Avatar
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* User preferences */}
          <div className="profile-sharing-row">
            <div className="profile-sharing-info">
              <span className="profile-sharing-title">Share profile photo</span>
              <span className="profile-sharing-subtitle">
                Let nearby users see your avatar.
              </span>
            </div>
            <label className="apple-switch" title="Toggle profile photo sharing">
              <input
                type="checkbox"
                checked={settings.shareAvatarWithPeers !== false}
                onChange={handleToggleSharing}
              />
              <span className="apple-switch-slider" />
            </label>
          </div>

          <div className="profile-sharing-row profile-visibility-row">
            <div className="profile-sharing-info">
              <span className="profile-sharing-title profile-preference-title">
                {settings.peopleCanFindMe === false ? (
                  <EyeOff style={{ width: 15, height: 15 }} aria-hidden="true" />
                ) : (
                  <Eye style={{ width: 15, height: 15 }} aria-hidden="true" />
                )}
                <span>People find me</span>
              </span>
              <span className="profile-sharing-subtitle">
                Show this device in New Chat and on the radar.
              </span>
            </div>
            <label className="apple-switch" title="Toggle whether people can find you">
              <input
                type="checkbox"
                checked={settings.peopleCanFindMe !== false}
                onChange={handleToggleDiscoverability}
              />
              <span className="apple-switch-slider" />
            </label>
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

        {/*
        <div className="profile-card profile-theme-card">
          <div className="profile-card-heading">
            <div>
              <h2 className="profile-card-title">Appearance</h2>
              <p className="profile-card-subtitle">Choose how Subnet looks on this device.</p>
            </div>
          </div>

          <div className="theme-options-grid" role="radiogroup" aria-label="Theme preference">
            {([
              { value: 'light', label: 'Light', description: 'Bright and airy', Icon: Sun },
              { value: 'dark', label: 'Dark', description: 'Soft and low-light', Icon: Moon },
              { value: 'system', label: 'System', description: 'Follow device setting', Icon: Monitor },
            ] as const).map(({ value, label, description, Icon }) => (
              <button
                key={value}
                type="button"
                className={`theme-card-option ${selectedTheme === value ? 'selected' : ''}`}
                onClick={() => handleThemeChange(value)}
                role="radio"
                aria-checked={selectedTheme === value}
              >
                <Icon style={{ width: 18, height: 18 }} aria-hidden="true" />
                <span className="theme-card-name">{label}</span>
                <span className="theme-card-desc">{description}</span>
              </button>
            ))}
          </div>
        </div>
        */}

        <div className="profile-card profile-permissions-card">
          <div className="profile-card-heading">
            <div>
              <h2 className="profile-card-title">Permissions</h2>
              <p className="profile-card-subtitle">
                Subnet uses these permissions for discovery and media sharing.
              </p>
            </div>
            <button
              type="button"
              className="tech-refresh-btn profile-permissions-refresh"
              onClick={() => void refreshPermissions()}
              disabled={isRefreshingPermissions}
              title="Refresh permission status"
            >
              <RefreshCw
                className={isRefreshingPermissions ? 'spinning' : ''}
                style={{ width: 13, height: 13 }}
              />
              <span>Refresh</span>
            </button>
          </div>

          <div className="profile-permissions-list">
            <div className="profile-permission-row">
              <div className="profile-permission-icon"><ShieldCheck size={17} /></div>
              <div className="profile-permission-meta">
                <span className="profile-permission-title">Local Network</span>
                <span className="profile-permission-description">
                  Needed to find and connect with nearby users. Enable Subnet in System Settings → Privacy &amp; Security → Local Network.
                </span>
              </div>
              <span className="profile-permission-status required">Required</span>
            </div>

            {(['camera', 'microphone'] as const).map((type) => {
              const status = mediaPermissions[type];
              return (
                <div className="profile-permission-row" key={type}>
                  <div className="profile-permission-icon"><Camera size={17} /></div>
                  <div className="profile-permission-meta">
                    <span className="profile-permission-title">
                      {type === 'camera' ? 'Camera' : 'Microphone'}
                    </span>
                    <span className="profile-permission-description">
                      Used for {type === 'camera' ? 'photos and videos' : 'audio in recorded videos'}.
                    </span>
                  </div>
                  <div className="profile-permission-actions">
                    <span className={`profile-permission-status ${status === 'granted' ? 'granted' : status === 'denied' || status === 'restricted' ? 'denied' : 'pending'}`}>
                      {permissionLabel(status)}
                    </span>
                    {status !== 'granted' && window.subnet?.requestMediaPermissions && (
                      <button
                        type="button"
                        className="profile-permission-request"
                        onClick={() => void requestPermission(type)}
                      >
                        Allow
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
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
                <Cpu style={{ width: 18, height: 18, color: '#B58AE8' }} />
              </div>
              <div className="tech-toggle-meta">
                <h3 className="tech-details-title">General</h3>
                <p className="tech-details-subtitle">
                  Connection details and discovery status
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
                      <span className="tech-detail-hint">Current connection state</span>
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
                      <span className="tech-detail-hint">Address used for local connections</span>
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
                      <span className="tech-detail-hint">Port used for local connections</span>
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

                {/* 4. File Transfer Port */}
                <div className="tech-detail-row">
                  <div className="tech-detail-label-col">
                    <span className="tech-detail-label">File Transfer Port</span>
                    <span className="tech-detail-hint">Port used for large file transfers</span>
                  </div>
                  <div className="tech-detail-value-col">
                    <span className="tech-code-value">{filePortDisplay}</span>
                    {filePortDisplay !== 'Unavailable' && (
                      <button
                        type="button"
                        className={`tech-copy-btn ${copiedField === 'file-port' ? 'copied' : ''}`}
                        onClick={() => handleCopy('file-port', filePortDisplay, 'File Transfer Port')}
                        title={copiedField === 'file-port' ? 'Copied!' : 'Copy File Transfer Port'}
                      >
                        {copiedField === 'file-port' ? (
                          <Check style={{ width: 12, height: 12, color: '#10b981' }} />
                        ) : (
                          <Copy style={{ width: 12, height: 12 }} />
                        )}
                        <span>{copiedField === 'file-port' ? 'Copied' : 'Copy'}</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* 5. Port Mode */}
                <div className="tech-detail-row">
                  <div className="tech-detail-label-col">
                    <span className="tech-detail-label">Port Mode</span>
                    <span className="tech-detail-hint">How the control port was selected</span>
                  </div>
                  <div className="tech-detail-value-col">
                    <span className="tech-metric-value">{portModeDisplay}</span>
                  </div>
                </div>

                {/* 6. Discovery */}
                <div className="tech-detail-row">
                  <div className="tech-detail-label-col">
                    <span className="tech-detail-label">Discovery</span>
                    <span className="tech-detail-hint">Ways Subnet finds users nearby</span>
                  </div>
                  <div className="tech-detail-value-col">
                    <span className="tech-metric-value tech-discovery-value">{discoveryDisplay}</span>
                  </div>
                </div>

                {/* 7. Local User ID */}
                <div className="tech-detail-row">
                  <div className="tech-detail-label-col">
                    <span className="tech-detail-label">Local User ID</span>
                      <span className="tech-detail-hint">Unique ID for this device</span>
                  </div>
                  <div className="tech-detail-value-col">
                    <span className="tech-code-value tech-code-id" title={peerIdDisplay}>
                      {peerIdDisplay}
                    </span>
                    {peerIdDisplay !== 'Unavailable' && (
                      <button
                        type="button"
                        className={`tech-copy-btn ${copiedField === 'id' ? 'copied' : ''}`}
                        onClick={() => handleCopy('id', peerIdDisplay, 'User ID')}
                        title={copiedField === 'id' ? 'Copied!' : 'Copy User ID'}
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

                {/* 8. Nearby Users */}
                <div className="tech-detail-row">
                  <div className="tech-detail-label-col">
                    <span className="tech-detail-label">Nearby Users</span>
                      <span className="tech-detail-hint">Users currently visible nearby</span>
                  </div>
                  <div className="tech-detail-value-col">
                    <span className="tech-metric-value">{discoveredPeersDisplay}</span>
                  </div>
                </div>

                {/* 9. Connected Users */}
                <div className="tech-detail-row">
                  <div className="tech-detail-label-col">
                    <span className="tech-detail-label">Connected Users</span>
                      <span className="tech-detail-hint">Active user connections</span>
                  </div>
                  <div className="tech-detail-value-col">
                    <span className="tech-metric-value">{connectedPeersDisplay}</span>
                  </div>
                </div>

                {/* 10. Transport */}
                <div className="tech-detail-row">
                  <div className="tech-detail-label-col">
                    <span className="tech-detail-label">Transport</span>
                      <span className="tech-detail-hint">Connection method</span>
                  </div>
                  <div className="tech-detail-value-col">
                    <span className="tech-metric-badge">WebSocket over LAN</span>
                  </div>
                </div>
              </div>
              {firewallHints.length > 0 && (
                <div className="tech-diagnostics-note" role="status">
                  <span className="tech-diagnostics-note-title">Connection checks</span>
                  <ul>
                    {firewallHints.map((hint) => <li key={hint}>{hint}</li>)}
                  </ul>
                </div>
              )}
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
                    fallbackIconColor="#B58AE8"
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

              {/* Photo Sources: OS Account Picture & Local File Picker */}
              <div className="picker-photo-sources">
                <button
                  type="button"
                  className="btn-use-os-avatar"
                  onClick={handleUseSystemPhoto}
                  disabled={isLoadingSystemAvatar}
                  title="Retrieve account photo from macOS System Settings"
                >
                  <User style={{ width: 15, height: 15 }} />
                  <span>{isLoadingSystemAvatar ? 'Reading Account Photo...' : 'Use macOS Account Photo'}</span>
                </button>

                <button
                  type="button"
                  className="btn-choose-mac"
                  onClick={handleChooseFromMac}
                  title="Choose a photo file from your Mac"
                >
                  <Upload style={{ width: 15, height: 15 }} />
                  <span>Choose Photo File...</span>
                </button>
              </div>
              <span className="picker-hint">PNG, JPEG, WebP, or GIF (max 10MB, auto-compressed to 96×96)</span>

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
                  onClick={async () => {
                    if (window.subnet?.getSystemAvatar) {
                      const sys = await window.subnet.getSystemAvatar();
                      if (sys.success && sys.dataUrl) {
                        setTempAvatarType('custom');
                        setTempAvatarValue(sys.dataUrl);
                        return;
                      }
                    }
                    setTempAvatarType('default');
                    setTempAvatarValue('');
                  }}
                  title="Reset to default device profile picture"
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
