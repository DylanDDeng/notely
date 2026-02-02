const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');
const http = require('http');

// 存储路径
const NOTES_DIR = path.join(os.homedir(), 'Documents', 'Notes');

// 判断是否在开发模式
const isDev = !app.isPackaged;

// 确保笔记目录存在
async function ensureNotesDir() {
  try {
    await fs.mkdir(NOTES_DIR, { recursive: true });
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

// 创建窗口
async function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
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
      // 显示错误页面
      mainWindow.loadURL('data:text/html,<h1>Development server not found</h1><p>Please ensure vite is running on ports 5173-5180</p>');
    }
  } else {
    // 生产模式
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

// IPC 处理：获取所有笔记
ipcMain.handle('notes:getAll', async () => {
  try {
    await ensureNotesDir();
    const files = await fs.readdir(NOTES_DIR);
    const mdFiles = files.filter(f => f.endsWith('.md'));
    
    const notes = await Promise.all(
      mdFiles.map(async (filename) => {
        const filepath = path.join(NOTES_DIR, filename);
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
    const filepath = path.join(NOTES_DIR, filename);
    const content = await fs.readFile(filepath, 'utf-8');
    return { success: true, content };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC 处理：保存笔记
ipcMain.handle('notes:save', async (event, { filename, content }) => {
  try {
    await ensureNotesDir();
    const filepath = path.join(NOTES_DIR, filename);
    await fs.writeFile(filepath, content, 'utf-8');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC 处理：创建新笔记
ipcMain.handle('notes:create', async (event, { filename, content }) => {
  try {
    await ensureNotesDir();
    const filepath = path.join(NOTES_DIR, filename);
    await fs.writeFile(filepath, content, 'utf-8');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC 处理：删除笔记
ipcMain.handle('notes:delete', async (event, filename) => {
  try {
    const filepath = path.join(NOTES_DIR, filename);
    await fs.unlink(filepath);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC 处理：选择存储目录
ipcMain.handle('settings:selectDirectory', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
  });
  return result.filePaths[0] || null;
});

// IPC 处理：打开外部链接
ipcMain.handle('shell:openExternal', async (event, url) => {
  await shell.openExternal(url);
});

app.whenReady().then(() => {
  ensureNotesDir();
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
