import {
  ArrowLeft,
  FolderOpen,
  Palette,
  Settings as SettingsIcon,
  Type,
  type LucideIcon,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import type { SettingsMenuItem } from '../../types';
import { truncatePath } from '../../utils/pathUtils';
import './Settings.css';

const SETTINGS_MENU: SettingsMenuItem[] = [
  { id: 'general', label: 'General', icon: SettingsIcon },
  { id: 'appearance', label: 'Appearance', icon: Palette },
];

const THEME_OPTIONS: Array<{ value: 'light' | 'dark' | 'system'; label: string }> = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

interface SettingsProps {
  onBack: () => void;
  storagePath: string;
  onChangeStoragePath: (path: string) => Promise<void>;
  fontFamily: string;
  onChangeFontFamily: (fontFamily: string) => void;
  theme: 'light' | 'dark' | 'system';
  onChangeTheme: (theme: 'light' | 'dark' | 'system') => void;
}

function Settings({
  onBack,
  storagePath,
  onChangeStoragePath,
  fontFamily,
  onChangeFontFamily,
  theme,
  onChangeTheme,
}: SettingsProps) {
  const [activeTab, setActiveTab] = useState('general');
  const [fontInput, setFontInput] = useState(fontFamily || '');
  const [localFonts, setLocalFonts] = useState<string[]>([]);
  const [localFontsStatus, setLocalFontsStatus] = useState<'idle' | 'loading' | 'loaded' | 'unsupported' | 'error'>('idle');
  const [localFontsError, setLocalFontsError] = useState('');

  const loadLocalFonts = useCallback(async () => {
    const queryLocalFonts = window.queryLocalFonts;
    if (!queryLocalFonts) {
      setLocalFontsStatus('unsupported');
      return;
    }

    setLocalFontsStatus('loading');
    setLocalFontsError('');

    try {
      const fonts = await queryLocalFonts();
      const families = [...new Set(
        fonts
          .map((font) => font.family)
          .filter((family): family is string => Boolean(family && family.trim()))
      )]
        .map((family) => family.trim())
        .sort((a, b) => a.localeCompare(b));
      setLocalFonts(families);
      setLocalFontsStatus('loaded');
    } catch (err) {
      setLocalFontsStatus('error');
      setLocalFontsError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const fontSuggestions = useMemo(() => {
    if (localFontsStatus !== 'loaded' || localFonts.length === 0) return [];
    const query = fontInput.trim().toLowerCase();
    if (!query) return localFonts.slice(0, 12);
    return localFonts.filter((font) => font.toLowerCase().includes(query)).slice(0, 12);
  }, [fontInput, localFonts, localFontsStatus]);

  const handleChangeSaveLocation = useCallback(async () => {
    const selectedPath = await window.electronAPI.selectDirectory();
    if (!selectedPath) return;
    await onChangeStoragePath(selectedPath);
  }, [onChangeStoragePath]);

  const renderGeneralSettings = () => (
    <>
      <h1 className="settings-page-title">General</h1>
      <p className="settings-page-description">
        Manage where your notes are stored.
      </p>

      <section className="settings-section">
        <h3 className="settings-section-title">Storage</h3>

        <div className="settings-item">
          <div className="settings-item-info">
            <span className="settings-item-label">Notes folder</span>
            <span className="settings-item-description" title={storagePath}>
              {truncatePath(storagePath || '~/Documents/Notes')}
            </span>
          </div>
          <button className="settings-btn" type="button" onClick={handleChangeSaveLocation}>
            <FolderOpen size={16} />
            <span>Change</span>
          </button>
        </div>
      </section>
    </>
  );

  const renderAppearanceSettings = () => (
    <>
      <h1 className="settings-page-title">Appearance</h1>
      <p className="settings-page-description">
        Customize the look and feel of the application.
      </p>

      <section className="settings-section">
        <h3 className="settings-section-title">Theme</h3>

        <div className="settings-item">
          <div className="settings-item-info">
            <span className="settings-item-label">Color theme</span>
            <span className="settings-item-description">
              Choose light, dark, or follow system preference.
            </span>
          </div>
          <select
            className="settings-select"
            value={theme}
            onChange={(event) => onChangeTheme(event.target.value as 'light' | 'dark' | 'system')}
          >
            {THEME_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="settings-section">
        <h3 className="settings-section-title">Typography</h3>

        <div className="settings-item settings-item-column">
          <div className="settings-item-info">
            <span className="settings-item-label">Application font</span>
            <span className="settings-item-description">
              Applies to the entire app, including the editor and code blocks.
            </span>
          </div>

          <div className="settings-font-controls">
            <input
              className="settings-input"
              type="text"
              placeholder="Search or enter a font family name..."
              value={fontInput}
              onChange={(event) => setFontInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                onChangeFontFamily(fontInput.trim());
              }}
            />
            <button className="settings-btn" type="button" onClick={() => onChangeFontFamily(fontInput.trim())}>
              Apply
            </button>
            <button
              className="settings-btn settings-btn-secondary"
              type="button"
              onClick={() => {
                setFontInput('');
                onChangeFontFamily('');
              }}
              disabled={!fontFamily}
            >
              Reset
            </button>
          </div>

          <div className="settings-font-meta">
            <span>Current: {fontFamily || 'System default'}</span>
            {localFontsStatus === 'loaded' && <span>• {localFonts.length} fonts</span>}
            {localFontsStatus === 'loading' && <span>• Loading system fonts...</span>}
            {localFontsStatus === 'unsupported' && <span>• System font list unavailable</span>}
            {localFontsStatus === 'error' && <span>• Failed to load fonts</span>}
          </div>

          {localFontsStatus === 'error' && localFontsError && (
            <div className="settings-font-error">{localFontsError}</div>
          )}

          {(localFontsStatus === 'idle' || localFontsStatus === 'error' || localFontsStatus === 'unsupported') && (
            <div className="settings-font-actions">
              <button className="settings-btn" type="button" onClick={() => void loadLocalFonts()}>
                Load system fonts
              </button>
            </div>
          )}

          {localFontsStatus === 'loaded' && fontSuggestions.length > 0 && (
            <div className="settings-font-suggestions">
              {fontSuggestions.map((font) => (
                <button
                  key={font}
                  type="button"
                  className={`settings-font-suggestion ${fontFamily === font ? 'active' : ''}`}
                  onClick={() => {
                    setFontInput(font);
                    onChangeFontFamily(font);
                  }}
                  title={font}
                >
                  <Type size={14} />
                  <span>{font}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );

  const renderContent = () => {
    if (activeTab === 'appearance') {
      return renderAppearanceSettings();
    }
    return renderGeneralSettings();
  };

  return (
    <div className="settings">
      <aside className="settings-sidebar">
        <div className="settings-header">
          <button className="settings-back-btn" type="button" onClick={onBack}>
            <ArrowLeft size={18} />
          </button>
          <h2 className="settings-title">Settings</h2>
        </div>

        <nav className="settings-nav">
          {SETTINGS_MENU.map((item) => {
            const Icon = item.icon as LucideIcon;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                className={`settings-nav-item ${isActive ? 'active' : ''}`}
                type="button"
                onClick={() => {
                  setActiveTab(item.id);
                  if (item.id === 'appearance' && localFontsStatus === 'idle') {
                    void loadLocalFonts();
                  }
                }}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <main className="settings-content">
        {renderContent()}
      </main>
    </div>
  );
}

export default Settings;
