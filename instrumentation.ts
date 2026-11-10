/**
 * Executado uma vez quando o servidor Next inicia.
 * Assim as migrations/seed rodam no boot do container, antes de qualquer request.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initializeDatabase } = await import("./lib/db/init");
    initializeDatabase();
  }
}
