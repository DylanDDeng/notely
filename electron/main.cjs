const { app, BrowserWindow, ipcMain, dialog, shell, session, clipboard, safeStorage } = require('electron');
const { spawn } = require('child_process');
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
  'editorial-pick': {
    name: 'Editorial Pick',
    promptPath: path.join(__dirname, 'prompts', 'wechat-layout-editorial-pick-system-prompt.md'),
  },
});
const DEFAULT_WECHAT_LAYOUT_THEME_ID = 'digital-tools-guide';
const cachedWechatLayoutSystemPrompt = Object.create(null);
const SUPPORTED_WECHAT_AI_PROVIDERS = new Set(['moonshot', 'openrouter']);
const NOTE_HISTORY_DIRNAME = '.history';
const NOTE_HISTORY_INDEX_FILENAME = 'index.json';
const NOTE_HISTORY_VERSIONS_DIRNAME = 'versions';
const NOTE_HISTORY_MAX_VERSIONS = 80;
const NOTE_HISTORY_SOURCES = new Set(['save', 'create', 'rollback']);
const GIT_SYNC_CONFIG_FILENAME = 'git-sync.json';
const GIT_ASKPASS_FILENAME = 'git-askpass.sh';
const DEFAULT_GIT_SYNC_BRANCH = 'main';
const DEFAULT_GIT_SYNC_INTERVAL_MINUTES = 5;
const MIN_GIT_SYNC_INTERVAL_MINUTES = 1;
const MAX_GIT_SYNC_INTERVAL_MINUTES = 120;
const GIT_SYNC_STATUS_VALUES = new Set(['idle', 'running', 'success', 'error', 'conflict', 'disabled', 'skipped']);
const GIT_SYNC_BRANCH_PATTERN = /^[A-Za-z0-9._/-]+$/;
const GIT_SYNC_HTTP_REMOTE_RE = /^https:\/\/.+/i;
const GIT_SYNC_NOTES_PATHSPEC = ':(top)*.md';
const GIT_SYNC_COMMITTER_NAME = 'Notely Sync';
const GIT_SYNC_COMMITTER_EMAIL = 'sync@notely.local';

// 判断是否在开发模式
const isDev = !app.isPackaged;
let gitSyncState = null;
let gitSyncStateLoaded = false;
let gitSyncTimer = null;
let gitSyncInFlight = false;

// 确保笔记目录存在
async function ensureNotesDir() {
  try {
    await fs.mkdir(currentNotesDir, { recursive: true });
  } catch (err) {
    console.error('Failed to create notes directory:', err);
  }
}

function normalizeHistorySource(source) {
  return NOTE_HISTORY_SOURCES.has(source) ? source : 'save';
}

function isValidHistoryVersionId(versionId) {
  return typeof versionId === 'string' && /^[a-z0-9-]{6,96}$/i.test(versionId);
}

function getHistoryRootDir() {
  return path.join(currentNotesDir, NOTE_HISTORY_DIRNAME);
}

function getHistoryKeyForFilename(filename) {
  return encodeURIComponent(String(filename || '').trim());
}

function getNoteHistoryDir(filename) {
  return path.join(getHistoryRootDir(), getHistoryKeyForFilename(filename));
}

function getNoteHistoryIndexPath(filename) {
  return path.join(getNoteHistoryDir(filename), NOTE_HISTORY_INDEX_FILENAME);
}

function getNoteHistoryVersionsDir(filename) {
  return path.join(getNoteHistoryDir(filename), NOTE_HISTORY_VERSIONS_DIRNAME);
}

function getNoteHistoryVersionPath(filename, versionId) {
  return path.join(getNoteHistoryVersionsDir(filename), `${versionId}.md`);
}

function stripFrontmatterForPreview(content) {
  const text = String(content || '');
  if (!text.startsWith('---\n')) return text;
  const end = text.indexOf('\n---\n', 4);
  if (end < 0) return text;
  return text.slice(end + 5);
}

function buildHistoryPreview(content) {
  const source = stripFrontmatterForPreview(content);
  const compact = source
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return compact.slice(0, 140);
}

function normalizeHistoryEntries(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item) => item && typeof item === 'object')
    .map((item) => {
      const createdAt =
        typeof item.createdAt === 'string' && !Number.isNaN(Date.parse(item.createdAt))
          ? item.createdAt
          : new Date().toISOString();
      const id = typeof item.id === 'string' ? item.id.trim() : '';
      if (!isValidHistoryVersionId(id)) return null;
      return {
        id,
        createdAt,
        source: normalizeHistorySource(item.source),
        size: Number.isFinite(item.size) ? Number(item.size) : 0,
        preview: typeof item.preview === 'string' ? item.preview : '',
        label: typeof item.label === 'string' ? item.label : '',
        pinned: Boolean(item.pinned),
        ...(typeof item.fromVersionId === 'string' && item.fromVersionId ? { fromVersionId: item.fromVersionId } : {}),
      };
    })
    .filter(Boolean);
}

