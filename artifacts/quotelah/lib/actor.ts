import type { QueryClient } from "@tanstack/react-query";
import type { DemoUserRole } from "@workspace/api-client-react";

/** The simulated signed-in user. Role switching is a demo control, not authentication. */
export interface Actor {
  role: DemoUserRole;
  userId: number | null;
  name: string;
}

/** Every write can change messages, quotes, stock and the log, so refetch all API data. */
export function refreshAll(qc: QueryClient) {
  return qc.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && q.queryKey[0].startsWith("/api/") });
}
