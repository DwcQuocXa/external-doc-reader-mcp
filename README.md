# External Documentation URL Relevance Engine

This project implements an MCP (Model Context Protocol) server that provides a tool to find relevant documentation pages from a given website based on a user's query. It's designed to help users quickly locate specific information within large documentation sites.

## Project Idea

The core idea is to build an intelligent assistant that can:
1.  **Discover:** Crawl a specified root documentation URL to find all available pages and their titles.
2.  **Cache:** Store the list of discovered pages to speed up subsequent requests for the same site.
3.  **Filter:** Use a Large Language Model (LLM) to compare the user's query against the discovered pages (titles and potentially content snippets in a more advanced version) to identify the most relevant ones.
4.  **Serve:** Provide this functionality as a tool within an MCP-compatible environment (like Cursor), allowing AI agents or users to easily invoke it.

This engine is particularly useful when dealing with extensive technical documentation where finding the right page can be time-consuming.

## Architecture

The system follows the architecture depicted below:

```
┌───────────────────────────────────────────────────────────────────┐
│          External Documentation URL Relevance Engine MCP Server   │
├───────────────────────────────────────────────────────────────────┤
│                                                                   │
│  1. MCP Client (e.g., Cursor)                                     │
│      │ Calls @find_relevant_doc_pages(root_url, query, limit)     │
│      ▼                                                            │
│  2. MCP Server (`src/index.ts` - `Server` class)                  │
│      │ Tool: `FIND_RELEVANT_DOC_PAGES_TOOL` defined               │
│      │ Routes to: `handleFindRelevantPages(request)`              │
│      ▼                                                            │
│  3. Tool Handler (`handleFindRelevantPages` in `src/index.ts`)    │
│      │ Receives: { root_url, query, max_pages_to_discover }       │
│      │ Validates args using `FindRelevantDocPagesArgsSchema`      │
│      │ Creates `cacheKey` for discovered pages list               │
│      │                                                            │
│      ├─► 4. CacheManager (`src/cacheManager.ts`)                  │
│      │      │ Input: `cacheKey`                                   │
│      │      │                                                     │
│      │      └─► `cache.get(cacheKey)`                             │
│      │          │ (Tries to get `PageMetadata[]`)                 │
│      │          │                                                 │
│      │          ├─► If cache hit:                                 │
│      │          │     `discoveredPages` = cached_list             │
│      │          │     `source`  = "cache (discovered URLs)"       │
│      │          └─► If cache miss:                                │
│      │                │                                           │
│      │                ▼                                           │
│      │            5. URL Discoverer (`src/scraper.ts`)            │
│      │                │ Uses: `discoverPageUrlsAndMetadata(...)`  │
│      │                │                                           │
│      │                └─► Fetches URLs & titles via Firecrawl     │
│      │                │   (`crawlUrl`)                            │
│      │                └─► `discoveredPages` = list of `PageMetadata`│
│      │                └─► `source` = "live discovery (URLs)"      │
│      │                └─► `cache.set(cacheKey, discoveredPages)`  │
│      │                                                            │
│      │ (If no pages found, returns empty list/message to client)  │
│      │                                                            │
│      ▼                                                            │
│  6. LLM Service (`src/llmService.ts`)                             │
│      │ Input: `discoveredPages` (`PageMetadata[]`), `query`       │
│      │ Uses: `filterRelevantPages(discoveredPages, query)`        │
│      │                                                            │
│      └─► Queries Gemini (via LangChain) with prompt:              │
│            "Given [list of URLs & titles] & [query],              │
│             return comma-separated list of relevant URLs or NONE" │
│      │                                                            │
│      ▼                                                            │
│  7. Response Formatting (`handleFindRelevantPages` in `src/index.ts`)│
│      │ Output: `{ content: [{text: message}, ...], isError }`     │
│      │ Returns to MCP Client (list of relevant URL strings)       │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

**Key Components:**

*   **MCP Client:** Any MCP-compliant client (e.g., Cursor) that can call the exposed tool.
*   **MCP Server (`src/index.ts`):** The backbone of the service. It defines and exposes the `find_relevant_doc_pages` tool.
*   **Tool Handler (`handleFindRelevantPages` in `src/index.ts`):** The core logic orchestrating the request. It validates arguments, interacts with the cache, triggers URL discovery, and invokes the LLM service.
*   **Cache Manager (`src/cacheManager.ts`):** Implements a simple file-based cache to store lists of discovered page URLs and metadata, reducing redundant calls to the discovery service for the same root URL.
*   **URL Discoverer (`src/scraper.ts`):** Leverages the Firecrawl service to crawl a given `root_url` and extract page URLs and their titles (`PageMetadata`).
*   **LLM Service (`src/llmService.ts`):** Uses a Google Gemini model (via LangChain) to process the list of discovered pages and the user's query. It then identifies and returns only the URLs that are most relevant to the query.
*   **Configuration (`src/config.ts`):** Manages API keys (Google API Key for Gemini, Firecrawl API Key) loaded from environment variables.

## Setup and Usage

**1. Prerequisites:**
   - Node.js (e.g., v18+ or v20+)
   - npm or yarn

**2. Installation:**
   If you want to run the server from source for development:
   ```bash
   git clone https://github.com/DwcQuocXa/external-doc-reader-mcp.git
   cd external-doc-reader-mcp
   npm install
   ```
   Then you can run it locally using `npm start` (see "Running Locally" below).

   For usage with MCP clients like Cursor or Claude Desktop, it's recommended to use `npx` (once the package is published to npm) or Docker.

**3. Configuration:**

   This MCP server requires two API keys to function:
   -   **Google API Key:** For accessing Google Gemini LLM via LangChain to filter relevant pages.
   -   **Firecrawl API Key:** For crawling websites to discover pages and their metadata.

   **Getting API Keys:**
   -   **Google API Key:**
        1.  Go to [Google AI Studio](https://aistudio.google.com/app/apikey) (or Google Cloud Console for Vertex AI).
        2.  Create an API key.
   -   **Firecrawl API Key:**
        1.  Sign up at [Firecrawl.dev](https://firecrawl.dev).
        2.  Obtain your API key from your dashboard.

   **Setting Environment Variables:**
   These keys must be available as environment variables to the server.
   -   **If running locally from source:** Create a `.env` file in the project root:
       ```env
       GOOGLE_API_KEY="your_google_api_key_here"
       FIRECRAWL_API_KEY="your_firecrawl_api_key_here"
       ```
   -   **If using NPX/Docker with MCP clients:** The environment variables will be configured in the client (see examples below).

**4. Running Locally (for development/from source):**
   After cloning, installing dependencies, and setting up your `.env` file:
   ```bash
   npm start
   ```
   This will start the MCP server, listening for requests via stdio.

**5. Usage with MCP Clients:**

   Once the package is published to npm as `@dwcquocxa/external-doc-reader-mcp` and/or a Docker image is available (e.g., `dwcquocxa/external-doc-reader-mcp`).

   **A. Usage with Claude Desktop:**
   Add this to your `claude_desktop_config.json`:

   *   **NPX:**
       ```json
       {
         "mcpServers": {
           "external-doc-reader": {
             "command": "npx",
             "args": [
               "-y",
               "@dwcquocxa/external-doc-reader-mcp"
             ],
             "env": {
               "GOOGLE_API_KEY": "YOUR_GOOGLE_API_KEY_HERE",
               "FIRECRAWL_API_KEY": "YOUR_FIRECRAWL_API_KEY_HERE"
             }
           }
         }
       }
       ```

   *   **Docker (Optional - if you publish a Docker image):**
       Replace `dwcquocxa/external-doc-reader-mcp` with your actual Docker image name if different.
       ```json
       {
         "mcpServers": {
           "external-doc-reader": {
             "command": "docker",
             "args": [
               "run",
               "-i",
               "--rm",
               "-e",
               "GOOGLE_API_KEY",
               "-e",
               "FIRECRAWL_API_KEY",
               "dwcquocxa/external-doc-reader-mcp"
             ],
             "env": {
               "GOOGLE_API_KEY": "YOUR_GOOGLE_API_KEY_HERE",
               "FIRECRAWL_API_KEY": "YOUR_FIRECRAWL_API_KEY_HERE"
             }
           }
         }
       }
       ```

   **B. Usage with VS Code:**
   For quick installation, use the one-click installation buttons below (ensure your package is on npm and your Docker image, if used, is public):

   [![Install with NPX in VS Code](https://img.shields.io/badge/Install%20with%20NPX-VS%20Code-blue?style=for-the-badge&logo=visualstudiocode)](vscode:extension/modelcontext.modelcontextprotocol-vscode?command=modelcontext.addServer&args=%7B%22name%22%3A%22external-doc-reader%22%2C%22config%22%3A%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40dwcquocxa%2Fexternal-doc-reader-mcp%22%5D%2C%22env%22%3A%7B%22GOOGLE_API_KEY%22%3A%22%24%7Binput%3Agoogle_api_key%7D%22%2C%22FIRECRAWL_API_KEY%22%3A%22%24%7Binput%3Afirecrawl_api_key%7D%22%7D%7D%2C%22inputs%22%3A%5B%7B%22type%22%3A%22promptString%22%2C%22id%22%3A%22google_api_key%22%2C%22description%22%3A%22Google%20API%20Key%20(for%20Gemini)%22%2C%22password%22%3Atrue%7D%2C%7B%22type%22%3A%22promptString%22%2C%22id%22%3A%22firecrawl_api_key%22%2C%22description%22%3A%22Firecrawl%20API%20Key%22%2C%22password%22%3Atrue%7D%5D%7D)
   [![Install with NPX in VS Code Insiders](https://img.shields.io/badge/Install%20with%20NPX-VS%20Code%20Insiders-purple?style=for-the-badge&logo=visualstudiocode)](vscode-insiders:extension/modelcontext.modelcontextprotocol-vscode?command=modelcontext.addServer&args=%7B%22name%22%3A%22external-doc-reader%22%2C%22config%22%3A%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40dwcquocxa%2Fexternal-doc-reader-mcp%22%5D%2C%22env%22%3A%7B%22GOOGLE_API_KEY%22%3A%22%24%7Binput%3Agoogle_api_key%7D%22%2C%22FIRECRAWL_API_KEY%22%3A%22%24%7Binput%3Afirecrawl_api_key%7D%22%7D%7D%2C%22inputs%22%3A%5B%7B%22type%22%3A%22promptString%22%2C%22id%22%3A%22google_api_key%22%2C%22description%22%3A%22Google%20API%20Key%20(for%20Gemini)%22%2C%22password%22%3Atrue%7D%2C%7B%22type%22%3A%22promptString%22%2C%22id%22%3A%22firecrawl_api_key%22%2C%22description%22%3A%22Firecrawl%20API%20Key%22%2C%22password%22%3Atrue%7D%5D%7D)

   [![Install with Docker in VS Code](https://img.shields.io/badge/Install%20with%20Docker-VS%20Code-blue?style=for-the-badge&logo=visualstudiocode&logoColor=white)](vscode:extension/modelcontext.modelcontextprotocol-vscode?command=modelcontext.addServer&args=%7B%22name%22%3A%22external-doc-reader%22%2C%22config%22%3A%7B%22command%22%3A%22docker%22%2C%22args%22%3A%5B%22run%22%2C%22-i%22%2C%22--rm%22%2C%22-e%22%2C%22GOOGLE_API_KEY%22%2C%22-e%22%2C%22FIRECRAWL_API_KEY%22%2C%22dwcquocxa%2Fexternal-doc-reader-mcp%22%5D%2C%22env%22%3A%7B%22GOOGLE_API_KEY%22%3A%22%24%7Binput%3Agoogle_api_key%7D%22%2C%22FIRECRAWL_API_KEY%22%3A%22%24%7Binput%3Afirecrawl_api_key%7D%22%7D%7D%2C%22inputs%22%3A%5B%7B%22type%22%3A%22promptString%22%2C%22id%22%3A%22google_api_key%22%2C%22description%22%3A%22Google%20API%20Key%20(for%20Gemini)%22%2C%22password%22%3Atrue%7D%2C%7B%22type%22%3A%22promptString%22%2C%22id%22%3A%22firecrawl_api_key%22%2C%22description%22%3A%22Firecrawl%20API%20Key%22%2C%22password%22%3Atrue%7D%5D%7D)
   [![Install with Docker in VS Code Insiders](https://img.shields.io/badge/Install%20with%20Docker-VS%20Code%20Insiders-purple?style=for-the-badge&logo=visualstudiocode&logoColor=white)](vscode-insiders:extension/modelcontext.modelcontextprotocol-vscode?command=modelcontext.addServer&args=%7B%22name%22%3A%22external-doc-reader%22%2C%22config%22%3A%7B%22command%22%3A%22docker%22%2C%22args%22%3A%5B%22run%22%2C%22-i%22%2C%22--rm%22%2C%22-e%22%2C%22GOOGLE_API_KEY%22%2C%22-e%22%2C%22FIRECRAWL_API_KEY%22%2C%22dwcquocxa%2Fexternal-doc-reader-mcp%22%5D%2C%22env%22%3A%7B%22GOOGLE_API_KEY%22%3A%22%24%7Binput%3Agoogle_api_key%7D%22%2C%22FIRECRAWL_API_KEY%22%3A%22%24%7Binput%3Afirecrawl_api_key%7D%22%7D%7D%2C%22inputs%22%3A%5B%7B%22type%22%3A%22promptString%22%2C%22id%22%3A%22google_api_key%22%2C%22description%22%3A%22Google%20API%20Key%20(for%20Gemini)%22%2C%22password%22%3Atrue%7D%2C%7B%22type%22%3A%22promptString%22%2C%22id%22%3A%22firecrawl_api_key%22%2C%22description%22%3A%22Firecrawl%20API%20Key%22%2C%22password%22%3Atrue%7D%5D%7D)
   *(Note: Docker buttons assume you've published an image named `dwcquocxa/external-doc-reader-mcp` to a public registry like Docker Hub. Update the image name in the links if necessary.)*

   For manual installation, add the following JSON block to your User Settings (JSON) file in VS Code (Ctrl+Shift+P, then "Preferences: Open User Settings (JSON)") or to a `.vscode/mcp.json` file in your workspace.

   *   **NPX:**
       ```json
       {
         "mcp": {
           "inputs": [
             {
               "type": "promptString",
               "id": "google_api_key",
               "description": "Google API Key (for Gemini)",
               "password": true
             },
             {
               "type": "promptString",
               "id": "firecrawl_api_key",
               "description": "Firecrawl API Key",
               "password": true
             }
           ],
           "servers": {
             "external-doc-reader": {
               "command": "npx",
               "args": ["-y", "@dwcquocxa/external-doc-reader-mcp"],
               "env": {
                 "GOOGLE_API_KEY": "${input:google_api_key}",
                 "FIRECRAWL_API_KEY": "${input:firecrawl_api_key}"
               }
             }
           }
         }
       }
       ```

   *   **Docker (Optional - if you publish a Docker image):**
       Replace `dwcquocxa/external-doc-reader-mcp` with your actual Docker image name if different.
       ```json
       {
         "mcp": {
           "inputs": [
             {
               "type": "promptString",
               "id": "google_api_key",
               "description": "Google API Key (for Gemini)",
               "password": true
             },
             {
               "type": "promptString",
               "id": "firecrawl_api_key",
               "description": "Firecrawl API Key",
               "password": true
             }
           ],
           "servers": {
             "external-doc-reader": {
               "command": "docker",
               "args": [
                 "run",
                 "-i",
                 "--rm",
                 "-e",
                 "GOOGLE_API_KEY",
                 "-e",
                 "FIRECRAWL_API_KEY",
                 "dwcquocxa/external-doc-reader-mcp"
               ],
               "env": {
                 "GOOGLE_API_KEY": "${input:google_api_key}",
                 "FIRECRAWL_API_KEY": "${input:firecrawl_api_key}"
               }
             }
           }
         }
       }
       ```

**6. Tool Invocation (Example):**
   Once the server is running and your MCP client (Cursor, VS Code with MCP extension, Claude Desktop) is configured, you can invoke the tool:

   `@find_relevant_doc_pages(root_url="https://docs.example.com", query="how to configure authentication", max_pages_to_discover=25)`

   **Parameters:**
   - `root_url` (string, required): The base URL of the documentation site you want to search.
   - `query` (string, required): The question or search terms to find relevant pages for.
   - `max_pages_to_discover` (integer, optional, default: 20): The maximum number of pages the tool should discover within the `root_url`. Min: 1, Max: 50.

   The tool will return a list of URLs deemed most relevant to your query.

## Troubleshooting
   - **FIRECRAWL_API_KEY not set / Scraper not initialized:** Ensure `FIRECRAWL_API_KEY` is correctly set in your `.env` file and accessible to the application. The scraper relies on this key.
   - **GOOGLE_API_KEY not set / LLM calls will fail:** Ensure `GOOGLE_API_KEY` is correctly set. The LLM filtering service needs this to function.
   - **Invalid arguments:** Double-check that `root_url` is a valid URL and other parameters meet the schema requirements.
   - **Failed to discover pages:** The target website might be blocking crawlers, or the `root_url` might be incorrect or inaccessible.
   - **LLM processing failed:** This could be due to issues with the LLM service itself, API key problems, or the prompt/data sent to the LLM. Check server logs for more details.