async function readNoteHistoryIndex(filename) {
  const indexPath = getNoteHistoryIndexPath(filename);
  try {
    const raw = await fs.readFile(indexPath, 'utf-8');
    const parsed = JSON.parse(raw);
    return normalizeHistoryEntries(parsed);
  } catch {
    return [];
  }
}

async function writeNoteHistoryIndex(filename, entries) {
  const indexPath = getNoteHistoryIndexPath(filename);
  await fs.writeFile(indexPath, JSON.stringify(entries, null, 2), 'utf-8');
}

function sortHistoryEntriesChronological(entries) {
  return entries
    .slice()
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

async function readLatestHistoryContent(filename, entries) {
  if (!entries.length) return null;
  const latest = entries[entries.length - 1];
  if (!latest || !isValidHistoryVersionId(latest.id)) return null;
  try {
    return await fs.readFile(getNoteHistoryVersionPath(filename, latest.id), 'utf-8');
  } catch {
    return null;
  }
}

async function recordNoteHistoryVersion({ filename, content, source = 'save', fromVersionId } = {}) {
  const safeFilename = typeof filename === 'string' ? filename.trim() : '';
  if (!safeFilename) return null;
  if (typeof content !== 'string') return null;

  const versionsDir = getNoteHistoryVersionsDir(safeFilename);
  await fs.mkdir(versionsDir, { recursive: true });

  const existingEntries = await readNoteHistoryIndex(safeFilename);
  const latestContent = await readLatestHistoryContent(safeFilename, existingEntries);
  if (latestContent === content) {
    return existingEntries[existingEntries.length - 1] || null;
  }

  const versionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await fs.writeFile(getNoteHistoryVersionPath(safeFilename, versionId), content, 'utf-8');

  const nextEntry = {
    id: versionId,
    createdAt: new Date().toISOString(),
    source: normalizeHistorySource(source),
    size: Buffer.byteLength(content, 'utf-8'),
    preview: buildHistoryPreview(content),
    label: '',
    pinned: false,
    ...(typeof fromVersionId === 'string' && fromVersionId ? { fromVersionId } : {}),
  };

  const nextEntries = [...existingEntries, nextEntry];
  const pinnedEntries = nextEntries.filter((entry) => entry.pinned);
  const unpinnedEntries = nextEntries.filter((entry) => !entry.pinned);
  const unpinnedKeepCount = Math.max(0, NOTE_HISTORY_MAX_VERSIONS - pinnedEntries.length);
  const keptUnpinnedEntries =
    unpinnedKeepCount > 0
      ? unpinnedEntries.slice(Math.max(0, unpinnedEntries.length - unpinnedKeepCount))
      : [];
  const keptIds = new Set([...pinnedEntries, ...keptUnpinnedEntries].map((entry) => entry.id));
  const keptEntries = sortHistoryEntriesChronological(nextEntries.filter((entry) => keptIds.has(entry.id)));
  const overflowEntries = nextEntries.filter((entry) => !keptIds.has(entry.id));

  await writeNoteHistoryIndex(safeFilename, keptEntries);

  await Promise.all(
    overflowEntries.map(async (entry) => {
      if (!entry?.id || !isValidHistoryVersionId(entry.id)) return;
      try {
        await fs.unlink(getNoteHistoryVersionPath(safeFilename, entry.id));
      } catch {
        // ignore stale cleanup errors
      }
    })
  );

  return nextEntry;
}

async function listNoteHistoryVersions({ filename, limit = 50 } = {}) {
  const safeFilename = typeof filename === 'string' ? filename.trim() : '';
  if (!safeFilename) return [];

  const entries = await readNoteHistoryIndex(safeFilename);
  const max = Number.isFinite(limit) ? Math.max(1, Math.min(Number(limit), 200)) : 50;
  return entries
    .slice()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, max);
}

async function updateNoteHistoryVersionMeta({ filename, versionId, label, pinned } = {}) {
  const safeFilename = typeof filename === 'string' ? filename.trim() : '';
  if (!safeFilename) throw new Error('Missing filename');
  if (!isValidHistoryVersionId(versionId)) throw new Error('Invalid history version id');

  const entries = await readNoteHistoryIndex(safeFilename);
  const targetIndex = entries.findIndex((entry) => entry.id === versionId);
  if (targetIndex < 0) {
    throw new Error('History version not found');
  }

  const nextEntries = entries.slice();
  const target = { ...nextEntries[targetIndex] };

  if (typeof label === 'string') {
    target.label = label.trim().slice(0, 100);
  }
  if (typeof pinned === 'boolean') {
    target.pinned = pinned;
  }

  nextEntries[targetIndex] = target;
  await writeNoteHistoryIndex(safeFilename, nextEntries);
  return target;
}

async function readNoteHistoryVersionContent({ filename, versionId } = {}) {
  const safeFilename = typeof filename === 'string' ? filename.trim() : '';
  if (!safeFilename) throw new Error('Missing filename');
  if (!isValidHistoryVersionId(versionId)) throw new Error('Invalid history version id');
  return fs.readFile(getNoteHistoryVersionPath(safeFilename, versionId), 'utf-8');
}

