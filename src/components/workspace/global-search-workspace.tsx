"use client";

import {
  Building2,
  ChevronRight,
  FileText,
  FolderKanban,
  Search,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { GlobalSearchResult } from "@/types/workspace";

type SearchType = "all" | "client" | "project" | "quotation";

function SearchIcon({ type }: { type: GlobalSearchResult["type"] }) {
  if (type === "client") return <Building2 size={18} />;
  if (type === "project") return <FolderKanban size={18} />;
  return <FileText size={18} />;
}

export function GlobalSearchWorkspace() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [type, setType] = useState<SearchType>("all");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    setQuery(url.searchParams.get("q") ?? "");
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

  const filters: { key: SearchType; label: string }[] = [
    { key: "all", label: "All" },
    { key: "client", label: "Clients" },
    { key: "project", label: "Projects" },
    { key: "quotation", label: "Quotations" },
  ];

  return (
    <div className="page-stack">
      <div className="page-heading-row">
        <div>
          <div className="eyebrow">Full-site data finder</div>
          <h1>Global Search</h1>
          <p>
            Search client, project and quotation data from one place. Invoice and
            document content will join this same index in later milestones.
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
            placeholder="Search client, phone, project, quotation no, item, tag..."
          />
        </div>

        <div className="search-filter-row">
          {filters.map((filter) => {
            const count =
              filter.key === "all"
                ? results.length
                : results.filter((result) => result.type === filter.key).length;

            return (
              <button
                type="button"
                key={filter.key}
                className={
                  type === filter.key
                    ? "filter-chip filter-chip-active"
                    : "filter-chip"
                }
                onClick={() => setType(filter.key)}
              >
                {filter.label} ({count})
              </button>
            );
          })}
        </div>

        <div className="search-result-list">
          {!query.trim() ? (
            <div className="search-page-empty">
              Start typing to search the ASB LiftDoc workspace.
            </div>
          ) : loading ? (
            <div className="search-page-empty">Searching...</div>
          ) : filtered.length === 0 ? (
            <div className="search-page-empty">No matching data found.</div>
          ) : (
            filtered.map((result) => (
              <Link
                href={result.href}
                key={`${result.type}-${result.id}`}
                className="full-search-result"
              >
                <span className="full-search-icon">
                  <SearchIcon type={result.type} />
                </span>
                <span className="full-search-copy">
                  <strong>{result.title}</strong>
                  <small>{result.subtitle}</small>
                </span>
                <span className="full-search-meta">{result.meta}</span>
                <ChevronRight size={18} />
              </Link>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
