type ExportFormat = 'csv' | 'excel' | 'pdf';

interface ExportColumn {
  key: string;
  header: string;
  format?: (value: any) => string;
}

function formatCurrency(value: number | string | null | undefined): string {
  const num = typeof value === 'string' ? parseFloat(value) : (value ?? 0);
  return `$${num.toFixed(2)}`;
}

function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  return date.toLocaleString();
}

function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  return date.toLocaleDateString();
}

function escapeCSV(value: any): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportToCSV<T>(
  data: T[],
  columns: ExportColumn[],
  filename: string
): void {
  const header = columns.map(col => escapeCSV(col.header)).join(',');
  const rows = data.map(row => 
    columns.map(col => {
      const value = (row as any)[col.key];
      const formatted = col.format ? col.format(value) : value;
      return escapeCSV(formatted);
    }).join(',')
  );
  
  const csv = [header, ...rows].join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `${filename}.csv`);
}

export function exportToExcel<T>(
  data: T[],
  columns: ExportColumn[],
  filename: string
): void {
  const header = columns.map(col => col.header).join('\t');
  const rows = data.map(row => 
    columns.map(col => {
      const value = (row as any)[col.key];
      const formatted = col.format ? col.format(value) : value;
      return String(formatted ?? '').replace(/\t/g, ' ').replace(/\n/g, ' ');
    }).join('\t')
  );
  
  const tsv = [header, ...rows].join('\n');
  const blob = new Blob(['\ufeff' + tsv], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  downloadBlob(blob, `${filename}.xls`);
}

export function exportToPDF<T>(
  data: T[],
  columns: ExportColumn[],
  filename: string,
  title: string
): void {
  const header = columns.map(col => col.header);
  const rows = data.map(row => 
    columns.map(col => {
      const value = (row as any)[col.key];
      return col.format ? col.format(value) : String(value ?? '');
    })
  );

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Please allow pop-ups to export PDF');
    return;
  }

  const tableRows = rows.map(row => 
    `<tr>${row.map(cell => `<td style="border:1px solid #ddd;padding:6px 10px;">${escapeHTML(cell)}</td>`).join('')}</tr>`
  ).join('');

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>${escapeHTML(title)}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; font-size: 12px; }
        h1 { font-size: 18px; margin-bottom: 10px; }
        .meta { color: #666; margin-bottom: 20px; font-size: 11px; }
        table { border-collapse: collapse; width: 100%; }
        th { background: #f5f5f5; border: 1px solid #ddd; padding: 8px 10px; text-align: left; font-weight: bold; }
        td { border: 1px solid #ddd; padding: 6px 10px; }
        tr:nth-child(even) { background: #fafafa; }
        @media print {
          body { margin: 0; }
          button { display: none; }
        }
      </style>
    </head>
    <body>
      <h1>${escapeHTML(title)}</h1>
      <div class="meta">Generated: ${new Date().toLocaleString()} | Records: ${data.length}</div>
      <button onclick="window.print();window.close();" style="margin-bottom:10px;padding:8px 16px;cursor:pointer;">Print / Save as PDF</button>
      <table>
        <thead>
          <tr>${header.map(h => `<th>${escapeHTML(h)}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>
    </body>
    </html>
  `;

  printWindow.document.write(html);
  printWindow.document.close();
}

function escapeHTML(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportData<T>(
  format: ExportFormat,
  data: T[],
  columns: ExportColumn[],
  filename: string,
  title: string
): void {
  switch (format) {
    case 'csv':
      exportToCSV(data, columns, filename);
      break;
    case 'excel':
      exportToExcel(data, columns, filename);
      break;
    case 'pdf':
      exportToPDF(data, columns, filename, title);
      break;
  }
}

export const commonFormatters = {
  currency: formatCurrency,
  dateTime: formatDateTime,
  date: formatDate,
};
