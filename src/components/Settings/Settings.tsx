import { FolderOpen, Type, X } from 'lucide-react';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { CSSProperties } from 'react';
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

const SYSTEM_THEME_OPTION = {
  id: 'system',
  name: 'System',
  colors: {
    '--editor-bg': 'linear-gradient(120deg, #f5f4ef 0 50%, #1c1c1e 50% 100%)',
    '--editor-accent': '#0a84ff',
  },
};

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
  const fontFieldRef = useRef<HTMLDivElement>(null);

  // Load system fonts
  useEffect(() => {
    let cancelled = false;

    async function loadFonts() {
      try {
        if (window.queryLocalFonts) {
          const fonts = await window.queryLocalFonts();
          if (cancelled) return;
          const families = Array.from(
            new Set(fonts.map((f) => f.family).filter((family): family is string => Boolean(family)))
          ).sort();
          setLocalFonts(families);
        }
      } catch {
        // Ignore - font access not granted or unavailable
      }
    }

    void loadFonts();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setFontInput(fontFamily || '');
  }, [fontFamily]);

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

  const commitFontInput = useCallback((value: string) => {
    const nextValue = value.trim();
    setFontInput(nextValue);
    onChangeFontFamily(nextValue);
  }, [onChangeFontFamily]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!showFontList) return;
      if (fontFieldRef.current?.contains(event.target as Node)) return;
      commitFontInput(fontInput);
      setShowFontList(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [commitFontInput, fontInput, showFontList]);

  const handleThemeChange = useCallback((themeId: string) => {
    setActiveThemeId(themeId);

    if (themeId === 'system') {
      applySystemTheme();
    } else {
      const theme = getThemeById(themeId);
      if (theme) applyTheme(theme);
    }
  }, []);

  const themeOptions = useMemo(() => [SYSTEM_THEME_OPTION, ...builtInThemes], []);
  const activeThemeName =
    themeOptions.find((theme) => theme.id === activeThemeId)?.name || 'System';

  return (
    <div className="settings-window">
      <div className="settings-titlebar" />

      <main className="settings-content">
        <h1 className="settings-title">Settings</h1>

        <section className="settings-section">
          <h2 className="settings-section-label">Appearance</h2>

          <div className="settings-row settings-row-top">
            <span className="settings-row-label">Theme</span>
            <div className="settings-row-control settings-row-control-stack">
              <div className="theme-swatches">
                {themeOptions.map((theme) => (
                  <button
                    key={theme.id}
                    type="button"
                    className={`theme-swatch ${activeThemeId === theme.id ? 'active' : ''}`}
                    onClick={() => handleThemeChange(theme.id)}
                    title={theme.name}
                    aria-label={theme.name}
                    aria-pressed={activeThemeId === theme.id}
                  >
                    <span
                      className="theme-swatch-chip"
                      style={{
                        '--chip-bg': theme.colors['--editor-bg'] || '#f5f4ef',
                        '--chip-accent': theme.colors['--editor-accent'] || '#0a84ff',
                      } as CSSProperties}
                    />
                  </button>
                ))}
              </div>
              <span className="theme-swatch-caption">{activeThemeName}</span>
            </div>
          </div>

          <div className="settings-row">
            <span className="settings-row-label">Editor font</span>
            <div className="settings-row-control" ref={fontFieldRef}>
              <div className="font-input-wrapper">
                <Type size={14} className="font-icon" />
                <input
                  id="settings-font-input"
                  type="text"
                  value={fontInput}
                  onChange={(e) => setFontInput(e.target.value)}
                  onFocus={() => setShowFontList(true)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      commitFontInput(fontInput);
                      setShowFontList(false);
                    }
                  }}
                  placeholder="System default"
                  className="font-input"
                />
                {fontInput && (
                  <button
                    type="button"
                    className="font-clear"
                    onClick={() => {
                      setFontInput('');
                      onChangeFontFamily('');
                    }}
                    aria-label="Clear font"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {showFontList && localFonts.length > 0 && (
                <div className="font-dropdown">
                  <button
                    type="button"
                    className="font-option"
                    onClick={() => {
                      setFontInput('');
                      onChangeFontFamily('');
                      setShowFontList(false);
                    }}
                  >
                    System default
                  </button>
                  {localFonts.slice(0, 30).map((font) => (
                    <button
                      key={font}
                      type="button"
                      className="font-option"
                      onClick={() => {
                        setFontInput(font);
                        onChangeFontFamily(font);
                        setShowFontList(false);
                      }}
                      style={{ fontFamily: font }}
                    >
                      {font}
                    </button>
                  ))}
                  {localFonts.length > 30 && (
                    <span className="font-more">+{localFonts.length - 30} more fonts</span>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="settings-section">
          <h2 className="settings-section-label">Storage</h2>

          <div className="settings-row">
            <span className="settings-row-label">Notes folder</span>
            <div className="settings-row-control settings-row-control-folder">
              <span className="storage-path">{storagePath || '~/Documents/Notes'}</span>
              <button
                type="button"
                className="icon-button"
                title="Choose folder"
                aria-label="Choose folder"
                onClick={async () => {
                  const path = await window.electronAPI.selectDirectory();
                  if (path) await onChangeStoragePath(path);
                }}
              >
                <FolderOpen size={16} />
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
