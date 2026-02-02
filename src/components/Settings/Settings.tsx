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
import { useState } from 'react';
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
}

function Settings({ onBack }: SettingsProps) {
  const [activeTab, setActiveTab] = useState('general');
  const [settings, setSettings] = useState<AppSettings>({
    launchAtStartup: true,
    showInMenuBar: false,
    autoSaveInterval: 30000,
    saveLocation: '~/Documents/Notes',
  });

  const handleToggle = (key: keyof AppSettings) => {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleAutoSaveChange = (value: string) => {
    setSettings(prev => ({ ...prev, autoSaveInterval: parseInt(value) }));
  };

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
              Automatically open Notes when you log in
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
              Display Notes icon in the macOS menu bar
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
          <button className="settings-btn">Change</button>
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
        return renderPlaceholder('Appearance', 'Customize the look and feel of the application');
      case 'sync':
        return renderPlaceholder('Sync & Backup', 'Manage your sync and backup preferences');
      case 'editor':
        return renderPlaceholder('Editor', 'Customize your editing experience');
      case 'shortcuts':
        return renderPlaceholder('Keyboard Shortcuts', 'View and customize keyboard shortcuts');
      case 'about':
        return renderPlaceholder('About', 'Information about Notes');
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
                onClick={() => setActiveTab(item.id)}
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
