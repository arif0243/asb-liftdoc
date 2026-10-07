"use client";

import {
  Archive,
  Building2,
  Edit3,
  Mail,
  MapPin,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Tag,
  UserRound,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Client, Project } from "@/types/workspace";

type ClientForm = {
  id?: string;
  name: string;
  companyName: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  tags: string;
  status: "active" | "archived";
};

const emptyForm: ClientForm = {
  name: "",
  companyName: "",
  contactPerson: "",
  phone: "",
  email: "",
  address: "",
  notes: "",
  tags: "",
  status: "active",
};

export function ClientsWorkspace() {
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "archived">("active");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<ClientForm>(emptyForm);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);

    try {
      const [clientResponse, projectResponse] = await Promise.all([
        fetch("/api/clients", { cache: "no-store" }),
        fetch("/api/projects", { cache: "no-store" }),
      ]);

      const clientData = await clientResponse.json();
      const projectData = await projectResponse.json();

      setClients(clientData.clients ?? []);
      setProjects(projectData.projects ?? []);

      const url = new URL(window.location.href);
      const requested = url.searchParams.get("selected");

      if (requested) {
        setSelectedId(requested);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    return clients.filter((client) => {
      if (statusFilter !== "all" && client.status !== statusFilter) {
        return false;
      }

      if (!q) {
        return true;
      }

      return [
        client.name,
        client.companyName,
        client.contactPerson,
        client.phone,
        client.email,
        client.address,
        ...client.tags,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [clients, query, statusFilter]);

  const selected = clients.find((client) => client.id === selectedId) ?? null;
  const selectedProjects = projects.filter(
    (project) => project.clientId === selected?.id,
  );

  const openCreate = () => {
    setForm(emptyForm);
    setError("");
    setModalOpen(true);
  };

  const openEdit = (client: Client) => {
    setForm({
      id: client.id,
      name: client.name,
      companyName: client.companyName,
      contactPerson: client.contactPerson,
      phone: client.phone,
      email: client.email,
      address: client.address,
      notes: client.notes,
      tags: client.tags.join(", "),
      status: client.status,
    });
    setError("");
    setModalOpen(true);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      const response = await fetch("/api/clients", {
        method: form.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          tags: form.tags
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to save client.");
      }

      setModalOpen(false);
      await load();
      setSelectedId(data.client.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save client.");
    } finally {
      setSaving(false);
    }
  };

  const toggleArchive = async (client: Client) => {
    await fetch("/api/clients", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: client.id,
        status: client.status === "archived" ? "active" : "archived",
      }),
    });

    await load();
  };

  return (
    <div className="page-stack">
      <div className="page-heading-row">
        <div>
          <div className="eyebrow">Workspace organization</div>
          <h1>Clients</h1>
          <p>
            Keep client contacts, projects and future quotations or invoices
            grouped under one record.
          </p>
        </div>

        <button className="button button-primary" type="button" onClick={openCreate}>
          <Plus size={17} />
          Add client
        </button>
      </div>

      <section className="workspace-layout">
        <div className="workspace-list-panel">
          <div className="workspace-toolbar">
            <div className="workspace-search">
              <Search size={16} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search clients..."
              />
            </div>

            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as "all" | "active" | "archived")
              }
            >
              <option value="active">Active</option>
              <option value="archived">Archived</option>
              <option value="all">All clients</option>
            </select>

            <button type="button" className="icon-button" onClick={() => void load()}>
              <RefreshCw size={16} />
            </button>
          </div>

          <div className="record-table">
            <div className="record-table-head client-grid">
              <span>Client</span>
              <span>Contact</span>
              <span>Projects</span>
              <span>Status</span>
            </div>

            {loading ? (
              <div className="record-empty">Loading clients...</div>
            ) : filtered.length === 0 ? (
              <div className="record-empty">
                No matching clients. Use “Add client” to create the first one.
              </div>
            ) : (
              filtered.map((client) => {
                const projectCount = projects.filter(
                  (project) => project.clientId === client.id,
                ).length;

                return (
                  <button
                    type="button"
                    key={client.id}
                    className={
                      selectedId === client.id
                        ? "record-row client-grid record-row-selected"
                        : "record-row client-grid"
                    }
                    onClick={() => setSelectedId(client.id)}
                  >
                    <span className="record-primary">
                      <strong>{client.name}</strong>
                      <small>{client.companyName || client.address || "Client record"}</small>
                    </span>
                    <span className="record-secondary">
                      {client.contactPerson || client.phone || client.email || "—"}
                    </span>
                    <span className="record-secondary">{projectCount}</span>
                    <span>
                      <span
                        className={
                          client.status === "archived"
                            ? "status-pill status-muted"
                            : "status-pill status-active"
                        }
                      >
                        {client.status}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <aside className="record-detail-panel">
          {selected ? (
            <>
              <div className="detail-heading">
                <div>
                  <span className="panel-kicker">Client profile</span>
                  <h2>{selected.name}</h2>
                  <p>{selected.companyName || "No company name added"}</p>
                </div>

                <button
                  type="button"
                  className="icon-button"
                  onClick={() => openEdit(selected)}
                  aria-label="Edit client"
                >
                  <Edit3 size={16} />
                </button>
              </div>

              <div className="detail-info-list">
                <div>
                  <UserRound size={16} />
                  <span>
                    <small>Contact person</small>
                    <strong>{selected.contactPerson || "Not added"}</strong>
                  </span>
                </div>
                <div>
                  <Phone size={16} />
                  <span>
                    <small>Phone</small>
                    <strong>{selected.phone || "Not added"}</strong>
                  </span>
                </div>
                <div>
                  <Mail size={16} />
                  <span>
                    <small>Email</small>
                    <strong>{selected.email || "Not added"}</strong>
                  </span>
                </div>
                <div>
                  <MapPin size={16} />
                  <span>
                    <small>Address</small>
                    <strong>{selected.address || "Not added"}</strong>
                  </span>
                </div>
              </div>

              {selected.tags.length > 0 && (
                <div className="detail-tags">
                  <div className="detail-section-title">
                    <Tag size={15} />
                    Tags
                  </div>
                  <div className="tag-row">
                    {selected.tags.map((tag) => (
                      <span key={tag} className="tag-chip">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="detail-section">
                <div className="detail-section-heading">
                  <strong>Projects</strong>
                  <span>{selectedProjects.length}</span>
                </div>

                {selectedProjects.length === 0 ? (
                  <p className="detail-muted">No project added for this client yet.</p>
                ) : (
                  <div className="mini-record-list">
                    {selectedProjects.map((project) => (
                      <div key={project.id}>
                        <span className="mini-record-icon">
                          <Building2 size={15} />
                        </span>
                        <span>
                          <strong>{project.name}</strong>
                          <small>{project.code || project.location || project.status}</small>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {selected.notes && (
                <div className="detail-section">
                  <div className="detail-section-heading">
                    <strong>Notes</strong>
                  </div>
                  <p className="detail-notes">{selected.notes}</p>
                </div>
              )}

              <button
                type="button"
                className="button button-secondary detail-archive"
                onClick={() => void toggleArchive(selected)}
              >
                <Archive size={16} />
                {selected.status === "archived" ? "Restore client" : "Archive client"}
              </button>
            </>
          ) : (
            <div className="detail-empty">
              <Building2 size={28} />
              <strong>Select a client</strong>
              <p>Client details and project grouping will appear here.</p>
            </div>
          )}
        </aside>
      </section>

      {modalOpen && (
        <div className="modal-backdrop" onMouseDown={() => setModalOpen(false)}>
          <div className="modal-card" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-heading">
              <div>
                <span className="panel-kicker">{form.id ? "Edit client" : "New client"}</span>
                <h2>{form.id ? form.name || "Client" : "Add client"}</h2>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setModalOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <form className="workspace-form" onSubmit={submit}>
              <div className="form-grid">
                <label>
                  <span>Client name *</span>
                  <input
                    required
                    value={form.name}
                    onChange={(event) => setForm({ ...form, name: event.target.value })}
                  />
                </label>

                <label>
                  <span>Company / organization</span>
                  <input
                    value={form.companyName}
                    onChange={(event) =>
                      setForm({ ...form, companyName: event.target.value })
                    }
                  />
                </label>

                <label>
                  <span>Contact person</span>
                  <input
                    value={form.contactPerson}
                    onChange={(event) =>
                      setForm({ ...form, contactPerson: event.target.value })
                    }
                  />
                </label>

                <label>
                  <span>Phone</span>
                  <input
                    value={form.phone}
                    onChange={(event) => setForm({ ...form, phone: event.target.value })}
                  />
                </label>

                <label>
                  <span>Email</span>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(event) => setForm({ ...form, email: event.target.value })}
                  />
                </label>

                <label>
                  <span>Tags</span>
                  <input
                    value={form.tags}
                    onChange={(event) => setForm({ ...form, tags: event.target.value })}
                    placeholder="e.g. Dhaka, Modernization"
                  />
                </label>

                <label className="form-span-2">
                  <span>Address</span>
                  <textarea
                    rows={2}
                    value={form.address}
                    onChange={(event) =>
                      setForm({ ...form, address: event.target.value })
                    }
                  />
                </label>

                <label className="form-span-2">
                  <span>Notes</span>
                  <textarea
                    rows={3}
                    value={form.notes}
                    onChange={(event) =>
                      setForm({ ...form, notes: event.target.value })
                    }
                  />
                </label>
              </div>

              {error && <div className="form-error">{error}</div>}

              <div className="modal-actions">
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="button button-primary" disabled={saving}>
                  {saving ? "Saving..." : form.id ? "Save changes" : "Create client"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
