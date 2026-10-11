import fs, { type FileHandle } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  allPermissions,
  normalizePermissions,
  type PermissionKey,
} from "./permissions";
import {
  hashPassword,
  type PasswordDigest,
} from "./password";

export type UserRole = "admin" | "user";
export type UserStatus = "active" | "disabled";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  permissions: PermissionKey[];
  password: PasswordDigest;
  sessionVersion: number;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
};

type AuthStore = {
  version: 1;
  users: AuthUser[];
};

export type PublicAuthUser = Omit<AuthUser, "password">;

const STORE_PATH = path.join(process.cwd(), "data", "auth-users.json");
const LOCK_PATH = `${STORE_PATH}.lock`;

function cleanEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function cleanName(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeRole(value: unknown): UserRole {
  return value === "admin" ? "admin" : "user";
}

function normalizeStatus(value: unknown): UserStatus {
  return value === "disabled" ? "disabled" : "active";
}

function normalizeUser(raw: AuthUser): AuthUser {
  const role = normalizeRole(raw.role);
  return {
    ...raw,
    name: cleanName(raw.name),
    email: cleanEmail(raw.email),
    role,
    status: normalizeStatus(raw.status),
    permissions:
      role === "admin"
        ? [...allPermissions]
        : normalizePermissions(raw.permissions),
    sessionVersion:
      Number.isInteger(raw.sessionVersion) && raw.sessionVersion > 0
        ? raw.sessionVersion
        : 1,
    lastLoginAt: raw.lastLoginAt ?? null,
  };
}

async function ensureDataDirectory() {
  await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
}

async function readStoreUnsafe(): Promise<AuthStore> {
  await ensureDataDirectory();
  const raw = await fs.readFile(STORE_PATH, "utf8");
  const parsed = JSON.parse(raw) as AuthStore;
  if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.users)) {
    throw new Error("Invalid auth user store.");
  }
  return {
    version: 1,
    users: parsed.users.map(normalizeUser),
  };
}

async function writeStoreUnsafe(store: AuthStore) {
  await ensureDataDirectory();
  const temp = `${STORE_PATH}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(store, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await fs.rename(temp, STORE_PATH);
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function withStoreLock<T>(work: () => Promise<T>): Promise<T> {
  await ensureDataDirectory();

  let handle: FileHandle | null = null;
  const started = Date.now();

  while (!handle) {
    try {
      handle = await fs.open(LOCK_PATH, "wx", 0o600);
    } catch (error) {
      const code =
        typeof error === "object" && error && "code" in error
          ? String((error as { code?: string }).code)
          : "";
      if (code !== "EEXIST") throw error;

      // Recover only clearly stale lock files left by an interrupted process.
      const stat = await fs.stat(LOCK_PATH).catch(() => null);
      if (stat && Date.now() - stat.mtimeMs > 30_000) {
        await fs.unlink(LOCK_PATH).catch(() => undefined);
        continue;
      }

      if (Date.now() - started > 4000) {
        throw new Error("User store is busy. Please try again.");
      }
      await sleep(80);
    }
  }

  try {
    return await work();
  } finally {
    await handle.close().catch(() => undefined);
    await fs.unlink(LOCK_PATH).catch(() => undefined);
  }
}

export function toPublicUser(user: AuthUser): PublicAuthUser {
  const { password: _password, ...publicUser } = user;
  return publicUser;
}

export async function readAuthStore() {
  return readStoreUnsafe();
}

export async function listUsers(): Promise<PublicAuthUser[]> {
  const store = await readStoreUnsafe();
  return store.users
    .map(toPublicUser)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getUserById(id: string): Promise<AuthUser | null> {
  const store = await readStoreUnsafe();
  return store.users.find((user) => user.id === id) ?? null;
}

export async function getUserByEmail(email: string): Promise<AuthUser | null> {
  const target = cleanEmail(email);
  const store = await readStoreUnsafe();
  return store.users.find((user) => user.email === target) ?? null;
}

function assertAtLeastOneActiveAdmin(users: AuthUser[]) {
  if (
    !users.some(
      (user) => user.role === "admin" && user.status === "active",
    )
  ) {
    throw new Error("At least one active administrator is required.");
  }
}

export async function recordSuccessfulLogin(id: string) {
  await withStoreLock(async () => {
    const store = await readStoreUnsafe();
    const user = store.users.find((item) => item.id === id);
    if (!user) return;
    user.lastLoginAt = new Date().toISOString();
    user.updatedAt = new Date().toISOString();
    await writeStoreUnsafe(store);
  });
}

export async function createUser(input: {
  name: string;
  email: string;
  password: string;
  role?: UserRole;
  status?: UserStatus;
  permissions?: unknown;
}): Promise<PublicAuthUser> {
  return withStoreLock(async () => {
    const store = await readStoreUnsafe();

    const name = cleanName(input.name);
    const email = cleanEmail(input.email);
    const role = normalizeRole(input.role);
    const status = normalizeStatus(input.status);

    if (!name) throw new Error("Name is required.");
    if (!email || !email.includes("@")) {
      throw new Error("A valid email address is required.");
    }
    if (store.users.some((user) => user.email === email)) {
      throw new Error("A user with this email already exists.");
    }

    const now = new Date().toISOString();
    const user: AuthUser = {
      id: randomUUID(),
      name,
      email,
      role,
      status,
      permissions:
        role === "admin"
          ? [...allPermissions]
          : normalizePermissions(input.permissions),
      password: hashPassword(input.password),
      sessionVersion: 1,
      createdAt: now,
      updatedAt: now,
      lastLoginAt: null,
    };

    store.users.push(user);
    assertAtLeastOneActiveAdmin(store.users);
    await writeStoreUnsafe(store);
    return toPublicUser(user);
  });
}

export async function updateUser(
  id: string,
  input: {
    name?: string;
    email?: string;
    password?: string;
    role?: UserRole;
    status?: UserStatus;
    permissions?: unknown;
  },
): Promise<PublicAuthUser> {
  return withStoreLock(async () => {
    const store = await readStoreUnsafe();
    const user = store.users.find((item) => item.id === id);
    if (!user) throw new Error("User not found.");

    if (input.name !== undefined) {
      const name = cleanName(input.name);
      if (!name) throw new Error("Name is required.");
      user.name = name;
    }

    if (input.email !== undefined) {
      const email = cleanEmail(input.email);
      if (!email || !email.includes("@")) {
        throw new Error("A valid email address is required.");
      }
      if (
        store.users.some(
          (item) => item.id !== id && item.email === email,
        )
      ) {
        throw new Error("A user with this email already exists.");
      }
      user.email = email;
    }

    if (input.role !== undefined) {
      user.role = normalizeRole(input.role);
    }

    if (input.status !== undefined) {
      user.status = normalizeStatus(input.status);
    }

    if (user.role === "admin") {
      user.permissions = [...allPermissions];
    } else if (input.permissions !== undefined) {
      user.permissions = normalizePermissions(input.permissions);
    }

    if (typeof input.password === "string" && input.password.trim()) {
      user.password = hashPassword(input.password);
    }

    user.sessionVersion += 1;
    user.updatedAt = new Date().toISOString();

    assertAtLeastOneActiveAdmin(store.users);
    await writeStoreUnsafe(store);
    return toPublicUser(user);
  });
}