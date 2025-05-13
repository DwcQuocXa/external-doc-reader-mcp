import FirecrawlApp, { type ScrapeResponse, type ErrorResponse, type FirecrawlDocument } from '@mendable/firecrawl-js';
import { config } from './config.js';
import { pino } from 'pino';
import { ScraperError } from './utils/errors.js';

const logger = pino({ level: 'info' });

if (!config.firecrawlApiKey) {
  logger.error('FIRECRAWL_API_KEY is not set. Scraping/Crawling will fail.');
}

const app = config.firecrawlApiKey ? new FirecrawlApp({ apiKey: config.firecrawlApiKey }) : null;

export async function scrapeUrl(url: string): Promise<string | null> {
  if (!app) {
    logger.error('FirecrawlApp is not initialized, likely due to missing API key.');
    throw new ScraperError('Scraper not initialized. Check FIRECRAWL_API_KEY.');
  }

  try {
    const scrapeResult = await app.scrapeUrl(url);

    if (scrapeResult && 'success' in scrapeResult && scrapeResult.success === true && 'markdown' in scrapeResult && typeof scrapeResult.markdown === 'string') {
      return scrapeResult.markdown;
    } else {
      logger.warn({ url, response: scrapeResult }, 'Firecrawl did not return a successful response with markdown content.');
      return null;
    }

  } catch (error: unknown) {
    logger.error({ url, error }, 'Error during scraping execution');
    if (error instanceof Error) {
      throw new ScraperError(`Failed to scrape ${url}: ${error.message}`);
    } else {
      throw new ScraperError(`Failed to scrape ${url}: Unknown error`);
    }
  }
}

export interface PageMetadata {
  url: string;
  title?: string;
}

export async function discoverPageUrlsAndMetadata(rootUrl: string, limit: number = 20): Promise<PageMetadata[] | null> {
  if (!app) {
    logger.error('FirecrawlApp is not initialized, likely due to missing API key.');
    throw new ScraperError('Discovery tool not initialized. Check FIRECRAWL_API_KEY.');
  }

  try {
    const crawlResult = await app.crawlUrl(rootUrl, { 
        limit: limit,
        scrapeOptions: { 
          formats: ['markdown'] 
        }
    }); 

    if (crawlResult && 'error' in crawlResult && typeof (crawlResult as any).error === 'string') {
        logger.warn({ rootUrl, error: (crawlResult as ErrorResponse).error }, 'Firecrawl URL discovery returned an error response');
        return null;
    }

    if (crawlResult && 'data' in crawlResult && Array.isArray((crawlResult as any).data) && (!('success' in crawlResult) || (crawlResult as any).success === true) ) {
        const discoveredDocs: FirecrawlDocument[] = (crawlResult as { data: FirecrawlDocument[] }).data;
        const pages: PageMetadata[] = [];
        
        for (const doc of discoveredDocs) {
            let title = doc.metadata?.title?.trim();
            if (!title && doc.markdown) {
                const firstLine = doc.markdown.trim().split('\n')[0];
                if (firstLine.startsWith('# ')) {
                    title = firstLine.substring(2).trim();
                }
            }
            if (!title) {
                try {
                    const urlPath = new URL(doc.url || doc.metadata?.sourceURL || '').pathname;
                    const pathParts = urlPath.split('/').filter(part => part.length > 0);
                    title = pathParts.pop() || doc.url || 'Untitled Page';
                    title = title.replace(/[-_]/g, ' ').replace(/\.html$|\.md$/i, ''); 
                    title = title.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
                } catch {
                    title = doc.url || 'Untitled Page';
                }
            }

            pages.push({
                url: doc.url || doc.metadata?.sourceURL || 'Unknown URL',
                title: title
            });
        }
        return pages.length > 0 ? pages : null;
    } else {
        logger.warn({ rootUrl, response: crawlResult }, 'Firecrawl URL discovery returned an unexpected response structure.');
        return null;
    }

  } catch (error: unknown) {
    logger.error({ rootUrl, error }, 'Error during URL discovery execution');
    if (error instanceof Error) {
      throw new ScraperError(`Failed to discover URLs from ${rootUrl}: ${error.message}`);
    } else {
      throw new ScraperError(`Failed to discover URLs from ${rootUrl}: Unknown error`);
    }
  }
}