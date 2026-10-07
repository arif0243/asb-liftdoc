type BrandProps = {
  compact?: boolean;
};

export function Brand({ compact = false }: BrandProps) {
  return (
    <div className={compact ? "brand brand-compact" : "brand"}>
      <div className="brand-mark" aria-hidden="true">
        <span>ASB</span>
      </div>
      <div className="brand-copy">
        <div className="brand-name" aria-label="ASB LiftDoc">
          <span>ASB Lift</span>
          <span className="brand-d">D</span>
          <span>oc</span>
        </div>
        {!compact && <div className="brand-tagline">Document Management</div>}
      </div>
    </div>
  );
}
