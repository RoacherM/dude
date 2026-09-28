/**
 * The one thing the page gets from the shell: the official desktop update
 * carrier, `window.dshDesktop` protocol 1 with only `updates`. The official
 * settings plugin draws the sidebar update status from it (updates.js).
 *
 * Its presence also switches other official plugins to their desktop
 * behaviour: the account menu ("More" → Sign in / Contact us) appears, and
 * the web API-key onboarding dialog is off. That trade was chosen on purpose;
 * see design/ARCHITECTURE.md §8.
 */
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('dshDesktop', {
  protocolVersion: 1,
  updates: {
    status: () => ipcRenderer.invoke('dude-updates:status'),
    open: () => ipcRenderer.invoke('dude-updates:open'),
    subscribe(listener) {
      const handle = (_event, presentation) => {
        listener(presentation)
      }
      ipcRenderer.on('dude-updates:presentation', handle)
      return () => {
        ipcRenderer.off('dude-updates:presentation', handle)
      }
    },
  },
})
