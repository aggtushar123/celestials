import type { AttributeDef } from './attributeConfig';

// Test-only: three attributes over two records, giving one 100%, one 50%
// and one 0% usage, and a display name with a comma and a quote for CSV.
export interface Row {
  name: string;
  note: string;
  seats: number;
}

export const ROWS: Row[] = [
  { name: 'Acme', note: 'Renews in May', seats: 0 },
  { name: 'Globex', note: '', seats: 0 },
];

export const ATTRS: AttributeDef<Row>[] = [
  { displayName: 'Name', name: 'name', type: 'text', isCustom: true, required: true, getValue: (row) => row.name },
  { displayName: 'Note, "quoted"', name: 'note', type: 'text', isCustom: true, getValue: (row) => row.note },
  { displayName: 'Seats', name: 'seats', type: 'number', isCustom: false, getValue: (row) => row.seats },
];

export const CSV_HEADER = '"Display name","Name","Description","Type","Properties","Usage %"';
export const CSV_NAME = '"Name","name","Default","text","Required; UI Editable; Visible","100"';
export const CSV_NOTE = '"Note, ""quoted""","note","Default","text","UI Editable; Visible","50"';
export const CSV_SEATS = '"Seats","seats","System Generated","number","Visible","0"';
