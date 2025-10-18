# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Model Context Protocol (MCP) server that provides integration with POEditor's translation management API. The server exposes POEditor functionality as MCP tools that can be called by MCP clients like Claude Desktop.

## Development Commands

```bash
# Install dependencies
npm install

# Build the TypeScript project (compiles src/ to dist/)
npm run build

# Run in development mode with tsx (no build required)
npm run dev

# Run the compiled server
npm start

# Type checking without emitting files
npm run typecheck
```

## Architecture

### Single-File Design
All server logic is in `src/server.ts` - this is intentional for simplicity. The file contains:
- POEditor API client helper (`poeditor()` function)
- MCP tool registrations using `@modelcontextprotocol/sdk`
- Zod schemas for input validation
- Environment variable configuration

### MCP Tool Structure
Tools are registered using `server.tool(name, description, schema, handler)`. Each tool:
1. Validates inputs with Zod schemas
2. Resolves project ID (from arg or env var)
3. Calls POEditor API via the `poeditor()` helper
4. Returns results in MCP format: `{ content: [{ type: "text", text: string }] }`

### Available Tools
- `add_terms_with_translations` - Preferred method for creating terms with translations
- `add_translations` - Add translations to existing terms (no overwrite)
- `update_translations` - Overwrite existing translations
- `list_terms` - List terms with optional translations (returns minimal data for efficiency)
- `list_languages` - List project languages

### POEditor API Integration
The `poeditor()` helper function:
- Makes POST requests with form-urlencoded data
- Automatically includes `api_token` from environment
- Parses JSON responses and validates `response.status === "success"`
- Throws errors with POEditor's error code and message on failure

### Context Handling
POEditor uses `term + context` as a composite unique key. When a term is created with a context:
- All subsequent translation operations MUST include the same context value
- The context defaults to empty string `""` if not provided
- This is critical for proper term matching

## Configuration

### Environment Variables
- `POEDITOR_API_TOKEN` (required) - API token from POEditor account
- `POEDITOR_PROJECT_ID` (optional) - Default project ID for all operations
- `POEDITOR_API_BASE` (optional) - Override API base URL (defaults to `https://api.poeditor.com/v2`)

### TypeScript Configuration
- Target: ES2022
- Module: ESNext with Bundler resolution
- Strict mode enabled
- Output directory: `dist/`

### MCP Client Setup
Configure in Claude Desktop or other MCP clients using stdio transport:
```json
{
  "mcpServers": {
    "poeditor": {
      "command": "npx",
      "args": ["poeditor-mcp@latest"],
      "env": {
        "POEDITOR_API_TOKEN": "your_token",
        "POEDITOR_PROJECT_ID": "your_project_id"
      }
    }
  }
}
```

## Code Patterns

### Adding New Tools
When adding a new POEditor API endpoint:
1. Create a Zod schema for the input parameters (e.g., `const NewToolInput = z.object({...})`)
2. Register the tool with `server.tool(name, description, schema, handler)`
3. In the handler: validate project_id, call `poeditor()`, format response
4. Use `requireProjectId()` to handle optional project_id parameter
5. Return results in MCP format with type "text"

### Error Handling
- POEditor API errors are thrown with descriptive messages in `poeditor()`
- Invalid JSON responses throw errors with the raw response text
- Missing required environment variables cause immediate process exit
- All async errors bubble up to the main() catch handler
