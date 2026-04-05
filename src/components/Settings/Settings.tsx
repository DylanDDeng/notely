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
  const [activeThemeId, setActiveThemeId] = useState(getActiveThemeId());
  const [fontInput, setFontInput] = useState(fontFamily || '');
  const [localFonts, setLocalFonts] = useState<string[]>([]);
  const [showFontList, setShowFontList] = useState(false);

  // Load system fonts
  useEffect(() => {
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
  }, []);

  const handleThemeChange = useCallback((themeId: string) => {
    setActiveThemeId(themeId);
    
    if (themeId === 'system') {
      applySystemTheme();
    } else {
      const theme = getThemeById(themeId);
      if (theme) applyTheme(theme);
    }
  }, []);

  // Close when clicking backdrop
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onBack();
    }
  };

  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onBack();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onBack]);

  return (
    <div className="settings-modal-overlay" onClick={handleBackdropClick}>
      <div className="settings-modal">
        {/* Close button */}
        <button className="settings-modal-close" onClick={onBack} aria-label="Close">
          <X size={18} />
        </button>

        {/* Content */}
        <div className="settings-modal-content">
          {/* Header */}
          <header className="settings-modal-header">
            <button className="settings-back" onClick={onBack} aria-label="Back">
              <ArrowLeft size={18} />
            </button>
            <h1 className="settings-title">Settings</h1>
          </header>

          {/* Body */}
          <main className="settings-body">
            {/* Appearance Section */}
            <section className="settings-section">
              <h2 className="settings-section-title">Appearance</h2>
              
              {/* Theme Palette */}
              <div className="theme-palette">
                <label className="field-label">Theme</label>
                <div className="theme-swatches">
                  <button
                    className={`theme-swatch ${activeThemeId === 'system' ? 'active' : ''}`}
                    onClick={() => handleThemeChange('system')}
                    title="System"
                  >
                    <div className="swatch-colors system">
                      <div className="swatch-half light" />
                      <div className="swatch-half dark" />
                    </div>
                    <span className="swatch-name">System</span>
                  </button>
                  
                  {builtInThemes.map((theme) => (
                    <button
                      key={theme.id}
                      className={`theme-swatch ${activeThemeId === theme.id ? 'active' : ''}`}
                      onClick={() => handleThemeChange(theme.id)}
                      title={theme.name}
                    >
                      <div 
                        className="swatch-colors"
                        style={{
                          background: theme.colors['--editor-bg'] || '#fff',
                        }}
                      >
                        <div 
                          className="swatch-accent"
                          style={{ background: theme.colors['--editor-accent'] || '#000' }}
                        />
                      </div>
                      <span className="swatch-name">{theme.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Divider */}
              <div className="settings-divider" />

              {/* Font */}
              <div className="font-field">
                <label className="field-label">Editor Font</label>
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
            </section>

            {/* Divider between sections */}
            <div className="settings-section-gap" />

            {/* General Section */}
            <section className="settings-section">
              <h2 className="settings-section-title">Storage</h2>
              
              <div className="storage-field">
                <label className="field-label">Notes Folder</label>
                <div className="storage-path-row">
                  <span className="storage-path">{storagePath || '~/Documents/Notes'}</span>
                  <button 
                    className="text-button"
                    onClick={async () => {
                      const path = await window.electronAPI.selectDirectory();
                      if (path) await onChangeStoragePath(path);
                    }}
                  >
                    Change
                  </button>
                </div>
              </div>
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}
