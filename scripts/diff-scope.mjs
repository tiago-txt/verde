import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * Portão de escopo para agentes.
 *
 * Lê `SCOPE.txt` (ignorado pelo git), com um caminho ou glob por linha, e falha
 * se o diff da working tree (incluindo arquivos não rastreados) contiver algo
 * fora da lista. Linhas vazias e iniciadas por `#` são ignoradas.
 *
 * Uso:
 *   npm run scope
 */

const root = process.cwd();
const scopePath = path.join(root, "SCOPE.txt");

if (!fs.existsSync(scopePath)) {
  console.error(
    "[scope] SCOPE.txt não encontrado. Crie o arquivo com um caminho ou glob por linha.",
  );
  process.exit(1);
}

const entries = fs
  .readFileSync(scopePath, "utf8")
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#"));

if (entries.length === 0) {
  console.error("[scope] SCOPE.txt está vazio. Liste os arquivos permitidos.");
  process.exit(1);
}

function gitLines(args) {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8" })
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch (error) {
    console.error(
      `[scope] Falha ao executar "git ${args.join(" ")}": ${error.message}`,
    );
    process.exit(1);
  }
}

function toPosix(value) {
  return value.replace(/\\/g, "/");
}

function globToRegExp(glob) {
  let source = "";
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index];
    const next = glob[index + 1];
    if (char === "*" && next === "*") {
      if (glob[index + 2] === "/") {
        source += "(?:.*/)?";
        index += 2;
      } else {
        source += ".*";
        index += 1;
      }
    } else if (char === "*") {
      source += "[^/]*";
    } else if (char === "?") {
      source += "[^/]";
    } else {
      source += char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${source}$`);
}

const matchers = entries.map((entry) => {
  const normalized = toPosix(entry);
  const isDirectory =
    normalized.endsWith("/") ||
    (fs.existsSync(path.join(root, normalized)) &&
      fs.statSync(path.join(root, normalized)).isDirectory());
  if (isDirectory) {
    const prefix = normalized.replace(/\/+$/, "") + "/";
    return { entry, test: (file) => file.startsWith(prefix) };
  }
  if (!/[*?]/.test(normalized)) {
    return { entry, test: (file) => file === normalized };
  }
  const regex = globToRegExp(normalized);
  return { entry, test: (file) => regex.test(file) };
});

const tracked = gitLines(["diff", "--name-only", "HEAD"]);
const untracked = gitLines(["ls-files", "--others", "--exclude-standard"]);
const changed = [...new Set([...tracked, ...untracked])]
  .map(toPosix)
  .filter((file) => file !== "SCOPE.txt")
  .sort();

const outside = changed.filter(
  (file) => !matchers.some((matcher) => matcher.test(file)),
);

if (outside.length > 0) {
  console.error("[scope] Arquivos fora do escopo declarado em SCOPE.txt:");
  for (const file of outside) console.error(`  - ${file}`);
  console.error(
    "\nAdicione os caminhos/globs ao SCOPE.txt ou desfaça as mudanças fora do escopo.",
  );
  process.exit(1);
}

console.log(
  `[scope] OK: ${changed.length} arquivo(s) alterado(s), todos dentro do escopo.`,
);
