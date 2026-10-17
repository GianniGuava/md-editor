import {
  app,
  BrowserWindow,
  Menu,
  type MenuItemConstructorOptions,
} from 'electron';

/**
 * Application menu. Every command shows its accelerator (D-16: Lane et al. 2005,
 * Grossman et al. 2007). Commands reach the renderer as `view:command` messages.
 */
export type ViewCommand =
  | 'mode:editor'
  | 'mode:split'
  | 'mode:preview'
  | 'highlight'
  | 'scrollSync'
  | 'zoom:in'
  | 'zoom:out'
  | 'zoom:reset';

export interface ViewCommandMessage {
  name: ViewCommand;
  checked?: boolean;
}

export function buildMenu(win: BrowserWindow): void {
  const send = (msg: ViewCommandMessage) =>
    win.webContents.send('view:command', msg);

  const template: MenuItemConstructorOptions[] = [
    {
      label: '&File',
      submenu: [{ role: 'quit', label: 'E&xit', accelerator: 'Alt+F4' }],
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
      ],
    },
    {
      label: '&View',
      submenu: [
        {
          label: '&Editor only',
          accelerator: 'CmdOrCtrl+Shift+E',
          click: () => send({ name: 'mode:editor' }),
        },
        {
          label: '&Split',
          accelerator: 'CmdOrCtrl+\\',
          click: () => send({ name: 'mode:split' }),
        },
        {
          label: '&Preview only',
          accelerator: 'CmdOrCtrl+Shift+P',
          click: () => send({ name: 'mode:preview' }),
        },
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
          label: 'Zoom &in',
          accelerator: 'CmdOrCtrl+=',
          click: () => send({ name: 'zoom:in' }),
        },
        {
          label: 'Zoom &out',
          accelerator: 'CmdOrCtrl+-',
          click: () => send({ name: 'zoom:out' }),
        },
        {
          label: '&Reset zoom',
          accelerator: 'CmdOrCtrl+0',
          click: () => send({ name: 'zoom:reset' }),
        },
        ...(app.isPackaged
          ? []
          : [
              { type: 'separator' } as MenuItemConstructorOptions,
              { role: 'toggleDevTools' } as MenuItemConstructorOptions,
            ]),
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
