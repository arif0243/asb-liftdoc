"use client";

import {
  ArrowLeft,
  Eye,
  Save,
  Upload,
} from "lucide-react";
import {
  ChangeEvent,
  useEffect,
  useState,
} from "react";
import type {
  QuotationHeaderFooterBlock,
  QuotationLayout,
} from "@/types/quotation-layout";
import styles from "./quotation-header-footer-workspace.module.css";

function defaultBlock(
  text = "",
  heightMm = 18,
): QuotationHeaderFooterBlock {
  return {
    mode: "text",
    text,
    imageData: "",
    align: "center",
    heightMm,
  };
}

function fallbackLayout(
  quotationId: string,
): QuotationLayout {
  return {
    quotationId,
    header: defaultBlock("ASB Lift", 18),
    footer: defaultBlock("", 14),
    firstPageDifferent: false,
    firstPageHeader: defaultBlock("", 18),
    firstPageFooter: defaultBlock("", 14),
    showQuotationMeta: true,
    showPageNumber: true,
    updatedAt: "",
  };
}

type EditorProps = {
  title: string;
  block: QuotationHeaderFooterBlock;
  onChange: (
    block: QuotationHeaderFooterBlock,
  ) => void;
};

function BlockEditor({
  title,
  block,
  onChange,
}: EditorProps) {
  const upload = (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = () => {
      onChange({
        ...block,
        mode: "image",
        imageData:
          typeof reader.result === "string"
            ? reader.result
            : "",
      });
    };

    reader.readAsDataURL(file);
  };

  return (
    <section className={styles.block}>
      <div className={styles.blockHeading}>
        <strong>{title}</strong>
        <span>{block.heightMm} mm</span>
      </div>

      <div className={styles.grid3}>
        <label>
          <span>Mode</span>
          <select
            value={block.mode}
            onChange={(event) =>
              onChange({
                ...block,
                mode: event.target.value as QuotationHeaderFooterBlock["mode"],
              })
            }
          >
            <option value="none">None</option>
            <option value="text">Text</option>
            <option value="image">Image</option>
          </select>
        </label>

        <label>
          <span>Align</span>
          <select
            value={block.align}
            onChange={(event) =>
              onChange({
                ...block,
                align: event.target.value as QuotationHeaderFooterBlock["align"],
              })
            }
          >
            <option value="left">Left</option>
            <option value="center">Center</option>
            <option value="right">Right</option>
          </select>
        </label>

        <label>
          <span>Height</span>
          <input
            type="number"
            min="5"
            max="80"
            value={block.heightMm}
            onChange={(event) =>
              onChange({
                ...block,
                heightMm: Number(event.target.value),
              })
            }
          />
        </label>
      </div>

      {block.mode === "text" && (
        <label>
          <span>Text</span>
          <textarea
            rows={3}
            value={block.text}
            onChange={(event) =>
              onChange({
                ...block,
                text: event.target.value,
              })
            }
          />
        </label>
      )}

      {block.mode === "image" && (
        <div className={styles.imageArea}>
          <label className={styles.upload}>
            <Upload size={14} />
            Upload image
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={upload}
            />
          </label>

          {block.imageData && (
            <img
              src={block.imageData}
              alt={`${title} preview`}
            />
          )}
        </div>
      )}
    </section>
  );
}

export function QuotationHeaderFooterWorkspace() {
  const [quotationId, setQuotationId] =
    useState("");
  const [layout, setLayout] =
    useState<QuotationLayout>(() =>
      fallbackLayout(""),
    );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setQuotationId(
      new URLSearchParams(window.location.search).get("id") ??
        "",
    );
  }, []);

  useEffect(() => {
    if (!quotationId) return;

    void (async () => {
      const response = await fetch(
        `/api/quotation-layouts?quotationId=${encodeURIComponent(
          quotationId,
        )}`,
        {
          cache: "no-store",
        },
      );

      const payload = await response.json();

      setLayout(
        response.ok && payload.layout
          ? payload.layout
          : fallbackLayout(quotationId),
      );
    })();
  }, [quotationId]);

  const save = async () => {
    if (!quotationId) return;

    setSaving(true);

    try {
      const response = await fetch(
        "/api/quotation-layouts",
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ...layout,
            quotationId,
          }),
        },
      );

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          payload.error ||
            "Unable to save header/footer.",
        );
      }

      setLayout(payload.layout);
    } catch (error) {
      window.alert(
        error instanceof Error
          ? error.message
          : "Unable to save header/footer.",
      );
    } finally {
      setSaving(false);
    }
  };

  if (!quotationId) {
    return (
      <div className={styles.empty}>
        Select a quotation first.
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <div>
          <a href="/quotations">
            <ArrowLeft size={14} />
            Quotations
          </a>

          <div>
            <span>Quotation setup</span>
            <h1>Header & Footer</h1>
          </div>
        </div>

        <div className={styles.actions}>
          <a
            href={`/quotations/preview?id=${encodeURIComponent(
              quotationId,
            )}`}
            target="_blank"
            rel="noreferrer"
          >
            <Eye size={14} />
            Preview
          </a>

          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
          >
            <Save size={14} />
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </header>

      <div className={styles.body}>
        <BlockEditor
          title="Header"
          block={layout.header}
          onChange={(header) =>
            setLayout((current) => ({
              ...current,
              header,
            }))
          }
        />

        <BlockEditor
          title="Footer"
          block={layout.footer}
          onChange={(footer) =>
            setLayout((current) => ({
              ...current,
              footer,
            }))
          }
        />

        <section className={styles.options}>
          <label>
            <input
              type="checkbox"
              checked={layout.firstPageDifferent}
              onChange={(event) =>
                setLayout((current) => ({
                  ...current,
                  firstPageDifferent:
                    event.target.checked,
                }))
              }
            />
            Different first page
          </label>

          <label>
            <input
              type="checkbox"
              checked={layout.showQuotationMeta}
              onChange={(event) =>
                setLayout((current) => ({
                  ...current,
                  showQuotationMeta:
                    event.target.checked,
                }))
              }
            />
            Show quotation meta
          </label>

          <label>
            <input
              type="checkbox"
              checked={layout.showPageNumber}
              onChange={(event) =>
                setLayout((current) => ({
                  ...current,
                  showPageNumber:
                    event.target.checked,
                }))
              }
            />
            Show page number
          </label>
        </section>

        {layout.firstPageDifferent && (
          <>
            <BlockEditor
              title="First Page Header"
              block={layout.firstPageHeader}
              onChange={(firstPageHeader) =>
                setLayout((current) => ({
                  ...current,
                  firstPageHeader,
                }))
              }
            />

            <BlockEditor
              title="First Page Footer"
              block={layout.firstPageFooter}
              onChange={(firstPageFooter) =>
                setLayout((current) => ({
                  ...current,
                  firstPageFooter,
                }))
              }
            />
          </>
        )}
      </div>
    </div>
  );
}