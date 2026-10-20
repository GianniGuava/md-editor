import {
  app,
  BrowserWindow,
  Menu,
  type MenuItemConstructorOptions,
} from 'electron';
import type { AppCommandMessage, ThemePref } from '../preload/preload';

/**
 * Application menu (shared by all windows). Every command shows its accelerator
 * (D-16: Lane et al. 2005, Grossman et al. 2007). Commands reach the focused
 * window's renderer as `app:command` messages; Ctrl+1..9 tab jumps are handled
 * in the renderer and listed in Help.
 */
export interface MenuState {
  theme: ThemePref;
}

export interface MenuActions {
  newWindow(): void;
}

export function buildMenu(state: MenuState, actions: MenuActions): void {
  const send = (msg: AppCommandMessage) =>
    BrowserWindow.getFocusedWindow()?.webContents.send('app:command', msg);
  const cmd = (
    label: string,
    name: AppCommandMessage['name'],
    accelerator?: string,
  ): MenuItemConstructorOptions => ({
    label,
    accelerator,
    click: () => send({ name }),
  });

  const template: MenuItemConstructorOptions[] = [
    {
      label: '&File',
      submenu: [
        cmd('&New tab', 'file:new', 'CmdOrCtrl+T'),
        {
          label: 'New &window',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => actions.newWindow(),
        },
        cmd('&Open…', 'file:open', 'CmdOrCtrl+O'),
        { type: 'separator' },
        cmd('&Save', 'file:save', 'CmdOrCtrl+S'),
        cmd('Save &as…', 'file:saveAs', 'CmdOrCtrl+Shift+S'),
        { type: 'separator' },
        cmd('&Close tab', 'tab:close', 'CmdOrCtrl+W'),
        cmd('&Reopen closed tab', 'tab:reopen', 'CmdOrCtrl+Shift+T'),
        cmd('&Move tab to new window', 'tab:detach'),
        { type: 'separator' },
        {
          role: 'close',
          label: 'Close &window',
          accelerator: 'CmdOrCtrl+Shift+W',
        },
        { role: 'quit', label: 'E&xit', accelerator: 'Alt+F4' },
      ],
    },
    {
      label: '&Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        cmd('&Find…', 'edit:find', 'CmdOrCtrl+F'),
        cmd('Find &next', 'edit:findNext', 'F3'),
        cmd('Find &previous', 'edit:findPrev', 'Shift+F3'),
        cmd('&Replace…', 'edit:replace', 'CmdOrCtrl+H'),
      ],
    },
    {
      label: '&View',
      submenu: [
        cmd('&Editor only', 'mode:editor', 'CmdOrCtrl+Shift+E'),
        cmd('&Split', 'mode:split', 'CmdOrCtrl+\\'),
        cmd('&Preview only', 'mode:preview', 'CmdOrCtrl+Shift+P'),
        { type: 'separator' },
        cmd('Ne&xt tab', 'tab:next', 'Ctrl+Tab'),
        cmd('Pre&vious tab', 'tab:prev', 'Ctrl+Shift+Tab'),
        { type: 'separator' },
        {
          label: '&Markup colouring',
          type: 'checkbox',
          checked: true,
          click: (item) => send({ name: 'highlight', checked: item.checked }),
        },
        {
          label: 'S&ynchronise scrolling',
          type: 'checkbox',
          checked: true,
          click: (item) => send({ name: 'scrollSync', checked: item.checked }),
        },
        { type: 'separator' },
        {
          label: '&Theme',
          submenu: [
            ...(
              [
                ['&Light (default)', 'light'],
                ['&Dark', 'dark'],
                ['&High contrast', 'hc'],
                ['&System', 'system'],
              ] as [string, ThemePref][]
            ).map(
              ([label, value]): MenuItemConstructorOptions => ({
                label,
                type: 'radio',
                checked: state.theme === value,
                click: () => send({ name: 'theme:set', value }),
              }),
            ),
            { type: 'separator' },
            cmd('&Cycle theme', 'theme:cycle', 'CmdOrCtrl+Shift+L'),
          ],
        },
        { type: 'separator' },
        cmd('Zoom &in', 'zoom:in', 'CmdOrCtrl+='),
        cmd('Zoom &out', 'zoom:out', 'CmdOrCtrl+-'),
        cmd('&Reset zoom', 'zoom:reset', 'CmdOrCtrl+0'),
        ...(app.isPackaged
          ? []
          : [
              { type: 'separator' } as MenuItemConstructorOptions,
              { role: 'toggleDevTools' } as MenuItemConstructorOptions,
            ]),
      ],
    },
    {
      label: 'E&xport',
      submenu: [cmd('&Export…', 'export:open', 'CmdOrCtrl+E')],
    },
    {
      label: '&Help',
      submenu: [
        cmd('Open &sample document', 'file:sample'),
        cmd('&About MD', 'help:about'),
        {
          label: 'Jump to tab 1–9',
          sublabel: 'Ctrl+1 … Ctrl+9 (Ctrl+9 is the last tab)',
          enabled: false,
        },
        {
          label: 'Drag a tab out of the window to open it in a new one',
          enabled: false,
        },
        {
          label: 'Show shortcuts on commands',
          sublabel: 'Hold Alt',
          enabled: false,
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
