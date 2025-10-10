import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { request } from "undici";

// ---- Config ----
const API_BASE = process.env.POEDITOR_API_BASE || "https://api.poeditor.com/v2";
const API_TOKEN = process.env.POEDITOR_API_TOKEN; // required
const PROJECT_ID = process.env.POEDITOR_PROJECT_ID; // optional default at server-level

if (!API_TOKEN) {
  console.error("POEDITOR_API_TOKEN is required (see .env.example)");
  process.exit(1);
}

// Helpers
async function poeditor(endpoint: string, form: Record<string, string>) {
  const body = new URLSearchParams({ api_token: API_TOKEN!, ...form });
  const { body: resBody } = await request(`${API_BASE}/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString()
  });
  const text = await resBody.text();
  let json: any;
  try { json = JSON.parse(text); } catch (e) {
    throw new Error(`POEditor: invalid JSON response: ${text}`);
  }
  const status = json?.response?.status;
  if (status !== "success") {
    const code = json?.response?.code;
    const message = json?.response?.message || "Unknown POEditor error";
    throw new Error(`POEditor API error ${code ?? ""}: ${message}`);
  }
  return json;
}

function requireProjectId(argProjectId?: number | null) {
  const id = argProjectId ?? (PROJECT_ID ? Number(PROJECT_ID) : null);
  if (!id) throw new Error("project_id is required (either pass it to the tool or set POEDITOR_PROJECT_ID)");
  return id;
}

// ---- Tool Schemas ----
const TermsInput = z.object({
  project_id: z.number().int().positive().optional(),
  terms: z.array(z.object({
    term: z.string().min(1),
    context: z.string().optional(),
    reference: z.string().optional(),
    plural: z.string().optional(),
    comment: z.string().optional(),
    tags: z.array(z.string()).optional()
  })).min(1)
});

const TranslationsInput = z.object({
  project_id: z.number().int().positive().optional(),
  language: z.string().min(2),
  items: z.array(z.object({
    term: z.string().min(1),
    context: z.string().optional(),
    content: z.string().default(""),
    fuzzy: z.boolean().optional(),
    plural: z.object({
      one: z.string().optional(),
      few: z.string().optional(),
      many: z.string().optional(),
      other: z.string().optional()
    }).partial().optional()
  })).min(1)
});

const ListTermsInput = z.object({
  project_id: z.number().int().positive().optional(),
  language: z.string().optional(),
  page: z.number().int().positive().optional(),
  per_page: z.number().int().positive().max(500).default(100)
});

const ListLanguagesInput = z.object({
  project_id: z.number().int().positive().optional()
});

// ---- Server Setup ----
async function main() {
  const server = new McpServer(
    {
      name: "poeditor-mcp",
      version: "0.1.0"
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  // Register tools
  server.tool(
    "add_terms",
    "Add one or more terms to a POEditor project.",
    TermsInput.shape,
    async (args) => {
      const id = requireProjectId(args.project_id ?? null);
      const data = JSON.stringify(args.terms);
      const res = await poeditor("terms/add", { id: String(id), data });
      return { content: [{ type: "text", text: JSON.stringify(res.result?.terms ?? res.result, null, 2) }] };
    }
  );

  server.tool(
    "add_translations",
    "Add translations for a language (does not overwrite).",
    TranslationsInput.shape,
    async (args) => {
      const id = requireProjectId(args.project_id ?? null);
      const payload = args.items.map((i) => ({
        term: i.term,
        context: i.context ?? "",
        translation: i.plural ? { plural: i.plural } : { content: i.content, fuzzy: i.fuzzy ? 1 : 0 }
      }));
      const data = JSON.stringify(payload);
      const res = await poeditor("translations/add", { id: String(id), language: args.language, data });
      return { content: [{ type: "text", text: JSON.stringify(res.result ?? {}, null, 2) }] };
    }
  );

  server.tool(
    "update_translations",
    "Update/overwrite translations for a language.",
    TranslationsInput.shape,
    async (args) => {
      const id = requireProjectId(args.project_id ?? null);
      const payload = args.items.map((i) => ({
        term: i.term,
        context: i.context ?? "",
        translation: i.plural ? { plural: i.plural } : { content: i.content, fuzzy: i.fuzzy ? 1 : 0 }
      }));
      const data = JSON.stringify(payload);
      const res = await poeditor("translations/update", { id: String(id), language: args.language, data });
      return { content: [{ type: "text", text: JSON.stringify(res.result ?? {}, null, 2) }] };
    }
  );

  server.tool(
    "list_terms",
    "List project terms (optionally include translations for a language).",
    ListTermsInput.shape,
    async (args) => {
      const id = requireProjectId(args.project_id ?? null);
      const form: Record<string, string> = { id: String(id) };
      if (args.language) form.language = args.language;
      if (args.page) form.page = String(args.page);
      form.per_page = String(args.per_page ?? 100);
      const res = await poeditor("terms/list", form);
      return { content: [{ type: "text", text: JSON.stringify(res.result ?? {}, null, 2) }] };
    }
  );

  server.tool(
    "list_languages",
    "List languages in the project.",
    ListLanguagesInput.shape,
    async (args) => {
      const id = requireProjectId(args.project_id ?? null);
      const res = await poeditor("languages/list", { id: String(id) });
      return { content: [{ type: "text", text: JSON.stringify(res.result ?? {}, null, 2) }] };
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
