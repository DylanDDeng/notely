const { app, BrowserWindow, ipcMain, dialog, shell, session, clipboard } = require('electron');
const path = require('path');
const fsSync = require('fs');
const fs = require('fs').promises;
const os = require('os');
const http = require('http');
const { pathToFileURL } = require('url');

// 默认存储路径
const DEFAULT_NOTES_DIR = path.join(os.homedir(), 'Documents', 'Notes');

// 当前存储路径（可以被修改）
let currentNotesDir = DEFAULT_NOTES_DIR;
const WECHAT_LAYOUT_THEMES = Object.freeze({
  'digital-tools-guide': {
    name: 'Digital Tools Guide',
    promptPath: path.join(__dirname, 'prompts', 'wechat-layout-system-prompt.md'),
  },
  'minimal-linework-black-red': {
    name: 'Minimal Linework (Black/Red)',
    promptPath: path.join(__dirname, 'prompts', 'wechat-layout-minimal-linework-black-red-system-prompt.md'),
  },
  'retro-corporate-archive': {
    name: 'Retro Corporate Archive',
    promptPath: path.join(__dirname, 'prompts', 'wechat-layout-retro-corporate-archive-system-prompt.md'),
  },
});
const DEFAULT_WECHAT_LAYOUT_THEME_ID = 'digital-tools-guide';
const cachedWechatLayoutSystemPrompt = Object.create(null);
const SUPPORTED_WECHAT_AI_PROVIDERS = new Set(['moonshot', 'openrouter']);

// 判断是否在开发模式
const isDev = !app.isPackaged;

// 确保笔记目录存在
async function ensureNotesDir() {
  try {
    await fs.mkdir(currentNotesDir, { recursive: true });
  } catch (err) {
    console.error('Failed to create notes directory:', err);
  }
}

// 检查端口是否可用
function checkPort(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}`, (res) => {
      resolve(res.statusCode === 200 || res.statusCode === 204);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeCssFontFamily(value) {
  return String(value || '')
    .replace(/[\r\n]/g, ' ')
    .replace(/[<>"]/g, '')
    .trim();
}

function buildNoteExportHtml({ title, dateText, bodyHtml, includeTitle, includeDate, includeHeader, fontFamily, baseHref }) {
  const safeTitle = escapeHtml(title || 'Untitled');
  const safeDate = escapeHtml(dateText || '');
  const safeBaseHref = baseHref ? escapeHtml(baseHref) : '';
  const family = sanitizeCssFontFamily(fontFamily);
  const defaultFontStack = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

  const titleBlock = includeTitle ? `<h1 class="note-title">${safeTitle}</h1>` : '';
  const dateBlock = includeDate && safeDate ? `<div class="note-date">${safeDate}</div>` : '';

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    ${safeBaseHref ? `<base href="${safeBaseHref}" />` : ''}
    <title>${safeTitle}</title>
    <style>
      :root {
        --app-font-family: ${family || defaultFontStack};
      }

      * { box-sizing: border-box; }

      body {
        margin: 0;
        background: #FFFFFF;
        color: #374151;
        font-family: var(--app-font-family);
      }

      .container {
        width: 100%;
        max-width: 860px;
        margin: 0 auto;
        padding: 32px;
      }

      .note-title {
        font-size: 32px;
        font-weight: 700;
        color: #1F2937;
        margin: 0 0 6px 0;
        line-height: 1.2;
      }

      .note-date {
        font-size: 13px;
        color: #9CA3AF;
        margin: 0 0 24px 0;
      }

      .note-content {
        font-size: 15px;
        line-height: 1.8;
        overflow-wrap: anywhere;
        word-break: break-word;
      }

      .note-content h1,
      .note-content h2,
      .note-content h3,
      .note-content h4,
      .note-content h5,
      .note-content h6 {
        margin-top: 24px;
        margin-bottom: 12px;
        font-weight: 600;
        color: #1F2937;
      }

      .note-content h1 { font-size: 28px; }
      .note-content h2 { font-size: 24px; }
      .note-content h3 { font-size: 20px; }
      .note-content h4 { font-size: 18px; }
      .note-content h5 { font-size: 16px; }
      .note-content h6 { font-size: 14px; }

      .note-content p { margin-bottom: 16px; }

      .note-content img {
        max-width: min(100%, 720px);
        height: auto;
        display: block;
        margin: 16px auto;
        border-radius: 12px;
        border: 1px solid #E5E7EB;
        background: #F9FAFB;
        box-shadow: 0 10px 24px rgba(15, 23, 42, 0.06);
      }

      .note-content ul,
      .note-content ol {
        margin-bottom: 16px;
        padding-left: 24px;
      }

      .note-content li { margin-bottom: 8px; }

      .note-content li > ul,
      .note-content li > ol { margin-top: 8px; }

      .note-content a {
        color: #2563EB;
        text-decoration: none;
      }

      .note-content a:hover { text-decoration: underline; }

      .note-content code {
        background: #F3F4F6;
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 14px;
        overflow-wrap: anywhere;
        word-break: break-word;
      }

      .note-content pre {
        background: #F3F4F6;
        padding: 16px;
        border-radius: 8px;
        overflow-x: auto;
        margin-bottom: 16px;
        overflow-wrap: normal;
        word-break: normal;
      }

      .note-content pre code {
        background: none;
        padding: 0;
      }

      .note-content blockquote {
        border-left: 4px solid #E5E7EB;
        padding-left: 16px;
        margin-left: 0;
        color: #6B7280;
        margin-bottom: 16px;
      }

      .note-content hr {
        border: none;
        border-top: 1px solid #E5E7EB;
        margin: 24px 0;
      }

      .note-content table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 16px;
      }

      .note-content th,
      .note-content td {
        border: 1px solid #E5E7EB;
        padding: 8px 12px;
        text-align: left;
      }

      .note-content th {
        background: #F9FAFB;
        font-weight: 600;
      }

      .note-content input[type="checkbox"] {
        margin-right: 8px;
      }

      @media print {
        body {
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
      }
    </style>
  </head>
  <body>
    <div class="container">
      ${includeHeader ? '' : `${titleBlock}${dateBlock}`}
      <div class="note-content">
        ${bodyHtml || ''}
      </div>
    </div>
  </body>
</html>`;
}

