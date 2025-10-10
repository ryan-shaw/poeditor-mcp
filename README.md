# POEditor MCP Server

A Model Context Protocol (MCP) server for interacting with POEditor's translation management API.

## Installation

```bash
npm install
npm run build
```

## Configuration

Configure the MCP server in your client (e.g., Claude Desktop) by adding it to your MCP settings:

```json
{
  "mcpServers": {
    "poeditor": {
      "command": "npx",
      "args": ["tsx", "/path/to/poeditor-mcp/src/server.js"],
      "env": {
        "POEDITOR_API_TOKEN": "your_api_token_here",
        "POEDITOR_PROJECT_ID": "your_project_id"
      }
    }
  }
}
```

**Required:**
- `POEDITOR_API_TOKEN`: Your POEditor API token (get it from [POEditor API Access](https://poeditor.com/account/api))

**Optional:**
- `POEDITOR_PROJECT_ID`: Default project ID (can be overridden per tool call)

## Available Tools

- **add_terms** - Add terms to a project
- **add_translations** - Add translations without overwriting existing ones
- **update_translations** - Update/overwrite existing translations
- **list_terms** - List all terms (with optional translations)
- **list_languages** - List available languages in a project

## License

MIT