function getGitSyncConfigPath() {
  return path.join(app.getPath('userData'), GIT_SYNC_CONFIG_FILENAME);
}

function getGitAskpassScriptPath() {
  return path.join(app.getPath('userData'), GIT_ASKPASS_FILENAME);
}

function createDefaultGitSyncState() {
  return {
    version: 1,
    enabled: false,
    remoteUrl: '',
    branch: DEFAULT_GIT_SYNC_BRANCH,
    autoSyncEnabled: true,
    intervalMinutes: DEFAULT_GIT_SYNC_INTERVAL_MINUTES,
    encryptedToken: '',
    vaultPath: '',
    lastSyncAt: null,
    lastStatus: 'idle',
    lastMessage: '',
    lastConflictFiles: [],
  };
}

function normalizeGitSyncStatus(status) {
  return GIT_SYNC_STATUS_VALUES.has(status) ? status : 'idle';
}

function normalizeGitSyncInterval(interval, fallback = DEFAULT_GIT_SYNC_INTERVAL_MINUTES) {
  const parsed = Number(interval);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(MAX_GIT_SYNC_INTERVAL_MINUTES, Math.max(MIN_GIT_SYNC_INTERVAL_MINUTES, Math.floor(parsed)));
}

function normalizeGitSyncBranch(branch, fallback = DEFAULT_GIT_SYNC_BRANCH) {
  const raw = typeof branch === 'string' ? branch.trim() : '';
  const next = raw || fallback;
  if (!GIT_SYNC_BRANCH_PATTERN.test(next)) {
    throw new Error('Invalid branch name. Allowed: letters, numbers, ., _, -, /.');
  }
  return next;
}

function normalizeGitSyncRemoteUrl(remoteUrl) {
  const value = typeof remoteUrl === 'string' ? remoteUrl.trim() : '';
  if (!value || !GIT_SYNC_HTTP_REMOTE_RE.test(value)) {
    throw new Error('Remote URL must start with https://');
  }
  return value;
}

function normalizeGitSyncState(raw) {
  const fallback = createDefaultGitSyncState();
  if (!raw || typeof raw !== 'object') return fallback;

  const next = {
    ...fallback,
    enabled: Boolean(raw.enabled),
    remoteUrl: typeof raw.remoteUrl === 'string' ? raw.remoteUrl.trim() : '',
    branch: typeof raw.branch === 'string' && raw.branch.trim() ? raw.branch.trim() : fallback.branch,
    autoSyncEnabled: typeof raw.autoSyncEnabled === 'boolean' ? raw.autoSyncEnabled : fallback.autoSyncEnabled,
    intervalMinutes: normalizeGitSyncInterval(raw.intervalMinutes, fallback.intervalMinutes),
    encryptedToken: typeof raw.encryptedToken === 'string' ? raw.encryptedToken : '',
    vaultPath: typeof raw.vaultPath === 'string' ? raw.vaultPath.trim() : '',
    lastSyncAt:
      typeof raw.lastSyncAt === 'string' && !Number.isNaN(Date.parse(raw.lastSyncAt))
        ? raw.lastSyncAt
        : null,
    lastStatus: normalizeGitSyncStatus(raw.lastStatus),
    lastMessage: typeof raw.lastMessage === 'string' ? raw.lastMessage : '',
    lastConflictFiles: Array.isArray(raw.lastConflictFiles)
      ? raw.lastConflictFiles.filter((item) => typeof item === 'string' && item.trim())
      : [],
  };

  if (!next.remoteUrl || !next.encryptedToken) {
    next.enabled = false;
  }

  return next;
}

function getPublicGitSyncConfig() {
  const source = gitSyncState || createDefaultGitSyncState();
  return {
    enabled: Boolean(source.enabled),
    remoteUrl: source.remoteUrl || '',
    branch: source.branch || DEFAULT_GIT_SYNC_BRANCH,
    autoSyncEnabled: Boolean(source.autoSyncEnabled),
    intervalMinutes: normalizeGitSyncInterval(source.intervalMinutes, DEFAULT_GIT_SYNC_INTERVAL_MINUTES),
    tokenConfigured: Boolean(source.encryptedToken),
    lastSyncAt: source.lastSyncAt || null,
    lastStatus: normalizeGitSyncStatus(source.lastStatus),
    lastMessage: source.lastMessage || '',
    lastConflictFiles: Array.isArray(source.lastConflictFiles) ? source.lastConflictFiles : [],
  };
}

async function ensureGitSyncStateLoaded() {
  if (gitSyncStateLoaded && gitSyncState) return gitSyncState;

  const configPath = getGitSyncConfigPath();
  try {
    const raw = await fs.readFile(configPath, 'utf-8');
    const parsed = JSON.parse(raw);
    gitSyncState = normalizeGitSyncState(parsed);
  } catch {
    gitSyncState = createDefaultGitSyncState();
  }
  gitSyncStateLoaded = true;
  return gitSyncState;
}

