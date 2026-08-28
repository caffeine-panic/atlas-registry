import type { ResourceAddress } from "./registry";

export type ConfigLanguage =
  | "plain"
  | "json"
  | "yaml"
  | "xml"
  | "properties"
  | "toml";

export const configLanguageLabels: Record<ConfigLanguage, string> = {
  plain: "Plain Text",
  json: "JSON",
  yaml: "YAML",
  xml: "XML",
  properties: "Properties / INI",
  toml: "TOML",
};

const contentTypeLanguages: Record<string, ConfigLanguage> = {
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  xml: "xml",
  properties: "properties",
  property: "properties",
  ini: "properties",
  toml: "toml",
  text: "plain",
  plain: "plain",
};

const extensionLanguages: Record<string, ConfigLanguage> = {
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  xml: "xml",
  properties: "properties",
  ini: "properties",
  cfg: "properties",
  conf: "properties",
  toml: "toml",
};

function utf8EtcdKey(keyBase64: string): string | undefined {
  try {
    const binary = atob(keyBase64);
    const bytes = Uint8Array.from(binary, (character) =>
      character.charCodeAt(0),
    );
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return undefined;
  }
}

export function addressIdentifier(address: ResourceAddress): string {
  switch (address.type) {
    case "nacosConfig":
      return address.dataId;
    case "zookeeper":
      return address.path;
    case "etcd":
      return utf8EtcdKey(address.keyBase64) ?? "";
    case "etcdPrefix":
      return utf8EtcdKey(address.prefixBase64) ?? "";
    case "root":
      return "";
  }
}

function languageFromExtension(identifier: string): ConfigLanguage | undefined {
  const leaf = identifier.split("/").at(-1) ?? identifier;
  const separator = leaf.lastIndexOf(".");
  if (separator < 0) return undefined;
  return extensionLanguages[leaf.slice(separator + 1).toLocaleLowerCase()];
}

function languageFromContent(content: string): ConfigLanguage | undefined {
  const trimmed = content.trimStart();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      JSON.parse(trimmed);
      return "json";
    } catch {
      // Invalid JSON should not override an otherwise unknown text format.
    }
  }
  if (/^<\?xml\b/i.test(trimmed) || /^<[A-Za-z_][^>]*>/.test(trimmed)) {
    return "xml";
  }
  return undefined;
}

export function detectConfigLanguage(input: {
  address: ResourceAddress;
  content: string;
  contentType?: string;
  encoding: "utf8" | "base64";
}): ConfigLanguage {
  if (input.encoding === "base64") return "plain";
  const normalizedType = input.contentType?.trim().toLocaleLowerCase();
  const typed = normalizedType && contentTypeLanguages[normalizedType];
  if (typed && typed !== "plain") return typed;
  return (
    languageFromExtension(addressIdentifier(input.address)) ??
    languageFromContent(input.content) ??
    "plain"
  );
}

export function languageSupportsValidation(language: ConfigLanguage): boolean {
  return ["json", "yaml", "xml", "toml"].includes(language);
}
