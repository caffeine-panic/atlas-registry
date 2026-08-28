import { parseDocument } from "yaml";
import { TomlError, parse as parseToml } from "smol-toml";
import { jsonLanguage } from "@codemirror/lang-json";
import type { ConfigLanguage } from "./configLanguage";

export type ConfigValidationIssue = {
  line: number;
  column: number;
  offset: number;
  message: string;
};

export type ConfigValidationResult =
  | { kind: "valid" }
  | { kind: "unsupported" }
  | { kind: "invalid"; issue: ConfigValidationIssue };

function lineColumnAt(content: string, offset: number) {
  const safeOffset = Math.max(0, Math.min(offset, content.length));
  const before = content.slice(0, safeOffset);
  const lines = before.split("\n");
  return {
    line: lines.length,
    column: (lines.at(-1)?.length ?? 0) + 1,
    offset: safeOffset,
  };
}

function invalidAt(
  content: string,
  offset: number,
  message: string,
): ConfigValidationResult {
  return {
    kind: "invalid",
    issue: { ...lineColumnAt(content, offset), message },
  };
}

function validateJson(content: string): ConfigValidationResult {
  try {
    JSON.parse(content);
    return { kind: "valid" };
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : "JSON 语法错误";
    const cursor = jsonLanguage.parser.parse(content).cursor();
    let offset = 0;
    do {
      if (cursor.type.isError) {
        offset = cursor.from;
        break;
      }
    } while (cursor.next());
    return invalidAt(content, offset, message);
  }
}

function validateYaml(content: string): ConfigValidationResult {
  const document = parseDocument(content, { prettyErrors: true });
  const error = document.errors[0];
  if (!error) return { kind: "valid" };
  const linePosition = error.linePos?.[0];
  return {
    kind: "invalid",
    issue: {
      line: linePosition?.line ?? 1,
      column: linePosition?.col ?? 1,
      offset: error.pos[0],
      message: error.message,
    },
  };
}

function validateXml(content: string): ConfigValidationResult {
  const document = new DOMParser().parseFromString(content, "application/xml");
  const error = document.querySelector("parsererror");
  if (!error) return { kind: "valid" };
  const message = error.textContent?.trim() || "XML 语法错误";
  const lineMatch = /line\s+(\d+)/i.exec(message);
  const columnMatch = /column\s+(\d+)/i.exec(message);
  const line = Number(lineMatch?.[1] ?? 1);
  const column = Number(columnMatch?.[1] ?? 1);
  const lines = content.split("\n");
  const offset =
    lines
      .slice(0, line - 1)
      .reduce((length, value) => length + value.length + 1, 0) +
    column -
    1;
  return { kind: "invalid", issue: { line, column, offset, message } };
}

function validateToml(content: string): ConfigValidationResult {
  try {
    parseToml(content);
    return { kind: "valid" };
  } catch (reason) {
    if (reason instanceof TomlError) {
      const lines = content.split("\n");
      const offset =
        lines
          .slice(0, reason.line - 1)
          .reduce((length, value) => length + value.length + 1, 0) +
        reason.column -
        1;
      return {
        kind: "invalid",
        issue: {
          line: reason.line,
          column: reason.column,
          offset,
          message: reason.message,
        },
      };
    }
    return invalidAt(
      content,
      0,
      reason instanceof Error ? reason.message : "TOML 语法错误",
    );
  }
}

export function validateConfig(
  language: ConfigLanguage,
  content: string,
): ConfigValidationResult {
  switch (language) {
    case "json":
      return validateJson(content);
    case "yaml":
      return validateYaml(content);
    case "xml":
      return validateXml(content);
    case "toml":
      return validateToml(content);
    case "plain":
    case "properties":
      return { kind: "unsupported" };
  }
}