async function persistGitSyncState() {
  await ensureGitSyncStateLoaded();
  await fs.mkdir(path.dirname(getGitSyncConfigPath()), { recursive: true });
  await fs.writeFile(getGitSyncConfigPath(), JSON.stringify(gitSyncState, null, 2), 'utf-8');
}

async function updateGitSyncState(patch = {}) {
  await ensureGitSyncStateLoaded();
  gitSyncState = normalizeGitSyncState({
    ...gitSyncState,
    ...patch,
  });
  await persistGitSyncState();
  return gitSyncState;
}

function areSamePath(a, b) {
  if (!a || !b) return false;
  return path.resolve(String(a)) === path.resolve(String(b));
}

function isGitRepository(cwd) {
  return fsSync.existsSync(path.join(cwd, '.git'));
}

async function ensureHistoryIgnoredInGit(cwd) {
  const gitignorePath = path.join(cwd, '.gitignore');
  let content = '';
  try {
    content = await fs.readFile(gitignorePath, 'utf-8');
  } catch {
    content = '';
  }

  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.includes('.history/')) return;

  const next = content.trimEnd();
  const suffix = next ? '\n' : '';
  await fs.writeFile(gitignorePath, `${next}${suffix}.history/\n`, 'utf-8');
}

async function ensureGitAskpassScript() {
  const scriptPath = getGitAskpassScriptPath();
  if (fsSync.existsSync(scriptPath)) return scriptPath;

  const scriptContent = [
    '#!/bin/sh',
    'case "$1" in',
    '  *Username*) printf "%s\\n" "${GIT_ASKPASS_USERNAME:-x-access-token}" ;;',
    '  *) printf "%s\\n" "${GIT_ASKPASS_PASSWORD:-}" ;;',
    'esac',
    '',
  ].join('\n');

  await fs.mkdir(path.dirname(scriptPath), { recursive: true });
  await fs.writeFile(scriptPath, scriptContent, { encoding: 'utf-8', mode: 0o700 });
  try {
    await fs.chmod(scriptPath, 0o700);
  } catch {
    // ignore chmod errors
  }
  return scriptPath;
}

function encryptGitToken(token) {
  const value = typeof token === 'string' ? token.trim() : '';
  if (!value) return '';
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('System encryption is unavailable. Cannot store Git token securely.');
  }
  return safeStorage.encryptString(value).toString('base64');
}

function decryptGitToken(encryptedToken) {
  const value = typeof encryptedToken === 'string' ? encryptedToken.trim() : '';
  if (!value) return '';
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('System encryption is unavailable. Please reconnect Git sync.');
  }
  try {
    return safeStorage.decryptString(Buffer.from(value, 'base64'));
  } catch {
    throw new Error('Failed to decrypt stored Git token. Please reconnect Git sync.');
  }
}

async function buildGitAuthEnv(token) {
  const askPass = await ensureGitAskpassScript();
  return {
    GIT_ASKPASS: askPass,
    GIT_TERMINAL_PROMPT: '0',
    GIT_ASKPASS_USERNAME: 'x-access-token',
    GIT_ASKPASS_PASSWORD: token,
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'credential.helper',
    GIT_CONFIG_VALUE_0: '',
  };
}

function buildGitCommitIdentityEnv() {
  return {
    GIT_AUTHOR_NAME: GIT_SYNC_COMMITTER_NAME,
    GIT_AUTHOR_EMAIL: GIT_SYNC_COMMITTER_EMAIL,
    GIT_COMMITTER_NAME: GIT_SYNC_COMMITTER_NAME,
    GIT_COMMITTER_EMAIL: GIT_SYNC_COMMITTER_EMAIL,
  };
}

function runGit(args, { cwd, env, check = true } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, {
      cwd,
      shell: false,
      env: { ...process.env, ...(env || {}) },
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (err) => {
      reject(err);
    });

    child.on('close', (code) => {
      const result = { code: typeof code === 'number' ? code : 1, stdout, stderr, args };
      if (check && result.code !== 0) {
        const error = new Error((stderr || stdout || `Git command failed (${result.code})`).trim());
        error.result = result;
        reject(error);
        return;
      }
      resolve(result);
    });
  });
}

async function runGitWithAuth(args, { cwd, token, check = true, env } = {}) {
  const authEnv = await buildGitAuthEnv(token);
  return runGit(args, {
    cwd,
    check,
    env: {
      ...authEnv,
      ...(env || {}),
    },
  });
}

function formatGitError(err) {
  if (!err) return 'Unknown error';
  if (err instanceof Error && typeof err.message === 'string' && err.message.trim()) {
    return err.message.trim();
  }
  return String(err);
}

