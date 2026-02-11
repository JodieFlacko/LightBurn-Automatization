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
// Path Definitions
// ─────────────────────────────────────────────────────────────────────────────

const userDataPath = getUserDataPath();
const documentsPath = getDocumentsPath();
const tempPath = getTempPath();

export const paths = {
  /**
   * User data directory (AppData on Windows)
   * Example: C:\Users\Name\AppData\Roaming\VictoriaLaserApp
   */
  userData: userDataPath,

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
// Configuration Store Initialization
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Type-safe configuration schema
 */
interface ConfigSchema {
  feedUrl: string;
  templatesPath: string | null;
}

/**
 * Persistent configuration store using the `conf` library.
 * Stores settings like feedUrl in a JSON file in the user data directory.
 * 
 * Initialized AFTER paths are resolved to ensure proper cross-environment support.
 */
const store = new Conf<ConfigSchema>({
  cwd: paths.userData,
  configName: 'config',
  defaults: { feedUrl: '', templatesPath: null }
});

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
console.log('─'.repeat(80));
console.log('Configuration:');
console.log(`  Config File: ${store.path}`);
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
// Auto-Migration from .env (One-time)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Automatically migrate FEED_URL from .env to persistent config if needed.
 * This runs once on module load if:
 * 1. FEED_URL environment variable exists
 * 2. Stored feedUrl is empty
 */
function migrateFromEnv(): void {
  const envFeedUrl = process.env.FEED_URL;
  const storedFeedUrl = store.get('feedUrl');
  
  if (envFeedUrl && !storedFeedUrl) {
    store.set('feedUrl', envFeedUrl);
    console.log('[config] Migrated FEED_URL from .env to persistent config');
  }
}

// Run migration on module load
migrateFromEnv();

// ─────────────────────────────────────────────────────────────────────────────
// Configuration API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Gets the stored feed URL.
 * @returns The feed URL from persistent storage
 */
export function getFeedUrl(): string {
  return store.get('feedUrl');
}

/**
 * Saves the feed URL to persistent storage.
 * @param url The feed URL to save
 */
export function setFeedUrl(url: string): void {
  store.set('feedUrl', url);
}

/**
 * Gets the templates directory path.
 * Returns custom path if set, otherwise returns default path.
 * @returns The templates directory path
 */
export function getTemplatesPath(): string {
  const customPath = store.get('templatesPath');
  if (customPath !== null) {
    return customPath;
  }
  // Return default path
  return path.join(documentsPath, 'templates');
}

/**
 * Sets the templates directory path with strict validation.
 * Handles Windows-to-WSL path conversion and quote stripping.
 * @param inputPath The templates directory path to set (null/undefined to reset to default)
 * @throws Error if path doesn't exist or is not a directory
 */
export function setTemplatesPath(inputPath: string | null | undefined): void {
  // ==================== PHASE 1: PRE-PROCESSING ====================
  
  // Normalize input: treat null/undefined as empty string
  let processedPath = inputPath ?? '';
  
  // Trim whitespace
  processedPath = processedPath.trim();
  
  // Strip surrounding quotes (both single and double)
  processedPath = processedPath.replace(/^["']|["']$/g, '');
  
  // Empty check: if empty string, reset to default (null)
  if (processedPath === '') {
    store.set('templatesPath', null);
    console.log('[config] Templates path reset to default');
    return;
  }
  
  // ==================== PHASE 2: WSL PATH CONVERSION (Linux Only) ====================
  
  let finalPath = processedPath;
  
  if (process.platform === 'linux') {
    // Check if input matches Windows drive pattern (e.g., C:\ or C:/)
    const windowsDrivePattern = /^([a-zA-Z]):[\\/]/;
    const match = processedPath.match(windowsDrivePattern);
    
    if (match) {
      // Extract drive letter and convert to lowercase
      const driveLetter = match[1].toLowerCase();
      
      // Replace Windows prefix with WSL mount point
      // Example: C:\ → /mnt/c/
      finalPath = processedPath.replace(windowsDrivePattern, `/mnt/${driveLetter}/`);
      
      // Replace all remaining backslashes with forward slashes
      finalPath = finalPath.replace(/\\/g, '/');
      
      console.log(`[config] Converted Windows path to WSL: ${processedPath} → ${finalPath}`);
    }
  }
  
  // ==================== PHASE 3: PATH VALIDATION ====================
  
  // Check if path exists
  if (!fs.pathExistsSync(finalPath)) {
    throw new Error(`Directory not found or invalid: ${finalPath}. Please check the path.`);
  }
  
  // Check if it's a directory
  const stats = fs.statSync(finalPath);
  if (!stats.isDirectory()) {
    throw new Error(`Directory not found or invalid: ${finalPath}. Please check the path.`);
  }
  
  // ==================== PHASE 4: SAVE & LOG ====================
  
  store.set('templatesPath', finalPath);
  console.log(`[config] Templates path set to: ${finalPath}`);
}

/**
 * Gets the full configuration object.
 * @returns The complete configuration schema
 */
export function getConfig(): ConfigSchema {
  return store.store;
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
  getTemplatesPath,
  setTemplatesPath,
  getConfig,
};

export default config;
