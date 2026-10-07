"use client";

import {
  ArrowRight,
  Copy,
  FileDown,
  FileText,
  FolderKanban,
  Plus,
  ReceiptText,
  Search,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

type Stats = {
  clients: number;
  projects: number;
  quotations: number;
  invoices: number;
};

const initialStats: Stats = {
  clients: 0,
  projects: 0,
  quotations: 0,
  invoices: 0,
};

export function DashboardOverview() {
  const [stats, setStats] = useState(initialStats);

  useEffect(() => {
    fetch("/api/stats", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => setStats({ ...initialStats, ...data }))
      .catch(() => undefined);
  }, []);

  const statCards = [
    {
      label: "Clients",
      value: stats.clients,
      helper: "Active client records",
      icon: Users,
      href: "/clients",
    },
    {
      label: "Projects",
      value: stats.projects,
      helper: "Active project records",
      icon: FolderKanban,
      href: "/projects",
    },
    {
      label: "Quotations",
      value: stats.quotations,
      helper: "Quotation engine starts in M3",
      icon: FileText,
      href: "/quotations",
    },
    {
      label: "Bills & invoices",
      value: stats.invoices,
      helper: "Billing engine starts in M3",
      icon: ReceiptText,
      href: "/invoices",
    },
  ];

  const quickActions = [
    {
      label: "Add client",
      description: "Create a client record",
      icon: Users,
      href: "/clients",
    },
    {
      label: "Add project",
      description: "Organize work under a client",
      icon: FolderKanban,
      href: "/projects",
    },
    {
      label: "Find data",
      description: "Search the full workspace",
      icon: Search,
      href: "/search",
    },
    {
      label: "Duplicate previous",
      description: "Quotation duplication starts in M3",
      icon: Copy,
      href: "/quotations",
    },
    {
      label: "Create quotation",
      description: "Quotation builder starts in M3",
      icon: Plus,
      href: "/quotations",
    },
    {
      label: "Export center",
      description: "PDF, print, Word and Excel later",
      icon: FileDown,
      href: "/documents",
    },
  ];

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <div className="hero-copy">
          <div className="eyebrow">Document workspace</div>
          <h1>Welcome to ASB LiftDoc</h1>
          <p>
            Manage client-wise and project-wise quotations, bills, invoices and
            custom business documents from one searchable workspace.
          </p>

          <div className="hero-actions">
            <Link href="/clients" className="button button-primary">
              <Plus size={17} />
              Add client
            </Link>
            <Link href="/search" className="button button-secondary">
              <Search size={17} />
              Global search
            </Link>
          </div>
        </div>

        <div className="hero-visual">
          <div className="paper-stack paper-back" />
          <div className="paper-stack paper-middle" />
          <div className="paper-card">
            <div className="paper-brand">
              <span>ASB Lift</span>
              <span className="brand-d">D</span>
              <span>oc</span>
            </div>
            <span className="paper-label">QUOTATION</span>
            <div className="paper-line paper-line-lg" />
            <div className="paper-line paper-line-md" />
            <div className="paper-table">
              <div />
              <div />
              <div />
              <div />
              <div />
              <div />
            </div>
            <div className="paper-total" />
          </div>
        </div>
      </section>

      <section className="stats-grid">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <Link key={stat.label} href={stat.href} className="stat-card">
              <div className="stat-card-top">
                <span className="stat-icon">
                  <Icon size={20} />
                </span>
                <ArrowRight size={17} className="stat-arrow" />
              </div>
              <strong className="stat-value">{stat.value}</strong>
              <span className="stat-label">{stat.label}</span>
              <span className="stat-helper">{stat.helper}</span>
            </Link>
          );
        })}
      </section>

      <section className="dashboard-grid">
        <div className="panel">
          <div className="panel-heading">
            <div>
              <span className="panel-kicker">Fast workflow</span>
              <h2>Quick actions</h2>
            </div>
          </div>

          <div className="quick-actions-grid">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <Link href={action.href} key={action.label} className="quick-action">
                  <span className="quick-action-icon">
                    <Icon size={20} />
                  </span>
                  <span>
                    <strong>{action.label}</strong>
                    <small>{action.description}</small>
                  </span>
                  <ArrowRight size={17} />
                </Link>
              );
            })}
          </div>
        </div>

        <div className="panel">
          <div className="panel-heading">
            <div>
              <span className="panel-kicker">Workspace status</span>
              <h2>Build progress</h2>
            </div>
          </div>

          <div className="progress-list">
            <div className="progress-row progress-done">
              <div className="progress-number">M0</div>
              <div>
                <strong>Foundation</strong>
                <span>Next.js, build, Git, local start/stop</span>
              </div>
              <span className="progress-pill">Done</span>
            </div>

            <div className="progress-row progress-done">
              <div className="progress-number">M1</div>
              <div>
                <strong>Application shell</strong>
                <span>Brand, dashboard, navigation, responsive UI</span>
              </div>
              <span className="progress-pill">Done</span>
            </div>

            <div className="progress-row progress-current">
              <div className="progress-number">M2</div>
              <div>
                <strong>Clients, projects & search</strong>
                <span>Persistent local data and full-site search</span>
              </div>
              <span className="progress-pill">Current</span>
            </div>
          </div>
        </div>
      </section>

      <section className="panel recent-panel">
        <div className="panel-heading panel-heading-row">
          <div>
            <span className="panel-kicker">Next workflow</span>
            <h2>Quotation engine</h2>
          </div>
          <Link href="/quotations" className="text-link">
            Open quotations
            <ArrowRight size={16} />
          </Link>
        </div>

        <div className="empty-state">
          <div className="empty-state-icon">
            <FileText size={26} />
          </div>
          <strong>Client and project foundation is ready</strong>
          <p>
            After M2 acceptance, M3 will connect quotation numbering, client/project
            selection, duplicate, revision and commercial items.
          </p>
        </div>
      </section>
    </div>
  );
}
