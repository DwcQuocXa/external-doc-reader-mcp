import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { normalizeUrl } from './utils/urlUtils.js';
import { fileURLToPath } from 'url';
import { pino } from 'pino';

interface CacheEntry {
  timestamp: number;
  content: string;
}

const DEFAULT_TTL = 24 * 60 * 60 * 1000;
const logger = pino();

export class CacheManager {
  private cacheDir: string;
  private defaultTtl: number;

  constructor(
    cacheDir?: string,
    defaultTtl: number = DEFAULT_TTL
  ) {
    if (cacheDir) {
      this.cacheDir = cacheDir;
    } else {
      const currentFilePath = fileURLToPath(import.meta.url);
      const srcDir = path.dirname(currentFilePath); 
      const projectRootDir = path.dirname(srcDir);   
      this.cacheDir = path.resolve(projectRootDir, 'cache');
    }
    this.defaultTtl = defaultTtl;
    this._initializeCacheDir();
  }

  private async _initializeCacheDir(): Promise<void> {
    try {
      await fs.mkdir(this.cacheDir, { recursive: true });
    } catch (error) {
      logger.error({cacheDir: this.cacheDir, err: error instanceof Error ? error.message : String(error)}, `Failed to create cache directory`);
    }
  }

  private _getCacheFilePath(normalizedUrl: string): string {
    try {
      const url = new URL(normalizedUrl);
      const domain = url.hostname;
      const domainDir = path.join(this.cacheDir, domain);

      const hash = crypto.createHash('sha256').update(normalizedUrl).digest('hex');
      const fileName = `${hash}.json`;

      return path.join(domainDir, fileName);
    } catch (error) {
        logger.error({ url: normalizedUrl, err: error instanceof Error ? error.message : String(error) }, `Error generating cache file path`);
        const fallbackHash = crypto.createHash('sha256').update(normalizedUrl).digest('hex');
        return path.join(this.cacheDir, `_invalid_domain_${fallbackHash}.json`);
    }
  }

  private async _ensureDirectoryExists(filePath: string): Promise<void> {
      const dirName = path.dirname(filePath);
      try {
          await fs.mkdir(dirName, { recursive: true });
      } catch (error) {
          const err = error as Error;
          logger.error({ dir: dirName, err: err.message }, `Failed to create directory`);
          throw new Error(`Failed to ensure directory exists: ${dirName}`);
      }
  }

  async get(url: string): Promise<string | null> {
    const normalizedUrl = normalizeUrl(url);
    const filePath = this._getCacheFilePath(normalizedUrl);

    try {
      const stats = await fs.stat(filePath);
      const fileAge = Date.now() - stats.mtime.getTime();

      if (fileAge > this.defaultTtl) {
        await fs.unlink(filePath);
        return null;
      }

      const fileContent = await fs.readFile(filePath, 'utf-8');
      const cacheEntry: CacheEntry = JSON.parse(fileContent);

      if (Date.now() - cacheEntry.timestamp > this.defaultTtl) {
          await fs.unlink(filePath);
          return null;
      }

      return cacheEntry.content;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
      } else {
        logger.error({ file: filePath, err: error instanceof Error ? error.message : String(error) }, `Error reading cache file`);
      }
      return null;
    }
  }

  async set(url: string, content: string): Promise<void> {
    const normalizedUrl = normalizeUrl(url);
    const filePath = this._getCacheFilePath(normalizedUrl);
    await this._ensureDirectoryExists(filePath);

    const cacheEntry: CacheEntry = {
      timestamp: Date.now(),
      content: content,
    };

    try {
      await fs.writeFile(filePath, JSON.stringify(cacheEntry, null, 2), 'utf-8');
    } catch (error) {
      logger.error({ file: filePath, err: error instanceof Error ? error.message : String(error) }, `Error writing cache file`);
    }
  }

  async clearCache(): Promise<void> {
      try {
          await fs.rm(this.cacheDir, { recursive: true, force: true });
          await this._initializeCacheDir();
      } catch (error) {
          logger.error({ dir: this.cacheDir, err: error instanceof Error ? error.message : String(error) }, `Error clearing cache directory`);
      }
  }
}
