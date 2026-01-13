type BusinessProfileLike = {
  businessName?: string;
  businessDescription?: string;
  businessHours?: string;
  businessTone?: string;
  businessLocation?: string;
  businessWebsite?: string;
  businessCatalog?: Array<{ name?: string; description?: string; price?: string }>;
  businessDocuments?: Array<{ title?: string; url?: string }>;
};

type BusinessProfileContext = {
  title: string;
  content: string;
};

const MAX_CATALOG_ITEMS = 12;
const MAX_DOCUMENT_ITEMS = 12;

const cleanText = (value?: string) => (typeof value === 'string' ? value.trim() : '');

export const buildBusinessProfileContext = (
  settings?: BusinessProfileLike | null,
): BusinessProfileContext | null => {
  if (!settings) return null;

  const lines: string[] = [];
  const name = cleanText(settings.businessName);
  const description = cleanText(settings.businessDescription);
  const hours = cleanText(settings.businessHours);
  const tone = cleanText(settings.businessTone);
  const location = cleanText(settings.businessLocation);
  const website = cleanText(settings.businessWebsite);

  if (name) lines.push(`Business name: ${name}`);
  if (description) lines.push(`Description: ${description}`);
  if (hours) lines.push(`Hours: ${hours}`);
  if (tone) lines.push(`Tone: ${tone}`);
  if (location) lines.push(`Location: ${location}`);
  if (website) lines.push(`Website: ${website}`);

  const catalog = Array.isArray(settings.businessCatalog)
    ? settings.businessCatalog.slice(0, MAX_CATALOG_ITEMS)
    : [];
  const catalogLines = catalog
    .map((item) => {
      const itemName = cleanText(item?.name);
      const itemDescription = cleanText(item?.description);
      const itemPrice = cleanText(item?.price);
      if (!itemName && !itemDescription && !itemPrice) return '';
      const details = [itemDescription, itemPrice ? `Price: ${itemPrice}` : '']
        .filter(Boolean)
        .join(' — ');
      if (!itemName) return details;
      if (!details) return itemName;
      return `${itemName} — ${details}`;
    })
    .filter(Boolean);
  if (catalogLines.length > 0) {
    lines.push('Catalog:');
    lines.push(...catalogLines.map((line) => `- ${line}`));
  }

  const documents = Array.isArray(settings.businessDocuments)
    ? settings.businessDocuments.slice(0, MAX_DOCUMENT_ITEMS)
    : [];
  const documentLines = documents
    .map((item) => {
      const title = cleanText(item?.title);
      const url = cleanText(item?.url);
      if (!title && !url) return '';
      if (title && url) return `${title} — ${url}`;
      return title || url;
    })
    .filter(Boolean);
  if (documentLines.length > 0) {
    lines.push('Documents:');
    lines.push(...documentLines.map((line) => `- ${line}`));
  }

  if (lines.length === 0) return null;

  return {
    title: name ? `${name} business profile` : 'Business profile',
    content: lines.join('\n'),
  };
};
