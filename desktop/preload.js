// preload.js — the only bridge between the widget display and the news engine.
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('newsBridge', {
  getAfter: (after) => ipcRenderer.invoke('headlines:after', after),
});