function getWechatThemeConfig(themeId) {
  const requestedKey = typeof themeId === 'string' && themeId.trim() ? themeId.trim() : DEFAULT_WECHAT_LAYOUT_THEME_ID;
  const resolvedKey = WECHAT_LAYOUT_THEMES[requestedKey] ? requestedKey : DEFAULT_WECHAT_LAYOUT_THEME_ID;

  if (!WECHAT_LAYOUT_THEMES[requestedKey] && requestedKey !== DEFAULT_WECHAT_LAYOUT_THEME_ID) {
    console.warn(`Unsupported WeChat layout theme "${requestedKey}", falling back to "${DEFAULT_WECHAT_LAYOUT_THEME_ID}"`);
  }

  return WECHAT_LAYOUT_THEMES[resolvedKey] ? { id: resolvedKey, ...WECHAT_LAYOUT_THEMES[resolvedKey] } : null;
}

function getWechatLayoutSystemPrompt(themeId) {
  const theme = getWechatThemeConfig(themeId);
  if (!theme) return '';

  // In dev mode, always re-read prompt files so edits apply immediately.
  if (!isDev && typeof cachedWechatLayoutSystemPrompt[theme.id] === 'string') {
    return cachedWechatLayoutSystemPrompt[theme.id];
  }

  try {
    const content = fsSync.readFileSync(theme.promptPath, 'utf-8');
    const prompt = String(content || '').trim();
    cachedWechatLayoutSystemPrompt[theme.id] = prompt;
    return prompt;
  } catch (err) {
    console.error(`Failed to load WeChat layout system prompt (${theme.id}):`, err);
    cachedWechatLayoutSystemPrompt[theme.id] = '';
    return '';
  }
}

function normalizeAiResponseContent(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';

  return content
    .map((part) => {
      if (typeof part === 'string') return part;
      if (!part || typeof part !== 'object') return '';
      if (typeof part.text === 'string') return part.text;
      if (typeof part.content === 'string') return part.content;
      return '';
    })
    .join('');
}

function stripMarkdownCodeFence(text) {
  const trimmed = String(text || '').trim();
  const fenced = trimmed.match(/^```(?:html)?\s*([\s\S]*?)\s*```$/i);
  if (!fenced) return trimmed;
  return fenced[1].trim();
}

function ensureWechatStyleMarker(html) {
  const normalized = String(html || '').trim();
  if (!normalized) {
    return '<p style="display: none;"><mp-style-type data-value="3"></mp-style-type></p>';
  }

  if (/<mp-style-type\b/i.test(normalized)) return normalized;
  return `${normalized}\n\n<p style="display: none;"><mp-style-type data-value="3"></mp-style-type></p>`;
}

