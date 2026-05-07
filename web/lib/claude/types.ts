// Events parsed from `claude --output-format stream-json` stdout.
// Discriminated union — switch on `kind`.

export type SystemInit = {
  kind: "system_init";
  session_id: string;
  model?: string;
  cwd?: string;
};

export type TextDelta = {
  kind: "text_delta";
  text: string;
};

export type ToolUseStart = {
  kind: "tool_use_start";
  id: string;
  name: string;
  input: unknown;
};

export type ToolResult = {
  kind: "tool_result";
  tool_use_id: string;
  content: unknown;
  is_error: boolean;
};

export type PermissionDenial = {
  tool_name: string;
  tool_use_id: string;
  tool_input: unknown;
};

export type Result = {
  kind: "result";
  session_id: string;
  duration_ms?: number;
  cost_usd?: number;
  permission_denials: PermissionDenial[];
};

export type ParseError = {
  kind: "parse_error";
  raw: string;
  reason: string;
};

export type Unknown = {
  kind: "unknown";
  raw: unknown;
};

export type ClaudeEvent =
  | SystemInit
  | TextDelta
  | ToolUseStart
  | ToolResult
  | Result
  | ParseError
  | Unknown;
