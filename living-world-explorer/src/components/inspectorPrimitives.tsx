import { isValidElement } from 'react'

// Shared display primitives for InspectorPanel and DataSourcesPanel — both
// render the same kind of "field list / table of rows" cognitive-debugger
// UI, just for different slices of an actor's state.
export function readable(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Not available'
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}

export function ActorSection({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return <section className={`lwe-inspector-section${className ? ` ${className}` : ''}`}>
    <h4 className="lwe-inspector-section-title">{title}</h4>
    {children}
  </section>
}

export function ActorList({ items }: { items: unknown[] }) {
  if (items.length === 0) return <div className="lwe-inspector-muted">None recorded.</div>
  return <ul className="lwe-inspector-list">{items.map((item, index) => <li key={index}>{readable(item)}</li>)}</ul>
}

import {  useMemo, useState } from 'react'

export function ActorTable({
  columns,
  rows,
  onRowClick,
  selectedIndex,
}: {
  columns: string[]
  rows: Array<Record<string, unknown>>
  onRowClick?: (row: Record<string, unknown>, index: number) => void
  selectedIndex?: number
}) {
  const [filter, setFilter] = useState('')

  const normalize = (value: unknown): string => {
    if (value == null) return ''

    if (Array.isArray(value)) {
      return value
        .map((v) => normalize(v))
        .join(' ')
        .toLowerCase()
    }

    if (typeof value === 'object') {
      try {
        return JSON.stringify(value).toLowerCase()
      } catch {
        return ''
      }
    }

    return String(value).toLowerCase()
  }

  const filteredRows = useMemo(() => {
    const q = filter.trim().toLowerCase()

    if (!q) return rows

    return rows.filter((row) =>
      columns.some((column) => normalize(row[column]).includes(q)),
    )
  }, [rows, columns, filter])

  if (rows.length === 0) {
    return <div className="lwe-inspector-muted">None recorded.</div>
  }

  return (
    <>
      <div
        style={{
          marginBottom: 10,
          display: 'flex',
          justifyContent: 'flex-end',
        }}
      >
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter..."
          className="lwe-inspector-filter"
          style={{
            width: 260,
            padding: '6px 10px',
            borderRadius: 6,
            border: '1px solid #D3D8DF',
            background: '#FFFFFF',
            color: '#303B4B',
            outline: 'none',
          }}
        />
      </div>

      <div className="lwe-inspector-table-wrap">
        <table className="lwe-inspector-table">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>

          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  style={{
                    textAlign: 'center',
                    padding: 24,
                    opacity: 0.7,
                  }}
                >
                  No matching records.
                </td>
              </tr>
            ) : (
              filteredRows.map((row) => {
                const originalIndex = rows.indexOf(row)

                return (
                  <tr
                    key={originalIndex}
                    onClick={
                      onRowClick
                        ? () => onRowClick(row, originalIndex)
                        : undefined
                    }
                    className={
                      onRowClick
                        ? `lwe-inspector-row-clickable${
                            selectedIndex === originalIndex
                              ? ' lwe-inspector-row-selected'
                              : ''
                          }`
                        : undefined
                    }
                  >
                    {columns.map((column) => (
                      <td key={column}>
                        {isValidElement(row[column])
                          ? (row[column] as React.ReactNode)
                          : readable(row[column])}
                      </td>
                    ))}
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}

export function formatTime(seconds: number | undefined | null): string {
  return seconds ? new Date(seconds * 1000).toLocaleString() : 'Not available'
}
