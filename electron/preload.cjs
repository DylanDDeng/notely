const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  setStoragePath: (path) => ipcRenderer.invoke('notes:setStoragePath', path),
  getAllNotes: () => ipcRenderer.invoke('notes:getAll'),
  saveNote: (data) => ipcRenderer.invoke('notes:save', data),
  saveNoteAs: (data) => ipcRenderer.invoke('notes:saveAs', data),
  deleteNote: (filename) => ipcRenderer.invoke('notes:delete', filename),
  selectDirectory: () => ipcRenderer.invoke('settings:selectDirectory'),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  writeClipboardText: (text) => ipcRenderer.invoke('clipboard:writeText', text),
  resolveLocalImage: (filePath) => ipcRenderer.invoke('media:resolveLocalImage', filePath),
  exportNotePdf: (data) => ipcRenderer.invoke('notes:exportPdf', data),
  exportNoteImage: (data) => ipcRenderer.invoke('notes:exportImage', data),
  onMenuAction: (callback) => {
    const handler = (_event, action) => callback(action);
    ipcRenderer.on('menu-action', handler);
    return () => ipcRenderer.removeListener('menu-action', handler);
  },
});
