"""
Google Drive integration for automatic document syncing (Service Account version)
-------------------------------------------------------------------------------
Supports:
- Shared Folder mode (for personal Google accounts)
- Domain-Wide Delegation (for Google Workspace)

Setup:
1️⃣ Enable the Google Drive API in your GCP project.
2️⃣ Create a Service Account and download its JSON key.
3️⃣ Share a folder in your Drive with the Service Account email as Editor.
4️⃣ Set these environment variables before running:
    export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service_account.json"
    export GDRIVE_PARENT_ID="your_shared_folder_id"
    export GDRIVE_AUTH_MODE="shared_folder"
    # (optional, if Workspace impersonation)
    # export GDRIVE_IMPERSONATE="user@your-domain.com"
5️⃣ Run:  python gdrive_sync.py
"""

import os
import io
import pickle
from pathlib import Path
from typing import List, Dict, Optional

try:
    from google.oauth2 import service_account
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaIoBaseDownload
    GDRIVE_AVAILABLE = True
except ImportError:
    GDRIVE_AVAILABLE = False
    print("⚠️  Google Drive libraries not installed. Run: pip install google-api-python-client google-auth google-auth-httplib2")

# Recommended: full Drive access (read/write)
SCOPES = ['https://www.googleapis.com/auth/drive']


