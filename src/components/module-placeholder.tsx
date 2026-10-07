import Link from "next/link";
import {
  ArrowLeft,
  Construction,
  Plus,
} from "lucide-react";

type ModulePlaceholderProps = {
  title: string;
  description: string;
  actionLabel?: string;
};

export function ModulePlaceholder({
  title,
  description,
  actionLabel,
}: ModulePlaceholderProps) {
  return (
    <div className="page-stack">
      <div className="page-heading-row">
        <div>
          <div className="eyebrow">ASB LiftDoc</div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>

        {actionLabel && (
          <button type="button" className="button button-primary">
            <Plus size={17} />
            {actionLabel}
          </button>
        )}
      </div>

      <section className="empty-module-card">
        <div className="empty-module-icon">
          <Construction size={30} />
        </div>
        <h2>{title} module is ready for the next milestone</h2>
        <p>
          The navigation route and UI foundation are active. Database-backed
          functionality will be added in the relevant milestone.
        </p>
        <Link href="/" className="button button-secondary">
          <ArrowLeft size={17} />
          Back to dashboard
        </Link>
      </section>
    </div>
  );
}