async function refreshGitSyncSchedule() {
  await ensureGitSyncStateLoaded();
  if (gitSyncTimer) {
    clearInterval(gitSyncTimer);
    gitSyncTimer = null;
  }

  if (!gitSyncState.enabled || !gitSyncState.autoSyncEnabled) return;

  const intervalMinutes = normalizeGitSyncInterval(gitSyncState.intervalMinutes, DEFAULT_GIT_SYNC_INTERVAL_MINUTES);
  gitSyncTimer = setInterval(() => {
    void runGitSync({ reason: 'auto' });
  }, intervalMinutes * 60 * 1000);
}

async function markGitSyncStatus(status, message, { touchSyncTime = true, conflictFiles } = {}) {
  const patch = {
    lastStatus: normalizeGitSyncStatus(status),
    lastMessage: typeof message === 'string' ? message : '',
  };

  if (touchSyncTime) {
    patch.lastSyncAt = new Date().toISOString();
  }

  if (Array.isArray(conflictFiles)) {
    patch.lastConflictFiles = conflictFiles;
  } else if (status !== 'conflict') {
    patch.lastConflictFiles = [];
  }

  await updateGitSyncState(patch);
}

function buildConflictTimestamp() {
  return new Date().toISOString().replace(/[-:.]/g, '').replace('T', '-').replace('Z', '');
}

function toPosixRelativePath(cwd, absFilePath) {
  return path.relative(cwd, absFilePath).split(path.sep).join('/');
}

async function createConflictCopies(cwd, conflictFiles) {
  const stamp = buildConflictTimestamp();
  const createdFiles = [];

  for (const conflictFile of conflictFiles) {
    if (!/\.md$/i.test(conflictFile)) continue;
    const parsed = path.parse(conflictFile);
    const localBlob = await runGit(['show', `:2:${conflictFile}`], { cwd, check: false });
    const remoteBlob = await runGit(['show', `:3:${conflictFile}`], { cwd, check: false });
    const localContent = localBlob.code === 0 ? localBlob.stdout : '';
    const remoteContent = remoteBlob.code === 0 ? remoteBlob.stdout : '';

    const localFilePath = path.join(
      cwd,
      parsed.dir,
      `${parsed.name}.conflict-local-${stamp}${parsed.ext || '.md'}`
    );
    const remoteFilePath = path.join(
      cwd,
      parsed.dir,
      `${parsed.name}.conflict-remote-${stamp}${parsed.ext || '.md'}`
    );

    await fs.writeFile(localFilePath, localContent, 'utf-8');
    await fs.writeFile(remoteFilePath, remoteContent, 'utf-8');

    createdFiles.push(toPosixRelativePath(cwd, localFilePath), toPosixRelativePath(cwd, remoteFilePath));
  }

  return createdFiles;
}

async function ensureOriginRemote(cwd, remoteUrl) {
  const remoteUrlResult = await runGit(['remote', 'get-url', 'origin'], { cwd, check: false });
  if (remoteUrlResult.code === 0) {
    if (String(remoteUrlResult.stdout || '').trim() !== remoteUrl) {
      await runGit(['remote', 'set-url', 'origin', remoteUrl], { cwd });
    }
    return;
  }
  await runGit(['remote', 'add', 'origin', remoteUrl], { cwd });
}

async function setupGitSync(data = {}) {
  let repoInitialized = false;
  let remoteConnected = false;

  try {
    await ensureNotesDir();
    await ensureGitSyncStateLoaded();
    await runGit(['--version'], { cwd: currentNotesDir });

    const remoteUrl = normalizeGitSyncRemoteUrl(data.remoteUrl);
    const branch = normalizeGitSyncBranch(data.branch, gitSyncState.branch || DEFAULT_GIT_SYNC_BRANCH);
    const intervalMinutes = normalizeGitSyncInterval(
      data.intervalMinutes,
      gitSyncState.intervalMinutes || DEFAULT_GIT_SYNC_INTERVAL_MINUTES
    );
    const autoSyncEnabled =
      typeof data.autoSyncEnabled === 'boolean' ? data.autoSyncEnabled : gitSyncState.autoSyncEnabled;

    const tokenInput = typeof data.token === 'string' ? data.token.trim() : '';
    let encryptedToken = gitSyncState.encryptedToken || '';
    if (tokenInput) {
      encryptedToken = encryptGitToken(tokenInput);
    }
    if (!encryptedToken) {
      return {
        success: false,
        status: 'error',
        message: 'PAT is required. Enter a token to connect Git sync.',
        repoInitialized,
        remoteConnected,
      };
    }

    const token = tokenInput || decryptGitToken(encryptedToken);
    const gitDirPath = path.join(currentNotesDir, '.git');
    if (!fsSync.existsSync(gitDirPath)) {
      await runGit(['init'], { cwd: currentNotesDir });
      repoInitialized = true;
    }

    await ensureHistoryIgnoredInGit(currentNotesDir);
    await ensureOriginRemote(currentNotesDir, remoteUrl);

    const remoteProbe = await runGitWithAuth(['ls-remote', 'origin'], {
      cwd: currentNotesDir,
      token,
      check: false,
    });
    if (remoteProbe.code !== 0) {
      throw new Error(remoteProbe.stderr || remoteProbe.stdout || 'Failed to connect to remote repository');
    }
    remoteConnected = true;

    const remoteHasHistory = Boolean(String(remoteProbe.stdout || '').trim());
    const localHeadResult = await runGit(['rev-parse', '--verify', 'HEAD'], {
      cwd: currentNotesDir,
      check: false,
    });
    const localHasCommits = localHeadResult.code === 0;
    const dirEntries = await fs.readdir(currentNotesDir);
    const localHasMarkdownFiles = dirEntries.some((name) => name.toLowerCase().endsWith('.md'));

    if (remoteHasHistory && !localHasCommits && localHasMarkdownFiles) {
      return {
        success: false,
        status: 'error',
        message:
          'Remote already has history while local Markdown notes are not committed. To avoid unrelated-history merge, use an empty remote or consolidate manually first.',
        repoInitialized,
        remoteConnected,
      };
    }

    await updateGitSyncState({
      enabled: true,
      remoteUrl,
      branch,
      autoSyncEnabled,
      intervalMinutes,
      encryptedToken,
      vaultPath: currentNotesDir,
      lastStatus: 'idle',
      lastMessage: 'Git sync connected. Click Sync now to start.',
      lastConflictFiles: [],
    });
    await refreshGitSyncSchedule();

    return {
      success: true,
      status: 'success',
      message: 'Git sync connected successfully.',
      repoInitialized,
      remoteConnected,
    };
  } catch (err) {
    const message = formatGitError(err);
    await markGitSyncStatus('error', `Failed to connect Git sync: ${message}`, { touchSyncTime: false });
    return {
      success: false,
      status: 'error',
      message,
      repoInitialized,
      remoteConnected,
      error: message,
    };
  }
}

