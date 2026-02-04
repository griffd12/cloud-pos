const { app, BrowserWindow, Menu, ipcMain, shell } = require('electron');
const path = require('path');

// Keep a global reference of the window object
let mainWindow = null;

// Server URL - configure for your environment
const SERVER_URL = process.env.ELECTRON_SERVER_URL || null;

function createWindow() {
  // Create the browser window with POS-optimized settings
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 1024,
    minWidth: 1024,
    minHeight: 768,
    title: 'Cloud POS',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    // POS-specific window settings
    autoHideMenuBar: true,
    fullscreenable: true,
    backgroundColor: '#1a1a2e',
  });

  // Load the app
  if (SERVER_URL) {
    // Connect to remote server (cloud or local CAPS)
    mainWindow.loadURL(SERVER_URL);
  } else {
    // Load local build (for standalone deployments)
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'public', 'index.html'));
  }

  // Remove default menu in production
  if (process.env.NODE_ENV === 'production') {
    Menu.setApplicationMenu(null);
  }

  // Handle window close
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Open external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // POS-specific: Prevent accidental navigation away
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const currentURL = mainWindow.webContents.getURL();
    const currentOrigin = new URL(currentURL).origin;
    const newOrigin = new URL(url).origin;
    
    // Allow navigation within same origin
    if (currentOrigin !== newOrigin) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
}

// App lifecycle events
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    // macOS: re-create window when dock icon clicked
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // On macOS, apps typically stay active until explicit quit
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Handle fullscreen toggle (F11 or from app)
ipcMain.on('toggle-fullscreen', () => {
  if (mainWindow) {
    mainWindow.setFullScreen(!mainWindow.isFullScreen());
  }
});

// Handle app quit request
ipcMain.on('quit-app', () => {
  app.quit();
});

// Security: Disable navigation to arbitrary URLs
app.on('web-contents-created', (event, contents) => {
  contents.on('will-navigate', (navigationEvent, navigationUrl) => {
    // Only allow navigation to trusted origins
    const parsedUrl = new URL(navigationUrl);
    const trustedOrigins = [
      'localhost',
      '127.0.0.1',
      'repl.co',
      'replit.dev',
    ];
    
    const isTrusted = trustedOrigins.some(origin => 
      parsedUrl.hostname === origin || parsedUrl.hostname.endsWith('.' + origin)
    );
    
    if (!isTrusted && SERVER_URL) {
      const serverOrigin = new URL(SERVER_URL).hostname;
      if (parsedUrl.hostname !== serverOrigin) {
        navigationEvent.preventDefault();
      }
    }
  });
});
