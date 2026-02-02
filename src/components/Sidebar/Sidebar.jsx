import { 
  Feather, 
  FileText,
  Star, 
  Archive, 
  Trash2, 
  Plus, 
  Settings, 
  Search,
  Tag
} from 'lucide-react';
import './Sidebar.css';

const FOLDERS = [
  { id: 'all', label: 'All Notes', icon: FileText, count: null },
  { id: 'favorites', label: 'Favorites', icon: Star, count: null },
  { id: 'archive', label: 'Archive', icon: Archive, count: null },
  { id: 'trash', label: 'Trash', icon: Trash2, count: null },
];

const TAG_COLORS = {
  'Work': '#FF6B6B',
  'Personal': '#4ECDC4',
  'Ideas': '#9B59B6',
  'Projects': '#F39C12',
};

function Sidebar({ 
  activeFilter, 
  onFilterChange, 
  onCreateNote, 
  onOpenSettings,
  tags,
  searchQuery,
  onSearchChange,
}) {
  const handleTagClick = (tag) => {
    onFilterChange(`tag:${tag}`);
  };

  return (
    <aside className="sidebar">
      {/* Header */}
      <div className="sidebar-header">
        <div className="logo">
          <Feather size={24} color="#2563EB" strokeWidth={2.5} />
          <span className="logo-text">Notes</span>
        </div>
        <button className="icon-btn" onClick={onOpenSettings}>
          <Settings size={18} />
        </button>
      </div>

      {/* Search */}
      <div className="search-container">
        <Search size={16} className="search-icon" />
        <input
          type="text"
          placeholder="Search notes..."
          className="search-input"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

      {/* Folders */}
      <nav className="sidebar-section">
        <h3 className="section-title">FOLDERS</h3>
        <ul className="nav-list">
          {FOLDERS.map((folder) => {
            const Icon = folder.icon;
            const isActive = activeFilter === folder.id;
            return (
              <li key={folder.id}>
                <button
                  className={`nav-item ${isActive ? 'active' : ''}`}
                  onClick={() => onFilterChange(folder.id)}
                >
                  <Icon size={18} />
                  <span className="nav-label">{folder.label}</span>
                  {folder.count !== null && (
                    <span className="nav-count">{folder.count}</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Tags */}
      <nav className="sidebar-section">
        <h3 className="section-title">TAGS</h3>
        <ul className="nav-list">
          {tags.map((tag) => {
            const isActive = activeFilter === `tag:${tag}`;
            const color = TAG_COLORS[tag] || '#6C757D';
            return (
              <li key={tag}>
                <button
                  className={`nav-item ${isActive ? 'active' : ''}`}
                  onClick={() => handleTagClick(tag)}
                >
                  <span 
                    className="tag-dot" 
                    style={{ backgroundColor: color }}
                  />
                  <span className="nav-label">{tag}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* New Note Button */}
      <div className="sidebar-footer">
        <button className="new-note-btn" onClick={onCreateNote}>
          <Plus size={18} />
          <span>New Note</span>
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;
