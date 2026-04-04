import { ArrowLeft, Type, X } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import {
  builtInThemes,
  getActiveThemeId,
  getThemeById,
  applyTheme,
  applySystemTheme,
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
  const [fontInput, setFontInput] = useState(fontFamily || '');
  const [localFonts, setLocalFonts] = useState<string[]>([]);
  const [showFontList, setShowFontList] = useState(false);

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

  const handleThemeChange = useCallback((themeId: string) => {
    setActiveThemeId(themeId);
    
    if (themeId === 'system') {
      applySystemTheme();
    } else {
      const theme = getThemeById(themeId);
      if (theme) applyTheme(theme);
    }
  }, []);

  const activeTheme = getThemeById(activeThemeId);

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
              <h2 className="settings-section-title">Theme</h2>
              
              <div className="settings-field">
                <label>Color Theme</label>
                <div className="theme-select-wrapper">
                  <select 
                    className="theme-select"
                    value={activeThemeId}
                    onChange={(e) => handleThemeChange(e.target.value)}
                  >
                    <option value="system">System</option>
                    {builtInThemes.map((theme) => (
                      <option key={theme.id} value={theme.id}>
                        {theme.name}
                      </option>
                    ))}
                  </select>
                  {activeTheme && (
                    <div 
                      className="theme-color-dot"
                      style={{
                        background: activeTheme.colors['--editor-accent'] || '#000',
                      }}
                    />
                  )}
                </div>
              </div>
            </section>

            {/* Font Section */}
            <section className="settings-section">
              <h2 className="settings-section-title">Font</h2>
              <div className="settings-field font-field">
                <label>Editor Font</label>
                <div className="font-input-wrapper">
                  <Type size={14} className="font-icon" />
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
                    <button
                      className="font-option"
                      onClick={() => { setFontInput(''); onChangeFontFamily(''); setShowFontList(false); }}
                    >
                      System default
                    </button>
                    {localFonts.slice(0, 30).map((font) => (
                      <button
                        key={font}
                        className="font-option"
                        onClick={() => { setFontInput(font); onChangeFontFamily(font); setShowFontList(false); }}
                        style={{ fontFamily: font }}
                      >
                        {font}
                      </button>
                    ))}
                    {localFonts.length > 30 && (
                      <span className="font-more">+{localFonts.length - 30} more</span>
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
    </div>
  );
}
