export type ActionResult =
  | { ok: true; id?: string; count?: number; ignored?: number }
  | { ok: false; error: string; code?: string; ignored?: number };
