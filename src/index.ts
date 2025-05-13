#!/usr/bin/env node
import { config } from './config.js';
import { pino } from 'pino';
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, Tool } from "@modelcontextprotocol/sdk/types.js";
import { z } from 'zod';
import { scrapeUrl, discoverPageUrlsAndMetadata, PageMetadata } from './scraper.js';
import { CacheManager } from './cacheManager.js';
import { filterRelevantPages } from './llmService.js';
import { normalizeUrl } from './utils/urlUtils.js';

const logger = pino({
  level: 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true
    }
  }
});

const cache = new CacheManager();

const FindRelevantDocPagesArgsSchema = z.object({
  root_url: z.string().url({ message: "Invalid root URL provided." }),
  query: z.string(),
  max_pages_to_discover: z.number().int().min(1).max(50).optional().default(20)
});

const FIND_RELEVANT_DOC_PAGES_TOOL: Tool = {
    name: "find_relevant_doc_pages",
    description: "Discovers pages within a given root URL and uses an LLM to filter them based on a query, returning a list of the most relevant page URLs.",
    inputSchema: { 
        type: "object",
        properties: {
            root_url: { type: "string", format: "uri", description: "The root documentation URL to start discovery from." },
            query: { type: "string", description: "The user query to find relevant pages for." },
            max_pages_to_discover: { type: "integer", description: "Maximum number of pages to discover (1-50, default 20).", default: 20 }
        },
        required: ["root_url", "query"]
    }
};

async function handleFindRelevantPages(request: z.infer<typeof CallToolRequestSchema>) {
  const { name, arguments: args } = request.params;

  if (name !== FIND_RELEVANT_DOC_PAGES_TOOL.name) {
    return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
  }

  const validationResult = FindRelevantDocPagesArgsSchema.safeParse(args);
  if (!validationResult.success) {
      logger.error({ errors: validationResult.error.format() }, `Invalid arguments for ${name}`);
      return { content: [{ type: "text", text: `Invalid arguments: ${validationResult.error.format()}` }], isError: true };
  }
  const { root_url, query, max_pages_to_discover } = validationResult.data;
  const cacheKey = `discovered_pages:${normalizeUrl(root_url)}:limit${max_pages_to_discover}`;

  try {
    let discoveredPages: PageMetadata[] | null = await cache.get(cacheKey).then(cached => cached ? JSON.parse(cached) : null);
    let source = 'cache (discovered URLs)';

    if (!discoveredPages) {
      discoveredPages = await discoverPageUrlsAndMetadata(root_url, max_pages_to_discover);
      source = 'live discovery (discovered URLs)';

      if (discoveredPages && discoveredPages.length > 0) {
        await cache.set(cacheKey, JSON.stringify(discoveredPages));
      } else {
        logger.warn({ root_url }, 'URL discovery failed or returned no pages.');
        return { content: [{ type: "text", text: `Failed to discover pages from ${root_url}` }], isError: true };
      }
    }

    if (!discoveredPages || discoveredPages.length === 0) {
        return { content: [{ type: "text", text: `No pages found for ${root_url} to filter.` }], isError: false };
    }
    
    const relevantUrls = await filterRelevantPages(discoveredPages, query);

    if (relevantUrls === null) {
      logger.warn({ root_url, query }, 'LLM failed to filter relevant pages.');
      return { content: [{ type: "text", text: `LLM processing failed for URL filtering on query: '${query}' for ${root_url}` }], isError: true };
    }

    const resultMessage = relevantUrls.length > 0 ? 
        `Found ${relevantUrls.length} relevant page(s) for query '${query}' under ${root_url} (Source: ${source}):` :
        `No specific pages found to be relevant for query '${query}' under ${root_url} (Source: ${source}).`;

    return {
      content: [
        { type: "text", text: resultMessage },
        ...relevantUrls.map(url => ({ type: "text", text: url }))
      ],
      isError: false, 
    };

  } catch (error: unknown) {
    logger.error({ root_url, query, error }, `Error processing ${name} tool call`);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { content: [{ type: "text", text: `Error processing tool call for ${root_url}: ${errorMessage}` }], isError: true };
  }
}

const server = new Server(
  { name: "external-doc-url-relevance-engine", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [FIND_RELEVANT_DOC_PAGES_TOOL],
}));

server.setRequestHandler(CallToolRequestSchema, handleFindRelevantPages);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error: unknown) => {
  logger.error({ error }, 'Fatal error running server:');
  process.exit(1);
});
