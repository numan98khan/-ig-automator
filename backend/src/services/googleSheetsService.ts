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

type GoogleSheetsAuth = {
  accessToken?: string;
  serviceAccountJson?: string;
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

export async function getOAuthAccessToken(params: {
  refreshToken: string;
}): Promise<{ accessToken: string; expiresAt: Date }> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth client credentials are missing');
  }
  const response = await axios.post(
    'https://oauth2.googleapis.com/token',
    new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: params.refreshToken,
      grant_type: 'refresh_token',
    }),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    },
  );
  const accessToken = response.data?.access_token;
  if (!accessToken) {
    throw new Error('Failed to refresh Google access token');
  }
  const expiresIn = response.data?.expires_in || 3600;
  return {
    accessToken,
    expiresAt: new Date(Date.now() + expiresIn * 1000),
  };
}

async function resolveAccessToken(auth: GoogleSheetsAuth): Promise<string> {
  if (auth.accessToken) return auth.accessToken;
  if (!auth.serviceAccountJson) {
    throw new Error('No Google Sheets auth available');
  }
  const serviceAccount = parseServiceAccount(auth.serviceAccountJson);
  return getAccessToken(serviceAccount);
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
  config: {
    spreadsheetId: string;
    sheetName?: string;
  } & GoogleSheetsAuth,
  options?: {
    headerRow?: number;
    sampleRows?: number;
  },
): Promise<{ headers: string[]; rows: string[][]; range: string }> {
  const accessToken = await resolveAccessToken(config);
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

export async function listGoogleSpreadsheets(auth: GoogleSheetsAuth): Promise<Array<{ id: string; name: string }>> {
  const accessToken = await resolveAccessToken(auth);
  const response = await axios.get('https://www.googleapis.com/drive/v3/files', {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: {
      q: "mimeType='application/vnd.google-apps.spreadsheet' and trashed = false",
      fields: 'files(id,name,modifiedTime)',
      orderBy: 'modifiedTime desc',
      pageSize: 50,
    },
  });
  const files = response.data?.files || [];
  return files.map((file: any) => ({ id: file.id, name: file.name }));
}

export async function listGoogleSpreadsheetTabs(
  auth: GoogleSheetsAuth,
  spreadsheetId: string,
): Promise<string[]> {
  const accessToken = await resolveAccessToken(auth);
  const response = await axios.get(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: {
      fields: 'sheets(properties(title))',
    },
  });
  const sheets = response.data?.sheets || [];
  return sheets.map((sheet: any) => sheet.properties?.title).filter(Boolean);
}
