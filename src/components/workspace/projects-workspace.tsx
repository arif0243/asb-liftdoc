"use client";

import {
  Edit3,
  FolderKanban,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  Tag,
  UserRound,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Client, Project, ProjectStatus } from "@/types/workspace";

type ProjectForm = {
  id?: string;
  clientId: string;
  name: string;
  code: string;
  location: string;
  description: string;
  tags: string;
  status: ProjectStatus;
};

const emptyForm: ProjectForm = {
  clientId: "",
  name: "",
  code: "",
  location: "",
  description: "",
  tags: "",
  status: "active",
};

export function ProjectsWorkspace() {
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [clientFilter, setClientFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<ProjectForm>(emptyForm);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);

    try {
      const response = await fetch("/api/projects", { cache: "no-store" });
      const data = await response.json();

      setClients(data.clients ?? []);
      setProjects(data.projects ?? []);

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

    return projects.filter((project) => {
      if (clientFilter !== "all" && project.clientId !== clientFilter) {
        return false;
      }

      if (statusFilter !== "all" && project.status !== statusFilter) {
        return false;
      }

      if (!q) {
        return true;
      }

      const client = clients.find((item) => item.id === project.clientId);

      return [
        project.name,
        project.code,
        project.location,
        project.description,
        project.status,
        client?.name ?? "",
        ...project.tags,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [projects, clients, clientFilter, statusFilter, query]);

  const selected = projects.find((project) => project.id === selectedId) ?? null;
  const selectedClient = clients.find((client) => client.id === selected?.clientId);

  const openCreate = () => {
    setForm({
      ...emptyForm,
      clientId: clients[0]?.id ?? "",
    });
    setError("");
    setModalOpen(true);
  };

  const openEdit = (project: Project) => {
    setForm({
      id: project.id,
      clientId: project.clientId,
      name: project.name,
      code: project.code,
      location: project.location,
      description: project.description,
      tags: project.tags.join(", "),
      status: project.status,
    });
    setError("");
    setModalOpen(true);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      const response = await fetch("/api/projects", {
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
        throw new Error(data.error || "Unable to save project.");
      }

      setModalOpen(false);
      await load();
      setSelectedId(data.project.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save project.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-stack">
      <div className="page-heading-row">
        <div>
          <div className="eyebrow">Client-wise organization</div>
          <h1>Projects</h1>
          <p>
            Group quotations, revisions, invoices and future project documents
            under the correct client and project.
          </p>
        </div>

        <button
          className="button button-primary"
          type="button"
          onClick={openCreate}
          disabled={clients.length === 0}
          title={clients.length === 0 ? "Add a client first" : undefined}
        >
          <Plus size={17} />
          Add project
        </button>
      </div>

      {clients.length === 0 && !loading && (
        <div className="info-banner">
          Add at least one client before creating a project.
        </div>
      )}

      <section className="workspace-layout">
        <div className="workspace-list-panel">
          <div className="workspace-toolbar workspace-toolbar-projects">
            <div className="workspace-search">
              <Search size={16} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search projects..."
              />
            </div>

            <select
              value={clientFilter}
              onChange={(event) => setClientFilter(event.target.value)}
            >
              <option value="all">All clients</option>
              {clients.map((client) => (
                <option value={client.id} key={client.id}>
                  {client.name}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">All status</option>
              <option value="active">Active</option>
              <option value="on_hold">On hold</option>
              <option value="completed">Completed</option>
              <option value="archived">Archived</option>
            </select>

            <button type="button" className="icon-button" onClick={() => void load()}>
              <RefreshCw size={16} />
            </button>
          </div>

          <div className="record-table">
            <div className="record-table-head project-grid">
              <span>Project</span>
              <span>Client</span>
              <span>Location</span>
              <span>Status</span>
            </div>

            {loading ? (
              <div className="record-empty">Loading projects...</div>
            ) : filtered.length === 0 ? (
              <div className="record-empty">
                No matching projects. Create a project after adding a client.
              </div>
            ) : (
              filtered.map((project) => {
                const client = clients.find(
                  (item) => item.id === project.clientId,
                );

                return (
                  <button
                    type="button"
                    key={project.id}
                    className={
                      selectedId === project.id
                        ? "record-row project-grid record-row-selected"
                        : "record-row project-grid"
                    }
                    onClick={() => setSelectedId(project.id)}
                  >
                    <span className="record-primary">
                      <strong>{project.name}</strong>
                      <small>{project.code || "No project code"}</small>
                    </span>
                    <span className="record-secondary">{client?.name || "—"}</span>
                    <span className="record-secondary">{project.location || "—"}</span>
                    <span>
                      <span
                        className={`status-pill ${
                          project.status === "active"
                            ? "status-active"
                            : project.status === "completed"
                              ? "status-completed"
                              : "status-muted"
                        }`}
                      >
                        {project.status.replace("_", " ")}
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
                  <span className="panel-kicker">Project profile</span>
                  <h2>{selected.name}</h2>
                  <p>{selected.code || "No project code"}</p>
                </div>

                <button
                  type="button"
                  className="icon-button"
                  onClick={() => openEdit(selected)}
                >
                  <Edit3 size={16} />
                </button>
              </div>

              <div className="detail-info-list">
                <div>
                  <UserRound size={16} />
                  <span>
                    <small>Client</small>
                    <strong>{selectedClient?.name || "Unknown client"}</strong>
                  </span>
                </div>

                <div>
                  <MapPin size={16} />
                  <span>
                    <small>Location</small>
                    <strong>{selected.location || "Not added"}</strong>
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
                  <strong>Description</strong>
                </div>
                <p className="detail-notes">
                  {selected.description || "No project description added."}
                </p>
              </div>

              <div className="project-document-summary">
                <div>
                  <strong>0</strong>
                  <span>Quotations</span>
                </div>
                <div>
                  <strong>0</strong>
                  <span>Invoices</span>
                </div>
                <div>
                  <strong>0</strong>
                  <span>Documents</span>
                </div>
              </div>
            </>
          ) : (
            <div className="detail-empty">
              <FolderKanban size={28} />
              <strong>Select a project</strong>
              <p>Project details and document grouping will appear here.</p>
            </div>
          )}
        </aside>
      </section>

      {modalOpen && (
        <div className="modal-backdrop" onMouseDown={() => setModalOpen(false)}>
          <div className="modal-card" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-heading">
              <div>
                <span className="panel-kicker">{form.id ? "Edit project" : "New project"}</span>
                <h2>{form.id ? form.name || "Project" : "Add project"}</h2>
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
                  <span>Client *</span>
                  <select
                    required
                    value={form.clientId}
                    onChange={(event) =>
                      setForm({ ...form, clientId: event.target.value })
                    }
                  >
                    <option value="">Select client</option>
                    {clients
                      .filter((client) => client.status === "active")
                      .map((client) => (
                        <option value={client.id} key={client.id}>
                          {client.name}
                        </option>
                      ))}
                  </select>
                </label>

                <label>
                  <span>Project name *</span>
                  <input
                    required
                    value={form.name}
                    onChange={(event) => setForm({ ...form, name: event.target.value })}
                  />
                </label>

                <label>
                  <span>Project code / reference</span>
                  <input
                    value={form.code}
                    onChange={(event) => setForm({ ...form, code: event.target.value })}
                  />
                </label>

                <label>
                  <span>Status</span>
                  <select
                    value={form.status}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        status: event.target.value as ProjectStatus,
                      })
                    }
                  >
                    <option value="active">Active</option>
                    <option value="on_hold">On hold</option>
                    <option value="completed">Completed</option>
                    <option value="archived">Archived</option>
                  </select>
                </label>

                <label>
                  <span>Location</span>
                  <input
                    value={form.location}
                    onChange={(event) =>
                      setForm({ ...form, location: event.target.value })
                    }
                  />
                </label>

                <label>
                  <span>Tags</span>
                  <input
                    value={form.tags}
                    onChange={(event) => setForm({ ...form, tags: event.target.value })}
                    placeholder="e.g. Lift-1, Modernization"
                  />
                </label>

                <label className="form-span-2">
                  <span>Description</span>
                  <textarea
                    rows={4}
                    value={form.description}
                    onChange={(event) =>
                      setForm({ ...form, description: event.target.value })
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
                  {saving ? "Saving..." : form.id ? "Save changes" : "Create project"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
