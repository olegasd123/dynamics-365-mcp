import { existsSync, readFileSync } from "node:fs";

function parseEnvAssignment(line: string): [string, string] | null {
  const trimmedLine = line.trim();
  if (!trimmedLine || trimmedLine.startsWith("#")) {
    return null;
  }

  const normalizedLine = trimmedLine.startsWith("export ")
    ? trimmedLine.slice("export ".length).trim()
    : trimmedLine;
  const separatorIndex = normalizedLine.indexOf("=");
  if (separatorIndex <= 0) {
    return null;
  }

  const key = normalizedLine.slice(0, separatorIndex).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
    return null;
  }

  const rawValue = normalizedLine.slice(separatorIndex + 1).trim();
  return [key, parseEnvValue(rawValue)];
}

function parseEnvValue(rawValue: string): string {
  if (!rawValue) {
    return "";
  }

  if (
    (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
    (rawValue.startsWith("'") && rawValue.endsWith("'"))
  ) {
    return rawValue.slice(1, -1);
  }

  const inlineCommentIndex = rawValue.search(/\s+#/);
  if (inlineCommentIndex >= 0) {
    return rawValue.slice(0, inlineCommentIndex).trimEnd();
  }

  return rawValue;
}

export function loadEnvFiles(env: NodeJS.ProcessEnv, filePaths: string[]): string[] {
  const loadedPaths: string[] = [];

  for (const filePath of filePaths) {
    if (!filePath || !existsSync(filePath)) {
      continue;
    }

    const content = readFileSync(filePath, "utf8");
    for (const rawLine of content.split(/\r?\n/)) {
      const assignment = parseEnvAssignment(rawLine);
      if (!assignment) {
        continue;
      }

      const [key, value] = assignment;
      if (env[key] === undefined) {
        env[key] = value;
      }
    }

    loadedPaths.push(filePath);
  }

  return loadedPaths;
}