class GoogleDriveSync:
    """
    Syncs documents from a Google Drive folder to local storage.
    """

    def __init__(self, credentials_path: str = "carecrew-fcm-6d3e980a672f.json"):
        if not GDRIVE_AVAILABLE:
            raise ImportError("Google Drive libraries not installed. Run: pip install google-api-python-client google-auth google-auth-httplib2")

        self.credentials_path = credentials_path
        self.service = None
        self.supported_mimetypes = {
            'application/pdf': '.pdf',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
            'text/plain': '.txt',
            # Google Docs exports
            'application/vnd.google-apps.document': '.docx',
        }

    # --------------------------------------------------------------------------
    # AUTHENTICATION (Service Account or DWD)
    # --------------------------------------------------------------------------
    def authenticate(self) -> bool:
        """
        Authenticate using a Service Account JSON.
        Supports shared-folder or domain-wide delegation modes.
        Can load credentials from file or environment variable.
        """
        try:
            # Try to load credentials from environment variable first (Railway deployment)
            creds_json = os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON")

            if creds_json:
                # Load from environment variable (Railway)
                print("🔐 Loading Google credentials from GOOGLE_SERVICE_ACCOUNT_JSON environment variable")
                try:
                    import json
                    import re

                    # Railway may format the JSON with actual newlines, which breaks parsing
                    # Strategy: First try to parse as-is, if that fails, fix the private_key field
                    try:
                        creds_dict = json.loads(creds_json)
                    except json.JSONDecodeError as e:
                        if "Invalid control character" in str(e):
                            # Fix: Find the private_key field and escape newlines within it
                            # This handles Railway's formatting where actual newlines appear in the private_key value
                            print("   Fixing malformed JSON with unescaped newlines in private_key...")

                            # Use regex to find and fix the private_key value
                            # Match: "private_key": "value" where value may span multiple lines
                            def fix_private_key(match):
                                key = match.group(1)
                                value = match.group(2)
                                # Escape any actual newlines in the value
                                value_fixed = value.replace('\n', '\\n').replace('\r', '\\r')
                                return f'"{key}": "{value_fixed}"'

                            creds_json_fixed = re.sub(
                                r'"(private_key)"\s*:\s*"([^"]*(?:\\.[^"]*)*)"',
                                fix_private_key,
                                creds_json,
                                flags=re.DOTALL
                            )

                            creds_dict = json.loads(creds_json_fixed)
                        else:
                            raise

                    creds = service_account.Credentials.from_service_account_info(creds_dict, scopes=SCOPES)
                except json.JSONDecodeError as e:
                    print(f"❌ Error parsing GOOGLE_SERVICE_ACCOUNT_JSON: {e}")
                    print(f"   First 300 chars: {creds_json[:300]}")
                    print(f"   Error at position {e.pos}")
                    if e.pos and e.pos < len(creds_json):
                        print(f"   Context around error: ...{creds_json[max(0, e.pos-20):e.pos+20]}...")
                    return False
                except Exception as e:
                    print(f"❌ Unexpected error loading credentials: {e}")
                    return False
            else:
                # Load from file (local development)
                sa_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", self.credentials_path)
                if not os.path.exists(sa_path):
                    print(f"❌ Service account JSON not found at: {sa_path}")
                    return False

                print(f"🔐 Loading Google credentials from file: {sa_path}")
                creds = service_account.Credentials.from_service_account_file(sa_path, scopes=SCOPES)

            auth_mode = os.getenv("GDRIVE_AUTH_MODE", "shared_folder")

            if auth_mode == "dwd":
                subject = os.getenv("GDRIVE_IMPERSONATE")
                if not subject:
                    print("❌ GDRIVE_IMPERSONATE is required for domain-wide delegation mode.")
                    return False
                creds = creds.with_subject(subject)

            self.service = build('drive', 'v3', credentials=creds)
            print("✅ Successfully authenticated with Google Drive (Service Account)")
            return True
        except Exception as e:
            print(f"❌ Error building Drive service: {e}")
            return False

    # --------------------------------------------------------------------------
    # CORE DRIVE OPERATIONS
    # --------------------------------------------------------------------------
    def get_folder_id(self, folder_name: str) -> Optional[str]:
        """
        Get folder ID by folder name (only works if the SA has access).
        """
        if not self.service:
            print("❌ Not authenticated. Call authenticate() first.")
            return None

        try:
            query = f"name='{folder_name}' and mimeType='application/vnd.google-apps.folder' and trashed=false"
            results = self.service.files().list(
                q=query,
                spaces='drive',
                fields='files(id, name)',
                supportsAllDrives=True,
                includeItemsFromAllDrives=True
            ).execute()

            folders = results.get('files', [])
            if not folders:
                print(f"❌ Folder '{folder_name}' not found or not shared with the service account.")
                return None

            if len(folders) > 1:
                print(f"⚠️  Multiple folders named '{folder_name}' found. Using first one.")

            folder_id = folders[0]['id']
            print(f"✅ Found folder '{folder_name}' (ID: {folder_id})")
            return folder_id

        except Exception as e:
            print(f"❌ Error searching for folder: {e}")
            return None

    def list_files(self, folder_id: str) -> List[Dict]:
        """
        List all supported files in a Google Drive folder.
        """
        if not self.service:
            print("❌ Not authenticated. Call authenticate() first.")
            return []

        try:
            mimetype_query = " or ".join([f"mimeType='{mt}'" for mt in self.supported_mimetypes.keys()])
            query = f"'{folder_id}' in parents and ({mimetype_query}) and trashed=false"

            results = self.service.files().list(
                q=query,
                spaces='drive',
                fields='files(id, name, mimeType, modifiedTime, size)',
                pageSize=100,
                supportsAllDrives=True,
                includeItemsFromAllDrives=True
            ).execute()

            files = results.get('files', [])
            print(f"📁 Found {len(files)} supported documents in Google Drive folder")
            return files

        except Exception as e:
            print(f"❌ Error listing files: {e}")
            return []

    def list_all_files_recursive(self, folder_id: Optional[str] = None) -> List[Dict]:
        """
        List all files and folders recursively from Google Drive.
        Returns a flat list with parent_id to maintain hierarchy.
        """
        if not self.service:
            print("❌ Not authenticated. Call authenticate() first.")
            return []

        all_items = []

        try:
            # If no folder_id, list from root
            if folder_id:
                query = f"'{folder_id}' in parents and trashed=false"
            else:
                query = "trashed=false"

            page_token = None
            while True:
                results = self.service.files().list(
                    q=query,
                    spaces='drive',
                    fields='nextPageToken, files(id, name, mimeType, modifiedTime, size, parents, webViewLink, iconLink)',
                    pageSize=100,
                    pageToken=page_token,
                    supportsAllDrives=True,
                    includeItemsFromAllDrives=True
                ).execute()

                items = results.get('files', [])
                all_items.extend(items)

                page_token = results.get('nextPageToken')
                if not page_token:
                    break

            # Recursively get files from subfolders
            folders = [item for item in all_items if item['mimeType'] == 'application/vnd.google-apps.folder']
            for folder in folders:
                subfolder_items = self.list_all_files_recursive(folder['id'])
                all_items.extend(subfolder_items)

            return all_items

        except Exception as e:
            print(f"❌ Error listing files recursively: {e}")
            return []

    def get_file_metadata(self, file_id: str) -> Optional[Dict]:
        """
        Get detailed metadata for a specific file.
        """
        if not self.service:
            print("❌ Not authenticated. Call authenticate() first.")
            return None

        try:
            file = self.service.files().get(
                fileId=file_id,
                fields='id, name, mimeType, modifiedTime, size, parents, webViewLink, iconLink, owners, createdTime',
                supportsAllDrives=True
            ).execute()
            return file
        except Exception as e:
            print(f"❌ Error getting file metadata: {e}")
            return None

    def is_supported_file(self, mime_type: str) -> bool:
        """
        Check if a file type is supported for indexing.
        """
        return mime_type in self.supported_mimetypes

    def download_file(self, file_id: str, file_name: str, mime_type: str, destination_path: str) -> bool:
        """
        Download a file from Google Drive.
        """
        if not self.service:
            print("❌ Not authenticated. Call authenticate() first.")
            return False

        try:
            if mime_type == 'application/vnd.google-apps.document':
                request = self.service.files().export_media(
                    fileId=file_id,
                    mimeType='application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                )
            else:
                request = self.service.files().get_media(fileId=file_id)

            fh = io.FileIO(destination_path, 'wb')
            downloader = MediaIoBaseDownload(fh, request)
            done = False
            while not done:
                status, done = downloader.next_chunk()
            fh.close()
            return True

        except Exception as e:
            print(f"❌ Error downloading {file_name}: {e}")
            return False

    # --------------------------------------------------------------------------
    # SYNC LOGIC
    # --------------------------------------------------------------------------
    def sync_folder(self, folder_id_or_name: str, local_dir: str = "data") -> Dict[str, int]:
        """
        Sync all supported files from a Drive folder into a local directory.
        """
        stats = {'downloaded': 0, 'skipped': 0, 'failed': 0, 'total': 0}
        os.makedirs(local_dir, exist_ok=True)

        folder_id = folder_id_or_name
        is_id = folder_id.isalnum() and len(folder_id) >= 25
        if not is_id:
            folder_id = self.get_folder_id(folder_id_or_name)
            if not folder_id:
                return stats

        files = self.list_files(folder_id)
        stats['total'] = len(files)

        if not files:
            print("📭 No supported documents found in folder.")
            return stats

        print(f"\n📥 Syncing {len(files)} documents...\n")

        for file in files:
            file_id = file['id']
            file_name = file['name']
            mime_type = file['mimeType']
            extension = self.supported_mimetypes.get(mime_type, '')

            if not extension:
                print(f"⚠️  Skipping unsupported file: {file_name}")
                stats['skipped'] += 1
                continue

            if not file_name.endswith(extension):
                file_name += extension

            local_path = os.path.join(local_dir, file_name)
            if os.path.exists(local_path):
                local_size = os.path.getsize(local_path)
                remote_size = int(file.get('size', 0)) if 'size' in file else 0
                if remote_size > 0 and local_size == remote_size:
                    print(f"⏭️  Skipped (already synced): {file_name}")
                    stats['skipped'] += 1
                    continue

            print(f"📥 Downloading: {file_name}")
            if self.download_file(file_id, file_name, mime_type, local_path):
                print(f"✅ Downloaded: {file_name}")
                stats['downloaded'] += 1
            else:
                stats['failed'] += 1

        print(f"\n{'='*80}")
        print(f"📊 SYNC SUMMARY")
        print(f"{'='*80}")
        print(f"Total files: {stats['total']}")
        print(f"✅ Downloaded: {stats['downloaded']}")
        print(f"⏭️  Skipped: {stats['skipped']}")
        print(f"❌ Failed: {stats['failed']}")
        print(f"{'='*80}\n")

        return stats


# --------------------------------------------------------------------------
# MAIN TEST ENTRYPOINT
# --------------------------------------------------------------------------
def main():
    print("=" * 80)
    print("🔄 GOOGLE DRIVE SYNC TEST")
    print("=" * 80)

    sync = GoogleDriveSync()

    if not sync.authenticate():
        return

    folder_name = 'lawrag-docs'# input("\n📁 Enter Google Drive folder name (or press Enter for shared folder ID): ").strip()
    if not folder_name:
        folder_name = os.getenv("GDRIVE_PARENT_ID") or "Legal Documents"

    stats = sync.sync_folder(folder_name, local_dir="data")

    if stats['downloaded'] > 0:
        print("\n🎉 Documents synced successfully!")
        print("📝 Next step: Run 'python build_index.py' to index the documents")


if __name__ == "__main__":
    if not GDRIVE_AVAILABLE:
        print("\n❌ Google Drive libraries not installed.")
        print("📦 Install with: pip install google-api-python-client google-auth google-auth-httplib2")
    else:
        main()
