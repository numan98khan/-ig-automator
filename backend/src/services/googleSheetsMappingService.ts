import OpenAI from 'openai';
import { getLogSettingsSnapshot } from './adminLogSettingsService';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const getDurationMs = (startNs: bigint) => Number(process.hrtime.bigint() - startNs) / 1e6;
const logAiTiming = (label: string, model: string | undefined, startNs: bigint, success: boolean) => {
  if (!getLogSettingsSnapshot().aiTimingEnabled) return;
  const ms = getDurationMs(startNs);
  console.log('[AI] timing', { label, model, ms: Number(ms.toFixed(2)), success });
};

export type InventoryMappingField =
  | 'productName'
  | 'sku'
  | 'description'
  | 'price'
  | 'quantity'
  | 'variant'
  | 'category'
  | 'brand'
  | 'imageUrl'
  | 'location'
  | 'status'
  | 'cost'
  | 'barcode';

export interface InventoryMappingEntry {
  header?: string;
  confidence?: number;
  notes?: string;
}

export interface InventoryMappingResult {
  fields: Record<InventoryMappingField, InventoryMappingEntry>;
  summary: string;
}

const INVENTORY_FIELDS: Array<{ key: InventoryMappingField; label: string; description: string }> = [
  { key: 'productName', label: 'Product name', description: 'Product title or name' },
  { key: 'sku', label: 'SKU', description: 'Stock-keeping unit or item code' },
  { key: 'description', label: 'Description', description: 'Long or short product description' },
  { key: 'price', label: 'Price', description: 'Selling price or MSRP' },
  { key: 'quantity', label: 'Quantity', description: 'Stock on hand / inventory count' },
  { key: 'variant', label: 'Variant', description: 'Size/color/variant details' },
  { key: 'category', label: 'Category', description: 'Category or product type' },
  { key: 'brand', label: 'Brand', description: 'Brand or manufacturer' },
  { key: 'imageUrl', label: 'Image URL', description: 'Image or thumbnail URL' },
  { key: 'location', label: 'Location', description: 'Warehouse, store, or bin location' },
  { key: 'status', label: 'Status', description: 'Active/inactive or in-stock/out-of-stock' },
  { key: 'cost', label: 'Cost', description: 'Cost of goods or wholesale cost' },
  { key: 'barcode', label: 'Barcode', description: 'UPC, EAN, or barcode value' },
];

const EMPTY_FIELDS: Record<InventoryMappingField, InventoryMappingEntry> = INVENTORY_FIELDS.reduce(
  (acc, field) => {
    acc[field.key] = {};
    return acc;
  },
  {} as Record<InventoryMappingField, InventoryMappingEntry>,
);

const INVENTORY_FIELD_KEYS = new Set<InventoryMappingField>(
  INVENTORY_FIELDS.map((field) => field.key),
);

const isInventoryMappingField = (value: unknown): value is InventoryMappingField =>
  typeof value === 'string' && INVENTORY_FIELD_KEYS.has(value as InventoryMappingField);

export async function analyzeInventoryMapping(
  headers: string[],
  rows: string[][],
): Promise<InventoryMappingResult> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OpenAI API key is missing');
  }

  if (!headers.length) {
    return {
      fields: { ...EMPTY_FIELDS },
      summary: 'No headers were detected to map.',
    };
  }

  const headerList = headers.map((header) => header.trim()).filter(Boolean);
  const headerLookup = new Map(headerList.map((header) => [header.toLowerCase(), header]));

  const sampleRows = rows.slice(0, 6).map((row) => {
    const rowData: Record<string, string> = {};
    headerList.forEach((header, index) => {
      rowData[header] = row[index] ?? '';
    });
    return rowData;
  });

  const schema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      summary: { type: 'string' },
      fields: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            field: { type: 'string', enum: INVENTORY_FIELDS.map((field) => field.key) },
            header: { type: ['string', 'null'] },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            notes: { type: ['string', 'null'] },
          },
          required: ['field', 'header', 'confidence', 'notes'],
        },
      },
    },
    required: ['fields', 'summary'],
  };

  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const requestStart = process.hrtime.bigint();
  let response;
  try {
    response = await openai.responses.create({
      model,
      temperature: 0.1,
      input: [
        {
          role: 'system',
          content: 'You map spreadsheet columns to inventory management fields. Choose the best header match or null.',
        },
        {
          role: 'user',
          content: [
            'Inventory fields to map:',
            ...INVENTORY_FIELDS.map((field) => `- ${field.key}: ${field.description}`),
            '',
            `Headers: ${headerList.join(', ')}`,
            '',
            'Sample rows (JSON array of objects):',
            JSON.stringify(sampleRows, null, 2),
            '',
            'Return a mapping for every inventory field. Use only headers from the list, or null if missing.',
          ].join('\n'),
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'inventory_mapping',
          schema,
          strict: true,
        },
      },
      store: false,
    });
    logAiTiming('inventory_mapping', model, requestStart, true);
  } catch (error) {
    logAiTiming('inventory_mapping', model, requestStart, false);
    throw error;
  }

  const structured = extractStructuredJson<{
    summary: string;
    fields: Array<{
      field: InventoryMappingField;
      header: string | null;
      confidence: number;
      notes: string | null;
    }>;
  }>(response);

  const fallback = safeParseJson(response.output_text?.trim() || '{}');
  const payload = structured || fallback;

  const mappedFields = { ...EMPTY_FIELDS };
  if (Array.isArray(payload?.fields)) {
    for (const item of payload.fields as Array<{
      field?: unknown;
      header?: unknown;
      confidence?: unknown;
      notes?: unknown;
    }>) {
      if (!isInventoryMappingField(item?.field)) continue;
      const field = item.field;
      const normalizedHeader = item.header?.toString().trim();
      const resolvedHeader = normalizedHeader
        ? headerLookup.get(normalizedHeader.toLowerCase())
        : undefined;
      mappedFields[field] = {
        header: resolvedHeader,
        confidence: typeof item.confidence === 'number'
          ? Math.max(0, Math.min(1, Number(item.confidence.toFixed(2))))
          : undefined,
        notes: item.notes || undefined,
      };
    }
  }

  const summary = typeof payload?.summary === 'string' ? payload.summary : undefined;

  return {
    fields: mappedFields,
    summary: summary ?? 'Inventory mapping completed.',
  };
}

function extractStructuredJson<T>(response: any): T | null {
  if (!response?.output) {
    return null;
  }

  for (const item of response.output) {
    if (!item?.content) continue;
    for (const content of item.content) {
      if (content?.type === 'output_text' && content.parsed) {
        return content.parsed as T;
      }
    }
  }

  return null;
}

function safeParseJson(content: string): any {
  try {
    return JSON.parse(content);
  } catch (error) {
    console.error('Failed to parse inventory mapping JSON', content);
    return {};
  }
}