async function updateGitSyncSettings(data = {}) {
  try {
    await ensureGitSyncStateLoaded();

    const patch = {};
    if (Object.prototype.hasOwnProperty.call(data, 'remoteUrl')) {
      patch.remoteUrl = normalizeGitSyncRemoteUrl(data.remoteUrl);
    }
    if (Object.prototype.hasOwnProperty.call(data, 'branch')) {
      patch.branch = normalizeGitSyncBranch(data.branch, gitSyncState.branch || DEFAULT_GIT_SYNC_BRANCH);
    }
    if (Object.prototype.hasOwnProperty.call(data, 'autoSyncEnabled')) {
      patch.autoSyncEnabled = Boolean(data.autoSyncEnabled);
    }
    if (Object.prototype.hasOwnProperty.call(data, 'intervalMinutes')) {
      patch.intervalMinutes = normalizeGitSyncInterval(
        data.intervalMinutes,
        gitSyncState.intervalMinutes || DEFAULT_GIT_SYNC_INTERVAL_MINUTES
      );
    }
    if (Object.prototype.hasOwnProperty.call(data, 'enabled')) {
      patch.enabled = Boolean(data.enabled);
    }

    const nextRemoteUrl = patch.remoteUrl ?? gitSyncState.remoteUrl;
    const nextEnabled = patch.enabled ?? gitSyncState.enabled;
    if (nextEnabled && !nextRemoteUrl) {
      return { success: false, status: 'error', message: 'Remote URL is required before enabling Git sync.' };
    }
    if (nextEnabled && !gitSyncState.encryptedToken) {
      return { success: false, status: 'error', message: 'PAT is not configured. Connect Git sync first.' };
    }

    await updateGitSyncState(patch);
    await refreshGitSyncSchedule();
    return { success: true, status: 'success', message: 'Git sync settings updated.' };
  } catch (err) {
    const message = formatGitError(err);
    return { success: false, status: 'error', message, error: message };
  }
}

async function clearGitSyncCredential() {
  try {
    await ensureGitSyncStateLoaded();
    await updateGitSyncState({
      enabled: false,
      encryptedToken: '',
      lastStatus: 'disabled',
      lastMessage: 'Git credential cleared. Reconnect to continue syncing.',
      lastConflictFiles: [],
    });
    await refreshGitSyncSchedule();
    return {
      success: true,
      status: 'disabled',
      message: 'Git credential cleared.',
    };
  } catch (err) {
    const message = formatGitError(err);
    return { success: false, status: 'error', message, error: message };
  }
}

