const fs = require('fs');
const path = require('path');
const os = require('os');

const LOG_DIR = path.join(
  process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
  'Cloud POS',
  'logs'
);

const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_LOG_FILES = 5;

const LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };

class Logger {
  constructor(logName, options = {}) {
    this.logName = logName;
    this.minLevel = LOG_LEVELS[options.minLevel || 'DEBUG'];
    this.logFile = path.join(LOG_DIR, `${logName}.log`);
    this.ensureLogDir();
  }

  ensureLogDir() {
    try {
      if (!fs.existsSync(LOG_DIR)) {
        fs.mkdirSync(LOG_DIR, { recursive: true });
      }
    } catch (e) {
      console.error(`[Logger] Failed to create log directory: ${e.message}`);
    }
  }

  rotateIfNeeded() {
    try {
      if (!fs.existsSync(this.logFile)) return;
      const stats = fs.statSync(this.logFile);
      if (stats.size < MAX_LOG_SIZE) return;

      for (let i = MAX_LOG_FILES - 1; i >= 1; i--) {
        const older = `${this.logFile}.${i}`;
        const newer = i === 1 ? this.logFile : `${this.logFile}.${i - 1}`;
        if (fs.existsSync(newer)) {
          if (fs.existsSync(older)) fs.unlinkSync(older);
          fs.renameSync(newer, older);
        }
      }
    } catch (e) {
      console.error(`[Logger] Rotation error: ${e.message}`);
    }
  }

  formatMessage(level, category, message, data) {
    const timestamp = new Date().toISOString();
    let line = `[${timestamp}] [${level}] [${category}] ${message}`;
    if (data !== undefined) {
      try {
        const serialized = typeof data === 'string' ? data : JSON.stringify(data, null, 0);
        if (serialized.length > 2000) {
          line += ` | DATA: ${serialized.substring(0, 2000)}...(truncated)`;
        } else {
          line += ` | DATA: ${serialized}`;
        }
      } catch {
        line += ` | DATA: [unserializable]`;
      }
    }
    return line;
  }

  write(level, category, message, data) {
    const levelNum = LOG_LEVELS[level] || 0;
    if (levelNum < this.minLevel) return;

    const line = this.formatMessage(level, category, message, data);

    const consoleMethod = level === 'ERROR' ? 'error' : level === 'WARN' ? 'warn' : 'log';
    console[consoleMethod](line);

    try {
      this.rotateIfNeeded();
      fs.appendFileSync(this.logFile, line + '\n', 'utf8');
    } catch (e) {
      console.error(`[Logger] Write failed: ${e.message}`);
    }
  }

  debug(category, message, data) { this.write('DEBUG', category, message, data); }
  info(category, message, data) { this.write('INFO', category, message, data); }
  warn(category, message, data) { this.write('WARN', category, message, data); }
  error(category, message, data) { this.write('ERROR', category, message, data); }

  separator(title) {
    const line = `\n${'='.repeat(80)}\n  ${title} - ${new Date().toISOString()}\n${'='.repeat(80)}`;
    try {
      this.rotateIfNeeded();
      fs.appendFileSync(this.logFile, line + '\n', 'utf8');
    } catch (e) {
      console.error(`[Logger] Write failed: ${e.message}`);
    }
  }

  getLogPath() { return this.logFile; }

  static getLogDirectory() { return LOG_DIR; }

  readRecentLines(count = 200) {
    try {
      if (!fs.existsSync(this.logFile)) return '';
      const content = fs.readFileSync(this.logFile, 'utf8');
      const lines = content.split('\n');
      return lines.slice(-count).join('\n');
    } catch (e) {
      return `[Error reading log: ${e.message}]`;
    }
  }
}

const appLogger = new Logger('app');
const printLogger = new Logger('print-agent');
const offlineDbLogger = new Logger('offline-db');
const installerLogger = new Logger('installer');

module.exports = {
  Logger,
  appLogger,
  printLogger,
  offlineDbLogger,
  installerLogger,
  LOG_DIR,
};
