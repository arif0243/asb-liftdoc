$ErrorActionPreference = "Stop"

$ProjectRoot = "E:\ASB LiftDoc\asb-liftdoc"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " ASB LiftDoc - M5 Advanced Layout" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Set-Location -LiteralPath $ProjectRoot

if (-not (Test-Path ".git")) {
    throw "Git repository not found."
}

$Dirty = git status --porcelain
$Unexpected = @(
    $Dirty | Where-Object {
        $_ -notmatch '^\?\? Scripts[/\\]' -and
        $_ -notmatch '^\?\? Backups[/\\]'
    }
)

if ($Unexpected.Count -gt 0) {
    Write-Host "Unexpected uncommitted changes:" -ForegroundColor Yellow
    $Unexpected | ForEach-Object { Write-Host $_ }
    throw "M5 stopped for safety."
}

git tag -f checkpoint-m4-document-builder HEAD | Out-Null

$Port = 3010
$PortFile = Join-Path $ProjectRoot ".liftdoc-port"
if (Test-Path $PortFile) {
    $Port = [int](Get-Content $PortFile -Raw).Trim()
}

$Running = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($Running) {
    $Running.OwningProcess | Sort-Object -Unique | ForEach-Object {
        Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 2
}

New-Item -ItemType Directory -Path "Backups\M5_Before_Advanced_Layout" -Force | Out-Null

$BackupFiles = @(
    "src\types\document-builder.ts",
    "src\components\workspace\template-builder-workspace.tsx",
    "src\app\globals.css"
)

foreach ($File in $BackupFiles) {
    if (Test-Path $File) {
        $Safe = $File -replace '[\\/:*?"<>|]', '_'
        Copy-Item $File "Backups\M5_Before_Advanced_Layout\$Safe.bak" -Force
    }
}

Write-Host "[OK] M4 backup created" -ForegroundColor Green

@'
export type PaperSize =
  | "A3"
  | "A4"
  | "A5"
  | "Letter"
  | "Legal"
  | "Custom";

export type PageOrientation = "portrait" | "landscape";
export type HeaderFooterMode = "none" | "manual" | "image";

export type DocumentBlockType =
  | "heading"
  | "text"
  | "field"
  | "divider"
  | "quotation_table"
  | "custom_table"
  | "totals";

export type BlockFlowSettings = {
  pageBreakBefore: boolean;
  keepTogether: boolean;
  allowSplit: boolean;
};

export type QuotationTableSettings = {
  repeatHeader: boolean;
  autoPaginate: boolean;
  rowHeightMm: number;
};

export type AdvancedTableCell = {
  id: string;
  content: string;
  rowSpan: number;
  colSpan: number;
  hidden: boolean;
  align: "left" | "center" | "right";
};

export type AdvancedTableRow = {
  id: string;
  heightMm: number;
  cells: AdvancedTableCell[];
};

export type AdvancedTableConfig = {
  columnWidths: number[];
  rows: AdvancedTableRow[];
  headerRows: number;
  repeatHeader: boolean;
  autoPaginate: boolean;
  borderWidth: number;
  cellPaddingMm: number;
  rowsPerPage: number;
};

export type DocumentBlock = {
  id: string;
  type: DocumentBlockType;
  content: string;
  align: "left" | "center" | "right";
  flow?: BlockFlowSettings;
  quotationTable?: QuotationTableSettings;
  table?: AdvancedTableConfig;
};

export type PageSettings = {
  paperSize: PaperSize;
  orientation: PageOrientation;
  customWidthMm: number;
  customHeightMm: number;

  marginTopMm: number;
  marginBottomMm: number;
  marginLeftMm: number;
  marginRightMm: number;

  headerMode: HeaderFooterMode;
  headerText: string;
  headerImageData: string;
  headerHeightMm: number;

  footerMode: HeaderFooterMode;
  footerText: string;
  footerImageData: string;
  footerHeightMm: number;
};

export type TemplatePage = {
  id: string;
  name: string;
  settings: PageSettings;
  blocks: DocumentBlock[];
};

export type DocumentTemplate = {
  id: string;
  name: string;
  description: string;
  pages: TemplatePage[];
  createdAt: string;
  updatedAt: string;
};

export type ReusableSection = {
  id: string;
  name: string;
  page: TemplatePage;
  createdAt: string;
};

export type TemplateStoreData = {
  templates: DocumentTemplate[];
  sections: ReusableSection[];
};
'@ | Set-Content "src\types\document-builder.ts" -Encoding UTF8

@'
"use client";

import { useMemo, useState } from "react";
import type {
  AdvancedTableCell,
  AdvancedTableConfig,
  AdvancedTableRow,
} from "@/types/document-builder";

type Props = {
  value?: AdvancedTableConfig;
  onChange: (value: AdvancedTableConfig) => void;
};

function uid() {
  return crypto.randomUUID();
}

export function createDefaultAdvancedTable(): AdvancedTableConfig {
  const columns = 4;
  const rows: AdvancedTableRow[] = Array.from({ length: 5 }, (_, rowIndex) => ({
    id: uid(),
    heightMm: rowIndex === 0 ? 9 : 8,
    cells: Array.from({ length: columns }, (_, columnIndex) => ({
      id: uid(),
      content:
        rowIndex === 0
          ? ["SL", "Description", "Qty", "Amount"][columnIndex] ?? ""
          : "",
      rowSpan: 1,
      colSpan: 1,
      hidden: false,
      align: rowIndex === 0 ? "center" : "left",
    })),
  }));

  return {
    columnWidths: [1, 3, 1, 1.5],
    rows,
    headerRows: 1,
    repeatHeader: true,
    autoPaginate: true,
    borderWidth: 1,
    cellPaddingMm: 1.5,
    rowsPerPage: 18,
  };
}

function normalize(value?: AdvancedTableConfig) {
  return value ?? createDefaultAdvancedTable();
}

function resetMerges(table: AdvancedTableConfig): AdvancedTableConfig {
  return {
    ...table,
    rows: table.rows.map((row) => ({
      ...row,
      cells: row.cells.map((cell) => ({
        ...cell,
        rowSpan: 1,
        colSpan: 1,
        hidden: false,
      })),
    })),
  };
}

function position(
  table: AdvancedTableConfig,
  cellId: string,
): { row: number; col: number } | null {
  for (let row = 0; row < table.rows.length; row += 1) {
    const col = table.rows[row].cells.findIndex((cell) => cell.id === cellId);
    if (col >= 0) return { row, col };
  }
  return null;
}

export function AdvancedTableEditor({ value, onChange }: Props) {
  const table = useMemo(() => normalize(value), [value]);
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState("");

  const setCell = (
    rowIndex: number,
    colIndex: number,
    patch: Partial<AdvancedTableCell>,
  ) => {
    onChange({
      ...table,
      rows: table.rows.map((row, currentRow) =>
        currentRow !== rowIndex
          ? row
          : {
              ...row,
              cells: row.cells.map((cell, currentCol) =>
                currentCol === colIndex ? { ...cell, ...patch } : cell,
              ),
            },
      ),
    });
  };

  const addRow = () => {
    const columns = table.columnWidths.length;
    onChange({
      ...table,
      rows: [
        ...table.rows,
        {
          id: uid(),
          heightMm: 8,
          cells: Array.from({ length: columns }, () => ({
            id: uid(),
            content: "",
            rowSpan: 1,
            colSpan: 1,
            hidden: false,
            align: "left" as const,
          })),
        },
      ],
    });
    setSelected([]);
  };

  const removeRow = () => {
    if (table.rows.length <= 1) return;
    const clean = resetMerges(table);
    onChange({
      ...clean,
      rows: clean.rows.slice(0, -1),
      headerRows: Math.min(clean.headerRows, clean.rows.length - 1),
    });
    setSelected([]);
  };

  const addColumn = () => {
    const clean = resetMerges(table);
    onChange({
      ...clean,
      columnWidths: [...clean.columnWidths, 1],
      rows: clean.rows.map((row) => ({
        ...row,
        cells: [
          ...row.cells,
          {
            id: uid(),
            content: "",
            rowSpan: 1,
            colSpan: 1,
            hidden: false,
            align: "left" as const,
          },
        ],
      })),
    });
    setSelected([]);
  };

  const removeColumn = () => {
    if (table.columnWidths.length <= 1) return;
    const clean = resetMerges(table);
    onChange({
      ...clean,
      columnWidths: clean.columnWidths.slice(0, -1),
      rows: clean.rows.map((row) => ({
        ...row,
        cells: row.cells.slice(0, -1),
      })),
    });
    setSelected([]);
  };

  const merge = () => {
    setMessage("");
    if (selected.length < 2) {
      setMessage("Select at least 2 cells.");
      return;
    }

    const positions = selected
      .map((cellId) => position(table, cellId))
      .filter((item): item is { row: number; col: number } => Boolean(item));

    const minRow = Math.min(...positions.map((item) => item.row));
    const maxRow = Math.max(...positions.map((item) => item.row));
    const minCol = Math.min(...positions.map((item) => item.col));
    const maxCol = Math.max(...positions.map((item) => item.col));

    const selectedSet = new Set(selected);

    for (let row = minRow; row <= maxRow; row += 1) {
      for (let col = minCol; col <= maxCol; col += 1) {
        const cell = table.rows[row].cells[col];
        if (
          !selectedSet.has(cell.id) ||
          cell.hidden ||
          cell.rowSpan !== 1 ||
          cell.colSpan !== 1
        ) {
          setMessage("Select a complete rectangular area of unmerged cells.");
          return;
        }
      }
    }

    const rows = table.rows.map((row) => ({
      ...row,
      cells: row.cells.map((cell) => ({ ...cell })),
    }));

    rows[minRow].cells[minCol].rowSpan = maxRow - minRow + 1;
    rows[minRow].cells[minCol].colSpan = maxCol - minCol + 1;

    for (let row = minRow; row <= maxRow; row += 1) {
      for (let col = minCol; col <= maxCol; col += 1) {
        if (row === minRow && col === minCol) continue;
        rows[row].cells[col].hidden = true;
      }
    }

    onChange({ ...table, rows });
    setSelected([]);
    setMessage("Cells merged.");
  };

  const split = () => {
    if (selected.length !== 1) {
      setMessage("Select one merged cell.");
      return;
    }

    const pos = position(table, selected[0]);
    if (!pos) return;

    const anchor = table.rows[pos.row].cells[pos.col];

    if (anchor.rowSpan === 1 && anchor.colSpan === 1) {
      setMessage("Selected cell is not merged.");
      return;
    }

    const rows = table.rows.map((row) => ({
      ...row,
      cells: row.cells.map((cell) => ({ ...cell })),
    }));

    for (let row = pos.row; row < pos.row + anchor.rowSpan; row += 1) {
      for (let col = pos.col; col < pos.col + anchor.colSpan; col += 1) {
        if (!rows[row]?.cells[col]) continue;
        rows[row].cells[col].hidden = false;
        rows[row].cells[col].rowSpan = 1;
        rows[row].cells[col].colSpan = 1;
      }
    }

    onChange({ ...table, rows });
    setSelected([]);
    setMessage("Cell split.");
  };

  return (
    <div className="advanced-table-editor">
      <div className="advanced-table-toolbar">
        <button type="button" onClick={addRow}>+ Row</button>
        <button type="button" onClick={removeRow}>- Row</button>
        <button type="button" onClick={addColumn}>+ Column</button>
        <button type="button" onClick={removeColumn}>- Column</button>
        <button type="button" onClick={merge}>Merge</button>
        <button type="button" onClick={split}>Split</button>
      </div>

      {message && <div className="advanced-table-message">{message}</div>}

      <div className="advanced-table-scroll">
        <table className="advanced-table-edit-table">
          <tbody>
            {table.rows.map((row, rowIndex) => (
              <tr key={row.id} style={{ height: `${Math.max(28, row.heightMm * 3)}px` }}>
                {row.cells.map((cell, colIndex) => {
                  if (cell.hidden) return null;
                  const isSelected = selected.includes(cell.id);

                  return (
                    <td
                      key={cell.id}
                      rowSpan={cell.rowSpan}
                      colSpan={cell.colSpan}
                      className={isSelected ? "advanced-cell-selected" : ""}
                    >
                      <button
                        type="button"
                        className="advanced-cell-selector"
                        onClick={() =>
                          setSelected((current) =>
                            current.includes(cell.id)
                              ? current.filter((id) => id !== cell.id)
                              : [...current, cell.id],
                          )
                        }
                      >
                        {isSelected ? "Selected" : "Select"}
                      </button>

                      <textarea
                        rows={2}
                        value={cell.content}
                        onChange={(event) =>
                          setCell(rowIndex, colIndex, {
                            content: event.target.value,
                          })
                        }
                      />

                      <select
                        value={cell.align}
                        onChange={(event) =>
                          setCell(rowIndex, colIndex, {
                            align: event.target.value as
                              | "left"
                              | "center"
                              | "right",
                          })
                        }
                      >
                        <option value="left">Left</option>
                        <option value="center">Center</option>
                        <option value="right">Right</option>
                      </select>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="advanced-table-settings-grid">
        <label>
          <span>Header rows</span>
          <input
            type="number"
            min="0"
            max={table.rows.length}
            value={table.headerRows}
            onChange={(event) =>
              onChange({
                ...table,
                headerRows: Math.max(
                  0,
                  Math.min(table.rows.length, Number(event.target.value) || 0),
                ),
              })
            }
          />
        </label>

        <label>
          <span>Rows per page</span>
          <input
            type="number"
            min="2"
            value={table.rowsPerPage}
            onChange={(event) =>
              onChange({
                ...table,
                rowsPerPage: Math.max(2, Number(event.target.value) || 18),
              })
            }
          />
        </label>

        <label>
          <span>Cell padding (mm)</span>
          <input
            type="number"
            min="0"
            step="0.5"
            value={table.cellPaddingMm}
            onChange={(event) =>
              onChange({
                ...table,
                cellPaddingMm: Math.max(0, Number(event.target.value) || 0),
              })
            }
          />
        </label>

        <label>
          <span>Border width</span>
          <input
            type="number"
            min="0"
            step="0.5"
            value={table.borderWidth}
            onChange={(event) =>
              onChange({
                ...table,
                borderWidth: Math.max(0, Number(event.target.value) || 0),
              })
            }
          />
        </label>
      </div>

      <div className="advanced-table-switches">
        <label>
          <input
            type="checkbox"
            checked={table.repeatHeader}
            onChange={(event) =>
              onChange({ ...table, repeatHeader: event.target.checked })
            }
          />
          Repeat header on continuation pages
        </label>

        <label>
          <input
            type="checkbox"
            checked={table.autoPaginate}
            onChange={(event) =>
              onChange({ ...table, autoPaginate: event.target.checked })
            }
          />
          Auto paginate long table
        </label>
      </div>

      <div className="advanced-table-dimensions">
        <strong>Column widths</strong>
        <div>
          {table.columnWidths.map((width, index) => (
            <label key={index}>
              <span>C{index + 1}</span>
              <input
                type="number"
                min="0.25"
                step="0.25"
                value={width}
                onChange={(event) =>
                  onChange({
                    ...table,
                    columnWidths: table.columnWidths.map((current, currentIndex) =>
                      currentIndex === index
                        ? Math.max(0.25, Number(event.target.value) || 1)
                        : current,
                    ),
                  })
                }
              />
            </label>
          ))}
        </div>
      </div>

      <div className="advanced-table-dimensions">
        <strong>Row heights (mm)</strong>
        <div>
          {table.rows.map((row, index) => (
            <label key={row.id}>
              <span>R{index + 1}</span>
              <input
                type="number"
                min="4"
                value={row.heightMm}
                onChange={(event) =>
                  onChange({
                    ...table,
                    rows: table.rows.map((current, currentIndex) =>
                      currentIndex === index
                        ? {
                            ...current,
                            heightMm: Math.max(
                              4,
                              Number(event.target.value) || 8,
                            ),
                          }
                        : current,
                    ),
                  })
                }
              />
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
'@ | Set-Content "src\components\workspace\advanced-table-editor.tsx" -Encoding UTF8

$BuilderPath = "src\components\workspace\template-builder-workspace.tsx"
$Builder = Get-Content $BuilderPath -Raw

function Replace-Required {
    param(
        [string]$Text,
        [string]$Old,
        [string]$New,
        [string]$Label
    )

    if (-not $Text.Contains($Old)) {
        throw "M5 patch target not found: $Label"
    }

    return $Text.Replace($Old, $New)
}

$Builder = Replace-Required $Builder `
'import type {
  DocumentBlock,' `
'import type {
  AdvancedTableConfig,
  DocumentBlock,' `
"import type AdvancedTableConfig"

$Builder = Replace-Required $Builder `
'import type {
  AdvancedTableConfig,
  DocumentBlock,
  DocumentBlockType,
  DocumentTemplate,
  PageSettings,
  PaperSize,
  ReusableSection,
  TemplatePage,
} from "@/types/document-builder";' `
'import type {
  AdvancedTableConfig,
  DocumentBlock,
  DocumentBlockType,
  DocumentTemplate,
  PageSettings,
  PaperSize,
  ReusableSection,
  TemplatePage,
} from "@/types/document-builder";
import {
  AdvancedTableEditor,
  createDefaultAdvancedTable,
} from "@/components/workspace/advanced-table-editor";' `
"advanced table import"

$Builder = Replace-Required $Builder `
'    quotation_table: "",
    totals: "",' `
'    quotation_table: "",
    custom_table: "",
    totals: "",' `
"custom table content map"

$Builder = Replace-Required $Builder `
'    align: "left",
  };' `
'    align: "left",
    flow: {
      pageBreakBefore: false,
      keepTogether: false,
      allowSplit: true,
    },
    quotationTable:
      type === "quotation_table"
        ? { repeatHeader: true, autoPaginate: true, rowHeightMm: 8.5 }
        : undefined,
    table: type === "custom_table" ? createDefaultAdvancedTable() : undefined,
  };' `
"new block defaults"

$InsertPreview = @'
function AdvancedTablePreview({
  table,
  quotation,
  client,
  project,
}: {
  table: AdvancedTableConfig;
  quotation: Quotation | null;
  client: Client | null;
  project: Project | null;
}) {
  const headerRows = table.rows.slice(0, table.headerRows);
  const bodyRows = table.rows.slice(table.headerRows);
  const perPage = Math.max(2, table.rowsPerPage || 18);

  const chunks =
    table.autoPaginate && bodyRows.length > perPage
      ? Array.from(
          { length: Math.ceil(bodyRows.length / perPage) },
          (_, index) => [
            ...(table.repeatHeader ? headerRows : index === 0 ? headerRows : []),
            ...bodyRows.slice(index * perPage, (index + 1) * perPage),
          ],
        )
      : [table.rows];

  const totalWidth = table.columnWidths.reduce(
    (sum, width) => sum + Number(width || 1),
    0,
  );

  return (
    <div className="m5-advanced-preview-pages">
      {chunks.map((rows, pageIndex) => (
        <div className="m5-advanced-preview-page" key={pageIndex}>
          {pageIndex > 0 && (
            <div className="m5-continuation-label">
              Auto continuation page {pageIndex + 1}
            </div>
          )}

          <table
            className="document-advanced-table"
            style={{ borderWidth: `${table.borderWidth}px` }}
          >
            <colgroup>
              {table.columnWidths.map((width, index) => (
                <col
                  key={index}
                  style={{
                    width: `${((Number(width) || 1) / totalWidth) * 100}%`,
                  }}
                />
              ))}
            </colgroup>

            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  style={{ height: `${Math.max(16, row.heightMm * 2.5)}px` }}
                >
                  {row.cells.map((cell) => {
                    if (cell.hidden) return null;

                    return (
                      <td
                        key={cell.id}
                        rowSpan={cell.rowSpan}
                        colSpan={cell.colSpan}
                        style={{
                          textAlign: cell.align,
                          borderWidth: `${table.borderWidth}px`,
                          padding: `${Math.max(1, table.cellPaddingMm * 2)}px`,
                        }}
                      >
                        {resolveTokens(
                          cell.content,
                          quotation,
                          client,
                          project,
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

'@

$Builder = Replace-Required $Builder `
'export function TemplateBuilderWorkspace() {' `
($InsertPreview + 'export function TemplateBuilderWorkspace() {') `
"advanced table preview helper"

$Builder = Replace-Required $Builder `
'                        if (block.type === "quotation_table") {' `
'                        if (block.type === "custom_table") {
                          return (
                            <AdvancedTablePreview
                              key={block.id}
                              table={block.table ?? createDefaultAdvancedTable()}
                              quotation={previewQuotation}
                              client={previewClient}
                              project={previewProject}
                            />
                          );
                        }

                        if (block.type === "quotation_table") {' `
"custom table preview"

$Builder = Replace-Required $Builder `
'                          <option value="quotation_table">
                            Quotation table
                          </option>
                          <option value="totals">Totals</option>' `
'                          <option value="quotation_table">
                            Quotation table
                          </option>
                          <option value="custom_table">
                            Advanced custom table
                          </option>
                          <option value="totals">Totals</option>' `
"custom table select option"

$Builder = Replace-Required $Builder `
'                      {!["divider", "quotation_table", "totals"].includes(
                        block.type,
                      ) && (' `
'                      {block.type === "custom_table" && (
                        <AdvancedTableEditor
                          value={block.table}
                          onChange={(table) =>
                            updateBlock(block.id, { table })
                          }
                        />
                      )}

                      {block.type === "quotation_table" && (
                        <div className="m5-table-options">
                          <label>
                            <input
                              type="checkbox"
                              checked={block.quotationTable?.autoPaginate ?? true}
                              onChange={(event) =>
                                updateBlock(block.id, {
                                  quotationTable: {
                                    repeatHeader:
                                      block.quotationTable?.repeatHeader ?? true,
                                    rowHeightMm:
                                      block.quotationTable?.rowHeightMm ?? 8.5,
                                    autoPaginate: event.target.checked,
                                  },
                                })
                              }
                            />
                            Auto paginate long quotation table
                          </label>

                          <label>
                            <input
                              type="checkbox"
                              checked={block.quotationTable?.repeatHeader ?? true}
                              onChange={(event) =>
                                updateBlock(block.id, {
                                  quotationTable: {
                                    autoPaginate:
                                      block.quotationTable?.autoPaginate ?? true,
                                    rowHeightMm:
                                      block.quotationTable?.rowHeightMm ?? 8.5,
                                    repeatHeader: event.target.checked,
                                  },
                                })
                              }
                            />
                            Repeat table header
                          </label>
                        </div>
                      )}

                      <div className="m5-flow-options">
                        <strong>Page flow</strong>
                        <label>
                          <input
                            type="checkbox"
                            checked={block.flow?.pageBreakBefore ?? false}
                            onChange={(event) =>
                              updateBlock(block.id, {
                                flow: {
                                  pageBreakBefore: event.target.checked,
                                  keepTogether:
                                    block.flow?.keepTogether ?? false,
                                  allowSplit:
                                    block.flow?.allowSplit ?? true,
                                },
                              })
                            }
                          />
                          Page break before
                        </label>
                        <label>
                          <input
                            type="checkbox"
                            checked={block.flow?.keepTogether ?? false}
                            onChange={(event) =>
                              updateBlock(block.id, {
                                flow: {
                                  pageBreakBefore:
                                    block.flow?.pageBreakBefore ?? false,
                                  keepTogether: event.target.checked,
                                  allowSplit:
                                    block.flow?.allowSplit ?? true,
                                },
                              })
                            }
                          />
                          Keep together
                        </label>
                        <label>
                          <input
                            type="checkbox"
                            checked={block.flow?.allowSplit ?? true}
                            onChange={(event) =>
                              updateBlock(block.id, {
                                flow: {
                                  pageBreakBefore:
                                    block.flow?.pageBreakBefore ?? false,
                                  keepTogether:
                                    block.flow?.keepTogether ?? false,
                                  allowSplit: event.target.checked,
                                },
                              })
                            }
                          />
                          Allow split across pages
                        </label>
                      </div>

                      {!["divider", "quotation_table", "custom_table", "totals"].includes(
                        block.type,
                      ) && (' `
"advanced editor and flow options"

$AddButtonTarget = @'
                <div className="builder-block-list">
'@

$AddButtonNew = @'
                <button
                  type="button"
                  className="button button-secondary builder-add-custom-table"
                  onClick={() =>
                    updatePage({
                      blocks: [
                        ...activePage.blocks,
                        newBlock("custom_table"),
                      ],
                    })
                  }
                >
                  <Table2 size={14} />
                  Add advanced custom table
                </button>

                <div className="builder-block-list">
'@

$Builder = Replace-Required $Builder $AddButtonTarget $AddButtonNew "custom table add button"

Set-Content $BuilderPath -Value $Builder -Encoding UTF8

@'

/* M5 advanced table + flow controls */

.builder-add-custom-table {
  width: 100%;
  margin: 2px 0 10px;
}

.m5-flow-options,
.m5-table-options {
  display: grid;
  gap: 6px;
  margin-top: 8px;
  padding: 8px;
  border: 1px solid var(--ink-100);
  border-radius: 8px;
  background: #fff;
}

.m5-flow-options strong {
  color: var(--ink-500);
  font-size: 8px;
}

.m5-flow-options label,
.m5-table-options label,
.advanced-table-switches label {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--ink-600);
  font-size: 8px;
  font-weight: 650;
}

.m5-flow-options input,
.m5-table-options input,
.advanced-table-switches input {
  width: 13px;
  height: 13px;
  accent-color: var(--brand-700);
}

.advanced-table-editor {
  margin-top: 8px;
  padding: 8px;
  border: 1px solid #d8e3ed;
  border-radius: 8px;
  background: #fff;
}

.advanced-table-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.advanced-table-toolbar button {
  min-height: 26px;
  padding: 0 7px;
  border: 1px solid var(--ink-200);
  border-radius: 6px;
  color: var(--ink-600);
  background: var(--surface-soft);
  font-size: 7px;
  font-weight: 750;
}

.advanced-table-message {
  margin-top: 6px;
  padding: 6px;
  border-radius: 6px;
  color: var(--brand-700);
  background: var(--brand-50);
  font-size: 7px;
}

.advanced-table-scroll {
  overflow: auto;
  margin-top: 7px;
  border: 1px solid var(--ink-100);
  border-radius: 6px;
}

.advanced-table-edit-table {
  min-width: 520px;
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.advanced-table-edit-table td {
  min-width: 105px;
  padding: 4px;
  vertical-align: top;
  border: 1px solid var(--ink-200);
  background: #fff;
}

.advanced-table-edit-table td.advanced-cell-selected {
  outline: 2px solid var(--brand-500);
  outline-offset: -2px;
  background: var(--brand-50);
}

.advanced-cell-selector {
  min-height: 19px;
  margin-bottom: 3px;
  padding: 0 5px;
  border: 1px solid var(--ink-200);
  border-radius: 4px;
  color: var(--ink-500);
  background: var(--surface-soft);
  font-size: 6px;
  font-weight: 800;
}

.advanced-table-edit-table textarea,
.advanced-table-edit-table select {
  width: 100%;
  border: 1px solid var(--ink-200);
  border-radius: 4px;
  color: var(--ink-700);
  background: #fff;
  font-size: 7px;
}

.advanced-table-edit-table textarea {
  min-height: 40px;
  padding: 4px;
  resize: vertical;
}

.advanced-table-edit-table select {
  min-height: 24px;
  margin-top: 3px;
}

.advanced-table-settings-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  margin-top: 7px;
}

.advanced-table-settings-grid label > span,
.advanced-table-dimensions label > span {
  display: block;
  margin-bottom: 3px;
  color: var(--ink-500);
  font-size: 6.5px;
  font-weight: 750;
}

.advanced-table-settings-grid input,
.advanced-table-dimensions input {
  width: 100%;
  min-height: 27px;
  padding: 4px 5px;
  border: 1px solid var(--ink-200);
  border-radius: 4px;
  font-size: 7px;
}

.advanced-table-switches {
  display: grid;
  gap: 5px;
  margin-top: 7px;
  padding: 7px;
  border-radius: 6px;
  background: var(--surface-soft);
}

.advanced-table-dimensions {
  margin-top: 8px;
}

.advanced-table-dimensions > strong {
  display: block;
  margin-bottom: 4px;
  color: var(--ink-500);
  font-size: 7px;
}

.advanced-table-dimensions > div {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 4px;
}

.m5-advanced-preview-pages {
  display: grid;
  gap: 12px;
}

.m5-advanced-preview-page {
  padding: 4px 0;
}

.m5-continuation-label {
  margin-bottom: 5px;
  padding: 4px 6px;
  border: 1px dashed #b8cee0;
  border-radius: 5px;
  color: var(--brand-700);
  background: var(--brand-50);
  text-align: center;
  font-size: 6.5px;
  font-weight: 800;
}

.document-advanced-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  border-style: solid;
  border-color: #1b2028;
  font-size: 7px;
}

.document-advanced-table td {
  border-style: solid;
  border-color: #1b2028;
  vertical-align: middle;
  overflow-wrap: anywhere;
}
'@ | Add-Content "src\app\globals.css" -Encoding UTF8

@'
# M5 Acceptance Checklist

## Advanced table
1. Open Templates.
2. Select any page.
3. Click "Add advanced custom table".
4. Test Add Row, Remove Row, Add Column and Remove Column.
5. Edit cell text and alignment.
6. Change column widths and row heights.
7. Change border width and cell padding.
8. Save the template and refresh.

## Merge / Split
1. Select a rectangular group of cells using the Select buttons.
2. Click Merge.
3. Confirm the cells merge in the builder preview.
4. Select the merged cell.
5. Click Split.
6. Confirm it returns to normal cells.

## Automatic continuation
1. Add enough rows to exceed Rows per page.
2. Keep Auto paginate enabled.
3. Keep Repeat header enabled.
4. Confirm the preview shows continuation sections.
5. Change Rows per page and confirm pagination changes.

## Flow rules
For blocks test:
- Page break before
- Keep together
- Allow split across pages

Save and refresh. Confirm the settings remain.

## Important architecture note
M5 stores page-flow rules now.
Advanced custom-table pagination preview is active.
The final print/PDF renderer in the export milestone will use these saved flow rules for physical output.

## Next milestone
M6:
- Quotation to document instance
- Choose a saved template
- Document-specific page/content overrides
- Preserve master template
- Saved document versions
- Duplicate and revision integration
'@ | Set-Content "docs\M5_ACCEPTANCE_TESTS.md" -Encoding UTF8

Set-Content ".liftdoc-milestone" -Value "M5" -Encoding ASCII

Write-Host ""
Write-Host "Running production build..." -ForegroundColor Yellow
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "M5 build failed. Do not rollback." -ForegroundColor Red
    Write-Host "Send me the complete new build error." -ForegroundColor Yellow
    throw "M5 production build failed."
}

Write-Host "[OK] Production build successful" -ForegroundColor Green

git add .
if ($LASTEXITCODE -ne 0) {
    throw "git add failed."
}

$Changes = git status --porcelain
if ($Changes) {
    git commit -m "Add advanced table builder and page flow rules"

    if ($LASTEXITCODE -eq 0) {
        git tag -f checkpoint-m5-advanced-layout HEAD | Out-Null
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host " M5 ADVANCED LAYOUT COMPLETE" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Local URL: http://localhost:$Port/templates" -ForegroundColor Cyan
Write-Host "Checklist: docs\M5_ACCEPTANCE_TESTS.md" -ForegroundColor Cyan
Write-Host ""

powershell -ExecutionPolicy Bypass -File (Join-Path $ProjectRoot "Start-ASBLiftDoc.ps1")

Write-Host ""
Write-Host "If everything works, send: M5 confirmed" -ForegroundColor Green

