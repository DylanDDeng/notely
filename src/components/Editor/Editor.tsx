import { useState, useEffect, useCallback, useRef, type KeyboardEvent } from 'react';
import { remark } from 'remark';
import remarkGfm from 'remark-gfm';
import remarkHtml from 'remark-html';
import { format } from 'date-fns';
import { Pin, Share2, MoreHorizontal, Bold, Italic, Underline, List, CheckSquare, Link, Image } from 'lucide-react';
import { getTagColor } from '../../utils/noteUtils';
import type { EditorNote, SaveNoteData } from '../../types';
import './Editor.css';

interface EditorProps {
  note: EditorNote | null;
  onSave: (note: SaveNoteData) => Promise<void>;
  isLoading: boolean;
}

function Editor({ note, onSave, isLoading }: EditorProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [htmlContent, setHtmlContent] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const autoSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  // 加载笔记
  useEffect(() => {
    if (note) {
      setTitle(note.title || 'Untitled');
      setContent(note.content || '');
      setTags(note.tags || []);
      setHasChanges(false);
      setLightboxSrc(null);
      renderMarkdown(note.content || '');
    } else {
      setTitle('');
      setContent('');
      setTags([]);
      setHtmlContent('');
      setLightboxSrc(null);
    }
  }, [note?.id]);

  // Lightbox keyboard controls
  useEffect(() => {
    if (!lightboxSrc) return;
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxSrc(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [lightboxSrc]);

  // 渲染 Markdown
  const renderMarkdown = async (text: string) => {
    try {
      const result = await remark()
        .use(remarkGfm)
        .use(remarkHtml)
        .process(text);
      setHtmlContent(String(result.value));
    } catch (err) {
      console.error('Failed to render markdown:', err);
    }
  };

  // 自动保存
  const autoSave = useCallback(() => {
    if (note && hasChanges) {
      onSave({
        id: note.id,
        filename: note.filename,
        title,
        content,
        tags,
        date: note.date,
      });
      setHasChanges(false);
    }
  }, [note, title, content, tags, hasChanges, onSave]);

  // 设置自动保存定时器
  useEffect(() => {
    if (hasChanges) {
      autoSaveRef.current = setTimeout(autoSave, 30000); // 30秒自动保存
    }
    return () => {
      if (autoSaveRef.current) {
        clearTimeout(autoSaveRef.current);
      }
    };
  }, [hasChanges, autoSave]);

  // 处理内容变化
  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    setContent(newContent);
    setHasChanges(true);
    renderMarkdown(newContent);
  };

  // 处理标题变化
  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTitle(e.target.value);
    setHasChanges(true);
  };

  // 处理标签输入
  const handleTagKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && e.currentTarget.value.trim()) {
      e.preventDefault();
      const newTag = e.currentTarget.value.trim();
      if (!tags.includes(newTag)) {
        setTags([...tags, newTag]);
        setHasChanges(true);
      }
      e.currentTarget.value = '';
    }
  };

  // 删除标签
  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
    setHasChanges(true);
  };

  // 工具栏操作
  const insertMarkdown = (before: string, after: string = '') => {
    const textarea = contentRef.current;
    if (!textarea) return;
    
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = content.substring(start, end);
    const newText = content.substring(0, start) + before + selectedText + after + content.substring(end);
    
    setContent(newText);
    setHasChanges(true);
    renderMarkdown(newText);
    
    // 恢复光标位置
    setTimeout(() => {
      textarea.focus();
      const newCursorPos = start + before.length + selectedText.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  const handlePreviewClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement | null;
    if (!target) {
      setIsEditing(true);
      return;
    }

    // Images: open lightbox
    if (target.tagName === 'IMG') {
      const img = target as HTMLImageElement;
      if (img.src) {
        setLightboxSrc(img.src);
        return;
      }
    }

    // Links: open in default browser
    const link = target.closest('a') as HTMLAnchorElement | null;
    if (link?.href) {
      e.preventDefault();
      window.electronAPI.openExternal(link.href);
      return;
    }

    // Otherwise, start editing
    setIsEditing(true);
  };

  const toolbarActions = {
    bold: () => insertMarkdown('**', '**'),
    italic: () => insertMarkdown('*', '*'),
    underline: () => insertMarkdown('<u>', '</u>'),
    bulletList: () => insertMarkdown('- '),
    checkList: () => insertMarkdown('- [ ] '),
    link: () => insertMarkdown('[', '](url)'),
  };

  if (isLoading) {
    return (
      <div className="editor">
        <div className="editor-loading">
          <div className="loading-spinner" />
        </div>
      </div>
    );
  }

  if (!note) {
    return (
      <div className="editor">
        <div className="editor-empty">
          <p>Select a note to view</p>
        </div>
      </div>
    );
  }

  const mainTag = tags.find(tag => !['favorite', 'archive', 'trash'].includes(tag));
  const displayTags = tags.filter(tag => !['favorite', 'archive', 'trash'].includes(tag));

  return (
    <div className="editor">
      {/* Header */}
      <div className="editor-header">
        <div className="editor-container editor-header-inner">
          <div className="editor-meta">
            <span className="editor-date">
              {note.modifiedAt && format(new Date(note.modifiedAt), "MMM d, yyyy 'at' h:mm a")}
            </span>
            {mainTag && (
              <span 
                className="editor-tag"
                style={{ 
                  backgroundColor: `${getTagColor(mainTag)}20`,
                  color: getTagColor(mainTag)
                }}
              >
                {mainTag}
              </span>
            )}
          </div>
          <div className="editor-actions">
            <button className="editor-action-btn">
              <Pin size={18} />
            </button>
            <button className="editor-action-btn">
              <Share2 size={18} />
            </button>
            <button className="editor-action-btn">
              <MoreHorizontal size={18} />
            </button>
          </div>
        </div>
      </div>

      <div className="editor-container">
        {/* Title */}
        <input
          type="text"
          className="editor-title-input"
          value={title}
          onChange={handleTitleChange}
          placeholder="Note title"
        />

        {/* Tags Input */}
        <div className="editor-tags">
          {displayTags.map(tag => (
            <span 
              key={tag} 
              className="editor-tag-chip"
              style={{ 
                backgroundColor: `${getTagColor(tag)}20`,
                color: getTagColor(tag)
              }}
            >
              {tag}
              <button onClick={() => removeTag(tag)}>×</button>
            </span>
          ))}
          <input
            type="text"
            className="editor-tag-input"
            placeholder={displayTags.length === 0 ? "Add tags..." : ""}
            onKeyDown={handleTagKeyDown}
          />
        </div>
      </div>

      {/* Content */}
      <div className="editor-content" onClick={isEditing ? undefined : handlePreviewClick}>
        <div className="editor-container editor-content-inner">
          {isEditing ? (
            <textarea
              ref={contentRef}
              className="editor-textarea"
              value={content}
              onChange={handleContentChange}
              onBlur={() => setIsEditing(false)}
              placeholder="Start writing..."
              autoFocus
            />
          ) : (
            <div
              className="editor-preview"
              dangerouslySetInnerHTML={{ 
                __html: htmlContent || '<p class="editor-placeholder">Click to start editing...</p>' 
              }}
            />
          )}
        </div>
      </div>

      {/* Toolbar */}
      <div className="editor-toolbar">
        <div className="editor-container editor-toolbar-inner">
          <button className="toolbar-btn" onClick={toolbarActions.bold} title="Bold">
            <Bold size={18} />
          </button>
          <button className="toolbar-btn" onClick={toolbarActions.italic} title="Italic">
            <Italic size={18} />
          </button>
          <button className="toolbar-btn" onClick={toolbarActions.underline} title="Underline">
            <Underline size={18} />
          </button>
          <div className="toolbar-divider" />
          <button className="toolbar-btn" onClick={toolbarActions.bulletList} title="Bullet list">
            <List size={18} />
          </button>
          <button className="toolbar-btn" onClick={toolbarActions.checkList} title="Check list">
            <CheckSquare size={18} />
          </button>
          <div className="toolbar-divider" />
          <button className="toolbar-btn" onClick={toolbarActions.link} title="Link">
            <Link size={18} />
          </button>
          <button className="toolbar-btn" title="Image">
            <Image size={18} />
          </button>
        </div>
      </div>

      {lightboxSrc && (
        <div className="image-lightbox" onClick={() => setLightboxSrc(null)}>
          <button
            type="button"
            className="image-lightbox-close"
            onClick={(e) => {
              e.stopPropagation();
              setLightboxSrc(null);
            }}
            aria-label="Close image preview"
          >
            ×
          </button>
          <img
            className="image-lightbox-img"
            src={lightboxSrc}
            alt=""
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

export default Editor;
