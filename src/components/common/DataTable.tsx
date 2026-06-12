import { useState, useMemo, ReactNode } from 'react';
import { FiChevronUp, FiChevronDown } from 'react-icons/fi';

export type ColumnDef<T> = {
  header: string;
  accessorKey?: keyof T;
  id?: string;
  cell?: (row: T) => ReactNode;
  sortable?: boolean;
};

type DataTableProps<T> = {
  data: T[];
  columns: ColumnDef<T>[];
  onRowClick?: (row: T) => void;
  defaultSort?: { key: keyof T | string; desc: boolean };
  emptyMessage?: string;
};

export function DataTable<T extends Record<string, any>>({
  data,
  columns,
  onRowClick,
  defaultSort,
  emptyMessage = 'No results found.',
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(
    defaultSort ? (defaultSort.key as string) : null
  );
  const [sortDesc, setSortDesc] = useState(defaultSort?.desc ?? false);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDesc(!sortDesc);
    } else {
      setSortKey(key);
      setSortDesc(false);
    }
  };

  const sortedData = useMemo(() => {
    if (!sortKey) return data;
    
    return [...data].sort((a, b) => {
      let aVal = a[sortKey];
      let bVal = b[sortKey];
      
      // Handle nested values if needed, but for simplicity we assume flat or pre-processed
      if (typeof aVal === 'string') aVal = aVal.toLowerCase();
      if (typeof bVal === 'string') bVal = bVal.toLowerCase();

      if (aVal < bVal) return sortDesc ? 1 : -1;
      if (aVal > bVal) return sortDesc ? -1 : 1;
      return 0;
    });
  }, [data, sortKey, sortDesc]);

  if (data.length === 0) {
    return (
      <div className="page-card">
        <div className="empty-state">
          <p className="empty-state__text">{emptyMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-card" style={{ padding: 0 }}>
      <div className="data-table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((col) => {
                const key = (col.accessorKey as string) || col.id;
                const isSortable = col.sortable !== false && key;
                return (
                  <th
                    key={col.header}
                    onClick={() => isSortable && handleSort(key as string)}
                    className={sortKey === key ? 'sorted' : ''}
                    style={{ cursor: isSortable ? 'pointer' : 'default' }}
                  >
                    {col.header}
                    {isSortable && sortKey === key && (
                      <span className="sort-icon">
                        {sortDesc ? <FiChevronDown /> : <FiChevronUp />}
                      </span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sortedData.map((row, i) => (
              <tr 
                key={row.id || i} 
                onClick={() => onRowClick && onRowClick(row)}
                className={onRowClick ? 'clickable' : ''}
              >
                {columns.map((col) => (
                  <td key={col.header}>
                    {col.cell ? col.cell(row) : col.accessorKey ? String(row[col.accessorKey] ?? '') : ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
