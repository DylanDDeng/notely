import {
  ArrowLeft,
  Download,
  FolderOpen,
  Palette,
  Plus,
  Settings as SettingsIcon,
  Trash2,
  Type,
  Upload,
  type LucideIcon,
} from 'lucide-react';
import { useCallback, useMemo, useState, useEffect } from 'react';
import type { SettingsMenuItem } from '../../types';
import type { Theme } from '../../themes';
import { truncatePath } from '../../utils/pathUtils';
import {
  builtInThemes,
  getCustomThemes,
  addCustomTheme,
  deleteCustomTheme,
  getActiveThemeId,
  getThemeById,
  applyTheme,
  applySystemTheme,
  exportThemeToJson,
  importThemeFromJson,
  createCustomThemeTemplate,
  duplicateTheme,
} from '../../themes';
import './Settings.css';

const SETTINGS_MENU: SettingsMenuItem[] = [
  { id: 'general', label: 'General', icon: SettingsIcon },
  { id: 'appearance', label: 'Appearance', icon: Palette },
];

interface SettingsProps {
  onBack: () => void;
  storagePath: string;
  onChangeStoragePath: (path: string) => Promise<void>;
  fontFamily: string;
  onChangeFontFamily: (fontFamily: string) => void;
}

function Settings({
  onBack,
  storagePath,
  onChangeStoragePath,
  fontFamily,
  onChangeFontFamily,
}: SettingsProps) {
  const [activeTab, setActiveTab] = useState('general');
  const [fontInput, setFontInput] = useState(fontFamily || '');
  const [localFonts, setLocalFonts] = useState<string[]>([]);
  const [localFontsStatus, setLocalFontsStatus] = useState<'idle' | 'loading' | 'loaded' | 'unsupported' | 'error'>('idle');
  const [localFontsError, setLocalFontsError] = useState('');

  // Theme state
  const [activeThemeId, setActiveThemeId] = useState(getActiveThemeId());
  const [customThemes, setCustomThemes] = useState<Theme[]>(getCustomThemes());
  const [previewThemeId, setPreviewThemeId] = useState<string | null>(null);
  const [isCreatingTheme, setIsCreatingTheme] = useState(false);
  const [newThemeName, setNewThemeName] = useState('');
  const [newThemeBase, setNewThemeBase] = useState('light');
  const [importError, setImportError] = useState('');

  const allThemes = useMemo(() => [...builtInThemes, ...customThemes], [customThemes]);

  // Refresh custom themes when tab changes to appearance
  useEffect(() => {
    if (activeTab === 'appearance') {
      setCustomThemes(getCustomThemes());
      setActiveThemeId(getActiveThemeId());
    }
  }, [activeTab]);

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

  // Theme handlers
  const handleThemeSelect = useCallback((themeId: string) => {
    setPreviewThemeId(null);
    setActiveThemeId(themeId);
    setActiveThemeId(themeId);
    
    if (themeId === 'system') {
      applySystemTheme();
      // Listen for system theme changes
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        applySystemTheme();
      });
    } else {
      const theme = getThemeById(themeId);
      if (theme) {
        applyTheme(theme);
      }
    }
  }, []);

  const handleThemePreview = useCallback((themeId: string) => {
    if (themeId === activeThemeId) return;
    setPreviewThemeId(themeId);
    
    if (themeId === 'system') {
      applySystemTheme();
    } else {
      const theme = getThemeById(themeId);
      if (theme) {
        applyTheme(theme);
      }
    }
  }, [activeThemeId]);

  const handlePreviewCancel = useCallback(() => {
    setPreviewThemeId(null);
    // Revert to active theme
    if (activeThemeId === 'system') {
      applySystemTheme();
    } else {
      const theme = getThemeById(activeThemeId);
      if (theme) {
        applyTheme(theme);
      }
    }
  }, [activeThemeId]);

  const handleCreateTheme = useCallback(() => {
    if (!newThemeName.trim()) return;
    const newTheme = createCustomThemeTemplate(newThemeName.trim(), newThemeBase);
    addCustomTheme(newTheme);
    setCustomThemes(getCustomThemes());
    setIsCreatingTheme(false);
    setNewThemeName('');
    // Auto-select the new theme
    handleThemeSelect(newTheme.id);
  }, [newThemeName, newThemeBase, handleThemeSelect]);

  const handleDuplicateTheme = useCallback((themeId: string) => {
    const sourceTheme = getThemeById(themeId);
    if (!sourceTheme) return;
    const newName = `${sourceTheme.name} Copy`;
    const duplicated = duplicateTheme(themeId, newName);
    if (duplicated) {
      addCustomTheme(duplicated);
      setCustomThemes(getCustomThemes());
      handleThemeSelect(duplicated.id);
    }
  }, [handleThemeSelect]);

  const handleDeleteTheme = useCallback((themeId: string) => {
    if (!confirm('Are you sure you want to delete this custom theme?')) return;
    deleteCustomTheme(themeId);
    setCustomThemes(getCustomThemes());
    // If the deleted theme was active, switch to light
    if (activeThemeId === themeId) {
      handleThemeSelect('light');
    }
  }, [activeThemeId, handleThemeSelect]);

  const handleExportTheme = useCallback((theme: Theme) => {
    const json = exportThemeToJson(theme);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `notely-theme-${theme.id}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  const handleImportTheme = useCallback(async () => {
    setImportError('');
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      
      try {
        const text = await file.text();
        const theme = importThemeFromJson(text);
        if (!theme) {
          setImportError('Invalid theme file format');
          return;
        }
        
        // Generate a new ID to avoid conflicts
        theme.id = `custom-${Date.now()}`;
        const success = addCustomTheme(theme);
        if (success) {
          setCustomThemes(getCustomThemes());
          handleThemeSelect(theme.id);
        } else {
          setImportError('Failed to add theme (ID may already exist)');
        }
      } catch (err) {
        setImportError(err instanceof Error ? err.message : 'Failed to import theme');
      }
    };
    input.click();
  }, [handleThemeSelect]);

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

        <div className="settings-item settings-item-column">
          <div className="settings-item-info">
            <span className="settings-item-label">Color theme</span>
            <span className="settings-item-description">
              Choose from built-in themes or create your own.
            </span>
          </div>

          {/* Theme Grid */}
          <div className="theme-grid">
            {allThemes.map((theme) => (
              <div
                key={theme.id}
                role="button"
                tabIndex={0}
                className={`theme-card ${activeThemeId === theme.id ? 'active' : ''} ${previewThemeId === theme.id ? 'preview' : ''}`}
                onClick={() => handleThemeSelect(theme.id)}
                onMouseEnter={() => handleThemePreview(theme.id)}
                onMouseLeave={handlePreviewCancel}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleThemeSelect(theme.id);
                  }
                }}
              >
                <div 
                  className="theme-preview" 
                  style={{
                    background: theme.colors['--editor-bg'] || '#fff',
                    borderColor: theme.colors['--editor-border'] || '#ddd',
                  }}
                >
                  <div 
                    className="theme-preview-accent" 
                    style={{ background: theme.colors['--editor-accent'] || '#000' }}
                  />
                  <div 
                    className="theme-preview-text" 
                    style={{ background: theme.colors['--editor-text'] || '#000' }}
                  />
                  <div 
                    className="theme-preview-surface" 
                    style={{ background: theme.colors['--editor-surface'] || '#f5f5f5' }}
                  />
                </div>
                <div className="theme-info">
                  <span className="theme-name">{theme.name}</span>
                  {theme.description && (
                    <span className="theme-description">{theme.description}</span>
                  )}
                </div>
                {activeThemeId === theme.id && (
                  <span className="theme-badge">Active</span>
                )}
                {previewThemeId === theme.id && (
                  <span className="theme-badge preview">Preview</span>
                )}
                {!theme.isBuiltIn && (
                  <div className="theme-actions">
                    <button
                      type="button"
                      className="theme-action-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDuplicateTheme(theme.id);
                      }}
                      title="Duplicate theme"
                    >
                      <Plus size={14} />
                    </button>
                    <button
                      type="button"
                      className="theme-action-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleExportTheme(theme);
                      }}
                      title="Export theme"
                    >
                      <Download size={14} />
                    </button>
                    <button
                      type="button"
                      className="theme-action-btn delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteTheme(theme.id);
                      }}
                      title="Delete theme"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
                {theme.isBuiltIn && (
                  <div className="theme-actions">
                    <button
                      type="button"
                      className="theme-action-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDuplicateTheme(theme.id);
                      }}
                      title="Duplicate as custom theme"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Create/Import Theme Buttons */}
          <div className="theme-actions-row">
            <button
              type="button"
              className="settings-btn"
              onClick={() => setIsCreatingTheme(true)}
            >
              <Plus size={16} />
              <span>Create Theme</span>
            </button>
            <button
              type="button"
              className="settings-btn"
              onClick={handleImportTheme}
            >
              <Upload size={16} />
              <span>Import Theme</span>
            </button>
          </div>

          {importError && (
            <div className="settings-theme-error">{importError}</div>
          )}

          {/* Create Theme Modal */}
          {isCreatingTheme && (
            <div className="theme-create-modal">
              <div className="theme-create-content">
                <h4>Create Custom Theme</h4>
                <input
                  type="text"
                  className="settings-input"
                  placeholder="Theme name..."
                  value={newThemeName}
                  onChange={(e) => setNewThemeName(e.target.value)}
                  autoFocus
                />
                <select
                  className="settings-select"
                  value={newThemeBase}
                  onChange={(e) => setNewThemeBase(e.target.value)}
                >
                  <option value="light">Based on Light</option>
                  <option value="dark">Based on Dark</option>
                  <option value="solarized-light">Based on Solarized Light</option>
                  <option value="solarized-dark">Based on Solarized Dark</option>
                  <option value="nord">Based on Nord</option>
                  <option value="dracula">Based on Dracula</option>
                  <option value="github-light">Based on GitHub Light</option>
                  <option value="github-dark">Based on GitHub Dark</option>
                  <option value="one-dark">Based on One Dark</option>
                </select>
                <div className="theme-create-actions">
                  <button
                    type="button"
                    className="settings-btn"
                    onClick={handleCreateTheme}
                    disabled={!newThemeName.trim()}
                  >
                    Create
                  </button>
                  <button
                    type="button"
                    className="settings-btn settings-btn-secondary"
                    onClick={() => {
                      setIsCreatingTheme(false);
                      setNewThemeName('');
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
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
