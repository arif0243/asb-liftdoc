import {
  createHmac,
  timingSafeEqual,
} from "node:crypto";

export const SESSION_COOKIE = "asb_liftdoc_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

export type SessionPayload = {
  uid: string;
  ver: number;
  exp: number;
};

function secret() {
  const value = process.env.ASB_AUTH_SECRET?.trim();
  if (!value || value.length < 32) {
    throw new Error(
      "ASB_AUTH_SECRET is missing or too short. It must be at least 32 characters.",
    );
  }
  return value;
}

function signature(body: string) {
  return createHmac("sha256", secret())
    .update(body)
    .digest("base64url");
}

export function createSessionToken(input: {
  userId: string;
  sessionVersion: number;
}) {
  const payload: SessionPayload = {
    uid: input.userId,
    ver: input.sessionVersion,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
  };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url",
  );
  return `${body}.${signature(body)}`;
}

export function verifySessionToken(
  token: string | undefined | null,
): SessionPayload | null {
  if (!token) return null;

  try {
    const [body, suppliedSignature, extra] = token.split(".");
    if (!body || !suppliedSignature || extra) return null;

    const expected = Buffer.from(signature(body));
    const supplied = Buffer.from(suppliedSignature);

    if (
      expected.length !== supplied.length ||
      !timingSafeEqual(expected, supplied)
    ) {
      return null;
    }

    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as SessionPayload;

    if (
      !payload ||
      typeof payload.uid !== "string" ||
      !Number.isInteger(payload.ver) ||
      !Number.isInteger(payload.exp) ||
      payload.exp <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export function readCookieValue(
  cookieHeader: string | null,
  name: string,
): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rest] = part.trim().split("=");
    if (rawName === name) {
      return decodeURIComponent(rest.join("="));
    }
  }
  return null;
}