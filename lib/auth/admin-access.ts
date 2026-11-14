import { cache } from "react";
import { headers } from "next/headers";
import {
  getAdminNetworkStatus,
  type AdminNetworkStatus,
} from "./network";

/**
 * Status de rede do request atual (memoizado por request pelo React).
 * Só deve ser usado em Server Components/Server Actions (runtime Node).
 */
export const getAdminNetworkAccess = cache(
  async (): Promise<AdminNetworkStatus> => {
    const headerStore = await headers();
    return getAdminNetworkStatus(headerStore);
  },
);
