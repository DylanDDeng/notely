import { 
  ArrowLeft, 
  Settings as SettingsIcon, 
  Palette, 
  Cloud, 
  Type, 
  Keyboard, 
  Info,
  type LucideIcon
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AppSettings, SettingsMenuItem } from '../../types';
import './Settings.css';

const SETTINGS_MENU: SettingsMenuItem[] = [
  { id: 'general', label: 'General', icon: SettingsIcon },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'sync', label: 'Sync & Backup', icon: Cloud },
  { id: 'editor', label: 'Editor', icon: Type },
  { id: 'shortcuts', label: 'Keyboard Shortcuts', icon: Keyboard },
  { id: 'about', label: 'About', icon: Info },
];

const AUTO_SAVE_OPTIONS = [
  { value: 10000, label: '10 seconds' },
  { value: 30000, label: '30 seconds' },
  { value: 60000, label: '1 minute' },
  { value: 300000, label: '5 minutes' },
];

interface SettingsProps {
  onBack: () => void;
  storagePath: string;
  onChangeStoragePath: (path: string) => Promise<void>;
  fontFamily: string;
  onChangeFontFamily: (fontFamily: string) => void;
  wechatAiApiKey: string;
  wechatAiModel: string;
  onChangeWechatAiApiKey: (apiKey: string) => void;
  onChangeWechatAiModel: (model: string) => void;
}

const DEFAULT_WECHAT_AI_MODEL = 'kimi-k2.5';