function buildWechatLayoutUserPrompt({ title, markdown }) {
  return [
    '请根据系统提示词中的当前主题规范，排版以下文章，并直接输出可粘贴到公众号后台的完整HTML。',
    '输出要求：',
    '1) 只能输出HTML，不要解释，不要Markdown代码块',
    '2) 所有样式必须使用行内style',
    '3) 文末必须包含 <p style="display: none;"><mp-style-type data-value="3"></mp-style-type></p>',
    title ? `文章标题：${title}` : '',
    'Markdown内容：',
    markdown,
  ].filter(Boolean).join('\n\n');
}

async function requestMoonshotWechatHtml({ apiKey, model, title, markdown, systemPrompt }) {
  if (typeof fetch !== 'function') {
    throw new Error('Fetch API is unavailable in main process');
  }

  const userPrompt = buildWechatLayoutUserPrompt({ title, markdown });

  const response = await fetch('https://api.moonshot.cn/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      thinking: { type: 'enabled' },
    }),
  });

  const responseText = await response.text();
  let payload = null;
  try {
    payload = responseText ? JSON.parse(responseText) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const errorMessage = payload?.error?.message || payload?.message || `Moonshot request failed (${response.status})`;
    throw new Error(errorMessage);
  }

  const rawContent = normalizeAiResponseContent(payload?.choices?.[0]?.message?.content);
  if (!rawContent) {
    throw new Error('Moonshot returned empty content');
  }

  return ensureWechatStyleMarker(stripMarkdownCodeFence(rawContent));
}

async function requestOpenRouterWechatHtml({ apiKey, model, title, markdown, systemPrompt }) {
  if (typeof fetch !== 'function') {
    throw new Error('Fetch API is unavailable in main process');
  }

  const userPrompt = buildWechatLayoutUserPrompt({ title, markdown });

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      reasoning: { enabled: true },
    }),
  });

  const responseText = await response.text();
  let payload = null;
  try {
    payload = responseText ? JSON.parse(responseText) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const errorMessage = payload?.error?.message || payload?.message || `OpenRouter request failed (${response.status})`;
    throw new Error(errorMessage);
  }

  const rawContent = normalizeAiResponseContent(payload?.choices?.[0]?.message?.content);
  if (!rawContent) {
    throw new Error('OpenRouter returned empty content');
  }

  return ensureWechatStyleMarker(stripMarkdownCodeFence(rawContent));
}

