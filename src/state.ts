import type { Pattern, PatternCategory, Framework, Complexity } from "@/types";

export interface FilterState {
  query: string;
  categories: Set<PatternCategory>;
  frameworks: Set<Framework>;
  complexities: Set<Complexity>;
}

type Listener = () => void;

function toggleInSet<T>(set: Set<T>, value: T): void {
  if (set.has(value)) set.delete(value);
  else set.add(value);
}

class FilterStore {
  state: FilterState = {
    query: "",
    categories: new Set(),
    frameworks: new Set(),
    complexities: new Set(),
  };

  private listeners = new Set<Listener>();

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    this.listeners.forEach((fn) => fn());
  }

  setQuery(query: string): void {
    this.state.query = query;
    this.emit();
  }

  toggleCategory(category: PatternCategory): void {
    toggleInSet(this.state.categories, category);
    this.emit();
  }

  toggleFramework(framework: Framework): void {
    toggleInSet(this.state.frameworks, framework);
    this.emit();
  }

  toggleComplexity(complexity: Complexity): void {
    toggleInSet(this.state.complexities, complexity);
    this.emit();
  }

  clearFilters(): void {
    this.state.categories.clear();
    this.state.frameworks.clear();
    this.state.complexities.clear();
    this.emit();
  }

  hasActiveFilters(): boolean {
    return (
      this.state.categories.size > 0 ||
      this.state.frameworks.size > 0 ||
      this.state.complexities.size > 0 ||
      this.state.query.trim().length > 0
    );
  }
}

export const filterStore = new FilterStore();

export function applyFilters(
  patterns: Pattern[],
  searchMatches: Set<string> | null
): Pattern[] {
  const { categories, frameworks, complexities } = filterStore.state;
  return patterns.filter((p) => {
    if (searchMatches && !searchMatches.has(p.slug)) return false;
    if (categories.size && !categories.has(p.category)) return false;
    if (frameworks.size && !p.frameworks.some((f) => frameworks.has(f))) return false;
    if (complexities.size && !complexities.has(p.complexity)) return false;
    return true;
  });
}
