"use client";

import { FormEvent, useState } from "react";
import { useSearchParams } from "next/navigation";



function MailIcon() {
  return (
    <svg className="asbLoginInputSvg" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg className="asbLoginInputSvg" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="10" width="14" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg className="asbLoginInputSvg" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
      <circle cx="12" cy="12" r="2.4" />
    </svg>
  );
}

export function LoginForm() {
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [help, setHelp] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!email.trim() || !password) {
      setError("Email and password are required.");
      return;
    }

    setBusy(true);
    setError("");
    setHelp("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: email.trim(),
          password,
          remember,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || "Unable to sign in.");
      }

      const requested = searchParams.get("next");

      const destination =
        requested &&
        requested.startsWith("/") &&
        !requested.startsWith("//")
          ? requested
          : "/";

      window.location.assign(destination);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to sign in.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="asbLoginForm" onSubmit={submit}>
      <div className="asbLoginField">
        <span className="asbLoginFieldIcon">
          <MailIcon />
        </span>

        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="username"
          placeholder="Email address"
          aria-label="Email address"
          required
        />
      </div>

      <div className="asbLoginField">
        <span className="asbLoginFieldIcon">
          <LockIcon />
        </span>

        <input
          type={showPassword ? "text" : "password"}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          placeholder="Password"
          aria-label="Password"
          required
        />

        <button
          type="button"
          className="asbLoginEye"
          aria-label={showPassword ? "Hide password" : "Show password"}
          onClick={() => setShowPassword((value) => !value)}
        >
          <EyeIcon />
        </button>
      </div>

      <div className="asbLoginOptions">
        <label className="asbLoginRemember">
          <input
            type="checkbox"
            checked={remember}
            onChange={(event) => setRemember(event.target.checked)}
          />

          <span>Keep me signed in</span>
        </label>

        <button
          type="button"
          className="asbLoginForgot"
          onClick={() =>
            setHelp(
              "Please contact your ASB LiftDoc administrator to reset your password.",
            )
          }
        >
          Forgot password?
        </button>
      </div>

      {help ? <div className="asbLoginHelp">{help}</div> : null}
      {error ? <div className="asbLoginError">{error}</div> : null}

      <button
        className="asbLoginSubmit"
        type="submit"
        disabled={busy}
      >
        <span>{busy ? "Signing in..." : "Sign in"}</span>
        {!busy ? <span className="asbLoginArrow">&rarr;</span> : null}
      </button>
    </form>
  );
}