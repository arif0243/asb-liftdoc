"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  allPermissions,
  permissionCatalog,
  type PermissionKey,
} from "@/lib/auth/permissions";
import styles from "./user-management.module.css";

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "user";
  status: "active" | "disabled";
  permissions: PermissionKey[];
  sessionVersion: number;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
};

type FormState = {
  id: string;
  name: string;
  email: string;
  password: string;
  role: "admin" | "user";
  status: "active" | "disabled";
  permissions: PermissionKey[];
};

const emptyForm: FormState = {
  id: "",
  name: "",
  email: "",
  password: "",
  role: "user",
  status: "active",
  permissions: ["dashboard.view"],
};

export function UserManagement() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [mode, setMode] = useState<"closed" | "create" | "edit">("closed");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const groupedPermissions = useMemo(() => {
    const groups = new Map<
      string,
      { key: PermissionKey; label: string }[]
    >();

    for (const item of permissionCatalog) {
      const list = groups.get(item.group) ?? [];
      list.push({ key: item.key, label: item.label });
      groups.set(item.group, list);
    }

    return Array.from(groups.entries());
  }, []);

  async function loadUsers() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/admin/users", {
        cache: "no-store",
      });
      const payload = (await response.json()) as {
        users?: UserRow[];
        currentUserId?: string | null;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || "Unable to load users.");
      }

      setUsers(payload.users ?? []);
      setCurrentUserId(payload.currentUserId ?? null);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to load users.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadUsers();
  }, []);

  function startCreate() {
    setError("");
    setMessage("");
    setForm(emptyForm);
    setMode("create");
  }

  function startEdit(user: UserRow) {
    setError("");
    setMessage("");
    setForm({
      id: user.id,
      name: user.name,
      email: user.email,
      password: "",
      role: user.role,
      status: user.status,
      permissions: [...user.permissions],
    });
    setMode("edit");
  }

  function togglePermission(permission: PermissionKey) {
    setForm((current) => {
      const exists = current.permissions.includes(permission);
      return {
        ...current,
        permissions: exists
          ? current.permissions.filter((item) => item !== permission)
          : [...current.permissions, permission],
      };
    });
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/admin/users", {
        method: mode === "edit" ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: form.id || undefined,
          name: form.name,
          email: form.email,
          password: form.password || undefined,
          role: form.role,
          status: form.status,
          permissions:
            form.role === "admin" ? allPermissions : form.permissions,
        }),
      });

      const payload = (await response.json()) as {
        user?: UserRow;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || "Unable to save user.");
      }

      setMessage(mode === "create" ? "User created." : "User updated.");
      setMode("closed");
      setForm(emptyForm);
      await loadUsers();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to save user.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    window.location.assign("/login");
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Users & Permissions</h1>
          <p className={styles.sub}>
            Create accounts, disable access, reset passwords and control module permissions.
          </p>
        </div>

        <div className={styles.actions}>
          <button
            className={styles.secondary}
            type="button"
            onClick={signOut}
          >
            Sign out
          </button>
          <button className={styles.button} type="button" onClick={startCreate}>
            New user
          </button>
        </div>
      </div>

      {error ? <div className={styles.error}>{error}</div> : null}
      {message ? <div className={styles.success}>{message}</div> : null}

      {mode !== "closed" ? (
        <form className={styles.formPanel} onSubmit={save}>
          <h2 className={styles.formTitle}>
            {mode === "create" ? "Create user" : "Edit user"}
          </h2>

          <div className={styles.grid}>
            <label className={styles.field}>
              Full name
              <input
                className={styles.input}
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                required
              />
            </label>

            <label className={styles.field}>
              Email
              <input
                className={styles.input}
                type="email"
                value={form.email}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    email: event.target.value,
                  }))
                }
                required
              />
            </label>

            <label className={styles.field}>
              {mode === "create" ? "Password" : "New password (optional)"}
              <input
                className={styles.input}
                type="password"
                minLength={10}
                value={form.password}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    password: event.target.value,
                  }))
                }
                required={mode === "create"}
              />
            </label>

            <label className={styles.field}>
              Role
              <select
                className={styles.select}
                value={form.role}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    role: event.target.value as "admin" | "user",
                    permissions:
                      event.target.value === "admin"
                        ? [...allPermissions]
                        : current.permissions,
                  }))
                }
              >
                <option value="user">User</option>
                <option value="admin">Administrator</option>
              </select>
            </label>

            <label className={styles.field}>
              Status
              <select
                className={styles.select}
                value={form.status}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    status: event.target.value as "active" | "disabled",
                  }))
                }
              >
                <option value="active">Active</option>
                <option value="disabled">Disabled</option>
              </select>
            </label>
          </div>

          <div className={styles.permissions}>
            {form.role === "admin" ? (
              <div className={styles.success}>
                Administrators automatically receive every permission.
              </div>
            ) : (
              groupedPermissions
                .filter(([group]) => group !== "Administration")
                .map(([group, items]) => (
                <section className={styles.group} key={group}>
                  <h3 className={styles.groupTitle}>{group}</h3>
                  <div className={styles.checks}>
                    {items.map((item) => (
                      <label className={styles.check} key={item.key}>
                        <input
                          type="checkbox"
                          checked={form.permissions.includes(item.key)}
                          onChange={() => togglePermission(item.key)}
                        />
                        {item.label}
                      </label>
                    ))}
                  </div>
                </section>
              ))
            )}
          </div>

          <div className={styles.formActions}>
            <button
              className={styles.secondary}
              type="button"
              onClick={() => setMode("closed")}
              disabled={busy}
            >
              Cancel
            </button>
            <button className={styles.button} type="submit" disabled={busy}>
              {busy ? "Saving..." : "Save user"}
            </button>
          </div>
        </form>
      ) : null}

      <section className={styles.panel}>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Status</th>
                <th>Permissions</th>
                <th>Last login</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6}>Loading users...</td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={6}>No users found.</td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <div className={styles.name}>
                        {user.name}
                        {user.id === currentUserId ? " (You)" : ""}
                      </div>
                      <div className={styles.muted}>{user.email}</div>
                    </td>
                    <td>
                      <span className={styles.badge}>
                        {user.role === "admin" ? "Administrator" : "User"}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`${styles.badge} ${
                          user.status === "active"
                            ? styles.active
                            : styles.disabled
                        }`}
                      >
                        {user.status === "active" ? "Active" : "Disabled"}
                      </span>
                    </td>
                    <td>
                      {user.role === "admin"
                        ? "All"
                        : `${user.permissions.length} assigned`}
                    </td>
                    <td>
                      {user.lastLoginAt
                        ? new Date(user.lastLoginAt).toLocaleString()
                        : "Never"}
                    </td>
                    <td>
                      <button
                        className={styles.secondary}
                        type="button"
                        onClick={() => startEdit(user)}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}