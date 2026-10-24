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
} from 'lucide-react';
import type { LocalProfile, UserSettings } from '../types/subnet';
import { PRESET_AVATARS, getPresetAvatar } from '../utils/avatars';
import UserAvatar from './UserAvatar';

interface SettingsViewProps {
  localProfile: LocalProfile | null;
  settings: UserSettings;
  onUpdateSettings: (newSettings: Partial<UserSettings>) => Promise<UserSettings>;
  onClose: () => void;
  onShowToast: (message: string) => void;
}

export default function SettingsView({
  localProfile,
  settings,
  onUpdateSettings,
  onClose,
  onShowToast,
}: SettingsViewProps): React.JSX.Element {
  // Modal state for changing profile picture
  const [isChangingPicture, setIsChangingPicture] = useState(false);
  const [tempAvatarType, setTempAvatarType] = useState<'default' | 'preset' | 'custom'>(settings.avatarType);
  const [tempAvatarValue, setTempAvatarValue] = useState<string>(settings.avatarValue);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

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

  const currentPreset = settings.avatarType === 'preset' ? getPresetAvatar(settings.avatarValue) : null;

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
