import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { startServer } from '../server/dist/src/index.js';

let mainWindow;
let serverApp;

/**
 * Create the main Electron window
 */
function createWindow(serverAddress) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'Victoria Laser App',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  // Load the server URL
  mainWindow.loadURL(serverAddress);

  // Open DevTools in development mode
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * Initialize the application
 */
app.whenReady().then(async () => {
  try {
    // Pass Electron-specific paths to server via environment variables
    const userDataPath = app.getPath('userData');
    const tempPath = app.getPath('temp');
    const resourcesPath = process.resourcesPath;
    
    process.env.ELECTRON_USER_DATA_PATH = userDataPath;
    process.env.ELECTRON_TEMP_PATH = tempPath;
    process.env.ELECTRON_RESOURCES_PATH = resourcesPath;
    process.env.IS_ELECTRON = 'true';
    
    console.log('Electron: Passing paths to server:', { userDataPath, tempPath, resourcesPath });
    
    // Start the Fastify server on a random free port
    const { app: fastifyApp, address, port } = await startServer(0);
    
    // Store the Fastify instance for graceful shutdown
    serverApp = fastifyApp;
    
    console.log(`Electron: Server started at ${address} (port ${port})`);
    
    // Create the browser window and load the server
    createWindow(address);
  } catch (error) {
    console.error('Electron: Failed to start server:', error);
    app.quit();
  }
});

/**
 * Quit when all windows are closed (except on macOS)
 */
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

/**
 * Gracefully shut down the server before quitting
 */
app.on('before-quit', async () => {
  if (serverApp) {
    try {
      await serverApp.close();
      console.log('Electron: Server shut down gracefully');
    } catch (error) {
      console.error('Electron: Error shutting down server:', error);
    }
  }
});

/**
 * Re-create window on macOS when dock icon is clicked
 */
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0 && serverApp) {
    const address = `http://127.0.0.1:${serverApp.server.address().port}`;
    createWindow(address);
  }
});
