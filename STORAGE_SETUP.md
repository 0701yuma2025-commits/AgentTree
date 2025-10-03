# Supabase Storage Setup

## Storage Bucket Configuration

The system uses Supabase Storage for document uploads. The storage bucket has been configured with the following settings:

### Bucket Details
- **Name**: `documents`
- **Access**: Public
- **Allowed File Types**:
  - JPEG images (`image/jpeg`)
  - PNG images (`image/png`)
  - GIF images (`image/gif`)
  - PDF documents (`application/pdf`)
- **Maximum File Size**: 10MB

### Setup Instructions

If you need to recreate the storage bucket:

1. Run the setup script:
```bash
node src/scripts/setup-storage.js
```

2. The script will:
   - Check if the "documents" bucket exists
   - Create the bucket if it doesn't exist
   - Configure the bucket with appropriate settings

### Manual Setup (Alternative)

If you prefer to set up the bucket manually via Supabase Dashboard:

1. Go to your Supabase project dashboard
2. Navigate to Storage section
3. Click "New Bucket"
4. Configure:
   - Name: `documents`
   - Public: Yes (toggle on)
   - File size limit: 10485760 (10MB)
   - Allowed MIME types: `image/jpeg,image/png,image/gif,application/pdf`

### Storage Structure

Documents are organized by agency:
```
documents/
├── {agency_id}/
│   ├── {uuid}_{original_filename}
│   └── ...
```

### Troubleshooting

If you encounter "Bucket not found" errors:
1. Run the setup script: `node src/scripts/setup-storage.js`
2. Check that your Supabase service key has proper permissions
3. Verify the bucket exists in Supabase Dashboard > Storage

### File Upload Flow

1. User selects file through frontend
2. File is validated (type and size)
3. File is uploaded to Supabase Storage
4. File metadata is saved to `agency_documents` table
5. Public URL is generated for file access