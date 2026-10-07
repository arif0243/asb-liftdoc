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
