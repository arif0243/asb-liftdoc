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

const stats = [
  {
    label: "Clients",
    value: "0",
    helper: "Client database starts in M2",
    icon: Users,
    href: "/clients",
  },
  {
    label: "Projects",
    value: "0",
    helper: "Project organization starts in M2",
    icon: FolderKanban,
    href: "/projects",
  },
  {
    label: "Quotations",
    value: "0",
    helper: "Quotation engine starts in M3",
    icon: FileText,
    href: "/quotations",
  },
  {
    label: "Bills & invoices",
    value: "0",
    helper: "Billing engine starts in M3",
    icon: ReceiptText,
    href: "/invoices",
  },
];

const quickActions = [
  {
    label: "Create quotation",
    description: "Start a new quotation workspace",
    icon: Plus,
    href: "/quotations",
  },
  {
    label: "Find document",
    description: "Search the full workspace",
    icon: Search,
    href: "/documents",
  },
  {
    label: "Duplicate previous",
    description: "Reuse a quotation or invoice",
    icon: Copy,
    href: "/quotations",
  },
  {
    label: "Export center",
    description: "PDF, print, Word and Excel",
    icon: FileDown,
    href: "/documents",
  },
];

export default function DashboardPage() {
  return (
    <div className="page-stack">
      <section className="hero-panel">
        <div className="hero-copy">
          <div className="eyebrow">Document workspace</div>
          <h1>Welcome to ASB LiftDoc</h1>
          <p>
            Build and manage client-wise and project-wise quotations, bills,
            invoices and custom business documents from one workspace.
          </p>

          <div className="hero-actions">
            <Link href="/quotations" className="button button-primary">
              <Plus size={17} />
              Create quotation
            </Link>
            <Link href="/templates" className="button button-secondary">
              View templates
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
        {stats.map((stat) => {
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

            <div className="progress-row progress-current">
              <div className="progress-number">M1</div>
              <div>
                <strong>Application shell</strong>
                <span>Brand, dashboard, navigation, responsive UI</span>
              </div>
              <span className="progress-pill">Current</span>
            </div>

            <div className="progress-row">
              <div className="progress-number">M2</div>
              <div>
                <strong>Clients, projects & search</strong>
                <span>Database-backed workspace organization</span>
              </div>
              <span className="progress-pill">Next</span>
            </div>
          </div>
        </div>
      </section>

      <section className="panel recent-panel">
        <div className="panel-heading panel-heading-row">
          <div>
            <span className="panel-kicker">Recent activity</span>
            <h2>Recent documents</h2>
          </div>
          <Link href="/documents" className="text-link">
            View all
            <ArrowRight size={16} />
          </Link>
        </div>

        <div className="empty-state">
          <div className="empty-state-icon">
            <FileText size={26} />
          </div>
          <strong>No documents yet</strong>
          <p>
            Your first quotation will appear here after the quotation engine is
            connected.
          </p>
        </div>
      </section>
    </div>
  );
}
