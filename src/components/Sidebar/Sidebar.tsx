import { 
  Feather, 
  FileText,
  KanbanSquare,
  Star, 
  Archive, 
	Trash2, 
	Plus, 
	Settings, 
	Search,
	ChevronDown,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { FolderItem } from '../../types';
import { getTagColor } from '../../utils/noteUtils';
import './Sidebar.css';

const FOLDERS: FolderItem[] = [
  { id: 'all', label: 'All Notes', icon: FileText, count: null },
  { id: 'kanban', label: 'Kanban Board', icon: KanbanSquare, count: null },
  { id: 'favorites', label: 'Favorites', icon: Star, count: null },
  { id: 'archive', label: 'Archive', icon: Archive, count: null },
  { id: 'trash', label: 'Trash', icon: Trash2, count: null },
];

interface SidebarProps {
	activeFilter: string;
	onFilterChange: (filter: string) => void;
	onCreateNote: () => void;
	onOpenSettings: () => void;
	storagePath: string;
	tags: string[];
	tagCounts?: Record<string, number>;
	folderCounts?: Record<string, number>;
	searchQuery: string;
	onSearchChange: (query: string) => void;
}

const TAGS_COLLAPSED_BY_VAULT_KEY = 'notes:sidebar:tagsCollapsedByVault';

const readTagsCollapsedByVault = (): Record<string, boolean> => {
	try {
		const raw = localStorage.getItem(TAGS_COLLAPSED_BY_VAULT_KEY);
		if (!raw) return {};
		const parsed = JSON.parse(raw) as unknown;
		if (!parsed || typeof parsed !== 'object') return {};
		return parsed as Record<string, boolean>;
	} catch {
		return {};
	}
};

const writeTagsCollapsedByVault = (value: Record<string, boolean>) => {
	try {
		localStorage.setItem(TAGS_COLLAPSED_BY_VAULT_KEY, JSON.stringify(value));
	} catch {
		// ignore
	}
};

function Sidebar({ 
	activeFilter, 
	onFilterChange, 
	onCreateNote, 
	onOpenSettings,
	storagePath,
	tags,
	tagCounts = {},
	folderCounts = {},
	searchQuery,
	onSearchChange,
}: SidebarProps) {
	const [isTagsCollapsed, setIsTagsCollapsed] = useState<boolean>(() => {
		const map = readTagsCollapsedByVault();
		return Boolean(map[storagePath]);
	});

	useEffect(() => {
		const map = readTagsCollapsedByVault();
		setIsTagsCollapsed(Boolean(map[storagePath]));
	}, [storagePath]);

	const selectedTag = useMemo(() => {
		if (!activeFilter.startsWith('tag:')) return null;
		return activeFilter.slice('tag:'.length);
	}, [activeFilter]);

	const selectedTagColor = useMemo(() => {
		if (!selectedTag) return null;
		return getTagColor(selectedTag);
	}, [selectedTag]);

	const selectedTagCount = useMemo(() => {
		if (!selectedTag) return 0;
		return tagCounts[selectedTag] ?? 0;
	}, [selectedTag, tagCounts]);

	const persistTagsCollapsed = useCallback((nextCollapsed: boolean) => {
		setIsTagsCollapsed(nextCollapsed);
		const map = readTagsCollapsedByVault();
		if (nextCollapsed) {
			map[storagePath] = true;
		} else {
			delete map[storagePath];
		}
		writeTagsCollapsedByVault(map);
	}, [storagePath]);

	const toggleTagsCollapsed = useCallback(() => {
		persistTagsCollapsed(!isTagsCollapsed);
	}, [isTagsCollapsed, persistTagsCollapsed]);

	const handleTagClick = (tag: string) => {
		onFilterChange(`tag:${tag}`);
	};

	return (
    <aside className="sidebar">
      {/* Header */}
      <div className="sidebar-header">
        <div className="logo">
          <Feather size={24} color="#374151" strokeWidth={2.5} />
          <span className="logo-text">Notely</span>
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
            const count = folderCounts[folder.id] ?? folder.count ?? null;
            return (
              <li key={folder.id}>
                <button
                  className={`nav-item ${isActive ? 'active' : ''}`}
                  onClick={() => onFilterChange(folder.id)}
                >
                  <Icon size={18} />
                  <span className="nav-label">{folder.label}</span>
                  {typeof count === 'number' && count > 0 && <span className="nav-count">{count}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Tags */}
      <nav className="sidebar-section">
        <button
          type="button"
          className="section-title-btn"
          onClick={toggleTagsCollapsed}
        >
          <span className="section-title-left">
            <span className="section-title-text">TAGS · {tags.length}</span>
          </span>
          <span className="section-title-right">
            {isTagsCollapsed && selectedTag && selectedTagColor && (
              <span
                className="selected-tag-pill"
                style={{
                  backgroundColor: `${selectedTagColor}14`,
                  borderColor: `${selectedTagColor}2A`,
                  color: selectedTagColor,
                }}
              >
                <span className="selected-tag-pill-dot" style={{ backgroundColor: selectedTagColor }} />
                <span className="selected-tag-pill-label">{selectedTag}</span>
                <span className="selected-tag-pill-count">{selectedTagCount}</span>
              </span>
            )}
            <ChevronDown
              size={14}
              className={`section-chevron ${isTagsCollapsed ? 'collapsed' : ''}`}
            />
          </span>
        </button>
        {!isTagsCollapsed && (
          <ul className="nav-list tag-list">
            {tags.map((tag) => {
              const isActive = activeFilter === `tag:${tag}`;
              const color = getTagColor(tag);
              const count = tagCounts[tag] ?? 0;
              const tagStyle = {
                '--tag-accent': color,
                '--tag-bg': `${color}14`,
                '--tag-bg-hover': `${color}20`,
                '--tag-border': `${color}44`,
                '--tag-count-bg': `${color}1F`,
              } as CSSProperties;
              return (
                <li key={tag}>
                  <button
                    className={`nav-item tag-nav-item ${isActive ? 'active' : ''}`}
                    onClick={() => handleTagClick(tag)}
                    style={tagStyle}
                  >
                    <span
                      className="tag-dot"
                      style={{ backgroundColor: color }}
                    />
                    <span className="nav-label">{tag}</span>
                    <span className="nav-count">{count}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
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
