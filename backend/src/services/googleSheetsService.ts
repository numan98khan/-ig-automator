import axios from 'axios';
import jwt from 'jsonwebtoken';

type GoogleServiceAccount = {
  client_email: string;
  private_key: string;
  token_uri?: string;
};

export type GoogleSheetsConfig = {
  spreadsheetId: string;
  sheetName?: string;
  serviceAccountJson: string;
};

function parseServiceAccount(rawJson: string): GoogleServiceAccount {
  let parsed: any;
  try {
    parsed = JSON.parse(rawJson);
  } catch (error) {
    throw new Error('Invalid service account JSON');
  }
  if (!parsed?.client_email || !parsed?.private_key) {
    throw new Error('Service account JSON missing client_email or private_key');
  }
  return parsed;
}

async function getAccessToken(serviceAccount: GoogleServiceAccount): Promise<string> {
  const tokenUri = serviceAccount.token_uri || 'https://oauth2.googleapis.com/token';
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: tokenUri,
    iat: now,
    exp: now + 3600,
  };

  const assertion = jwt.sign(payload, serviceAccount.private_key, { algorithm: 'RS256' });

  const response = await axios.post(
    tokenUri,
    new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    },
  );

  const accessToken = response.data?.access_token;
  if (!accessToken) {
    throw new Error('Failed to fetch access token');
  }
  return accessToken;
}

export async function appendGoogleSheetRow(
  config: GoogleSheetsConfig,
  values: Array<string | number | boolean | null>,
): Promise<{ updatedRange?: string; updatedRows?: number }> {
  const serviceAccount = parseServiceAccount(config.serviceAccountJson);
  const accessToken = await getAccessToken(serviceAccount);
  const sheetName = config.sheetName || 'Sheet1';
  const encodedRange = encodeURIComponent(`${sheetName}!A1`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheetId}/values/${encodedRange}:append`;

  const response = await axios.post(
    url,
    {
      values: [values],
    },
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: {
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
      },
    },
  );

  return {
    updatedRange: response.data?.updates?.updatedRange,
    updatedRows: response.data?.updates?.updatedRows,
  };
}

export async function getGoogleSheetPreview(
  config: GoogleSheetsConfig,
  options?: {
    headerRow?: number;
    sampleRows?: number;
  },
): Promise<{ headers: string[]; rows: string[][]; range: string }> {
  const serviceAccount = parseServiceAccount(config.serviceAccountJson);
  const accessToken = await getAccessToken(serviceAccount);
  const sheetName = config.sheetName || 'Sheet1';
  const headerRow = options?.headerRow && options.headerRow > 0 ? options.headerRow : 1;
  const sampleRows = options?.sampleRows && options.sampleRows > 0 ? options.sampleRows : 5;
  const endRow = headerRow + sampleRows;
  const range = `${sheetName}!${headerRow}:${endRow}`;
  const encodedRange = encodeURIComponent(range);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheetId}/values/${encodedRange}`;

  const response = await axios.get(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: { majorDimension: 'ROWS' },
  });

  const values: string[][] = response.data?.values || [];
  const headers = values.length > 0 ? values[0] : [];
  const rows = values.length > 1 ? values.slice(1) : [];

  return { headers, rows, range };
}
