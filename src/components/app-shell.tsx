"use client";

import {
  Archive,
  Bell,
  BriefcaseBusiness,
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
  useMemo,
  useRef,
  useState,
} from "react";
import { Brand } from "@/components/brand";

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
  { label: "Templates", href: "/templates", icon: LayoutTemplate },
  { label: "Products & Services", href: "/products", icon: Package },
];

const utilityNavigation: NavItem[] = [
  { label: "Archive", href: "/archive", icon: Archive },
  { label: "Settings", href: "/settings", icon: Settings },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
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

  const searchResults = useMemo(() => {
    const query = searchValue.trim().toLowerCase();

    if (!query) {
      return [];
    }

    return [...navigation, ...utilityNavigation]
      .filter((item) => item.label.toLowerCase().includes(query))
      .slice(0, 6);
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
            <span>M1 UI Foundation</span>
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
                placeholder="Search clients, projects, quotations, invoices..."
                aria-label="Global search"
              />
              <span className="search-shortcut">Ctrl K</span>

              {searchValue.trim() && (
                <div className="search-popover">
                  <div className="search-popover-title">Global search preview</div>

                  {searchResults.length > 0 ? (
                    searchResults.map((result) => {
                      const Icon = result.icon;
                      return (
                        <Link
                          key={result.href}
                          href={result.href}
                          className="search-result"
                          onClick={() => setSearchValue("")}
                        >
                          <span className="search-result-icon">
                            <Icon size={17} />
                          </span>
                          <span>{result.label}</span>
                          <ChevronRight size={16} />
                        </Link>
                      );
                    })
                  ) : (
                    <div className="search-empty">
                      Real client/project/document data search will be connected in M2.
                    </div>
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