// 创建窗口
async function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#00000000',
    transparent: process.platform === 'darwin',
    ...(process.platform === 'darwin'
      ? {
          // "under-window" is prone to repaint flicker while scrolling translucent panels.
          vibrancy: 'sidebar',
          visualEffectState: 'active',
        }
      : {}),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  // 加载 Vite 开发服务器或生产构建
  if (isDev) {
    // 开发模式：尝试多个端口
    const ports = [5173, 5174, 5175, 5176, 5177, 5178, 5179, 5180];
    let loaded = false;
    
    for (const port of ports) {
      const isAvailable = await checkPort(port);
      if (isAvailable) {
        const url = `http://localhost:${port}`;
        try {
          await mainWindow.loadURL(url);
          loaded = true;
          console.log(`Loaded dev server at ${url}`);
          mainWindow.webContents.openDevTools({ mode: 'detach' });
          
          // Listen for console messages
          mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
            console.log(`[Renderer:${level}] ${message}`);
          });
          break;
        } catch (err) {
          console.log(`Failed to load ${url}:`, err.message);
        }
      }
    }
    
    if (!loaded) {
      console.error('Could not connect to any Vite dev server port');
      mainWindow.loadURL('data:text/html,<h1>Development server not found</h1><p>Please ensure vite is running on ports 5173-5180</p>');
    }
  } else {
    // 生产模式
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

// IPC 处理：获取当前存储目录
ipcMain.handle('notes:getStoragePath', async () => {
  return currentNotesDir;
});

// IPC 处理：设置存储目录
ipcMain.handle('notes:setStoragePath', async (event, newPath) => {
  try {
    if (newPath && newPath.trim() !== '') {
      // 验证路径是否存在或可创建
      await fs.mkdir(newPath, { recursive: true });
      currentNotesDir = newPath;
    } else {
      // 使用默认路径
      currentNotesDir = DEFAULT_NOTES_DIR;
      await fs.mkdir(currentNotesDir, { recursive: true });
    }
    return { success: true, path: currentNotesDir };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC 处理：获取所有笔记
ipcMain.handle('notes:getAll', async () => {
  try {
    await ensureNotesDir();
    const files = await fs.readdir(currentNotesDir);
    const mdFiles = files.filter(f => f.endsWith('.md'));
    
    const notes = await Promise.all(
      mdFiles.map(async (filename) => {
        const filepath = path.join(currentNotesDir, filename);
        const stat = await fs.stat(filepath);
        const content = await fs.readFile(filepath, 'utf-8');
        return {
          id: filename.replace('.md', ''),
          filename,
          filepath,
          content,
          modifiedAt: stat.mtime,
          createdAt: stat.birthtime,
        };
      })
    );
    
    return notes.sort((a, b) => b.modifiedAt - a.modifiedAt);
  } catch (err) {
    console.error('Failed to get notes:', err);
    return [];
  }
});

// IPC 处理：读取笔记
ipcMain.handle('notes:read', async (event, filename) => {
  try {
    const filepath = path.join(currentNotesDir, filename);
    const content = await fs.readFile(filepath, 'utf-8');
    return { success: true, content };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC 处理：保存笔记
ipcMain.handle('notes:save', async (event, { filename, content, preserveModifiedAt } = {}) => {
  try {
    await ensureNotesDir();
    const filepath = path.join(currentNotesDir, filename);

    let previousStat = null;
    if (preserveModifiedAt) {
      try {
        previousStat = await fs.stat(filepath);
      } catch {
        previousStat = null;
      }
    }

    await fs.writeFile(filepath, content, 'utf-8');

    if (preserveModifiedAt && previousStat) {
      try {
        await fs.utimes(filepath, previousStat.atime, previousStat.mtime);
      } catch (err) {
        console.warn('Failed to preserve note timestamps:', err?.message || String(err));
      }
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC 处理：创建新笔记
ipcMain.handle('notes:create', async (event, { filename, content }) => {
  try {
    await ensureNotesDir();
    const filepath = path.join(currentNotesDir, filename);
    await fs.writeFile(filepath, content, 'utf-8');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC 处理：删除笔记
ipcMain.handle('notes:delete', async (event, filename) => {
  try {
    const filepath = path.join(currentNotesDir, filename);
    await fs.unlink(filepath);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC 处理：导出 PDF
ipcMain.handle('notes:exportPdf', async (event, data) => {
  try {
    await ensureNotesDir();

    const title = data?.title || 'Untitled';
    const html = data?.html || '';
    const options = data?.options || {};
    const suggestedFileName = typeof data?.suggestedFileName === 'string' ? data.suggestedFileName.trim() : 'note.pdf';

    const saveResult = await dialog.showSaveDialog({
      title: 'Export as PDF',
      defaultPath: path.join(currentNotesDir, suggestedFileName || 'note.pdf'),
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
      properties: ['createDirectory', 'showOverwriteConfirmation'],
    });

    if (saveResult.canceled || !saveResult.filePath) {
      return { success: false, canceled: true };
    }

    const outPath = saveResult.filePath.toLowerCase().endsWith('.pdf')
      ? saveResult.filePath
      : `${saveResult.filePath}.pdf`;

    const pageSize = options.pageSize === 'Letter' ? 'Letter' : 'A4';
    const landscape = options.orientation === 'landscape';
    const includeHeader = Boolean(options.includeHeader);
    const includeTitle = Boolean(options.includeTitle);
    const includeDate = Boolean(options.includeDate);
    const includePageNumbers = Boolean(options.includePageNumbers);
    const dateText = typeof options.dateText === 'string' ? options.dateText : '';
    const fontFamily = typeof options.fontFamily === 'string' ? options.fontFamily : '';

    const baseHref = pathToFileURL(`${currentNotesDir}${path.sep}`).toString();
    const exportHtml = buildNoteExportHtml({
      title,
      dateText,
      bodyHtml: html,
      includeTitle,
      includeDate,
      includeHeader,
      fontFamily,
      baseHref,
    });

    const exportWindow = new BrowserWindow({
      show: false,
      width: 900,
      height: 1100,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        devTools: false,
      },
    });

    try {
      await exportWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(exportHtml)}`);

      // Wait for images (best effort, with timeout)
      await exportWindow.webContents.executeJavaScript(
        `Promise.race([
          Promise.all(Array.from(document.images || []).map(img => img && img.complete ? Promise.resolve() : new Promise(resolve => { if (!img) return resolve(); img.addEventListener('load', resolve, { once: true }); img.addEventListener('error', resolve, { once: true }); }))),
          new Promise(resolve => setTimeout(resolve, 15000)),
        ])`,
        true
      );

      const displayHeaderFooter = includeHeader || includePageNumbers;

      const headerFont = sanitizeCssFontFamily(fontFamily) || 'system-ui';
      const headerTemplate = displayHeaderFooter && includeHeader && (includeTitle || includeDate)
        ? `<div style="width:100%; padding: 0 16px; font-size: 9px; color: #9CA3AF; font-family: ${headerFont};">
            <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
              <div style="max-width: 70%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                ${includeTitle ? escapeHtml(title) : ''}
              </div>
              <div style="max-width: 30%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; text-align:right;">
                ${includeDate ? escapeHtml(dateText) : ''}
              </div>
            </div>
          </div>`
        : '<div></div>';

      const footerTemplate = displayHeaderFooter && includePageNumbers
        ? `<div style="width:100%; padding: 0 16px; font-size: 9px; color: #9CA3AF; font-family: ${headerFont};">
            <div style="display:flex; justify-content:flex-end; width:100%;">
              <span class="pageNumber"></span>/<span class="totalPages"></span>
            </div>
          </div>`
        : '<div></div>';

      const pdfBuffer = await exportWindow.webContents.printToPDF({
        pageSize,
        landscape,
        printBackground: true,
        displayHeaderFooter,
        headerTemplate,
        footerTemplate,
      });

      await fs.writeFile(outPath, pdfBuffer);
    } finally {
      exportWindow.destroy();
    }

    return { success: true, filePath: outPath };
  } catch (err) {
    console.error('Failed to export PDF:', err);
    return { success: false, error: err?.message || String(err) };
  }
});

ipcMain.handle('wechat:generateHtmlWithAi', async (event, data = {}) => {
  try {
    const providerValue = typeof data.provider === 'string' ? data.provider.trim().toLowerCase() : '';
    if (!providerValue) {
      return { success: false, error: 'WeChat AI provider is missing. Please restart Notely and try again.' };
    }
    if (!SUPPORTED_WECHAT_AI_PROVIDERS.has(providerValue)) {
      return { success: false, error: `Unsupported WeChat AI provider "${providerValue}"` };
    }

    const provider = providerValue;
    const apiKey = typeof data.apiKey === 'string' ? data.apiKey.trim() : '';
    const model = typeof data.model === 'string' ? data.model.trim() : '';
    const markdown = typeof data.markdown === 'string' ? data.markdown.trim() : '';
    const title = typeof data.title === 'string' ? data.title.trim() : '';
    const requestedThemeId = typeof data.themeId === 'string' ? data.themeId.trim() : '';
    const theme = getWechatThemeConfig(requestedThemeId || DEFAULT_WECHAT_LAYOUT_THEME_ID);
    const providerLabel = provider === 'openrouter' ? 'OpenRouter' : 'Moonshot';

    if (!apiKey) {
      return { success: false, error: `${providerLabel} API key is not configured` };
    }
    if (!model) {
      return { success: false, error: `${providerLabel} model is not configured` };
    }
    if (!markdown) {
      return { success: false, error: 'Note content is empty' };
    }
    if (!theme) {
      return { success: false, error: 'Unsupported WeChat layout theme' };
    }

    const systemPrompt = getWechatLayoutSystemPrompt(theme.id);
    if (!systemPrompt) {
      return { success: false, error: `WeChat layout system prompt is missing for theme "${theme.name}"` };
    }

    const html = provider === 'openrouter'
      ? await requestOpenRouterWechatHtml({
          apiKey,
          model,
          title,
          markdown,
          systemPrompt,
        })
      : await requestMoonshotWechatHtml({
          apiKey,
          model,
          title,
          markdown,
          systemPrompt,
        });

    return { success: true, html };
  } catch (err) {
    console.error('Failed to generate WeChat HTML with AI:', err);
    return { success: false, error: err?.message || String(err) };
  }
});

// IPC 处理：选择存储目录
ipcMain.handle('settings:selectDirectory', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
  });
  return result.filePaths[0] || null;
});

// IPC 处理：打开外部链接
ipcMain.handle('shell:openExternal', async (event, url) => {
  await shell.openExternal(url);
});

ipcMain.handle('clipboard:writeText', async (event, text) => {
  try {
    clipboard.writeText(typeof text === 'string' ? text : String(text ?? ''));
    return { success: true };
  } catch (err) {
    return { success: false, error: err?.message || String(err) };
  }
});

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'local-fonts') {
      callback(true);
      return;
    }
    callback(false);
  });

  createWindow();
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