async function runGitSync(data = {}) {
  const reason = data?.reason === 'auto' ? 'auto' : 'manual';
  const baseResult = {
    success: false,
    status: 'error',
    message: '',
    commitsCreated: 0,
    pushed: false,
    pulled: false,
    conflictFiles: [],
  };

  await ensureGitSyncStateLoaded();

  if (gitSyncInFlight) {
    return {
      ...baseResult,
      status: 'skipped',
      message: 'A sync task is already running.',
    };
  }

  if (!gitSyncState.enabled) {
    return {
      ...baseResult,
      status: 'disabled',
      message: 'Git sync is disabled.',
    };
  }

  if (gitSyncState.vaultPath && !areSamePath(gitSyncState.vaultPath, currentNotesDir)) {
    await updateGitSyncState({
      enabled: false,
      lastStatus: 'error',
      lastMessage: 'Storage location changed. Reconnect Git sync for this vault.',
      lastConflictFiles: [],
    });
    await refreshGitSyncSchedule();
    return {
      ...baseResult,
      status: 'error',
      message: 'Storage location changed. Reconnect Git sync for this vault.',
    };
  }

  let remoteUrl = '';
  let branch = DEFAULT_GIT_SYNC_BRANCH;
  let token = '';
  try {
    remoteUrl = normalizeGitSyncRemoteUrl(gitSyncState.remoteUrl);
    branch = normalizeGitSyncBranch(gitSyncState.branch, DEFAULT_GIT_SYNC_BRANCH);
    token = decryptGitToken(gitSyncState.encryptedToken);
  } catch (err) {
    const message = formatGitError(err);
    await markGitSyncStatus('error', `Sync failed: ${message}`, {
      touchSyncTime: true,
      conflictFiles: [],
    });
    return {
      ...baseResult,
      status: 'error',
      message,
      error: message,
    };
  }
  if (!token) {
    const message = 'PAT is not configured. Reconnect Git sync.';
    await markGitSyncStatus('error', `Sync failed: ${message}`, {
      touchSyncTime: true,
      conflictFiles: [],
    });
    return {
      ...baseResult,
      status: 'error',
      message,
      error: message,
    };
  }

  gitSyncInFlight = true;
  await markGitSyncStatus('running', reason === 'auto' ? 'Auto sync in progress...' : 'Sync in progress...', {
    touchSyncTime: false,
  });

  try {
    await ensureNotesDir();
    await runGit(['--version'], { cwd: currentNotesDir });
    if (!isGitRepository(currentNotesDir)) {
      throw new Error('Current vault is not a Git repository. Connect Git sync first.');
    }

    await ensureOriginRemote(currentNotesDir, remoteUrl);

    const addMarkdownResult = await runGit(['add', '-A', '--', GIT_SYNC_NOTES_PATHSPEC], {
      cwd: currentNotesDir,
      check: false,
    });
    if (addMarkdownResult.code !== 0) {
      const addErrorText = String(addMarkdownResult.stderr || addMarkdownResult.stdout || '').trim();
      const noMarkdownMatch = /did not match any files/i.test(addErrorText);
      if (!noMarkdownMatch) {
        throw new Error(addErrorText || 'Failed to stage Markdown changes');
      }
    }

    const stagedDiff = await runGit(['diff', '--cached', '--name-only', '--', GIT_SYNC_NOTES_PATHSPEC], {
      cwd: currentNotesDir,
    });
    let commitsCreated = 0;
    if (String(stagedDiff.stdout || '').trim()) {
      await runGit(
        ['commit', '-m', `chore(sync): update notes ${new Date().toISOString()}`],
        {
          cwd: currentNotesDir,
          env: buildGitCommitIdentityEnv(),
        }
      );
      commitsCreated = 1;
    }

    let localHasCommits =
      (await runGit(['rev-parse', '--verify', 'HEAD'], { cwd: currentNotesDir, check: false })).code === 0;

    const remoteBranchProbe = await runGitWithAuth(
      ['ls-remote', '--heads', 'origin', branch],
      {
        cwd: currentNotesDir,
        token,
        check: false,
      }
    );
    if (remoteBranchProbe.code !== 0) {
      throw new Error(remoteBranchProbe.stderr || remoteBranchProbe.stdout || 'Failed to inspect remote branch');
    }
    const remoteBranchExists = Boolean(String(remoteBranchProbe.stdout || '').trim());
    let pulled = false;

    if (remoteBranchExists) {
      await runGitWithAuth(['fetch', 'origin', branch], {
        cwd: currentNotesDir,
        token,
      });

      if (!localHasCommits) {
        await runGit(['checkout', '-B', branch, `origin/${branch}`], { cwd: currentNotesDir });
        pulled = true;
      } else {
        const rebaseResult = await runGit(['rebase', `origin/${branch}`], {
          cwd: currentNotesDir,
          check: false,
        });

        if (rebaseResult.code !== 0) {
          const conflictResult = await runGit(['diff', '--name-only', '--diff-filter=U'], {
            cwd: currentNotesDir,
            check: false,
          });
          const conflictFiles = String(conflictResult.stdout || '')
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean);

          if (conflictFiles.length) {
            const createdConflictCopies = await createConflictCopies(currentNotesDir, conflictFiles);
            await runGit(['rebase', '--abort'], { cwd: currentNotesDir, check: false });
            const message = createdConflictCopies.length
              ? `Sync conflict detected. Created local/remote conflict copies: ${createdConflictCopies.join(', ')}`
              : 'Sync conflict detected during rebase. Rebase was aborted to keep your notes safe.';
            await markGitSyncStatus('conflict', message, {
              touchSyncTime: true,
              conflictFiles,
            });
            return {
              ...baseResult,
              status: 'conflict',
              message,
              commitsCreated,
              pulled,
              conflictFiles,
            };
          }

          throw new Error(rebaseResult.stderr || rebaseResult.stdout || `Failed to rebase with origin/${branch}`);
        }
        pulled = true;
      }
    }

    localHasCommits =
      (await runGit(['rev-parse', '--verify', 'HEAD'], { cwd: currentNotesDir, check: false })).code === 0;
    let pushed = false;
    if (localHasCommits) {
      await runGitWithAuth(
        remoteBranchExists
          ? ['push', 'origin', `HEAD:${branch}`]
          : ['push', '-u', 'origin', `HEAD:${branch}`],
        {
          cwd: currentNotesDir,
          token,
        }
      );
      pushed = true;
    }

    const message = reason === 'auto' ? 'Auto sync completed.' : 'Sync completed successfully.';
    await markGitSyncStatus('success', message, {
      touchSyncTime: true,
      conflictFiles: [],
    });

    return {
      success: true,
      status: 'success',
      message,
      commitsCreated,
      pushed,
      pulled,
      conflictFiles: [],
    };
  } catch (err) {
    const message = formatGitError(err);
    await markGitSyncStatus('error', `Sync failed: ${message}`, {
      touchSyncTime: true,
      conflictFiles: [],
    });
    return {
      ...baseResult,
      status: 'error',
      message,
      error: message,
    };
  } finally {
    gitSyncInFlight = false;
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
    const previousNotesDir = currentNotesDir;
    if (newPath && newPath.trim() !== '') {
      // 验证路径是否存在或可创建
      await fs.mkdir(newPath, { recursive: true });
      currentNotesDir = newPath;
    } else {
      // 使用默认路径
      currentNotesDir = DEFAULT_NOTES_DIR;
      await fs.mkdir(currentNotesDir, { recursive: true });
    }

    await ensureGitSyncStateLoaded();
    if (
      gitSyncState.enabled &&
      gitSyncState.vaultPath &&
      !areSamePath(previousNotesDir, currentNotesDir) &&
      !areSamePath(gitSyncState.vaultPath, currentNotesDir)
    ) {
      await updateGitSyncState({
        enabled: false,
        lastStatus: 'error',
        lastMessage: 'Storage location changed. Reconnect Git sync for this vault.',
        lastConflictFiles: [],
      });
      await refreshGitSyncSchedule();
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
ipcMain.handle('notes:save', async (event, { filename, content, preserveModifiedAt, historySource } = {}) => {
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

    try {
      await recordNoteHistoryVersion({
        filename,
        content,
        source: normalizeHistorySource(historySource),
      });
    } catch (err) {
      console.warn('Failed to record note history (save):', err?.message || String(err));
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

    try {
      await recordNoteHistoryVersion({
        filename,
        content,
        source: 'create',
      });
    } catch (err) {
      console.warn('Failed to record note history (create):', err?.message || String(err));
    }

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

ipcMain.handle('notes:history:list', async (event, { filename, limit } = {}) => {
  try {
    const safeFilename = typeof filename === 'string' ? filename.trim() : '';
    if (!safeFilename) {
      return { success: false, error: 'Missing filename' };
    }
    const versions = await listNoteHistoryVersions({ filename: safeFilename, limit });
    return { success: true, versions };
  } catch (err) {
    return { success: false, error: err?.message || String(err) };
  }
});

ipcMain.handle('notes:history:read', async (event, { filename, versionId } = {}) => {
  try {
    const content = await readNoteHistoryVersionContent({ filename, versionId });
    return { success: true, content };
  } catch (err) {
    return { success: false, error: err?.message || String(err) };
  }
});

ipcMain.handle('notes:history:update', async (event, { filename, versionId, label, pinned } = {}) => {
  try {
    const version = await updateNoteHistoryVersionMeta({ filename, versionId, label, pinned });
    return { success: true, version };
  } catch (err) {
    return { success: false, error: err?.message || String(err) };
  }
});

ipcMain.handle('gitSync:getConfig', async () => {
  try {
    await ensureGitSyncStateLoaded();
    return { success: true, config: getPublicGitSyncConfig() };
  } catch (err) {
    return { success: false, error: err?.message || String(err) };
  }
});

ipcMain.handle('gitSync:setup', async (event, data = {}) => {
  return setupGitSync(data);
});

ipcMain.handle('gitSync:run', async (event, data = {}) => {
  return runGitSync(data);
});

ipcMain.handle('gitSync:updateSettings', async (event, data = {}) => {
  return updateGitSyncSettings(data);
});

ipcMain.handle('gitSync:clearCredential', async () => {
  return clearGitSyncCredential();
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

  ensureGitSyncStateLoaded()
    .then(() => refreshGitSyncSchedule())
    .catch((err) => {
      console.warn('Failed to initialize Git sync state:', err?.message || String(err));
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
