import { ArrowLeft, Check, Download, Plus, Trash2, Upload, X } from 'lucide-react';
import { useCallback, useMemo, useState, useEffect } from 'react';
import type { Theme } from '../../themes';
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

interface SettingsProps {
  onBack: () => void;
  storagePath: string;
  onChangeStoragePath: (path: string) => Promise<void>;
  fontFamily: string;
  onChangeFontFamily: (fontFamily: string) => void;
}

export default function Settings({
  onBack,
  storagePath,
  onChangeStoragePath,
  fontFamily,
  onChangeFontFamily,
}: SettingsProps) {
  const [activeTab, setActiveTab] = useState<'general' | 'appearance'>('appearance');
  const [activeThemeId, setActiveThemeId] = useState(getActiveThemeId());
  const [customThemes, setCustomThemes] = useState<Theme[]>(getCustomThemes());
  const [fontInput, setFontInput] = useState(fontFamily || '');
  const [localFonts, setLocalFonts] = useState<string[]>([]);
  const [showFontList, setShowFontList] = useState(false);
  
  // Create theme modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newThemeName, setNewThemeName] = useState('');
  const [newThemeBase, setNewThemeBase] = useState('light');
  const [importError, setImportError] = useState('');

  const allThemes = useMemo(() => [...builtInThemes, ...customThemes], [customThemes]);

  useEffect(() => {
    setCustomThemes(getCustomThemes());
    setActiveThemeId(getActiveThemeId());
  }, []);

  // Load system fonts
  useEffect(() => {
    if (activeTab !== 'appearance') return;
    const loadFonts = async () => {
      if (!window.queryLocalFonts) return;
      try {
        const fonts = await window.queryLocalFonts();
        const families = [...new Set(fonts.map((f) => f.family).filter((f): f is string => Boolean(f)))].sort();
        setLocalFonts(families);
      } catch {
        // ignore
      }
    };
    loadFonts();
  }, [activeTab]);

  const handleThemeSelect = useCallback((themeId: string) => {
    setActiveThemeId(themeId);
    
    if (themeId === 'system') {
      applySystemTheme();
    } else {
      const theme = getThemeById(themeId);
      if (theme) applyTheme(theme);
    }
  }, []);

  const handleCreateTheme = useCallback(() => {
    if (!newThemeName.trim()) return;
    const newTheme = createCustomThemeTemplate(newThemeName.trim(), newThemeBase);
    addCustomTheme(newTheme);
    setCustomThemes(getCustomThemes());
    setShowCreateModal(false);
    setNewThemeName('');
    handleThemeSelect(newTheme.id);
  }, [newThemeName, newThemeBase, handleThemeSelect]);

  const handleDuplicateTheme = useCallback((themeId: string) => {
    const source = getThemeById(themeId);
    if (!source) return;
    const duplicated = duplicateTheme(themeId, `${source.name} Copy`);
    if (duplicated) {
      addCustomTheme(duplicated);
      setCustomThemes(getCustomThemes());
      handleThemeSelect(duplicated.id);
    }
  }, [handleThemeSelect]);

  const handleDeleteTheme = useCallback((themeId: string) => {
    if (!confirm('Delete this custom theme?')) return;
    deleteCustomTheme(themeId);
    setCustomThemes(getCustomThemes());
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
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleImportTheme = useCallback(() => {
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
          setImportError('Invalid theme file');
          return;
        }
        theme.id = `custom-${Date.now()}`;
        addCustomTheme(theme);
        setCustomThemes(getCustomThemes());
        handleThemeSelect(theme.id);
      } catch {
        setImportError('Failed to import theme');
      }
    };
    input.click();
  }, [handleThemeSelect]);



  const activeTheme = useMemo(() => getThemeById(activeThemeId), [activeThemeId]);

  return (
    <div className="settings">
      {/* Header */}
      <header className="settings-header">
        <button className="settings-back" onClick={onBack} aria-label="Back">
          <ArrowLeft size={18} />
        </button>
        <h1 className="settings-title">Settings</h1>
      </header>

      {/* Tabs */}
      <nav className="settings-tabs">
        <button
          className={`settings-tab ${activeTab === 'general' ? 'active' : ''}`}
          onClick={() => setActiveTab('general')}
        >
          General
        </button>
        <button
          className={`settings-tab ${activeTab === 'appearance' ? 'active' : ''}`}
          onClick={() => setActiveTab('appearance')}
        >
          Appearance
        </button>
      </nav>

      {/* Content */}
      <main className="settings-body">
        {activeTab === 'general' ? (
          <section className="settings-section">
            <h2 className="settings-section-title">Storage</h2>
            <div className="settings-row">
              <div className="settings-field">
                <label>Notes Folder</label>
                <span className="settings-value">{storagePath || '~/Documents/Notes'}</span>
              </div>
              <button 
                className="settings-button secondary"
                onClick={async () => {
                  const path = await window.electronAPI.selectDirectory();
                  if (path) await onChangeStoragePath(path);
                }}
              >
                Change
              </button>
            </div>
          </section>
        ) : (
          <>
            {/* Theme Section */}
            <section className="settings-section">
              <div className="settings-section-header">
                <h2 className="settings-section-title">Theme</h2>
                {activeTheme && (
                  <span className="settings-active-theme">
                    {activeTheme.name}
                  </span>
                )}
              </div>
              
              <div className="theme-list">
                {allThemes.map((theme) => (
                  <div
                    key={theme.id}
                    className={`theme-item ${activeThemeId === theme.id ? 'active' : ''}`}
                    onClick={() => handleThemeSelect(theme.id)}
                  >
                    <div 
                      className="theme-color-preview"
                      style={{
                        background: theme.colors['--editor-bg'] || '#fff',
                      }}
                    >
                      <div 
                        className="theme-color-accent"
                        style={{ background: theme.colors['--editor-accent'] || '#000' }}
                      />
                    </div>
                    <span className="theme-item-name">{theme.name}</span>
                    {activeThemeId === theme.id && (
                      <Check size={14} className="theme-check" />
                    )}
                    
                    {/* Actions overlay on hover */}
                    <div className="theme-item-actions">
                      {!theme.isBuiltIn && (
                        <>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDuplicateTheme(theme.id); }}
                            title="Duplicate"
                          >
                            <Plus size={12} />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleExportTheme(theme); }}
                            title="Export"
                          >
                            <Download size={12} />
                          </button>
                          <button
                            className="danger"
                            onClick={(e) => { e.stopPropagation(); handleDeleteTheme(theme.id); }}
                            title="Delete"
                          >
                            <Trash2 size={12} />
                          </button>
                        </>
                      )}
                      {theme.isBuiltIn && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDuplicateTheme(theme.id); }}
                          title="Duplicate as custom"
                        >
                          <Plus size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="theme-actions-bar">
                <button className="settings-button" onClick={() => setShowCreateModal(true)}>
                  <Plus size={14} />
                  New Theme
                </button>
                <button className="settings-button secondary" onClick={handleImportTheme}>
                  <Upload size={14} />
                  Import
                </button>
              </div>
              
              {importError && <span className="settings-error">{importError}</span>}
            </section>

            {/* Font Section */}
            <section className="settings-section">
              <h2 className="settings-section-title">Font</h2>
              <div className="settings-field font-field">
                <label>Editor Font</label>
                <div className="font-input-wrapper">
                  <input
                    type="text"
                    value={fontInput}
                    onChange={(e) => setFontInput(e.target.value)}
                    onFocus={() => setShowFontList(true)}
                    placeholder="System default"
                    className="font-input"
                  />
                  {fontInput && (
                    <button 
                      className="font-clear"
                      onClick={() => { setFontInput(''); onChangeFontFamily(''); }}
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
                
                {showFontList && localFonts.length > 0 && (
                  <div className="font-dropdown">
                    {localFonts.slice(0, 20).map((font) => (
                      <button
                        key={font}
                        className="font-option"
                        onClick={() => { setFontInput(font); onChangeFontFamily(font); setShowFontList(false); }}
                        style={{ fontFamily: font }}
                      >
                        {font}
                      </button>
                    ))}
                    {localFonts.length > 20 && (
                      <span className="font-more">+{localFonts.length - 20} more</span>
                    )}
                  </div>
                )}
              </div>
              
              {!fontInput && (
                <span className="settings-hint">
                  Using system default font
                </span>
              )}
            </section>
          </>
        )}
      </main>

      {/* Create Theme Modal */}
      {showCreateModal && (
        <div className="settings-modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Create Custom Theme</h3>
            <input
              type="text"
              placeholder="Theme name"
              value={newThemeName}
              onChange={(e) => setNewThemeName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateTheme()}
              autoFocus
            />
            <select value={newThemeBase} onChange={(e) => setNewThemeBase(e.target.value)}>
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
            <div className="settings-modal-actions">
              <button 
                className="settings-button" 
                onClick={handleCreateTheme}
                disabled={!newThemeName.trim()}
              >
                Create
              </button>
              <button 
                className="settings-button secondary" 
                onClick={() => { setShowCreateModal(false); setNewThemeName(''); }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
