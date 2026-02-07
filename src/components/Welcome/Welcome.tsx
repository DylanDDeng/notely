import { Feather, HardDrive, Zap, Tags, FolderOpen } from 'lucide-react';
import './Welcome.css';

interface WelcomeProps {
  onGetStarted: () => void;
  onOpenFolder: () => void;
}

const FEATURES = [
  {
    icon: HardDrive,
    text: 'Local-first storage for complete privacy',
  },
  {
    icon: Zap,
    text: 'Lightning fast search across all notes',
  },
  {
    icon: Tags,
    text: 'Organize with folders and tags',
  },
];

function Welcome({ onGetStarted, onOpenFolder }: WelcomeProps) {
  return (
    <div className="welcome">
      <div className="welcome-content">
        {/* Logo */}
        <div className="welcome-logo">
          <Feather size={64} color="#374151" strokeWidth={1.5} />
        </div>

        {/* Title */}
        <h1 className="welcome-title">Notely</h1>
        <p className="welcome-subtitle">Your thoughts, beautifully organized</p>

        {/* Features */}
        <div className="welcome-features">
          {FEATURES.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <div key={index} className="welcome-feature">
                <Icon size={20} className="welcome-feature-icon" />
                <span className="welcome-feature-text">{feature.text}</span>
              </div>
            );
          })}
        </div>

        {/* Actions */}
        <div className="welcome-actions">
          <button className="welcome-btn-primary" onClick={onGetStarted}>
            Get Started
          </button>
          <button className="welcome-btn-secondary" onClick={onOpenFolder}>
            <FolderOpen size={18} />
            <span>Open Existing Folder</span>
          </button>
        </div>

        {/* Version */}
        <p className="welcome-version">Version 1.0.0</p>
      </div>
    </div>
  );
}

export default Welcome;
