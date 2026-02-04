import { useState, useEffect, useCallback, useRef, type KeyboardEvent } from 'react';
import { remark } from 'remark';
import remarkGfm from 'remark-gfm';
import remarkHtml from 'remark-html';
import { format } from 'date-fns';
import { Pin, Share2, MoreHorizontal } from 'lucide-react';
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
  const saveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveInFlightRef = useRef(false);
  const pendingSaveRef = useRef<{ id: string; filename: string } | null>(null);
  const draftChangeTokenRef = useRef(0);
  const draftCacheRef = useRef<
    Record<
      string,
      { title: string; content: string; tags: string[]; date?: string; token: number; filename: string }
    >
  >({});
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const editorContentRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const textOffsetMapRef = useRef<number[]>([]);
  const pendingSelectionRef = useRef<{ index?: number; scrollTop: number } | null>(null);
  const pendingScrollRestoreRef = useRef<number | null>(null);
  const SAVE_DEBOUNCE_MS = 800;

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

  const clearSaveDebounce = useCallback(() => {
    if (!saveDebounceRef.current) return;
    clearTimeout(saveDebounceRef.current);
    saveDebounceRef.current = null;
  }, []);

  const flushSaveForNote = useCallback(async (noteId: string, filename: string) => {
    clearSaveDebounce();

    if (saveInFlightRef.current) {
      pendingSaveRef.current = { id: noteId, filename };
      return;
    }

    const entry = draftCacheRef.current[noteId];
    if (!entry) return;

    saveInFlightRef.current = true;
    const token = entry.token;

    try {
      await onSave({
        id: noteId,
        filename,
        title: entry.title,
        content: entry.content,
        tags: entry.tags,
        date: entry.date,
      });

      const stillSame = draftCacheRef.current[noteId]?.token === token;
      if (stillSame) {
        delete draftCacheRef.current[noteId];
        if (note?.id === noteId) {
          setHasChanges(false);
        }
      }
    } catch (err) {
      console.error('Failed to save note:', err);
    } finally {
      saveInFlightRef.current = false;
      const pending = pendingSaveRef.current;
      pendingSaveRef.current = null;
      if (pending) {
        await flushSaveForNote(pending.id, pending.filename);
      }
    }
  }, [clearSaveDebounce, onSave, note?.id]);

  const scheduleSave = useCallback(() => {
    if (!note) return;
    clearSaveDebounce();
    saveDebounceRef.current = setTimeout(() => {
      void flushSaveForNote(note.id, note.filename);
    }, SAVE_DEBOUNCE_MS);
  }, [clearSaveDebounce, flushSaveForNote, note]);

  // 加载笔记（并在切换时 flush 未保存的草稿）
  useEffect(() => {
    if (note) {
      const cached = draftCacheRef.current[note.id];
      if (cached) {
        setTitle(cached.title || 'Untitled');
        setContent(cached.content || '');
        setTags(cached.tags || []);
        setHasChanges(true);
        setLightboxSrc(null);
        renderMarkdown(cached.content || '');
      } else {
        setTitle(note.title || 'Untitled');
        setContent(note.content || '');
        setTags(note.tags || []);
        setHasChanges(false);
        setLightboxSrc(null);
        renderMarkdown(note.content || '');
      }
    } else {
      setTitle('');
      setContent('');
      setTags([]);
      setHtmlContent('');
      setHasChanges(false);
      setLightboxSrc(null);
    }

    return () => {
      if (!note) return;
      void flushSaveForNote(note.id, note.filename);
    };
  }, [note?.id]);

  const resizeTextarea = useCallback(() => {
    const textarea = contentRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, []);

  const getCaretTopInTextarea = (textarea: HTMLTextAreaElement, caretIndex: number): number => {
    const marker = document.createElement('span');
    marker.textContent = '\u200b';

    const mirror = document.createElement('div');
    const style = window.getComputedStyle(textarea);
    const rect = textarea.getBoundingClientRect();

    mirror.style.position = 'absolute';
    mirror.style.visibility = 'hidden';
    mirror.style.pointerEvents = 'none';
    mirror.style.left = '-9999px';
    mirror.style.top = '0';
    mirror.style.width = `${rect.width}px`;
    mirror.style.whiteSpace = 'pre-wrap';
    mirror.style.wordBreak = 'break-word';
    mirror.style.overflowWrap = 'break-word';
    mirror.style.fontFamily = style.fontFamily;
    mirror.style.fontSize = style.fontSize;
    mirror.style.fontWeight = style.fontWeight;
    mirror.style.fontStyle = style.fontStyle;
    mirror.style.letterSpacing = style.letterSpacing;
    mirror.style.wordSpacing = style.wordSpacing;
    mirror.style.lineHeight = style.lineHeight;
    mirror.style.paddingTop = style.paddingTop;
    mirror.style.paddingRight = style.paddingRight;
    mirror.style.paddingBottom = style.paddingBottom;
    mirror.style.paddingLeft = style.paddingLeft;
    mirror.style.borderTopWidth = style.borderTopWidth;
    mirror.style.borderRightWidth = style.borderRightWidth;
    mirror.style.borderBottomWidth = style.borderBottomWidth;
    mirror.style.borderLeftWidth = style.borderLeftWidth;
    mirror.style.boxSizing = style.boxSizing;

    mirror.textContent = textarea.value.slice(0, Math.max(0, caretIndex));
    mirror.appendChild(marker);
    document.body.appendChild(mirror);

    const markerRect = marker.getBoundingClientRect();
    const mirrorRect = mirror.getBoundingClientRect();
    const top = markerRect.top - mirrorRect.top;

    document.body.removeChild(mirror);
    return top;
  };

  const getLineHeightPx = (textarea: HTMLTextAreaElement): number => {
    const style = window.getComputedStyle(textarea);
    const parsed = parseFloat(style.lineHeight);
    if (!Number.isNaN(parsed) && parsed > 0) return parsed;
    const fontSize = parseFloat(style.fontSize);
    return (Number.isNaN(fontSize) ? 16 : fontSize) * 1.2;
  };

  const scrollEditorToCaretCenter = (caretIndex: number) => {
    const textarea = contentRef.current;
    const container = editorContentRef.current;
    if (!textarea || !container) return;

    const caretTopInTextarea = getCaretTopInTextarea(textarea, caretIndex);
    const lineHeight = getLineHeightPx(textarea);

    const containerRect = container.getBoundingClientRect();
    const textareaRect = textarea.getBoundingClientRect();
    const textareaTopInContainer = textareaRect.top - containerRect.top + container.scrollTop;
    const caretTopInContainer = textareaTopInContainer + caretTopInTextarea;

    const desired = caretTopInContainer - container.clientHeight / 2 + lineHeight / 2;
    const maxScrollTop = container.scrollHeight - container.clientHeight;
    container.scrollTop = Math.min(maxScrollTop, Math.max(0, desired));
  };

  // 渲染 Markdown
  const renderMarkdown = async (text: string) => {
    try {
      updateTextOffsetMap(text);
      const result = await remark()
        .use(remarkGfm)
        .use(remarkHtml)
        .process(text);
      setHtmlContent(String(result.value));
    } catch (err) {
      console.error('Failed to render markdown:', err);
    }
  };

  const updateTextOffsetMap = (markdown: string) => {
    try {
      const tree = remark().use(remarkGfm).parse(markdown) as any;
      const offsets: number[] = [];

      const addOffsets = (value: string, startOffset: number | null | undefined) => {
        if (!value || typeof startOffset !== 'number') return;
        for (let i = 0; i < value.length; i += 1) {
          offsets.push(startOffset + i);
        }
      };

      const findValueStart = (node: any) => {
        const start = node?.position?.start?.offset;
        const end = node?.position?.end?.offset;
        if (typeof start !== 'number' || typeof end !== 'number') return null;
        const slice = markdown.slice(start, end);
        const idx = typeof node.value === 'string' ? slice.indexOf(node.value) : -1;
        if (idx >= 0) return start + idx;
        return start;
      };

      const visit = (node: any) => {
        if (!node) return;
        if (node.type === 'text') {
          addOffsets(node.value, node.position?.start?.offset);
          return;
        }
        if (node.type === 'inlineCode' || node.type === 'code') {
          addOffsets(node.value || '', findValueStart(node));
          return;
        }
        if (Array.isArray(node.children)) {
          node.children.forEach(visit);
        }
      };

      visit(tree);
      textOffsetMapRef.current = offsets;
    } catch (err) {
      textOffsetMapRef.current = [];
    }
  };

  // 自动保存
  // 处理内容变化
  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    setContent(newContent);
    setHasChanges(true);
    renderMarkdown(newContent);
    if (note) {
      draftChangeTokenRef.current += 1;
      draftCacheRef.current[note.id] = {
        title,
        content: newContent,
        tags,
        date: note.date,
        token: draftChangeTokenRef.current,
        filename: note.filename,
      };
      scheduleSave();
    }
  };

  // 处理标题变化
  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTitle = e.target.value;
    setTitle(newTitle);
    setHasChanges(true);
    if (note) {
      draftChangeTokenRef.current += 1;
      draftCacheRef.current[note.id] = {
        title: newTitle,
        content,
        tags,
        date: note.date,
        token: draftChangeTokenRef.current,
        filename: note.filename,
      };
      scheduleSave();
    }
  };

  // 处理标签输入
  const handleTagKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && e.currentTarget.value.trim()) {
      e.preventDefault();
      const newTag = e.currentTarget.value.trim();
      if (!tags.includes(newTag)) {
        const nextTags = [...tags, newTag];
        setTags(nextTags);
        setHasChanges(true);
        if (note) {
          draftChangeTokenRef.current += 1;
          draftCacheRef.current[note.id] = {
            title,
            content,
            tags: nextTags,
            date: note.date,
            token: draftChangeTokenRef.current,
            filename: note.filename,
          };
          scheduleSave();
        }
      }
      e.currentTarget.value = '';
    }
  };

  // 删除标签
  const removeTag = (tagToRemove: string) => {
    const nextTags = tags.filter(tag => tag !== tagToRemove);
    setTags(nextTags);
    setHasChanges(true);
    if (note) {
      draftChangeTokenRef.current += 1;
      draftCacheRef.current[note.id] = {
        title,
        content,
        tags: nextTags,
        date: note.date,
        token: draftChangeTokenRef.current,
        filename: note.filename,
      };
      scheduleSave();
    }
  };

  useEffect(() => {
    if (!isEditing) return;
    const pending = pendingSelectionRef.current;
    if (!pending) {
      resizeTextarea();
      return;
    }
    const textarea = contentRef.current;
    const container = editorContentRef.current;
    if (!textarea || !container) return;

    requestAnimationFrame(() => {
      resizeTextarea();
      requestAnimationFrame(() => {
        textarea.focus();
        if (typeof pending.index === 'number') {
          textarea.setSelectionRange(pending.index, pending.index);
          scrollEditorToCaretCenter(pending.index);
        } else {
          container.scrollTop = pending.scrollTop;
        }
        pendingSelectionRef.current = null;
      });
    });
  }, [isEditing, content, resizeTextarea]);

  useEffect(() => {
    if (!isEditing) return;
    resizeTextarea();
  }, [isEditing, content, resizeTextarea]);

  useEffect(() => {
    if (isEditing) return;
    const pendingScroll = pendingScrollRestoreRef.current;
    if (pendingScroll === null) return;
    const container = editorContentRef.current;
    if (!container) return;

    let rafId = 0;
    let cancelled = false;
    let programmaticScroll = false;

    const apply = () => {
      if (cancelled) return;
      const maxScrollTop = container.scrollHeight - container.clientHeight;
      const next = Math.min(maxScrollTop, Math.max(0, pendingScroll));
      programmaticScroll = true;
      container.scrollTop = next;
    };

    const stop = (clearPending: boolean) => {
      if (cancelled) return;
      cancelled = true;
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      container.removeEventListener('scroll', onScroll);
      if (clearPending) {
        pendingScrollRestoreRef.current = null;
      }
    };

    const onScroll = () => {
      if (programmaticScroll) {
        programmaticScroll = false;
        return;
      }
      stop(true);
    };

    const resizeObserver = new ResizeObserver(() => apply());
    const previewEl = previewRef.current;
    if (previewEl) resizeObserver.observe(previewEl);

    container.addEventListener('scroll', onScroll, { passive: true });

    const start = performance.now();
    const tick = () => {
      apply();

      if (cancelled) return;
      if (performance.now() - start >= 4000) {
        stop(true);
        return;
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => stop(false);
  }, [isEditing, htmlContent]);

  const exitEditing = useCallback(() => {
    pendingScrollRestoreRef.current = editorContentRef.current?.scrollTop ?? 0;
    setIsEditing(false);
  }, []);

  useEffect(() => {
    if (!isEditing) return;
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        exitEditing();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isEditing, exitEditing]);

  const getPlainTextOffsetFromEvent = (e: React.MouseEvent<HTMLDivElement>) => {
    const previewEl = previewRef.current;
    if (!previewEl) return null;

    const caretRange =
      (document as Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null })
        .caretRangeFromPoint?.(e.clientX, e.clientY) ?? null;

    if (!caretRange || caretRange.startContainer.nodeType !== Node.TEXT_NODE) return null;

    const targetNode = caretRange.startContainer as Text;
    const targetOffset = caretRange.startOffset;

    const walker = document.createTreeWalker(previewEl, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        if (!node.textContent) return NodeFilter.FILTER_REJECT;
        if (node.textContent.trim() === '' && node.parentElement === previewEl) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    let offset = 0;
    let current = walker.nextNode();
    while (current) {
      if (current === targetNode) {
        return offset + Math.min(targetOffset, current.textContent?.length ?? 0);
      }
      offset += current.textContent?.length ?? 0;
      current = walker.nextNode();
    }
    return offset;
  };

  const handlePreviewClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement | null;
    if (!target) {
      pendingSelectionRef.current = { index: undefined, scrollTop: editorContentRef.current?.scrollTop ?? 0 };
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

    const scrollTop = editorContentRef.current?.scrollTop ?? 0;
    const plainTextOffset = getPlainTextOffsetFromEvent(e);
    const map = textOffsetMapRef.current;
    let index: number | undefined;
    if (plainTextOffset !== null && map.length > 0) {
      const mappedIndex = map[Math.min(plainTextOffset, map.length - 1)] ?? 0;
      index = Math.max(0, Math.min(mappedIndex, content.length));
    }
    pendingSelectionRef.current = { index, scrollTop };

    // Otherwise, start editing
    setIsEditing(true);
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
            <button
              className="editor-mode-btn"
              onClick={isEditing ? exitEditing : () => {
                pendingSelectionRef.current = { index: undefined, scrollTop: editorContentRef.current?.scrollTop ?? 0 };
                setIsEditing(true);
              }}
            >
              {isEditing ? 'Preview' : 'Edit'}
            </button>
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
      <div
        className="editor-content"
        ref={editorContentRef}
        onClick={isEditing ? undefined : handlePreviewClick}
      >
        <div className="editor-container editor-content-inner">
          {isEditing ? (
            <textarea
              ref={contentRef}
              className="editor-textarea"
              value={content}
              onChange={handleContentChange}
              placeholder="Start writing..."
              autoFocus
            />
          ) : (
            <div
              className="editor-preview"
              ref={previewRef}
              dangerouslySetInnerHTML={{ 
                __html: htmlContent || '<p class="editor-placeholder">Click to start editing...</p>' 
              }}
            />
          )}
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
