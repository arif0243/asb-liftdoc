"use client";

import {
  Building2,
  ChevronRight,
  FolderKanban,
  Search,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { GlobalSearchResult } from "@/types/workspace";

export function GlobalSearchWorkspace() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [type, setType] = useState<"all" | "client" | "project">("all");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    const initial = url.searchParams.get("q") ?? "";
    setQuery(initial);
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);

      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        const data = await response.json();
        setResults(data.results ?? []);
      } catch {
        if (!controller.signal.aborted) {
          setResults([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }, 220);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const filtered = useMemo(
    () => (type === "all" ? results : results.filter((result) => result.type === type)),
    [results, type],
  );

  return (
    <div className="page-stack">
      <div className="page-heading-row">
        <div>
          <div className="eyebrow">Full-site data finder</div>
          <h1>Global Search</h1>
          <p>
            Search client and project data now. Quotations, invoices and document
            text will join this same search index in later milestones.
          </p>
        </div>
      </div>

      <section className="search-page-panel">
        <div className="search-page-input">
          <Search size={20} />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, phone, email, address, project code, location, tags..."
          />
        </div>

        <div className="search-filter-row">
          {(["all", "client", "project"] as const).map((item) => (
            <button
              type="button"
              key={item}
              className={type === item ? "filter-chip filter-chip-active" : "filter-chip"}
              onClick={() => setType(item)}
            >
              {item === "all"
                ? `All (${results.length})`
                : `${item === "client" ? "Clients" : "Projects"} (${
                    results.filter((result) => result.type === item).length
                  })`}
            </button>
          ))}
        </div>

        <div className="search-result-list">
          {!query.trim() ? (
            <div className="search-page-empty">
              Start typing to search the full ASB LiftDoc workspace.
            </div>
          ) : loading ? (
            <div className="search-page-empty">Searching...</div>
          ) : filtered.length === 0 ? (
            <div className="search-page-empty">No matching data found.</div>
          ) : (
            filtered.map((result) => {
              const Icon = result.type === "client" ? Building2 : FolderKanban;

              return (
                <Link href={result.href} key={`${result.type}-${result.id}`} className="full-search-result">
                  <span className="full-search-icon">
                    <Icon size={18} />
                  </span>
                  <span className="full-search-copy">
                    <strong>{result.title}</strong>
                    <small>{result.subtitle}</small>
                  </span>
                  <span className="full-search-meta">{result.meta}</span>
                  <ChevronRight size={18} />
                </Link>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
