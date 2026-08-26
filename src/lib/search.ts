import MiniSearch from "minisearch";
import type { Pattern } from "@/types";

interface SearchDoc {
  id: string;
  name: string;
  summary: string;
  intent: string;
  tags: string;
  category: string;
  frameworks: string;
  useCases: string;
}

let index: MiniSearch<SearchDoc> | null = null;

function toDoc(pattern: Pattern): SearchDoc {
  return {
    id: pattern.slug,
    name: pattern.name,
    summary: pattern.summary,
    intent: pattern.intent,
    tags: pattern.tags.join(" "),
    category: pattern.category,
    frameworks: pattern.frameworks.join(" "),
    useCases: pattern.useCases.map((u) => `${u.title} ${u.description}`).join(" "),
  };
}

export function buildSearchIndex(patterns: Pattern[]): void {
  index = new MiniSearch<SearchDoc>({
    idField: "id",
    fields: ["name", "summary", "intent", "tags", "category", "frameworks", "useCases"],
    storeFields: ["name"],
    searchOptions: {
      boost: { name: 3, tags: 2, summary: 1.5 },
      fuzzy: 0.2,
      prefix: true,
    },
  });
  index.addAll(patterns.map(toDoc));
}

export function search(query: string): Set<string> {
  if (!index || !query.trim()) return new Set();
  const results = index.search(query);
  return new Set(results.map((r) => String(r.id)));
}
