import { URL } from 'url';
import { pino } from 'pino';

const logger = pino({ level: 'info' });

export function normalizeUrl(urlInput: string): string {
  let urlStr = urlInput.trim();

  if (!/^https?:\/\//i.test(urlStr)) {
    urlStr = 'https://' + urlStr;
  }

  try {
    const url = new URL(urlStr);

    let hostname = url.hostname.toLowerCase();

    if (hostname.startsWith('www.')) {
      hostname = hostname.substring(4);
    }

    let pathname = url.pathname;
    if (pathname.endsWith('/') && pathname.length > 1) {
      pathname = pathname.slice(0, -1);
    } else if (pathname === '/') {
      pathname = '';
    }

    const normalized = url.protocol + '//' + hostname + (url.port ? ':' + url.port : '') + pathname + url.search;

    return normalized;

  } catch (error: unknown) {
    logger.error({ urlInput, err: error instanceof Error ? error.message : String(error) }, 'Error normalizing URL');
    return urlInput;
  }
}
