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
import type {
  AppSettings,
  GitSyncConfig,
  GitSyncCredentialClearResult,
  GitSyncRunRequest,
  GitSyncRunResult,
  GitSyncSetupRequest,
  GitSyncSetupResult,
  GitSyncUpdateSettingsRequest,
  SettingsMenuItem,
} from '../../types';
import { truncatePath } from '../../utils/pathUtils';
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
  wechatMoonshotApiKey: string;
  wechatMoonshotModel: string;
  onChangeWechatMoonshotApiKey: (apiKey: string) => void;
  onChangeWechatMoonshotModel: (model: string) => void;
  wechatOpenRouterApiKey: string;
  wechatOpenRouterModel: string;
  onChangeWechatOpenRouterApiKey: (apiKey: string) => void;
  onChangeWechatOpenRouterModel: (model: string) => void;
  gitSyncConfig: GitSyncConfig | null;
  isGitSyncLoading: boolean;
  onRefreshGitSyncConfig: () => Promise<void>;
  onSetupGitSync: (data: GitSyncSetupRequest) => Promise<GitSyncSetupResult>;
  onRunGitSync: (data: GitSyncRunRequest) => Promise<GitSyncRunResult>;
  onUpdateGitSyncSettings: (data: GitSyncUpdateSettingsRequest) => Promise<GitSyncSetupResult>;
  onClearGitSyncCredential: () => Promise<GitSyncCredentialClearResult>;
}

const DEFAULT_WECHAT_MOONSHOT_MODEL = 'kimi-k2.5';
const DEFAULT_WECHAT_OPENROUTER_MODEL = 'google/gemini-3-pro-preview';
const BUILT_IN_WECHAT_THEMES = [
  'Digital Tools Guide',
  'Minimal Linework',
  'Retro Corporate Archive',
  'Editorial Pick',
];
const DEFAULT_GIT_SYNC_BRANCH = 'main';
const DEFAULT_GIT_SYNC_INTERVAL = 5;
const GIT_SYNC_INTERVAL_OPTIONS = [1, 5, 10, 15, 30, 60];

