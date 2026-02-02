const { contextBridge, ipcRenderer } = require('electron');

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 笔记相关
  getAllNotes: () => ipcRenderer.invoke('notes:getAll'),
  readNote: (filename) => ipcRenderer.invoke('notes:read', filename),
  saveNote: (data) => ipcRenderer.invoke('notes:save', data),
  createNote: (data) => ipcRenderer.invoke('notes:create', data),
  deleteNote: (filename) => ipcRenderer.invoke('notes:delete', filename),
  
  // 设置相关
  selectDirectory: () => ipcRenderer.invoke('settings:selectDirectory'),
  
  // Shell
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal'),
});
