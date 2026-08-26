import type { Pattern } from "@/types";
import { filterStore, applyFilters } from "@/state";
import { search } from "@/lib/search";

export function getVisiblePatterns(all: Pattern[]): Pattern[] {
  const query = filterStore.state.query.trim();
  const matches = query ? search(query) : null;
  return applyFilters(all, matches);
}
