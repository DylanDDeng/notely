const { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, session, shell } = require('electron');
const fs = require('fs').promises;
const http = require('http');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

const DEFAULT_NOTES_DIR = path.join(os.homedir(), 'Documents', 'Notes');
const isDev = !app.isPackaged;
let isAppQuitting = false;

let currentNotesDir = DEFAULT_NOTES_DIR;

function buildWindowUrl(baseUrl, options = {}) {
  const url = new URL(baseUrl);
  if (options.newDocument) {
    url.searchParams.set('newDocument', '1');
    url.searchParams.set('draftKey', options.draftKey || `draft-${Date.now()}`);
  }
  return url.toString();
}

async function ensureNotesDir() {
  try {
    await fs.mkdir(currentNotesDir, { recursive: true });
  } catch (err) {
    console.error('Failed to create notes directory:', err);
  }
}

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

function stripNullChars(value) {
  return String(value || '').replace(/\0/g, '').trim();
}

function fileUrlToPath(value) {
  try {
    return decodeURI(new URL(value).pathname).replace(/^\/([A-Za-z]:\/)/, '$1');
  } catch {
    return '';
  }
}

function isLikelyImagePath(value) {
  return /\.(png|jpe?g|gif|webp|svg|bmp|ico|avif)$/i.test(value);
}

function guessImageMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ({
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.bmp': 'image/bmp',
    '.ico': 'image/x-icon',
    '.avif': 'image/avif',
  })[ext];
}

