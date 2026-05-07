/**
 * Standalone stdio MCP server that exposes cockpit-managed filesystem tools
 * to a `claude -p` subprocess spawned by the cockpit. Tools are scoped to
 * outputs/ via the same FilesBrowser sandbox the HTTP API uses.
 *
 * Invoked by claude (as a child of claude) with COCKPIT_PROJECT_ROOT set.
 * Communicates over stdio per MCP spec — keep stdout clean of anything
 * that isn't an MCP frame.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createBrowser } from "../files/browser";

const projectRoot = process.env.COCKPIT_PROJECT_ROOT;
if (!projectRoot) {
  // stderr is fine; only stdout is reserved for MCP frames
  // eslint-disable-next-line no-console
  console.error("[cockpit-mcp] COCKPIT_PROJECT_ROOT env var is required");
  process.exit(2);
}

const browser = createBrowser(projectRoot);

const server = new McpServer({ name: "cockpit", version: "0.1.0" });

// The McpServer.tool generic is excessively deep when fed zod schemas
// directly; the runtime is fine, only the TS instantiation chokes. Cast
// through unknown to side-step it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tool = server.tool.bind(server) as any;

tool(
  "cockpit_mkdir",
  "Create a directory under outputs/ in the trading-playbooks project. Recursive (parents auto-created), idempotent (no error if exists). Use this before writing reports if you want an empty placeholder folder; cockpit_write_file already auto-creates parents so this is optional.",
  {
    path: z
      .string()
      .min(1)
      .describe(
        "Path relative to project root, must start with 'outputs/'. Example: 'outputs/F'.",
      ),
  },
  async ({ path: p }: { path: string }) => {
    try {
      browser.mkdir(p);
      return { content: [{ type: "text", text: `Created ${p}` }] };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error: ${(err as Error).message}` }],
        isError: true,
      };
    }
  },
);

tool(
  "cockpit_write_file",
  "Write a file under outputs/ in the trading-playbooks project. Auto-creates parent directories. Overwrites if file exists. Sandboxed to outputs/ — anywhere else returns an error. Use this for ALL research-report writes when running inside the cockpit; do not try Bash mkdir, Write, or Edit (claude -p sandbox will block them).",
  {
    path: z
      .string()
      .min(1)
      .describe(
        "Path relative to project root, must start with 'outputs/'. Example: 'outputs/F/F-assess-company-2026-05-07.md'.",
      ),
    content: z
      .string()
      .describe(
        "Full file content as a string. Markdown with YAML frontmatter is fine. UTF-8.",
      ),
  },
  async ({ path: p, content }: { path: string; content: string }) => {
    try {
      browser.writeFile(p, content);
      const bytes = Buffer.byteLength(content, "utf8");
      return { content: [{ type: "text", text: `Wrote ${p} (${bytes} bytes)` }] };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error: ${(err as Error).message}` }],
        isError: true,
      };
    }
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[cockpit-mcp] fatal:", err);
  process.exit(1);
});
