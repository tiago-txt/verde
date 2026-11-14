import fs from "node:fs";
import path from "node:path";

/**
 * O migrator do Drizzle aplica uma migration só quando o `when` do journal é
 * maior que o `created_at` da última migration gravada no banco. Como o
 * projeto usa timestamps fixos/artificiais para ordenar migrations antigas,
 * uma migration nova gerada com `Date.now()` pode ficar com timestamp menor e
 * ser silenciosamente ignorada.
 *
 * Este script garante que o journal seja estritamente crescente após o
 * `drizzle-kit generate`.
 */
const journalPath = path.join(process.cwd(), "drizzle", "meta", "_journal.json");
const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));

let changed = false;
for (let index = 1; index < journal.entries.length; index += 1) {
  const previous = journal.entries[index - 1];
  const current = journal.entries[index];
  if (current.when <= previous.when) {
    current.when = previous.when + 1;
    changed = true;
  }
}

if (changed) {
  fs.writeFileSync(journalPath, `${JSON.stringify(journal, null, 2)}\n`);
  console.log("[verde] Journal de migrations reordenado (when crescente).");
}