async function resolveImagePathToDataUrl(filePath) {
  const mimeType = guessImageMimeType(filePath);
  if (!mimeType) return null;
  const buffer = await fs.readFile(filePath);
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

function resolveLocalImageSource(src, baseDir) {
  const trimmed = String(src || '').trim();
  if (!trimmed) return null;
  if (/^(data:|blob:|https?:\/\/|mailto:)/i.test(trimmed)) return null;

  if (/^file:\/\//i.test(trimmed)) {
    const localPath = fileUrlToPath(trimmed);
    return localPath && isLikelyImagePath(localPath) ? localPath : null;
  }

  if ((trimmed.startsWith('/') || /^[A-Za-z]:[\\/]/.test(trimmed)) && isLikelyImagePath(trimmed)) {
    return trimmed;
  }

  const candidate = path.resolve(baseDir, trimmed);
  return isLikelyImagePath(candidate) ? candidate : null;
}

async function inlineLocalImagesInHtml(html, baseDir) {
  const source = String(html || '');
  const matches = [...source.matchAll(/<img\b[^>]*?\bsrc=(["'])(.*?)\1[^>]*>/gi)];
  if (matches.length === 0) return source;

  let result = source;
  const cache = new Map();

  for (const match of matches) {
    const fullMatch = match[0];
    const quote = match[1];
    const rawSrc = match[2];
    const localPath = resolveLocalImageSource(rawSrc, baseDir);
    if (!localPath) continue;

    let dataUrl = cache.get(localPath);
    if (dataUrl === undefined) {
      try {
        dataUrl = await resolveImagePathToDataUrl(localPath);
      } catch {
        dataUrl = null;
      }
      cache.set(localPath, dataUrl);
    }

    if (!dataUrl) continue;

    const escapedSrc = rawSrc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const attrPattern = new RegExp(`src=${quote}${escapedSrc}${quote}`);
    result = result.replace(fullMatch, fullMatch.replace(attrPattern, `src=${quote}${dataUrl}${quote}`));
  }

  return result;
}

function extractImagePathFromClipboardEntries(entries) {
  const prioritized = [...entries].sort((a, b) => {
    const score = (format) => {
      if (/file-url/i.test(format)) return 0;
      if (/NSFilenamesPboardType|filenames/i.test(format)) return 1;
      if (/public\.url|text\/uri-list/i.test(format)) return 2;
      if (/text\/plain|public\.utf8-plain-text/i.test(format)) return 3;
      return 10;
    };
    return score(a.format) - score(b.format);
  });

  for (const entry of prioritized) {
    const textCandidates = [entry.value, entry.utf8]
      .filter((value) => typeof value === 'string' && value.length > 0)
      .map(stripNullChars)
      .filter(Boolean);

    for (const candidate of textCandidates) {
      const fileUrlMatch = candidate.match(/file:\/\/[^\s]+/i);
      if (fileUrlMatch) {
        const filePath = fileUrlToPath(fileUrlMatch[0]);
        if (filePath && isLikelyImagePath(filePath)) return filePath;
      }

      const absolutePathMatch = candidate.match(/(?:\/Users\/|\/Volumes\/|\/private\/|\/tmp\/)[^\s]+/);
      if (absolutePathMatch && isLikelyImagePath(absolutePathMatch[0])) {
        return absolutePathMatch[0];
      }

      const windowsPathMatch = candidate.match(/[A-Za-z]:[\\/][^\s]+/);
      if (windowsPathMatch && isLikelyImagePath(windowsPathMatch[0])) {
        return windowsPathMatch[0];
      }
    }
  }

  return null;
}

function sanitizeFilename(name) {
  return String(name || 'pasted-image')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function buildNoteExportHtml({ title, dateText, bodyHtml, includeTitle, includeDate, includeHeader, fontFamily, baseHref }) {
  const safeTitle = escapeHtml(title || 'Untitled');
  const safeDate = escapeHtml(dateText || '');
  const safeBaseHref = baseHref ? escapeHtml(baseHref) : '';
  const family = sanitizeCssFontFamily(fontFamily);
  const defaultFontStack = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
  const cjkFontStack = "'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans CJK SC', 'Source Han Sans SC', 'Heiti SC', sans-serif";
  const fullFontStack = family
    ? `${family}, ${defaultFontStack}, ${cjkFontStack}`
    : `${defaultFontStack}, ${cjkFontStack}`;

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
        --app-font-family: ${fullFontStack};
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
      .note-content p,
      .note-content li,
      .note-content blockquote {
        white-space: pre-wrap;
      }

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
    </style>
  </head>
  <body>
    <main class="container">
      ${includeHeader ? '' : ''}
      ${titleBlock}
      ${dateBlock}
      <article class="note-content">${bodyHtml}</article>
    </main>
  </body>
</html>`;
}

async function createWindow(options = {}) {
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

  let allowClose = false;
  mainWindow.on('close', async (event) => {
    if (allowClose || isAppQuitting) return;
    event.preventDefault();

    try {
      const rawState = await mainWindow.webContents.executeJavaScript(
        'JSON.stringify(window.__notelyUnsavedState ?? null)',
        true
      );
      const state = rawState ? JSON.parse(rawState) : null;
      if (!state?.dirty) {
        if (process.platform === 'darwin') {
          mainWindow.hide();
        } else {
          allowClose = true;
          mainWindow.close();
        }
        return;
      }

      const { response } = await dialog.showMessageBox(mainWindow, {
        type: 'question',
        buttons: ['Save', "Don't Save", 'Cancel'],
        defaultId: 0,
        cancelId: 2,
        message: `Save changes to "${state.title || 'Untitled'}"?`,
        detail: state.isDraft
          ? 'Your markdown document is not saved yet.'
          : 'Your recent changes will be lost if you do not save them.',
      });

      if (response === 2) {
        return;
      }

      if (response === 0) {
        const saved = await mainWindow.webContents.executeJavaScript(
          'window.__notelySaveCurrent ? window.__notelySaveCurrent(true) : Promise.resolve(false)',
          true
        );
        if (!saved) return;
      }

      if (response === 1) {
        const draftStorageKey = typeof state?.draftStorageKey === 'string' ? state.draftStorageKey : 'notes:unsavedDraft';
        await mainWindow.webContents.executeJavaScript(
          `try { localStorage.removeItem(${JSON.stringify(draftStorageKey)}); } catch {}`,
          true
        );
      }

      if (process.platform === 'darwin') {
        mainWindow.hide();
      } else {
        allowClose = true;
        mainWindow.close();
      }
    } catch (err) {
      console.error('Failed to handle close/save flow:', err);
    }
  });

  buildApplicationMenu(mainWindow);

  if (isDev) {
    const preferredUrl = typeof process.env.NOTELY_DEV_SERVER_URL === 'string'
      ? process.env.NOTELY_DEV_SERVER_URL.trim()
      : '';
    if (preferredUrl) {
      try {
        await mainWindow.loadURL(buildWindowUrl(preferredUrl, options));
        console.log(`Loaded dev server at ${preferredUrl}`);
        mainWindow.webContents.openDevTools({ mode: 'detach' });
        return;
      } catch (err) {
        console.log(`Failed to load preferred dev server ${preferredUrl}:`, err?.message || String(err));
      }
    }

    const ports = [5173, 5174, 5175, 5176, 5177, 5178, 5179, 5180];
    let loaded = false;

    for (const port of ports) {
      const isAvailable = await checkPort(port);
      if (!isAvailable) continue;

      const url = `http://localhost:${port}`;
      try {
        await mainWindow.loadURL(buildWindowUrl(url, options));
        loaded = true;
        console.log(`Loaded dev server at ${url}`);
        mainWindow.webContents.openDevTools({ mode: 'detach' });
        break;
      } catch (err) {
        console.log(`Failed to load ${url}:`, err?.message || String(err));
      }
    }

    if (!loaded) {
      console.error('Could not connect to any Vite dev server port');
      await mainWindow.loadURL(
        'data:text/html,<h1>Development server not found</h1><p>Please ensure vite is running on ports 5173-5180</p>'
      );
    }
    return;
  }

  const fileUrl = pathToFileURL(path.join(__dirname, '../dist/index.html')).toString();
  await mainWindow.loadURL(buildWindowUrl(fileUrl, options));
}

ipcMain.handle('notes:getStoragePath', async () => currentNotesDir);

ipcMain.handle('notes:setStoragePath', async (_event, newPath) => {
  try {
    if (newPath && String(newPath).trim() !== '') {
      await fs.mkdir(newPath, { recursive: true });
      currentNotesDir = newPath;
    } else {
      currentNotesDir = DEFAULT_NOTES_DIR;
      await fs.mkdir(currentNotesDir, { recursive: true });
    }

    return { success: true, path: currentNotesDir };
  } catch (err) {
    return { success: false, error: err?.message || String(err) };
  }
});

ipcMain.handle('notes:getAll', async () => {
  try {
    await ensureNotesDir();
    const files = await fs.readdir(currentNotesDir);
    const mdFiles = files.filter((file) => file.endsWith('.md'));

    const notes = await Promise.all(
      mdFiles.map(async (filename) => {
        const filepath = path.join(currentNotesDir, filename);
        const stat = await fs.stat(filepath);
        const content = await fs.readFile(filepath, 'utf-8');
        return {
          id: filename.replace(/\.md$/i, ''),
          filename,
          filepath,
          content,
          modifiedAt: stat.mtime.toISOString(),
          createdAt: stat.birthtime.toISOString(),
        };
      })
    );

    return notes.sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());
  } catch (err) {
    console.error('Failed to get notes:', err);
    return [];
  }
});

ipcMain.handle('notes:read', async (_event, filename) => {
  try {
    const filepath = path.join(currentNotesDir, filename);
    const content = await fs.readFile(filepath, 'utf-8');
    return { success: true, content };
  } catch (err) {
    return { success: false, error: err?.message || String(err) };
  }
});

ipcMain.handle('notes:save', async (_event, { filename, content, preserveModifiedAt } = {}) => {
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
    return { success: false, error: err?.message || String(err) };
  }
});

ipcMain.handle('notes:saveAs', async (_event, { suggestedFilename, content } = {}) => {
  try {
    await ensureNotesDir();

    const fallbackName = typeof suggestedFilename === 'string' && suggestedFilename.trim() ? suggestedFilename.trim() : 'Untitled.md';
    const saveResult = await dialog.showSaveDialog({
      title: 'Save Markdown Document',
      defaultPath: path.join(currentNotesDir, fallbackName),
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
      properties: ['createDirectory', 'showOverwriteConfirmation'],
    });

    if (saveResult.canceled || !saveResult.filePath) {
      return { success: false, canceled: true };
    }

    const outPath = /\.(md|markdown)$/i.test(saveResult.filePath)
      ? saveResult.filePath
      : `${saveResult.filePath}.md`;

    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, content, 'utf-8');

    currentNotesDir = path.dirname(outPath);

    return {
      success: true,
      filepath: outPath,
      filename: path.basename(outPath),
      directory: currentNotesDir,
    };
  } catch (err) {
    return { success: false, error: err?.message || String(err) };
  }
});

ipcMain.handle('notes:create', async (_event, { filename, content } = {}) => {
  try {
    await ensureNotesDir();
    const filepath = path.join(currentNotesDir, filename);
    await fs.writeFile(filepath, content, 'utf-8');
    return { success: true };
  } catch (err) {
    return { success: false, error: err?.message || String(err) };
  }
});

ipcMain.handle('notes:delete', async (_event, filename) => {
  try {
    const filepath = path.join(currentNotesDir, filename);
    await fs.unlink(filepath);
    return { success: true };
  } catch (err) {
    return { success: false, error: err?.message || String(err) };
  }
});

ipcMain.handle('notes:exportPdf', async (_event, data) => {
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
    const inlinedBodyHtml = await inlineLocalImagesInHtml(html, currentNotesDir);
    const exportHtml = buildNoteExportHtml({
      title,
      dateText,
      bodyHtml: inlinedBodyHtml,
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

ipcMain.handle('settings:selectDirectory', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
  });
  return result.filePaths[0] || null;
});

ipcMain.handle('shell:openExternal', async (_event, url) => {
  await shell.openExternal(url);
});

ipcMain.handle('clipboard:writeText', async (_event, text) => {
  try {
    clipboard.writeText(typeof text === 'string' ? text : String(text ?? ''));
    return { success: true };
  } catch (err) {
    return { success: false, error: err?.message || String(err) };
  }
});

ipcMain.handle('clipboard:getDebugPayload', async () => {
  try {
    const formats = clipboard.availableFormats();
    const entries = formats.map((format) => {
      try {
        const text = clipboard.read(format);
        if (text) {
          return {
            format,
            kind: 'text',
            value: text,
          };
        }
      } catch {
        // fall through to buffer read
      }

      try {
        const buffer = clipboard.readBuffer(format);
        return {
          format,
          kind: 'buffer',
          utf8: buffer.toString('utf8'),
          hexPreview: buffer.toString('hex').slice(0, 256),
        };
      } catch (err) {
        return {
          format,
          kind: 'error',
          error: err?.message || String(err),
        };
      }
    });

    return { success: true, formats: entries };
  } catch (err) {
    return { success: false, error: err?.message || String(err) };
  }
});

ipcMain.handle('clipboard:getLocalImagePath', async () => {
  try {
    const formats = clipboard.availableFormats();
    const entries = formats.map((format) => {
      try {
        const text = clipboard.read(format);
        if (text) {
          return { format, value: text };
        }
      } catch {
        // ignore and try buffer
      }

      try {
        const buffer = clipboard.readBuffer(format);
        return { format, utf8: buffer.toString('utf8') };
      } catch {
        return { format };
      }
    });

    const filePath = extractImagePathFromClipboardEntries(entries);
    return {
      success: Boolean(filePath),
      filePath: filePath || undefined,
    };
  } catch (err) {
    return { success: false, error: err?.message || String(err) };
  }
});

ipcMain.handle('media:saveClipboardImageAsset', async (_event, data) => {
  try {
    await ensureNotesDir();

    const dataUrl = typeof data?.dataUrl === 'string' ? data.dataUrl : '';
    const suggestedName = typeof data?.suggestedName === 'string' ? data.suggestedName : 'pasted-image';
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
      return { success: false, error: 'Invalid image data URL' };
    }

    const mimeType = match[1];
    const base64 = match[2];
    const ext = ({
      'image/png': '.png',
      'image/jpeg': '.jpg',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'image/svg+xml': '.svg',
      'image/bmp': '.bmp',
      'image/x-icon': '.ico',
      'image/avif': '.avif',
    })[mimeType];

    if (!ext) {
      return { success: false, error: `Unsupported image type: ${mimeType}` };
    }

    const assetDir = path.join(currentNotesDir, '.notely-assets');
    await fs.mkdir(assetDir, { recursive: true });

    const baseName = sanitizeFilename(path.basename(suggestedName, path.extname(suggestedName)) || 'pasted-image');
    const filename = `${baseName || 'pasted-image'}-${Date.now()}${ext}`;
    const filePath = path.join(assetDir, filename);
    const buffer = Buffer.from(base64, 'base64');
    await fs.writeFile(filePath, buffer);

    return {
      success: true,
      filePath,
    };
  } catch (err) {
    return { success: false, error: err?.message || String(err) };
  }
});

ipcMain.handle('media:resolveLocalImage', async (_event, filePath) => {
  try {
    const rawPath = typeof filePath === 'string' ? filePath.trim() : '';
    if (!rawPath) {
      return { success: false, error: 'Missing file path' };
    }

    const normalizedPath = rawPath
      .replace(/^file:\/\//i, '')
      .replace(/^\/([A-Za-z]:\/)/, '$1');

    const dataUrl = await resolveImagePathToDataUrl(normalizedPath);
    if (!dataUrl) {
      return { success: false, error: `Unsupported image type: ${path.extname(normalizedPath).toLowerCase() || 'unknown'}` };
    }
    return {
      success: true,
      dataUrl,
    };
  } catch (err) {
    return { success: false, error: err?.message || String(err) };
  }
});

function buildApplicationMenu(mainWindow) {
  const isMac = process.platform === 'darwin';

  const send = (action) => {
    mainWindow.webContents.send('menu-action', action);
  };

  const template = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { label: `About ${app.name}`, click: () => send('about') },
        { type: 'separator' },
        { label: 'Preferences…', accelerator: 'CmdOrCtrl+,', click: () => send('open-settings') },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'New Document', accelerator: 'CmdOrCtrl+N', click: () => void createWindow({ newDocument: true }) },
        { type: 'separator' },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => send('save-note') },
        { label: 'Save As…', accelerator: 'CmdOrCtrl+Shift+S', click: () => send('save-note-as') },
        { type: 'separator' },
        { label: 'Open Folder…', accelerator: 'CmdOrCtrl+Shift+O', click: () => send('open-folder') },
        { type: 'separator' },
        { label: 'Export PDF…', accelerator: 'CmdOrCtrl+Shift+E', click: () => send('export-pdf') },
        { type: 'separator' },
        { role: 'closeWindow' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        { label: 'Find', accelerator: 'CmdOrCtrl+F', click: () => send('find') },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Toggle Sidebar', accelerator: 'CmdOrCtrl+\\', click: () => send('toggle-sidebar') },
        { label: 'Toggle Outline', accelerator: 'CmdOrCtrl+Shift+L', click: () => send('toggle-outline') },
        { type: 'separator' },
        { label: 'Actual Size', accelerator: 'CmdOrCtrl+0', click: () => send('zoom-reset') },
        { label: 'Zoom In', accelerator: 'CmdOrCtrl+=', click: () => send('zoom-in') },
        { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', click: () => send('zoom-out') },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'toggleDevTools' },
      ],
    },
    {
      label: 'Format',
      submenu: [
        { label: 'Bold', accelerator: 'CmdOrCtrl+B', click: () => send('format-bold') },
        { label: 'Italic', accelerator: 'CmdOrCtrl+I', click: () => send('format-italic') },
        { label: 'Strikethrough', accelerator: 'CmdOrCtrl+Shift+S', click: () => send('format-strikethrough') },
        { label: 'Inline Code', accelerator: 'CmdOrCtrl+Shift+`', click: () => send('format-inline-code') },
        { type: 'separator' },
        { label: 'Hyperlink', accelerator: 'CmdOrCtrl+K', click: () => send('format-link') },
        { label: 'Image', accelerator: 'CmdOrCtrl+Shift+I', click: () => send('format-image') },
        { type: 'separator' },
        { label: 'Heading 1', accelerator: 'CmdOrCtrl+1', click: () => send('format-heading-1') },
        { label: 'Heading 2', accelerator: 'CmdOrCtrl+2', click: () => send('format-heading-2') },
        { label: 'Heading 3', accelerator: 'CmdOrCtrl+3', click: () => send('format-heading-3') },
        { label: 'Heading 4', accelerator: 'CmdOrCtrl+4', click: () => send('format-heading-4') },
        { label: 'Heading 5', accelerator: 'CmdOrCtrl+5', click: () => send('format-heading-5') },
        { label: 'Heading 6', accelerator: 'CmdOrCtrl+6', click: () => send('format-heading-6') },
        { label: 'Paragraph', accelerator: 'CmdOrCtrl+0', click: () => send('format-heading-0') },
        { type: 'separator' },
        { label: 'Unordered List', accelerator: 'CmdOrCtrl+L', click: () => send('format-ul') },
        { label: 'Ordered List', click: () => send('format-ol') },
        { label: 'Blockquote', accelerator: 'CmdOrCtrl+Shift+B', click: () => send('format-blockquote') },
        { label: 'Code Block', accelerator: 'CmdOrCtrl+Shift+K', click: () => send('format-code-block') },
        { type: 'separator' },
        { label: 'Horizontal Rule', accelerator: 'CmdOrCtrl+Shift+H', click: () => send('format-hr') },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac ? [
          { type: 'separator' },
          { role: 'front' },
        ] : []),
      ],
    },
    {
      label: 'Help',
      submenu: [
        { label: `${app.name} Help`, click: () => send('help') },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    if (permission === 'local-fonts') {
      callback(true);
      return;
    }
    callback(false);
  });

  void createWindow();

  app.on('activate', () => {
    const windows = BrowserWindow.getAllWindows();
    if (windows.length === 0) {
      void createWindow();
      return;
    }
    const [firstWindow] = windows;
    if (firstWindow) {
      firstWindow.show();
      firstWindow.focus();
    }
  });
});

app.on('before-quit', () => {
  isAppQuitting = true;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
