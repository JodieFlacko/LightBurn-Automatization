import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import fs from 'fs-extra';
import Conf from 'conf';
import isWsl from 'is-wsl';

/**
 * Central configuration manager for Victoria Laser App.
 * Manages all paths and persistent settings for native Windows operation.
 * 
 * Supports both:
 * - Native Windows execution (for production Electron app)
 * - WSL development mode (maps paths to Windows filesystem via /mnt/c/)
 * 
 * This replaces the old .env + WSL path approach with a proper
 * Windows-native configuration system suitable for Electron.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

export const APP_NAME = 'VictoriaLaserApp';

// ─────────────────────────────────────────────────────────────────────────────
// WSL Detection & Windows Username Resolution
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cached Windows username (only populated in WSL environment)
 */
let cachedWindowsUsername: string | null = null;

/**
 * Detects if we're running in WSL environment
 */
export const IS_WSL = isWsl;

/**
 * Gets the actual Windows username when running in WSL.
 * This is critical for mapping WSL paths to the correct Windows user directory.
 * 
 * @returns The Windows username (e.g., "peppe")
 */
function getWindowsUsername(): string {
  // Return cached value if already resolved
  if (cachedWindowsUsername !== null) {
    return cachedWindowsUsername;
  }

  if (!IS_WSL) {
    // Not in WSL, no need for Windows username
    return '';
  }

  try {
    // Execute Windows command to get the actual logged-in username
    // cmd.exe is accessible from WSL via the Windows interop feature
    const output = execSync('cmd.exe /C echo %USERNAME%', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Trim whitespace and newlines
    const username = output.trim();

    if (!username || username === '%USERNAME%') {
      throw new Error('Failed to resolve Windows username - got empty or unexpanded variable');
    }

    // Cache the result
    cachedWindowsUsername = username;

    console.log(`[config] Windows username detected: ${username}`);
    return username;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to detect Windows username from WSL. ` +
      `Ensure cmd.exe is accessible from WSL. Error: ${errorMessage}`
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Path Resolution (WSL-aware)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolves the Windows AppData/Roaming directory for application data.
 * 
 * Native Windows: C:\Users\Name\AppData\Roaming\VictoriaLaserApp
 * WSL: /mnt/c/Users/Name/AppData/Roaming/VictoriaLaserApp
 */
function getUserDataPath(): string {
  if (IS_WSL) {
    // Running in WSL - map to Windows filesystem via /mnt/c/
    const windowsUsername = getWindowsUsername();
    return `/mnt/c/Users/${windowsUsername}/AppData/Roaming/${APP_NAME}`;
  }

  // Running natively on Windows
  const homeDir = os.homedir();
  const appDataDir = process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming');
  return path.join(appDataDir, APP_NAME);
}

/**
 * Resolves the Windows Documents directory for user-accessible files.
 * 
 * Native Windows: C:\Users\Name\Documents\Victoria Laser
 * WSL: /mnt/c/Users/Name/Documents/Victoria Laser
 */
function getDocumentsPath(): string {
  if (IS_WSL) {
    // Running in WSL - map to Windows filesystem via /mnt/c/
    const windowsUsername = getWindowsUsername();
    return `/mnt/c/Users/${windowsUsername}/Documents/Victoria Laser`;
  }

  // Running natively on Windows
  const homeDir = os.homedir();
  return path.join(homeDir, 'Documents', 'Victoria Laser');
}

/**
 * Resolves the temp directory for LightBurn files.
 * 
 * Native Windows: C:\Users\Name\AppData\Local\Temp\VictoriaLaserApp
 * WSL: /mnt/c/Temp/LightBurnAuto (legacy path for compatibility)
 */
function getTempPath(): string {
  if (IS_WSL) {
    // Running in WSL - use legacy temp path for compatibility
    return '/mnt/c/Temp/LightBurnAuto';
  }

  // Running natively on Windows
  return path.join(os.tmpdir(), APP_NAME);
}

// ─────────────────────────────────────────────────────────────────────────────
// Configuration Store Initialization
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Persistent configuration store using the `conf` library.
 * Stores settings like feedUrl in a JSON file in the user data directory.
 */
const configStore = new Conf({
  projectName: APP_NAME,
  // Conf will automatically use the appropriate OS location
  // On Windows: %APPDATA%\VictoriaLaserApp\config.json
});

// ─────────────────────────────────────────────────────────────────────────────
// Path Definitions
// ─────────────────────────────────────────────────────────────────────────────

const userDataPath = getUserDataPath();
const documentsPath = getDocumentsPath();
const tempPath = getTempPath();

export const paths = {
  /**
   * Database file location (in AppData)
   * Example: C:\Users\Name\AppData\Roaming\VictoriaLaserApp\db.sqlite
   */
  db: path.join(userDataPath, 'db.sqlite'),
  
  /**
   * Logs directory (in AppData)
   * Example: C:\Users\Name\AppData\Roaming\VictoriaLaserApp\logs
   */
  logs: path.join(userDataPath, 'logs'),
  
  /**
   * Templates directory (in Documents, user-accessible)
   * Example: C:\Users\Name\Documents\Victoria Laser\templates
   */
  templates: path.join(documentsPath, 'templates'),
  
  /**
   * Assets directory (in Documents, user-accessible)
   * Example: C:\Users\Name\Documents\Victoria Laser\assets
   */
  assets: path.join(documentsPath, 'assets'),
  
  /**
   * Temporary files directory (in system temp)
   * Example: C:\Users\Name\AppData\Local\Temp\VictoriaLaserApp
   */
  temp: tempPath,
};

// ─────────────────────────────────────────────────────────────────────────────
// Platform Information & Logging
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Platform information for debugging and verification
 */
export const PLATFORM_INFO = {
  isWSL: IS_WSL,
  platform: IS_WSL ? 'WSL' : 'Native Windows',
  windowsUsername: IS_WSL ? getWindowsUsername() : os.userInfo().username,
  nodeVersion: process.version,
};

// Log platform information on module load
console.log('\n' + '═'.repeat(80));
console.log('Victoria Laser App - Configuration Initialized');
console.log('═'.repeat(80));
console.log(`Platform: ${PLATFORM_INFO.platform}`);
console.log(`Windows Username: ${PLATFORM_INFO.windowsUsername}`);
console.log(`Node.js Version: ${PLATFORM_INFO.nodeVersion}`);
console.log('─'.repeat(80));
console.log('Paths:');
console.log(`  Database:  ${paths.db}`);
console.log(`  Logs:      ${paths.logs}`);
console.log(`  Templates: ${paths.templates}`);
console.log(`  Assets:    ${paths.assets}`);
console.log(`  Temp:      ${paths.temp}`);
console.log('═'.repeat(80) + '\n');

// ─────────────────────────────────────────────────────────────────────────────
// Directory Initialization
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ensures all required directories exist.
 * Creates them if they don't exist yet.
 * 
 * In WSL mode, these directories are created on the Windows filesystem
 * via the /mnt/c/ mount point.
 */
function initializeDirectories(): void {
  console.log('[config] Initializing directories...');
  
  try {
    // Ensure the base user data directory exists
    fs.ensureDirSync(userDataPath);
    console.log(`[config] ✓ User data directory: ${userDataPath}`);
    
    // Ensure logs directory exists (in AppData)
    fs.ensureDirSync(paths.logs);
    console.log(`[config] ✓ Logs directory: ${paths.logs}`);
    
    // Ensure templates directory exists (in Documents)
    fs.ensureDirSync(paths.templates);
    console.log(`[config] ✓ Templates directory: ${paths.templates}`);
    
    // Ensure assets directory exists (in Documents)
    fs.ensureDirSync(paths.assets);
    console.log(`[config] ✓ Assets directory: ${paths.assets}`);
    
    // Ensure temp directory exists
    fs.ensureDirSync(paths.temp);
    console.log(`[config] ✓ Temp directory: ${paths.temp}`);
    
    console.log('[config] All directories initialized successfully\n');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[config] ✗ Failed to initialize directories: ${errorMessage}`);
    throw error;
  }
}

// Initialize directories on module load
initializeDirectories();

// ─────────────────────────────────────────────────────────────────────────────
// Configuration API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Default feed URL (fallback if none is stored)
 */
const DEFAULT_FEED_URL = 'https://example.com/feed.csv';

/**
 * Gets the stored feed URL or returns the default.
 */
export function getFeedUrl(): string {
  return configStore.get('feedUrl', DEFAULT_FEED_URL) as string;
}

/**
 * Saves the feed URL to persistent storage.
 */
export function setFeedUrl(url: string): void {
  configStore.set('feedUrl', url);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Config Export
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Central configuration object.
 * This is the single source of truth for all application paths and settings.
 */
export const config = {
  paths,
  getFeedUrl,
  setFeedUrl,
};

export default config;