function Settings({
  onBack,
  storagePath,
  onChangeStoragePath,
  fontFamily,
  onChangeFontFamily,
  wechatAiApiKey,
  wechatAiModel,
  onChangeWechatAiApiKey,
  onChangeWechatAiModel,
}: SettingsProps) {
  const [activeTab, setActiveTab] = useState('general');
  const [settings, setSettings] = useState<AppSettings>({
    launchAtStartup: true,
    showInMenuBar: false,
    autoSaveInterval: 30000,
    saveLocation: storagePath || '~/Documents/Notes',
  });
  const [fontInput, setFontInput] = useState(fontFamily || '');
  const [localFonts, setLocalFonts] = useState<string[]>([]);
  const [localFontsStatus, setLocalFontsStatus] = useState<'idle' | 'loading' | 'loaded' | 'unsupported' | 'error'>('idle');
  const [localFontsError, setLocalFontsError] = useState('');
  const [wechatApiKeyInput, setWechatApiKeyInput] = useState(wechatAiApiKey || '');
  const [wechatModelInput, setWechatModelInput] = useState(wechatAiModel || DEFAULT_WECHAT_AI_MODEL);
  const [showWechatApiKey, setShowWechatApiKey] = useState(false);

  useEffect(() => {
    if (!storagePath) return;
    setSettings(prev => ({ ...prev, saveLocation: storagePath }));
  }, [storagePath]);

  useEffect(() => {
    setFontInput(fontFamily || '');
  }, [fontFamily]);

  useEffect(() => {
    setWechatApiKeyInput(wechatAiApiKey || '');
  }, [wechatAiApiKey]);

  useEffect(() => {
    setWechatModelInput(wechatAiModel || DEFAULT_WECHAT_AI_MODEL);
  }, [wechatAiModel]);

  const handleToggle = (key: keyof AppSettings) => {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleAutoSaveChange = (value: string) => {
    setSettings(prev => ({ ...prev, autoSaveInterval: parseInt(value) }));
  };

  const handleChangeSaveLocation = async () => {
    const selectedPath = await window.electronAPI.selectDirectory();
    if (!selectedPath) return;
    await onChangeStoragePath(selectedPath);
  };

  const loadLocalFonts = useCallback(async () => {
    const queryLocalFonts = (window as any).queryLocalFonts as undefined | (() => Promise<Array<{ family?: string }>>);
    if (!queryLocalFonts) {
      setLocalFontsStatus('unsupported');
      return;
    }

    setLocalFontsStatus('loading');
    setLocalFontsError('');

    try {
      const fonts = await queryLocalFonts();
      const families = [...new Set(fonts.map(font => font.family).filter((family): family is string => Boolean(family && family.trim())))]
        .map(family => family.trim())
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
    return localFonts
      .filter(font => font.toLowerCase().includes(query))
      .slice(0, 12);
  }, [fontInput, localFonts, localFontsStatus]);

  const applyWechatApiKey = useCallback(() => {
    onChangeWechatAiApiKey(wechatApiKeyInput);
  }, [onChangeWechatAiApiKey, wechatApiKeyInput]);

  const clearWechatApiKey = useCallback(() => {
    setWechatApiKeyInput('');
    onChangeWechatAiApiKey('');
  }, [onChangeWechatAiApiKey]);

  const applyWechatModel = useCallback(() => {
    onChangeWechatAiModel(wechatModelInput);
  }, [onChangeWechatAiModel, wechatModelInput]);

  const resetWechatModel = useCallback(() => {
    setWechatModelInput(DEFAULT_WECHAT_AI_MODEL);
    onChangeWechatAiModel(DEFAULT_WECHAT_AI_MODEL);
  }, [onChangeWechatAiModel]);

  const renderGeneralSettings = () => (
    <>
      <h1 className="settings-page-title">General</h1>
      <p className="settings-page-description">
        Customize your general preferences and application behavior
      </p>

      <section className="settings-section">
        <h3 className="settings-section-title">Application</h3>
        
        <div className="settings-item">
          <div className="settings-item-info">
            <span className="settings-item-label">Launch at startup</span>
            <span className="settings-item-description">
              Automatically open Notely when you log in
            </span>
          </div>
          <label className="toggle">
            <input
              type="checkbox"
              checked={settings.launchAtStartup}
              onChange={() => handleToggle('launchAtStartup')}
            />
            <span className="toggle-slider" />
          </label>
        </div>

        <div className="settings-item">
          <div className="settings-item-info">
            <span className="settings-item-label">Show in menu bar</span>
            <span className="settings-item-description">
              Display Notely icon in the macOS menu bar
            </span>
          </div>
          <label className="toggle">
            <input
              type="checkbox"
              checked={settings.showInMenuBar}
              onChange={() => handleToggle('showInMenuBar')}
            />
            <span className="toggle-slider" />
          </label>
        </div>

        <div className="settings-item">
          <div className="settings-item-info">
            <span className="settings-item-label">Quick note shortcut</span>
            <span className="settings-item-description">
              Press this shortcut to quickly create a new note
            </span>
          </div>
          <span className="keyboard-shortcut">⌘ + Shift + N</span>
        </div>
      </section>

      <section className="settings-section">
        <h3 className="settings-section-title">Storage</h3>
        
        <div className="settings-item">
          <div className="settings-item-info">
            <span className="settings-item-label">Default save location</span>
            <span className="settings-item-description">{settings.saveLocation}</span>
          </div>
          <button className="settings-btn" onClick={handleChangeSaveLocation}>Change</button>
        </div>

        <div className="settings-item">
          <div className="settings-item-info">
            <span className="settings-item-label">Auto-save interval</span>
            <span className="settings-item-description">
              How often to automatically save your notes
            </span>
          </div>
          <select
            className="settings-select"
            value={settings.autoSaveInterval}
            onChange={(e) => handleAutoSaveChange(e.target.value)}
          >
            {AUTO_SAVE_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </section>
    </>
  );

  const renderAppearanceSettings = () => (
    <>
      <h1 className="settings-page-title">Appearance</h1>
      <p className="settings-page-description">
        Customize the look and feel of the application
      </p>

      <section className="settings-section">
        <h3 className="settings-section-title">Typography</h3>

        <div className="settings-item settings-item-column">
          <div className="settings-item-info">
            <span className="settings-item-label">Application font</span>
            <span className="settings-item-description">
              Applies to the entire app (including editor and code blocks)
            </span>
          </div>

          <div className="settings-font-controls">
            <input
              className="settings-input"
              type="text"
              placeholder="Search or enter a font family name..."
              value={fontInput}
              onChange={(e) => setFontInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                onChangeFontFamily(fontInput.trim());
              }}
            />
            <button
              className="settings-btn"
              onClick={() => onChangeFontFamily(fontInput.trim())}
            >
              Apply
            </button>
            <button
              className="settings-btn settings-btn-secondary"
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
            <span>
              Current: {fontFamily ? fontFamily : 'System default'}
            </span>
            {localFontsStatus === 'loaded' && (
              <span>• {localFonts.length} fonts</span>
            )}
            {localFontsStatus === 'loading' && (
              <span>• Loading system fonts…</span>
            )}
            {localFontsStatus === 'unsupported' && (
              <span>• System font list unavailable</span>
            )}
            {localFontsStatus === 'error' && (
              <span>• Failed to load fonts</span>
            )}
          </div>

          {localFontsStatus === 'error' && localFontsError && (
            <div className="settings-font-error">
              {localFontsError}
            </div>
          )}

          {(localFontsStatus === 'idle' || localFontsStatus === 'error' || localFontsStatus === 'unsupported') && (
            <div className="settings-font-actions">
              <button
                className="settings-btn"
                onClick={() => loadLocalFonts()}
              >
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
                  {font}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );

  const renderEditorSettings = () => (
    <>
      <h1 className="settings-page-title">Editor</h1>
      <p className="settings-page-description">
        Configure AI-powered WeChat layout generation
      </p>

      <section className="settings-section">
        <h3 className="settings-section-title">AI WeChat Layout</h3>

        <div className="settings-item settings-item-column">
          <div className="settings-item-info">
            <span className="settings-item-label">Model</span>
            <span className="settings-item-description">
              Used by AI to generate WeChat-ready HTML
            </span>
          </div>
          <div className="settings-font-controls">
            <input
              className="settings-input"
              type="text"
              placeholder={DEFAULT_WECHAT_AI_MODEL}
              value={wechatModelInput}
              onChange={(e) => setWechatModelInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                applyWechatModel();
              }}
              onBlur={applyWechatModel}
            />
            <button
              className="settings-btn"
              onClick={applyWechatModel}
            >
              Apply
            </button>
            <button
              className="settings-btn settings-btn-secondary"
              onClick={resetWechatModel}
              disabled={(wechatAiModel || DEFAULT_WECHAT_AI_MODEL) === DEFAULT_WECHAT_AI_MODEL}
            >
              Reset
            </button>
          </div>
          <div className="settings-font-meta">
            <span>Current: {wechatAiModel || DEFAULT_WECHAT_AI_MODEL}</span>
          </div>
        </div>

        <div className="settings-item settings-item-column">
          <div className="settings-item-info">
            <span className="settings-item-label">Moonshot API Key</span>
            <span className="settings-item-description">
              Required before using AI WeChat layout in the editor menu
            </span>
          </div>
          <div className="settings-font-controls">
            <input
              className="settings-input"
              type={showWechatApiKey ? 'text' : 'password'}
              placeholder="sk-..."
              value={wechatApiKeyInput}
              onChange={(e) => setWechatApiKeyInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                applyWechatApiKey();
              }}
              onBlur={applyWechatApiKey}
              autoComplete="off"
              spellCheck={false}
            />
            <button
              className="settings-btn settings-btn-secondary"
              onClick={() => setShowWechatApiKey((prev) => !prev)}
              type="button"
            >
              {showWechatApiKey ? 'Hide' : 'Show'}
            </button>
            <button
              className="settings-btn"
              onClick={applyWechatApiKey}
              type="button"
            >
              Save
            </button>
            <button
              className="settings-btn settings-btn-secondary"
              onClick={clearWechatApiKey}
              type="button"
              disabled={!wechatAiApiKey}
            >
              Clear
            </button>
          </div>
          <div className="settings-font-meta">
            <span>{wechatAiApiKey ? 'Status: Configured' : 'Status: Not configured'}</span>
            <span>• Stored locally on this device</span>
          </div>
        </div>
      </section>
    </>
  );

  const renderPlaceholder = (title: string, description: string) => (
    <>
      <h1 className="settings-page-title">{title}</h1>
      <p className="settings-page-description">{description}</p>
      <div className="settings-placeholder">
        <p>This section is under development...</p>
      </div>
    </>
  );

  const renderContent = () => {
    switch (activeTab) {
      case 'general':
        return renderGeneralSettings();
      case 'appearance':
        return renderAppearanceSettings();
      case 'sync':
        return renderPlaceholder('Sync & Backup', 'Manage your sync and backup preferences');
      case 'editor':
        return renderEditorSettings();
      case 'shortcuts':
        return renderPlaceholder('Keyboard Shortcuts', 'View and customize keyboard shortcuts');
      case 'about':
        return renderPlaceholder('About', 'Information about Notely');
      default:
        return renderGeneralSettings();
    }
  };

  return (
    <div className="settings">
      {/* Sidebar */}
      <aside className="settings-sidebar">
        <div className="settings-header">
          <button className="settings-back-btn" onClick={onBack}>
            <ArrowLeft size={20} />
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

      {/* Content */}
      <main className="settings-content">
        {renderContent()}
      </main>
    </div>
  );
}

export default Settings;
