import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HumanMessage } from "@langchain/core/messages";
import { config } from "./config.js";
import { pino } from 'pino';
import type { PageMetadata } from "./scraper.js";

const logger = pino({ level: 'info' });

if (!config.googleApiKey) {
  logger.error('GOOGLE_API_KEY is not set. LLM calls will fail.');
}

const chatModel = config.googleApiKey ? new ChatGoogleGenerativeAI({
  apiKey: config.googleApiKey,
  model: "gemini-2.0-flash",
  maxOutputTokens: 2048,
  temperature: 0.1,
}) : null;

export async function filterRelevantPages(pages: PageMetadata[], query: string): Promise<string[] | null> {
  if (!chatModel) {
    logger.error('ChatGoogleGenerativeAI model is not initialized. Check GOOGLE_API_KEY.');
    return null;
  }

  if (!pages || pages.length === 0) {
    return [];
  }

  const pageListString = pages.map((page, index) => 
    `${index + 1}. URL: ${page.url}${page.title ? ` (Title: ${page.title})` : ''}`
  ).join('\n');

  const prompt = `Given the following list of discovered web pages (with their URLs and titles) from a documentation site, and a user's question, please identify which of these pages are most relevant to answering the question.
Return *only* a comma-separated list of the relevant URLs. For example: "https://url1.com/path,https://url2.com/another"
If none of the pages seem relevant, return the exact phrase: "NONE".
Do not add any other explanatory text or formatting.

Discovered Pages:
---
${pageListString}
---

User's Question: ${query}

Comma-separated list of relevant URLs (or NONE):
`;

  try {
    const response = await chatModel.invoke([new HumanMessage(prompt)]);
    const llmResponse = response.content;

    if (typeof llmResponse === 'string') {
      const trimmedResponse = llmResponse.trim();
      if (trimmedResponse.toUpperCase() === 'NONE') {
        return [];
      }
      const relevantUrls = trimmedResponse.split(',').map(url => url.trim()).filter(url => url.length > 0);
      return relevantUrls;
    } else {
      logger.warn({ responseContent: llmResponse }, 'LLM response for URL filtering was not a simple string.');
      return null;
    }

  } catch (error: unknown) {
    logger.error({ error, query }, 'Error calling LLM for URL filtering');
    return null;
  }
}