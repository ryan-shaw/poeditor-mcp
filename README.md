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
      "args": ["poeditor-mcp@latest"],
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

- **add_terms_with_translations** ⭐ **PREFERRED** - Create multiple new terms and add their translations in one operation
- **add_translations** - Add translations for existing terms (does not overwrite)
- **update_translations** - Update/overwrite existing translations
- **list_terms** - List all terms (with optional translations)
- **list_languages** - List languages currently enabled in a project
- **list_available_languages** - List all languages that POEditor supports (for reference when adding languages)
- **add_language** - Add a new language to the project

### Important Note on Context

POEditor uses the combination of `term` + `context` as a unique identifier. **If a term is created with a context value, you must provide the same context when adding or updating translations for that term.** Otherwise, POEditor will not be able to match the translation to the correct term.

## License

MIT
