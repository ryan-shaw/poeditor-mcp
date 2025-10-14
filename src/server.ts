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
  limit: z.number().int().positive().optional(),
  search: z.string().optional(),
  count_only: z.boolean().optional(),
  fields: z.array(z.enum(["term", "context", "translation"])).optional()
});

const ListLanguagesInput = z.object({
  project_id: z.number().int().positive().optional()
});

const AddLanguageInput = z.object({
  project_id: z.number().int().positive().optional(),
  language: z.string().min(2)
});

const AddTermsWithTranslationsInput = z.object({
  project_id: z.number().int().positive().optional(),
  language: z.string().min(2),
  items: z.array(z.object({
    term: z.string().min(1),
    context: z.string().optional(),
    reference: z.string().optional(),
    tags: z.array(z.string()).optional(),
    translation: z.object({
      content: z.string().default(""),
      fuzzy: z.boolean().optional(),
      plural: z.object({
        one: z.string().optional(),
        few: z.string().optional(),
        many: z.string().optional(),
        other: z.string().optional()
      }).partial().optional()
    })
  })).min(1)
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
    "add_translations",
    "Add translations for EXISTING terms in a language (does not overwrite). Use this only when terms already exist. If you need to create new terms AND add their translations, prefer using add_terms_with_translations instead. Important: if a term was created with a context, you must provide the same context value to match that term.",
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
    "Update/overwrite translations for a language. Important: if a term was created with a context, you must provide the same context value to match that term.",
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
    "List all project terms (optionally include translations for a specific language). Returns only term names, contexts, and translation content to minimize response size. Use limit, search, count_only, and fields parameters to reduce token usage.",
    ListTermsInput.shape,
    async (args) => {
      const id = requireProjectId(args.project_id ?? null);
      const form: Record<string, string> = { id: String(id) };
      if (args.language) form.language = args.language;
      const res = await poeditor("terms/list", form);

      // Extract term and translation content to reduce response size
      let terms = res.result?.terms?.map((t: any) => ({
        term: t.term,
        context: t.context || undefined,
        translation: t.translation?.content || undefined
      })) ?? [];

      // Apply search filter (case-insensitive substring match on term, context, translation)
      if (args.search) {
        const searchLower = args.search.toLowerCase();
        terms = terms.filter((t: any) =>
          t.term?.toLowerCase().includes(searchLower) ||
          t.context?.toLowerCase().includes(searchLower) ||
          t.translation?.toLowerCase().includes(searchLower)
        );
      }

      // Apply fields selection
      if (args.fields && args.fields.length > 0) {
        const fieldSet = new Set(args.fields);
        terms = terms.map((t: any) => {
          const filtered: any = {};
          if (fieldSet.has("term")) filtered.term = t.term;
          if (fieldSet.has("context")) filtered.context = t.context;
          if (fieldSet.has("translation")) filtered.translation = t.translation;
          return filtered;
        });
      }

      const total = terms.length;

      // Return count only if requested
      if (args.count_only) {
        return { content: [{ type: "text", text: JSON.stringify({ total }) }] };
      }

      // Apply limit
      if (args.limit && args.limit < terms.length) {
        terms = terms.slice(0, args.limit);
      }

      const result = { terms, total };

      return { content: [{ type: "text", text: JSON.stringify(result) }] };
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

  server.tool(
    "list_available_languages",
    "List all available languages that POEditor supports (not project-specific, but all possible language codes).",
    {},
    async () => {
      const res = await poeditor("languages/available", {});
      return { content: [{ type: "text", text: JSON.stringify(res.result ?? {}, null, 2) }] };
    }
  );

  server.tool(
    "add_language",
    "Add a new language to the project. Provide the language code (e.g., 'en', 'de', 'fr').",
    AddLanguageInput.shape,
    async (args) => {
      const id = requireProjectId(args.project_id ?? null);
      const res = await poeditor("languages/add", { id: String(id), language: args.language });
      return { content: [{ type: "text", text: JSON.stringify(res.result ?? {}, null, 2) }] };
    }
  );

  server.tool(
    "add_terms_with_translations",
    "PREFERRED METHOD: Create multiple new terms and add their translations in one operation. Use this instead of calling add_terms followed by add_translations separately. This ensures terms and translations are properly linked (especially important when using context).",
    AddTermsWithTranslationsInput.shape,
    async (args) => {
      const id = requireProjectId(args.project_id ?? null);

      // Step 1: Add all terms
      const termData = JSON.stringify(args.items.map(item => ({
        term: item.term,
        context: item.context,
        reference: item.reference,
        tags: item.tags
      })));
      const termRes = await poeditor("terms/add", { id: String(id), data: termData });

      // Step 2: Add all translations
      const translationPayload = args.items.map(item => ({
        term: item.term,
        context: item.context ?? "",
        translation: item.translation.plural
          ? { plural: item.translation.plural }
          : { content: item.translation.content, fuzzy: item.translation.fuzzy ? 1 : 0 }
      }));
      const translationData = JSON.stringify(translationPayload);
      const translationRes = await poeditor("translations/add", {
        id: String(id),
        language: args.language,
        data: translationData
      });

      // Return combined result
      const result = {
        terms_added: termRes.result?.terms ?? termRes.result,
        translations_added: translationRes.result ?? {}
      };
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
