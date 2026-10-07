"use client";

import {
  Archive,
  Bell,
  BriefcaseBusiness,
  Building2,
  ChevronRight,
  FileStack,
  FileText,
  FolderKanban,
  LayoutDashboard,
  LayoutTemplate,
  Menu,
  Package,
  Plus,
  ReceiptText,
  Search,
  Settings,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { Brand } from "@/components/brand";
import type { GlobalSearchResult } from "@/types/workspace";

type NavItem = {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
};

const navigation: NavItem[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Clients", href: "/clients", icon: Users },
  { label: "Projects", href: "/projects", icon: FolderKanban },
  { label: "Quotations", href: "/quotations", icon: FileText },
  { label: "Bills & Invoices", href: "/invoices", icon: ReceiptText },
  { label: "Documents", href: "/documents", icon: FileStack },
  { label: "Global Search", href: "/search", icon: Search },
  { label: "Templates", href: "/templates", icon: LayoutTemplate },
  { label: "Products & Services", href: "/products", icon: Package },
];

const utilityNavigation: NavItem[] = [
  { label: "Archive", href: "/archive", icon: Archive },
  { label: "Settings", href: "/settings", icon: Settings },
];

function ResultIcon({ type }: { type: GlobalSearchResult["type"] }) {
  if (type === "client") {
    return <Building2 size={17} />;
  }

  if (type === "project") {
    return <FolderKanban size={17} />;
  }

  return <FileText size={17} />;
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [searchResults, setSearchResults] = useState<GlobalSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  useEffect(() => {
    const query = searchValue.trim();

    if (!query) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);

      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        const data = await response.json();
        setSearchResults((data.results ?? []).slice(0, 8));
      } catch {
        if (!controller.signal.aborted) {
          setSearchResults([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setSearching(false);
        }
      }
    }, 180);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [searchValue]);

  const renderNavItem = (item: NavItem) => {
    const Icon = item.icon;
    const active =
      item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);

    return (
      <Link
        key={item.href}
        href={item.href}
        className={active ? "nav-item nav-item-active" : "nav-item"}
        onClick={() => setSidebarOpen(false)}
      >
        <Icon size={18} strokeWidth={1.9} />
        <span>{item.label}</span>
      </Link>
    );
  };

  return (
    <div className="app-root">
      <div
        className={sidebarOpen ? "sidebar-overlay sidebar-overlay-open" : "sidebar-overlay"}
        onClick={() => setSidebarOpen(false)}
      />

      <aside className={sidebarOpen ? "sidebar sidebar-open" : "sidebar"}>
        <div className="sidebar-brand-row">
          <Brand />
          <button
            type="button"
            className="icon-button sidebar-close"
            aria-label="Close menu"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={19} />
          </button>
        </div>

        <div className="sidebar-section-label">Workspace</div>
        <nav className="sidebar-nav">{navigation.map(renderNavItem)}</nav>

        <div className="sidebar-section-label sidebar-section-gap">System</div>
        <nav className="sidebar-nav">{utilityNavigation.map(renderNavItem)}</nav>

        <div className="sidebar-footer">
          <div className="sidebar-footer-icon">
            <BriefcaseBusiness size={18} />
          </div>
          <div>
            <strong>Local Workspace</strong>
            <span>M3 Quotation Engine</span>
          </div>
        </div>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <div className="topbar-left">
            <button
              type="button"
              className="icon-button menu-button"
              aria-label="Open menu"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={21} />
            </button>

            <div className="search-wrap">
              <Search size={18} className="search-icon" />
              <input
                ref={searchRef}
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                placeholder="Search clients, projects, quotations..."
                aria-label="Global search"
              />
              <span className="search-shortcut">Ctrl K</span>

              {searchValue.trim() && (
                <div className="search-popover">
                  <div className="search-popover-title">Global search</div>

                  {searching ? (
                    <div className="search-empty">Searching...</div>
                  ) : searchResults.length > 0 ? (
                    <>
                      {searchResults.map((result) => (
                        <Link
                          key={`${result.type}-${result.id}`}
                          href={result.href}
                          className="search-result"
                          onClick={() => setSearchValue("")}
                        >
                          <span className="search-result-icon">
                            <ResultIcon type={result.type} />
                          </span>
                          <span className="search-result-copy">
                            <strong>{result.title}</strong>
                            <small>{result.subtitle}</small>
                          </span>
                          <ChevronRight size={16} />
                        </Link>
                      ))}

                      <Link
                        href={`/search?q=${encodeURIComponent(searchValue)}`}
                        className="search-view-all"
                        onClick={() => setSearchValue("")}
                      >
                        View all search results
                        <ChevronRight size={15} />
                      </Link>
                    </>
                  ) : (
                    <div className="search-empty">No matching workspace data found.</div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="topbar-actions">
            <Link href="/quotations" className="button button-primary desktop-create">
              <Plus size={17} />
              New quotation
            </Link>

            <button className="icon-button notification-button" type="button" aria-label="Notifications">
              <Bell size={19} />
              <span className="notification-dot" />
            </button>

            <div className="profile-chip">
              <div className="profile-avatar">ASB</div>
              <div className="profile-copy">
                <strong>Administrator</strong>
                <span>Local account</span>
              </div>
            </div>
          </div>
        </header>

        <main className="content">{children}</main>
      </div>
    </div>
  );
}
