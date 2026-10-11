import Image from "next/image";
import { Suspense } from "react";

import { LoginForm } from "@/components/auth/login-form";
import "./login.css";

function SafetyIcon() {
  return (
    <svg className="asbLoginFeatureIcon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3 20 6.2v5.3c0 5-3.3 8.3-8 10.2-4.7-1.9-8-5.2-8-10.2V6.2L12 3Z" />
      <path d="m8.5 12.2 2.2 2.2 4.9-5" />
    </svg>
  );
}

function ReliableIcon() {
  return (
    <svg className="asbLoginFeatureIcon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="3.4" />
      <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6" />
    </svg>
  );
}

function SupportIcon() {
  return (
    <svg className="asbLoginFeatureIcon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="9" cy="8" r="3" />
      <circle cx="17" cy="9" r="2.3" />
      <path d="M3.5 20c.4-4 2.5-6 5.5-6s5.1 2 5.5 6" />
      <path d="M14.5 15c3-.4 5.2 1.2 6 4.5" />
    </svg>
  );
}

function ValueIcon() {
  return (
    <svg className="asbLoginFeatureIcon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 20V11M12 20V7M19 20V3" />
    </svg>
  );
}

export default function LoginPage() {
  return (
    <main className="asbLoginPage">
      <section className="asbLoginHero">
        <div className="asbLoginHeroOverlay" />

        <div className="asbLoginHeroContent">
          <Image
            src="/asb-auth/asb-elevator-logo.png"
            alt="ASB Elevator"
            width={230}
            height={130}
            priority
            className="asbLoginHeroLogo"
          />

          <div className="asbLoginHeroCopyBlock">
            <h1>
              Reliable
              <br />
              Vertical
              <br />
              Solutions
            </h1>

            <p>
              Safer buildings.
              <br />
              Smoother journeys.
              <br />
              A more connected future.
            </p>

            <span className="asbLoginRedLine" />
          </div>

          <div className="asbLoginFeatures">
            <div className="asbLoginFeature">
              <SafetyIcon />
              <span>
                Safety
                <br />
                First
              </span>
            </div>

            <div className="asbLoginFeature">
              <ReliableIcon />
              <span>
                Reliable
                <br />
                Performance
              </span>
            </div>

            <div className="asbLoginFeature">
              <SupportIcon />
              <span>
                Expert
                <br />
                Support
              </span>
            </div>

            <div className="asbLoginFeature">
              <ValueIcon />
              <span>
                Long-term
                <br />
                Value
              </span>
            </div>
          </div>
        </div>

        <div className="asbLoginBlueAccent" />
        <div className="asbLoginRedAccent" />
      </section>

      <section className="asbLoginArea">
        <div className="asbLoginBgShapeOne" />
        <div className="asbLoginBgShapeTwo" />

        <div className="asbLoginCard">
          <Image
            src="/asb-auth/asb-elevator-logo.png"
            alt="ASB Elevator"
            width={220}
            height={125}
            priority
            className="asbLoginCardLogo"
          />

          <h2>Welcome back</h2>

          <p className="asbLoginSubtitle">
            Sign in to your account to continue
          </p>

          <Suspense fallback={<div className="asbLoginLoading">Loading...</div>}>
            <LoginForm />
          </Suspense>
        </div>
      </section>
    </main>
  );
}