function Settings({
  onBack,
  storagePath,
  onChangeStoragePath,
  fontFamily,
  onChangeFontFamily,
  theme,
  onChangeTheme,
  wechatMoonshotApiKey,
  wechatMoonshotModel,
  onChangeWechatMoonshotApiKey,
  onChangeWechatMoonshotModel,
  wechatOpenRouterApiKey,
  wechatOpenRouterModel,
  onChangeWechatOpenRouterApiKey,
  onChangeWechatOpenRouterModel,
  gitSyncConfig,
  isGitSyncLoading,
  onRefreshGitSyncConfig,
  onSetupGitSync,
  onRunGitSync,
  onUpdateGitSyncSettings,
  onClearGitSyncCredential,
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
  const [wechatMoonshotApiKeyInput, setWechatMoonshotApiKeyInput] = useState(wechatMoonshotApiKey || '');
  const [wechatMoonshotModelInput, setWechatMoonshotModelInput] = useState(wechatMoonshotModel || DEFAULT_WECHAT_MOONSHOT_MODEL);
  const [showWechatMoonshotApiKey, setShowWechatMoonshotApiKey] = useState(false);
  const [wechatOpenRouterApiKeyInput, setWechatOpenRouterApiKeyInput] = useState(wechatOpenRouterApiKey || '');
  const [wechatOpenRouterModelInput, setWechatOpenRouterModelInput] = useState(wechatOpenRouterModel || DEFAULT_WECHAT_OPENROUTER_MODEL);
  const [showWechatOpenRouterApiKey, setShowWechatOpenRouterApiKey] = useState(false);
  const [gitRemoteUrlInput, setGitRemoteUrlInput] = useState(gitSyncConfig?.remoteUrl || '');
  const [gitBranchInput, setGitBranchInput] = useState(gitSyncConfig?.branch || DEFAULT_GIT_SYNC_BRANCH);
  const [gitTokenInput, setGitTokenInput] = useState('');
  const [showGitToken, setShowGitToken] = useState(false);
  const [gitAutoSyncEnabled, setGitAutoSyncEnabled] = useState(Boolean(gitSyncConfig?.autoSyncEnabled ?? true));
  const [gitSyncIntervalInput, setGitSyncIntervalInput] = useState(
    String(gitSyncConfig?.intervalMinutes ?? DEFAULT_GIT_SYNC_INTERVAL)
  );
  const [gitSyncFeedback, setGitSyncFeedback] = useState('');
  const [gitSyncConflictFiles, setGitSyncConflictFiles] = useState<string[]>(gitSyncConfig?.lastConflictFiles || []);
  const [syncBusyAction, setSyncBusyAction] = useState<null | 'connect' | 'sync' | 'save' | 'clear' | 'refresh'>(null);

  useEffect(() => {
    if (!storagePath) return;
    setSettings(prev => ({ ...prev, saveLocation: storagePath }));
  }, [storagePath]);

  useEffect(() => {
    setFontInput(fontFamily || '');
  }, [fontFamily]);

  useEffect(() => {
    setWechatMoonshotApiKeyInput(wechatMoonshotApiKey || '');
  }, [wechatMoonshotApiKey]);

  useEffect(() => {
    setWechatMoonshotModelInput(wechatMoonshotModel || DEFAULT_WECHAT_MOONSHOT_MODEL);
  }, [wechatMoonshotModel]);

  useEffect(() => {
    setWechatOpenRouterApiKeyInput(wechatOpenRouterApiKey || '');
  }, [wechatOpenRouterApiKey]);

  useEffect(() => {
    setWechatOpenRouterModelInput(wechatOpenRouterModel || DEFAULT_WECHAT_OPENROUTER_MODEL);
  }, [wechatOpenRouterModel]);

  useEffect(() => {
    if (!gitSyncConfig) return;
    setGitRemoteUrlInput(gitSyncConfig.remoteUrl || '');
    setGitBranchInput(gitSyncConfig.branch || DEFAULT_GIT_SYNC_BRANCH);
    setGitAutoSyncEnabled(Boolean(gitSyncConfig.autoSyncEnabled));
    setGitSyncIntervalInput(String(gitSyncConfig.intervalMinutes || DEFAULT_GIT_SYNC_INTERVAL));
    setGitSyncConflictFiles(gitSyncConfig.lastConflictFiles || []);
    if (gitSyncConfig.lastMessage) {
      setGitSyncFeedback(gitSyncConfig.lastMessage);
    }
  }, [gitSyncConfig]);

  const normalizedGitSyncInterval = useMemo(() => {
    const parsed = Number(gitSyncIntervalInput);
    if (!Number.isFinite(parsed)) return DEFAULT_GIT_SYNC_INTERVAL;
    return Math.max(1, Math.min(120, Math.floor(parsed)));
  }, [gitSyncIntervalInput]);

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

  const applyWechatMoonshotApiKey = useCallback(() => {
    onChangeWechatMoonshotApiKey(wechatMoonshotApiKeyInput);
  }, [onChangeWechatMoonshotApiKey, wechatMoonshotApiKeyInput]);

  const clearWechatMoonshotApiKey = useCallback(() => {
    setWechatMoonshotApiKeyInput('');
    onChangeWechatMoonshotApiKey('');
  }, [onChangeWechatMoonshotApiKey]);

  const applyWechatMoonshotModel = useCallback(() => {
    onChangeWechatMoonshotModel(wechatMoonshotModelInput);
  }, [onChangeWechatMoonshotModel, wechatMoonshotModelInput]);

  const resetWechatMoonshotModel = useCallback(() => {
    setWechatMoonshotModelInput(DEFAULT_WECHAT_MOONSHOT_MODEL);
    onChangeWechatMoonshotModel(DEFAULT_WECHAT_MOONSHOT_MODEL);
  }, [onChangeWechatMoonshotModel]);

  const applyWechatOpenRouterApiKey = useCallback(() => {
    onChangeWechatOpenRouterApiKey(wechatOpenRouterApiKeyInput);
  }, [onChangeWechatOpenRouterApiKey, wechatOpenRouterApiKeyInput]);

  const clearWechatOpenRouterApiKey = useCallback(() => {
    setWechatOpenRouterApiKeyInput('');
    onChangeWechatOpenRouterApiKey('');
  }, [onChangeWechatOpenRouterApiKey]);

  const applyWechatOpenRouterModel = useCallback(() => {
    onChangeWechatOpenRouterModel(wechatOpenRouterModelInput);
  }, [onChangeWechatOpenRouterModel, wechatOpenRouterModelInput]);

  const resetWechatOpenRouterModel = useCallback(() => {
    setWechatOpenRouterModelInput(DEFAULT_WECHAT_OPENROUTER_MODEL);
    onChangeWechatOpenRouterModel(DEFAULT_WECHAT_OPENROUTER_MODEL);
  }, [onChangeWechatOpenRouterModel]);

  const handleConnectGitSync = useCallback(async () => {
    const remoteUrl = gitRemoteUrlInput.trim();
    const branch = gitBranchInput.trim() || DEFAULT_GIT_SYNC_BRANCH;
    setSyncBusyAction('connect');
    setGitSyncConflictFiles([]);
    try {
      const result = await onSetupGitSync({
        remoteUrl,
        branch,
        token: gitTokenInput.trim() || undefined,
        autoSyncEnabled: gitAutoSyncEnabled,
        intervalMinutes: normalizedGitSyncInterval,
      });
      setGitSyncFeedback(result.message || (result.success ? 'Git sync connected.' : 'Failed to connect Git sync.'));
      if (result.success) {
        setGitTokenInput('');
      }
    } catch (err) {
      setGitSyncFeedback(err instanceof Error ? err.message : String(err));
    } finally {
      setSyncBusyAction(null);
    }
  }, [
    gitAutoSyncEnabled,
    gitBranchInput,
    gitRemoteUrlInput,
    gitTokenInput,
    normalizedGitSyncInterval,
    onSetupGitSync,
  ]);

  const handleSaveGitSyncSettings = useCallback(async () => {
    setSyncBusyAction('save');
    try {
      const result = await onUpdateGitSyncSettings({
        remoteUrl: gitRemoteUrlInput.trim(),
        branch: gitBranchInput.trim() || DEFAULT_GIT_SYNC_BRANCH,
        autoSyncEnabled: gitAutoSyncEnabled,
        intervalMinutes: normalizedGitSyncInterval,
      });
      setGitSyncFeedback(result.message || (result.success ? 'Git sync settings saved.' : 'Failed to save Git sync settings.'));
    } catch (err) {
      setGitSyncFeedback(err instanceof Error ? err.message : String(err));
    } finally {
      setSyncBusyAction(null);
    }
  }, [
    gitAutoSyncEnabled,
    gitBranchInput,
    gitRemoteUrlInput,
    normalizedGitSyncInterval,
    onUpdateGitSyncSettings,
  ]);

  const handleRunGitSyncNow = useCallback(async () => {
    setSyncBusyAction('sync');
    try {
      const result = await onRunGitSync({ reason: 'manual' });
      setGitSyncFeedback(result.message || (result.success ? 'Sync finished.' : 'Sync failed.'));
      setGitSyncConflictFiles(result.conflictFiles || []);
    } catch (err) {
      setGitSyncFeedback(err instanceof Error ? err.message : String(err));
    } finally {
      setSyncBusyAction(null);
    }
  }, [onRunGitSync]);

  const handleRefreshGitSyncStatus = useCallback(async () => {
    setSyncBusyAction('refresh');
    try {
      await onRefreshGitSyncConfig();
      setGitSyncFeedback('Git sync status refreshed.');
    } catch (err) {
      setGitSyncFeedback(err instanceof Error ? err.message : String(err));
    } finally {
      setSyncBusyAction(null);
    }
  }, [onRefreshGitSyncConfig]);

  const handleClearGitToken = useCallback(async () => {
    setSyncBusyAction('clear');
    setGitSyncConflictFiles([]);
    try {
      const result = await onClearGitSyncCredential();
      setGitSyncFeedback(result.message || (result.success ? 'Git token cleared.' : 'Failed to clear token.'));
      if (result.success) {
        setGitTokenInput('');
      }
    } catch (err) {
      setGitSyncFeedback(err instanceof Error ? err.message : String(err));
    } finally {
      setSyncBusyAction(null);
    }
  }, [onClearGitSyncCredential]);

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
            <span className="settings-item-description" title={settings.saveLocation}>{truncatePath(settings.saveLocation)}</span>
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
        <h3 className="settings-section-title">Theme</h3>

        <div className="settings-item">
          <div className="settings-item-info">
            <span className="settings-item-label">Color theme</span>
            <span className="settings-item-description">
              Choose light, dark, or follow system preference
            </span>
          </div>
          <select
            className="settings-select"
            value={theme}
            onChange={(e) => onChangeTheme(e.target.value as 'light' | 'dark' | 'system')}
          >
            {THEME_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
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
        Configure WeChat layout generation and themes
      </p>

      <section className="settings-section">
        <h3 className="settings-section-title">WeChat Layout Themes</h3>

        <div className="settings-item">
          <div className="settings-item-info">
            <span className="settings-item-label">Built-in themes</span>
            <span className="settings-item-description">
              Available themes for WeChat layout
            </span>
          </div>
          <select className="settings-select" style={{ opacity: 1, cursor: 'default' }}>
            {BUILT_IN_WECHAT_THEMES.map(theme => (
              <option key={theme}>{theme}</option>
            ))}
          </select>
        </div>

        <div className="settings-item settings-item-column">
          <div className="settings-item-info">
            <span className="settings-item-label">Moonshot model</span>
            <span className="settings-item-description">
              This model appears in the Generate WeChat Layout dialog
            </span>
          </div>
          <div className="settings-font-controls">
            <input
              className="settings-input"
              type="text"
              placeholder={DEFAULT_WECHAT_MOONSHOT_MODEL}
              value={wechatMoonshotModelInput}
              onChange={(e) => setWechatMoonshotModelInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                applyWechatMoonshotModel();
              }}
              onBlur={applyWechatMoonshotModel}
            />
            <button
              className="settings-btn"
              onClick={applyWechatMoonshotModel}
            >
              Apply
            </button>
            <button
              className="settings-btn settings-btn-secondary"
              onClick={resetWechatMoonshotModel}
              disabled={(wechatMoonshotModel || DEFAULT_WECHAT_MOONSHOT_MODEL) === DEFAULT_WECHAT_MOONSHOT_MODEL}
            >
              Reset
            </button>
          </div>
          <div className="settings-font-meta">
            <span>Current: {wechatMoonshotModel || DEFAULT_WECHAT_MOONSHOT_MODEL}</span>
          </div>
        </div>

        <div className="settings-item settings-item-column">
          <div className="settings-item-info">
            <span className="settings-item-label">Moonshot API Key</span>
            <span className="settings-item-description">
              Required before using Generate WeChat Layout in the editor menu
            </span>
          </div>
          <div className="settings-font-controls">
            <input
              className="settings-input"
              type={showWechatMoonshotApiKey ? 'text' : 'password'}
              placeholder="sk-..."
              value={wechatMoonshotApiKeyInput}
              onChange={(e) => setWechatMoonshotApiKeyInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                applyWechatMoonshotApiKey();
              }}
              onBlur={applyWechatMoonshotApiKey}
              autoComplete="off"
              spellCheck={false}
            />
            <button
              className="settings-btn settings-btn-secondary"
              onClick={() => setShowWechatMoonshotApiKey((prev) => !prev)}
              type="button"
            >
              {showWechatMoonshotApiKey ? 'Hide' : 'Show'}
            </button>
            <button
              className="settings-btn"
              onClick={applyWechatMoonshotApiKey}
              type="button"
            >
              Save
            </button>
            <button
              className="settings-btn settings-btn-secondary"
              onClick={clearWechatMoonshotApiKey}
              type="button"
              disabled={!wechatMoonshotApiKey}
            >
              Clear
            </button>
          </div>
          <div className="settings-font-meta">
            <span>{wechatMoonshotApiKey ? 'Status: Configured' : 'Status: Not configured'}</span>
            <span>• Stored locally on this device</span>
          </div>
        </div>

        <div className="settings-item settings-item-column">
          <div className="settings-item-info">
            <span className="settings-item-label">OpenRouter model</span>
            <span className="settings-item-description">
              Used when selecting OpenRouter inside the generation dialog
            </span>
          </div>
          <div className="settings-font-controls">
            <input
              className="settings-input"
              type="text"
              placeholder={DEFAULT_WECHAT_OPENROUTER_MODEL}
              value={wechatOpenRouterModelInput}
              onChange={(e) => setWechatOpenRouterModelInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                applyWechatOpenRouterModel();
              }}
              onBlur={applyWechatOpenRouterModel}
            />
            <button
              className="settings-btn"
              onClick={applyWechatOpenRouterModel}
            >
              Apply
            </button>
            <button
              className="settings-btn settings-btn-secondary"
              onClick={resetWechatOpenRouterModel}
              disabled={(wechatOpenRouterModel || DEFAULT_WECHAT_OPENROUTER_MODEL) === DEFAULT_WECHAT_OPENROUTER_MODEL}
            >
              Reset
            </button>
          </div>
          <div className="settings-font-meta">
            <span>Current: {wechatOpenRouterModel || DEFAULT_WECHAT_OPENROUTER_MODEL}</span>
          </div>
        </div>

        <div className="settings-item settings-item-column">
          <div className="settings-item-info">
            <span className="settings-item-label">OpenRouter API Key</span>
            <span className="settings-item-description">
              Required when generating WeChat layout with OpenRouter
            </span>
          </div>
          <div className="settings-font-controls">
            <input
              className="settings-input"
              type={showWechatOpenRouterApiKey ? 'text' : 'password'}
              placeholder="sk-or-..."
              value={wechatOpenRouterApiKeyInput}
              onChange={(e) => setWechatOpenRouterApiKeyInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                applyWechatOpenRouterApiKey();
              }}
              onBlur={applyWechatOpenRouterApiKey}
              autoComplete="off"
              spellCheck={false}
            />
            <button
              className="settings-btn settings-btn-secondary"
              onClick={() => setShowWechatOpenRouterApiKey((prev) => !prev)}
              type="button"
            >
              {showWechatOpenRouterApiKey ? 'Hide' : 'Show'}
            </button>
            <button
              className="settings-btn"
              onClick={applyWechatOpenRouterApiKey}
              type="button"
            >
              Save
            </button>
            <button
              className="settings-btn settings-btn-secondary"
              onClick={clearWechatOpenRouterApiKey}
              type="button"
              disabled={!wechatOpenRouterApiKey}
            >
              Clear
            </button>
          </div>
          <div className="settings-font-meta">
            <span>{wechatOpenRouterApiKey ? 'Status: Configured' : 'Status: Not configured'}</span>
            <span>• Stored locally on this device</span>
          </div>
        </div>
      </section>
    </>
  );

  const renderSyncSettings = () => {
    const syncStatus = gitSyncConfig?.lastStatus || 'idle';
    const lastSyncAt = gitSyncConfig?.lastSyncAt
      ? new Date(gitSyncConfig.lastSyncAt).toLocaleString()
      : 'Never';
    const tokenConfigured = Boolean(gitSyncConfig?.tokenConfigured);
    const actionBusy = Boolean(syncBusyAction);
    const statusClass = `settings-sync-status settings-sync-status-${syncStatus}`;
    const conflictFiles = gitSyncConflictFiles.length > 0 ? gitSyncConflictFiles : (gitSyncConfig?.lastConflictFiles || []);

    return (
      <>
        <h1 className="settings-page-title">Sync & Backup</h1>
        <p className="settings-page-description">
          Sync notes through Git over HTTPS with PAT authentication
        </p>

        <section className="settings-section">
          <h3 className="settings-section-title">Repository</h3>

          <div className="settings-item settings-item-column">
            <div className="settings-item-info">
              <span className="settings-item-label">Remote URL</span>
              <span className="settings-item-description">
                HTTPS repository address (for example: https://github.com/you/notes.git)
              </span>
            </div>
            <input
              className="settings-input"
              type="text"
              placeholder="https://..."
              value={gitRemoteUrlInput}
              onChange={(e) => setGitRemoteUrlInput(e.target.value)}
              spellCheck={false}
            />
          </div>

          <div className="settings-item settings-item-column">
            <div className="settings-item-info">
              <span className="settings-item-label">Branch</span>
              <span className="settings-item-description">
                Default branch used for sync
              </span>
            </div>
            <input
              className="settings-input settings-sync-branch-input"
              type="text"
              placeholder={DEFAULT_GIT_SYNC_BRANCH}
              value={gitBranchInput}
              onChange={(e) => setGitBranchInput(e.target.value)}
              spellCheck={false}
            />
          </div>

          <div className="settings-item settings-item-column">
            <div className="settings-item-info">
              <span className="settings-item-label">Personal Access Token</span>
              <span className="settings-item-description">
                Stored securely on this device via system encryption
              </span>
            </div>
            <div className="settings-font-controls">
              <input
                className="settings-input"
                type={showGitToken ? 'text' : 'password'}
                placeholder="ghp_... / glpat-... / token"
                value={gitTokenInput}
                onChange={(e) => setGitTokenInput(e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
              <button
                className="settings-btn settings-btn-secondary"
                type="button"
                onClick={() => setShowGitToken((prev) => !prev)}
                disabled={actionBusy}
              >
                {showGitToken ? 'Hide' : 'Show'}
              </button>
              <button
                className="settings-btn settings-btn-secondary"
                type="button"
                onClick={handleClearGitToken}
                disabled={actionBusy || !tokenConfigured}
              >
                {syncBusyAction === 'clear' ? 'Clearing...' : 'Clear token'}
              </button>
            </div>
            <div className="settings-font-meta">
              <span>Status: {tokenConfigured ? 'Configured' : 'Not configured'}</span>
              {gitTokenInput.trim() && <span>• New token will be saved on Connect</span>}
            </div>
          </div>
        </section>

        <section className="settings-section">
          <h3 className="settings-section-title">Automatic Sync</h3>

          <div className="settings-item">
            <div className="settings-item-info">
              <span className="settings-item-label">Enable auto sync</span>
              <span className="settings-item-description">
                Run background sync every configured interval
              </span>
            </div>
            <label className="toggle">
              <input
                type="checkbox"
                checked={gitAutoSyncEnabled}
                onChange={(e) => setGitAutoSyncEnabled(e.target.checked)}
                disabled={actionBusy}
              />
              <span className="toggle-slider" />
            </label>
          </div>

          <div className="settings-item">
            <div className="settings-item-info">
              <span className="settings-item-label">Sync interval</span>
              <span className="settings-item-description">
                Minutes between automatic sync runs
              </span>
            </div>
            <select
              className="settings-select"
              value={String(normalizedGitSyncInterval)}
              onChange={(e) => setGitSyncIntervalInput(e.target.value)}
              disabled={actionBusy}
            >
              {GIT_SYNC_INTERVAL_OPTIONS.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes} minute{minutes > 1 ? 's' : ''}
                </option>
              ))}
            </select>
          </div>
        </section>

        <section className="settings-section">
          <h3 className="settings-section-title">Sync Actions</h3>
          <div className="settings-item settings-item-column">
            <div className="settings-sync-actions">
              <button
                className="settings-btn"
                type="button"
                onClick={handleConnectGitSync}
                disabled={actionBusy || !gitRemoteUrlInput.trim()}
              >
                {syncBusyAction === 'connect' ? 'Connecting...' : 'Connect'}
              </button>
              <button
                className="settings-btn settings-btn-secondary"
                type="button"
                onClick={handleSaveGitSyncSettings}
                disabled={actionBusy || !gitRemoteUrlInput.trim()}
              >
                {syncBusyAction === 'save' ? 'Saving...' : 'Save settings'}
              </button>
              <button
                className="settings-btn"
                type="button"
                onClick={handleRunGitSyncNow}
                disabled={actionBusy || isGitSyncLoading || !gitSyncConfig?.enabled}
              >
                {syncBusyAction === 'sync' ? 'Syncing...' : 'Sync now'}
              </button>
              <button
                className="settings-btn settings-btn-secondary"
                type="button"
                onClick={handleRefreshGitSyncStatus}
                disabled={actionBusy || isGitSyncLoading}
              >
                {syncBusyAction === 'refresh' ? 'Refreshing...' : 'Refresh status'}
              </button>
            </div>

            <div className={statusClass}>
              <span className="settings-sync-status-title">
                Status: {syncStatus}
              </span>
              <span>Last sync: {lastSyncAt}</span>
              {gitSyncConfig?.lastMessage && <span>Last result: {gitSyncConfig.lastMessage}</span>}
              {gitSyncFeedback && <span>Latest action: {gitSyncFeedback}</span>}
              {conflictFiles.length > 0 && (
                <div className="settings-sync-conflict">
                  <span>Conflict files: {conflictFiles.join(', ')}</span>
                  <span>Local and remote conflict copies are created automatically in your notes folder.</span>
                </div>
              )}
            </div>
          </div>
        </section>
      </>
    );
  };

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
        return renderSyncSettings();
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
                onClick={() => {
                  setActiveTab(item.id);
                  if (item.id === 'appearance' && localFontsStatus === 'idle') {
                    void loadLocalFonts();
                  }
                  if (item.id === 'sync') {
                    void onRefreshGitSyncConfig();
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
