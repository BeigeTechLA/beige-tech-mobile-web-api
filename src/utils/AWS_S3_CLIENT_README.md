# AWS S3 Client Utility - Implementation Guide

## Overview

Production-ready AWS S3 client for Revure V2 backend with comprehensive file management capabilities, multipart upload support, and secure presigned URL generation.

## Installation

Install the required AWS SDK package:

```bash
yarn add aws-sdk
```

Or with npm:

```bash
npm install aws-sdk
```

## Configuration

### Environment Variables

Add the following variables to your `.env` file:

```bash
# AWS S3 Configuration
AWS_REGION=us-east-1
AWS_S3_BUCKET=revure-projects
AWS_ACCESS_KEY_ID=your_aws_access_key_id
AWS_SECRET_ACCESS_KEY=your_aws_secret_access_key

# S3 Folder Structure (optional - defaults provided)
S3_RAW_FOLDER=raw-footage
S3_EDITS_FOLDER=edits
S3_FINALS_FOLDER=finals
S3_THUMBNAILS_FOLDER=thumbnails
S3_REFERENCE_FOLDER=reference
```

### AWS IAM Permissions

Ensure your AWS IAM user has the following S3 permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucket",
        "s3:GetObjectMetadata",
        "s3:HeadObject",
        "s3:CopyObject"
      ],
      "Resource": [
        "arn:aws:s3:::revure-projects/*",
        "arn:aws:s3:::revure-projects"
      ]
    }
  ]
}
```

## S3 Bucket Structure

The client follows this folder structure:

```
revure-projects/
├── raw-footage/{project_id}/
│   ├── video_001.mp4
│   ├── video_002.mp4
│   └── audio_001.wav
├── edits/{project_id}/
│   ├── draft_v1.mp4
│   ├── draft_v2.mp4
│   └── revision_v1.mp4
├── finals/{project_id}/
│   ├── final_export_4k.mp4
│   └── final_export_1080p.mp4
├── thumbnails/{project_id}/
│   └── preview_thumb.jpg
└── reference/{project_id}/
    └── client_reference.pdf
```

## API Reference

### Import

```javascript
const {
  uploadLargeFile,
  getSignedDownloadUrl,
  getSignedUploadUrl,
  deleteFile,
  listFiles,
  getFileMetadata,
  generateS3Key,
  testConnection
} = require('./utils/awsS3Client');
```

### Upload Operations

#### `uploadLargeFile(filePath, key, options)`

Upload large files with multipart upload and progress tracking. Automatically handles files >100MB.

**Parameters:**
- `filePath` (string): Local file path to upload
- `key` (string): S3 key (destination path)
- `options` (object):
  - `contentType` (string): MIME type (auto-detected if not provided)
  - `onProgress` (function): Progress callback with `{ percentage, loaded, total, speed }`
  - `metadata` (object): Custom metadata key-value pairs
  - `serverSideEncryption` (boolean): Enable AES256 encryption (default: true)
  - `contentDisposition` (string): Force download behavior

**Returns:** Promise<Object>
- `location` (string): Public URL (if bucket is public)
- `etag` (string): Entity tag
- `bucket` (string): Bucket name
- `key` (string): S3 key
- `versionId` (string): Version ID (if versioning enabled)

**Example:**

```javascript
const filePath = '/tmp/uploads/raw_footage.mp4';
const key = generateS3Key('RAW_FOOTAGE', 123, 'raw_footage.mp4');

const result = await uploadLargeFile(filePath, key, {
  onProgress: ({ percentage, loaded, total, speed }) => {
    console.log(`Upload progress: ${percentage}% (${speed})`);
    // Update database with progress
    await ProjectFile.update(
      { upload_progress: percentage },
      { where: { file_id: fileId } }
    );
  },
  metadata: {
    projectId: '123',
    uploadedBy: 'user@example.com',
    originalName: 'raw_footage.mp4'
  }
});

console.log('Upload complete:', result.location);
```

#### `getSignedUploadUrl(key, contentType, expiresIn, options)`

Generate presigned URL for direct client upload to S3 (bypasses server).

**Parameters:**
- `key` (string): S3 key (destination path)
- `contentType` (string): MIME type
- `expiresIn` (number): Expiration time in seconds (default: 3600)
- `options` (object):
  - `maxFileSize` (number): Maximum file size in bytes
  - `metadata` (object): Custom metadata

**Returns:** Promise<Object>
- `url` (string): Presigned URL
- `method` (string): HTTP method ('PUT')
- `headers` (object): Required headers
- `expiresAt` (string): ISO timestamp of expiration

**Example:**

```javascript
// Generate presigned URL for client upload
const key = generateS3Key('RAW_FOOTAGE', 123, 'video.mp4');
const uploadUrl = await getSignedUploadUrl(key, 'video/mp4', 3600, {
  metadata: { projectId: '123' }
});

// Send to frontend
res.json({
  uploadUrl: uploadUrl.url,
  method: uploadUrl.method,
  headers: uploadUrl.headers,
  expiresAt: uploadUrl.expiresAt
});

// Frontend uploads directly to S3
// fetch(uploadUrl.url, {
//   method: 'PUT',
//   headers: uploadUrl.headers,
//   body: file
// })
```

#### `getPresignedPost(key, options)`

Generate presigned POST for browser-based multipart form upload with size limits.

**Parameters:**
- `key` (string): S3 key (destination path)
- `options` (object):
  - `expiresIn` (number): Expiration time in seconds
  - `maxFileSize` (number): Maximum file size in bytes
  - `contentType` (string): Allowed content type pattern

**Returns:** Promise<Object>
- `url` (string): POST URL
- `fields` (object): Form fields to include
- `expiresAt` (string): ISO timestamp

**Example:**

```javascript
const postData = await getPresignedPost(
  generateS3Key('RAW_FOOTAGE', 123, 'video.mp4'),
  {
    expiresIn: 3600,
    maxFileSize: 5 * 1024 * 1024 * 1024, // 5GB
    contentType: 'video/mp4'
  }
);

// Frontend creates FormData and appends fields
```

### Download Operations

#### `getSignedDownloadUrl(key, expiresIn, options)`

Generate secure presigned URL for file download (expires after specified time).

**Parameters:**
- `key` (string): S3 key
- `expiresIn` (number): Expiration time in seconds (default: 3600 = 1 hour)
- `options` (object):
  - `responseContentDisposition` (string): Force download with filename

**Returns:** Promise<string> - Presigned URL

**Example:**

```javascript
// Generate 1-hour download link
const downloadUrl = await getSignedDownloadUrl(
  'raw-footage/123/video.mp4',
  3600,
  {
    responseContentDisposition: 'attachment; filename="project_123_raw.mp4"'
  }
);

res.json({ downloadUrl });

// Client downloads using the URL
// <a href={downloadUrl} download>Download File</a>
```

### File Management

#### `deleteFile(key)`

Delete a single file from S3.

**Parameters:**
- `key` (string): S3 key

**Returns:** Promise<Object> - Deletion result

**Example:**

```javascript
await deleteFile('raw-footage/123/old_video.mp4');
```

#### `deleteFiles(keys)`

Delete multiple files in batch (up to 1000 per request, automatically chunks larger batches).

**Parameters:**
- `keys` (Array<string>): Array of S3 keys

**Returns:** Promise<Object>
- `deleted` (Array<string>): Successfully deleted keys
- `errors` (Array<Object>): Failed deletions with error details

**Example:**

```javascript
const result = await deleteFiles([
  'raw-footage/123/video1.mp4',
  'raw-footage/123/video2.mp4',
  'edits/123/draft_v1.mp4'
]);

console.log(`Deleted: ${result.deleted.length}, Errors: ${result.errors.length}`);
```

#### `copyFile(sourceKey, destinationKey, options)`

Copy file within S3 bucket.

**Parameters:**
- `sourceKey` (string): Source S3 key
- `destinationKey` (string): Destination S3 key
- `options` (object):
  - `serverSideEncryption` (boolean): Enable encryption (default: true)
  - `metadata` (object): Replace metadata (optional)

**Returns:** Promise<Object>
- `etag` (string): New ETag
- `versionId` (string): New version ID

**Example:**

```javascript
// Archive final version
await copyFile(
  'edits/123/final.mp4',
  'finals/123/final_archive_2024.mp4'
);
```

#### `moveFile(sourceKey, destinationKey)`

Move file (copy + delete original).

**Example:**

```javascript
// Move draft to final folder
await moveFile(
  'edits/123/approved_draft.mp4',
  'finals/123/final_export.mp4'
);
```

### Listing Operations

#### `listFiles(prefix, options)`

List files with specific prefix, supports pagination.

**Parameters:**
- `prefix` (string): Folder prefix
- `options` (object):
  - `maxKeys` (number): Maximum keys to return (default: 1000)
  - `continuationToken` (string): Pagination token

**Returns:** Promise<Object>
- `files` (Array<Object>): File metadata
- `isTruncated` (boolean): More results available
- `nextContinuationToken` (string): Token for next page
- `totalCount` (number): Count in current response

**Example:**

```javascript
const result = await listFiles('raw-footage/123/', { maxKeys: 100 });

result.files.forEach(file => {
  console.log(`${file.key}: ${(file.size / 1024 / 1024).toFixed(2)} MB`);
});

// Pagination
if (result.isTruncated) {
  const nextPage = await listFiles('raw-footage/123/', {
    continuationToken: result.nextContinuationToken
  });
}
```

#### `listProjectFiles(projectId)`

List all files for a project across all categories.

**Parameters:**
- `projectId` (number): Project ID

**Returns:** Promise<Object> - Files grouped by category

**Example:**

```javascript
const files = await listProjectFiles(123);

console.log('Raw footage:', files.RAW_FOOTAGE.length);
console.log('Edits:', files.EDITS.length);
console.log('Finals:', files.FINALS.length);
console.log('Thumbnails:', files.THUMBNAILS.length);
console.log('Reference:', files.REFERENCE.length);
```

### Metadata Operations

#### `getFileMetadata(key)`

Get detailed file metadata.

**Parameters:**
- `key` (string): S3 key

**Returns:** Promise<Object>
- `key` (string): S3 key
- `size` (number): File size in bytes
- `contentType` (string): MIME type
- `lastModified` (Date): Last modified timestamp
- `etag` (string): Entity tag
- `versionId` (string): Version ID
- `metadata` (object): Custom metadata
- `serverSideEncryption` (string): Encryption type
- `storageClass` (string): Storage class

**Example:**

```javascript
const metadata = await getFileMetadata('raw-footage/123/video.mp4');

console.log(`Size: ${(metadata.size / 1024 / 1024 / 1024).toFixed(2)} GB`);
console.log(`Type: ${metadata.contentType}`);
console.log(`Modified: ${metadata.lastModified}`);
console.log(`Encrypted: ${metadata.serverSideEncryption}`);
```

#### `fileExists(key)`

Check if file exists in S3.

**Parameters:**
- `key` (string): S3 key

**Returns:** Promise<boolean>

**Example:**

```javascript
if (await fileExists('raw-footage/123/video.mp4')) {
  console.log('File exists');
} else {
  console.log('File not found');
}
```

### Checksum and Verification

#### `calculateChecksum(filePath)`

Calculate MD5 checksum for a file (used for upload verification).

**Parameters:**
- `filePath` (string): Path to the file

**Returns:** Promise<string> - MD5 checksum as hex string

**Example:**

```javascript
const checksum = await calculateChecksum('/tmp/uploads/video.mp4');
console.log('MD5:', checksum); // e.g., 'd41d8cd98f00b204e9800998ecf8427e'
```

#### `calculateBufferChecksum(buffer)`

Calculate MD5 checksum for a buffer.

**Parameters:**
- `buffer` (Buffer): Data buffer

**Returns:** string - MD5 checksum as hex string

**Example:**

```javascript
const buffer = fs.readFileSync('/tmp/uploads/video.mp4');
const checksum = calculateBufferChecksum(buffer);
```

#### `verifyUpload(key, expectedChecksum)`

Verify uploaded file integrity by comparing checksums.

**Parameters:**
- `key` (string): S3 key
- `expectedChecksum` (string): Expected MD5 checksum (hex string)

**Returns:** Promise<Object>
- `verified` (boolean): Whether checksum matches
- `partial` (boolean): True if multipart upload (ETag verification not available)
- `key` (string): S3 key
- `expectedChecksum` (string): Expected checksum
- `actualChecksum` (string): Actual ETag/checksum
- `size` (number): File size in bytes
- `message` (string): Verification result message

**Example:**

```javascript
// After uploading a file
const result = await uploadFile('/tmp/video.mp4', 'raw-footage/123/video.mp4');

// Verify integrity
const verification = await verifyUpload(result.key, result.checksum);

if (verification.verified) {
  console.log('Upload verified successfully');
} else {
  console.error('Upload verification failed:', verification.message);
  // Re-upload or notify user
}
```

### Upload Operations (Enhanced)

#### `uploadFile(filePath, key, options)`

Upload small files to S3 (< 100MB). Automatically redirects to multipart upload for larger files.

**Parameters:**
- `filePath` (string): Local file path to upload
- `key` (string): S3 key (destination path)
- `options` (object):
  - `contentType` (string): MIME type (auto-detected if not provided)
  - `metadata` (object): Custom metadata key-value pairs
  - `serverSideEncryption` (boolean): Enable AES256 encryption (default: true)
  - `verifyChecksum` (boolean): Verify upload integrity (default: true)
  - `contentDisposition` (string): Force download behavior

**Returns:** Promise<Object>
- `location` (string): S3 URL
- `etag` (string): Entity tag
- `bucket` (string): Bucket name
- `key` (string): S3 key
- `versionId` (string): Version ID
- `checksum` (string): MD5 checksum
- `size` (number): File size in bytes
- `verified` (boolean): Whether checksum was verified

**Example:**

```javascript
const result = await uploadFile('/tmp/small_video.mp4', 'raw-footage/123/small_video.mp4', {
  metadata: { projectId: '123', uploadedBy: 'user@example.com' },
  verifyChecksum: true
});

console.log('Uploaded:', result.location);
console.log('Verified:', result.verified);
console.log('Checksum:', result.checksum);
```

#### `uploadMultipart(filePath, key, options)`

Upload large files using true multipart upload with parallel parts. Optimized for files > 100MB.

**Parameters:**
- `filePath` (string): Local file path to upload
- `key` (string): S3 key (destination path)
- `options` (object):
  - `contentType` (string): MIME type (auto-detected if not provided)
  - `onProgress` (function): Progress callback `({ percentage, loaded, total, parts })`
  - `metadata` (object): Custom metadata key-value pairs
  - `partSize` (number): Part size in bytes (default: 10MB)
  - `concurrency` (number): Concurrent part uploads (default: 5)
  - `serverSideEncryption` (boolean): Enable AES256 encryption (default: true)

**Returns:** Promise<Object>
- `location` (string): S3 URL
- `etag` (string): Multipart ETag (format: "hash-partcount")
- `bucket` (string): Bucket name
- `key` (string): S3 key
- `versionId` (string): Version ID
- `checksum` (string): Original file MD5 checksum
- `size` (number): File size in bytes
- `parts` (number): Number of parts uploaded

**Example:**

```javascript
const result = await uploadMultipart('/tmp/large_video.mp4', 'raw-footage/123/large_video.mp4', {
  onProgress: ({ percentage, loaded, total, parts }) => {
    console.log(`Progress: ${percentage}% (Part ${parts.completed}/${parts.total})`);
    console.log(`Uploaded: ${(loaded / 1024 / 1024).toFixed(2)} MB of ${(total / 1024 / 1024).toFixed(2)} MB`);
  },
  concurrency: 5,
  metadata: {
    projectId: '123',
    uploadedBy: 'user@example.com'
  }
});

console.log(`Uploaded ${result.parts} parts`);
console.log('File checksum:', result.checksum);
```

### Utility Functions

#### `withRetry(operation, retries, delay)`

Helper function to retry failed operations with exponential backoff.

**Parameters:**
- `operation` (Function): Async function to retry
- `retries` (number): Number of retries (default: 3)
- `delay` (number): Initial delay in ms (default: 1000)

**Returns:** Promise<any> - Operation result

**Example:**

```javascript
const result = await withRetry(async () => {
  return await s3.putObject(params).promise();
}, 3, 1000);
```

#### `generateS3Key(category, projectId, fileName)`

Generate S3 key following the bucket structure convention.

**Parameters:**
- `category` (string): File category ('RAW_FOOTAGE', 'EDITS', 'FINALS', 'THUMBNAILS', 'REFERENCE')
- `projectId` (number): Project ID
- `fileName` (string): Original file name

**Returns:** string - S3 key

**Example:**

```javascript
const key = generateS3Key('RAW_FOOTAGE', 123, 'video.mp4');
// Returns: 'raw-footage/123/video.mp4'

const editKey = generateS3Key('EDITS', 456, 'draft_v1.mp4');
// Returns: 'edits/456/draft_v1.mp4'
```

#### `detectContentType(fileName)`

Auto-detect MIME type from file extension.

**Returns:** string - MIME type

**Example:**

```javascript
detectContentType('video.mp4');      // 'video/mp4'
detectContentType('audio.wav');      // 'audio/wav'
detectContentType('thumbnail.jpg');  // 'image/jpeg'
detectContentType('unknown.xyz');    // 'application/octet-stream'
```

#### `testConnection()`

Test S3 connection and permissions.

**Returns:** Promise<Object>
- `configured` (boolean): Configuration valid
- `canList` (boolean): List permission
- `canRead` (boolean): Read permission
- `canWrite` (boolean): Write permission
- `canDelete` (boolean): Delete permission
- `errors` (Array<Object>): Any errors encountered

**Example:**

```javascript
const test = await testConnection();

console.log('S3 Configuration:', test.configured ? 'OK' : 'FAILED');
console.log('Permissions:', {
  list: test.canList,
  read: test.canRead,
  write: test.canWrite,
  delete: test.canDelete
});

if (test.errors.length > 0) {
  console.error('Errors:', test.errors);
}
```

## Complete Usage Examples

### Example 1: File Upload Controller

```javascript
const express = require('express');
const multer = require('multer');
const path = require('path');
const {
  uploadLargeFile,
  generateS3Key,
  getFileMetadata
} = require('../utils/awsS3Client');
const { ProjectFile } = require('../models');

const router = express.Router();
const upload = multer({ dest: '/tmp/uploads/' });

// Upload RAW footage
router.post('/projects/:id/files/upload', upload.single('file'), async (req, res) => {
  const { id: projectId } = req.params;
  const { file } = req;

  try {
    // Generate S3 key
    const s3Key = generateS3Key('RAW_FOOTAGE', projectId, file.originalname);

    // Create database record
    const fileRecord = await ProjectFile.create({
      project_id: projectId,
      file_category: 'RAW_FOOTAGE',
      file_name: file.originalname,
      file_path: s3Key,
      file_size_bytes: file.size,
      upload_status: 'IN_PROGRESS',
      upload_progress: 0
    });

    // Upload to S3 with progress tracking
    const result = await uploadLargeFile(file.path, s3Key, {
      onProgress: async ({ percentage }) => {
        await ProjectFile.update(
          { upload_progress: percentage },
          { where: { file_id: fileRecord.file_id } }
        );
      },
      metadata: {
        projectId: projectId.toString(),
        uploadedBy: req.user.email,
        originalName: file.originalname
      }
    });

    // Update record with completion
    await ProjectFile.update(
      {
        upload_status: 'COMPLETED',
        upload_progress: 100,
        s3_location: result.location,
        s3_etag: result.etag
      },
      { where: { file_id: fileRecord.file_id } }
    );

    // Clean up temp file
    fs.unlinkSync(file.path);

    res.json({
      success: true,
      file: fileRecord,
      s3Location: result.location
    });
  } catch (error) {
    console.error('Upload failed:', error);

    // Update status to failed
    if (fileRecord) {
      await ProjectFile.update(
        { upload_status: 'FAILED' },
        { where: { file_id: fileRecord.file_id } }
      );
    }

    res.status(500).json({
      success: false,
      message: 'Upload failed',
      error: error.message
    });
  }
});

module.exports = router;
```

### Example 2: Generate Download Link

```javascript
router.get('/projects/:projectId/files/:fileId/download', async (req, res) => {
  const { projectId, fileId } = req.params;

  try {
    // Get file record
    const file = await ProjectFile.findOne({
      where: {
        file_id: fileId,
        project_id: projectId
      }
    });

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Generate 1-hour presigned download URL
    const downloadUrl = await getSignedDownloadUrl(
      file.file_path,
      3600,
      {
        responseContentDisposition: `attachment; filename="${file.file_name}"`
      }
    );

    res.json({
      downloadUrl,
      fileName: file.file_name,
      fileSize: file.file_size_bytes,
      expiresIn: 3600
    });
  } catch (error) {
    console.error('Failed to generate download URL:', error);
    res.status(500).json({ error: 'Failed to generate download URL' });
  }
});
```

### Example 3: Client-Side Direct Upload

```javascript
// Backend: Generate presigned URL
router.post('/projects/:id/files/presigned-upload', async (req, res) => {
  const { id: projectId } = req.params;
  const { fileName, fileSize, fileType } = req.body;

  try {
    const s3Key = generateS3Key('RAW_FOOTAGE', projectId, fileName);

    const uploadUrl = await getSignedUploadUrl(s3Key, fileType, 3600, {
      metadata: {
        projectId: projectId.toString(),
        uploadedBy: req.user.email
      }
    });

    res.json({
      uploadUrl: uploadUrl.url,
      method: uploadUrl.method,
      headers: uploadUrl.headers,
      s3Key
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Frontend: Upload directly to S3
async function uploadToS3(file) {
  // Get presigned URL from backend
  const response = await fetch(`/v1/projects/123/files/presigned-upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type
    })
  });

  const { uploadUrl, method, headers, s3Key } = await response.json();

  // Upload directly to S3
  const uploadResponse = await fetch(uploadUrl, {
    method,
    headers,
    body: file
  });

  if (uploadResponse.ok) {
    // Notify backend of completion
    await fetch(`/v1/projects/123/files/complete-upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ s3Key })
    });
  }
}
```

### Example 4: Project File Management

```javascript
// Delete all draft files for a project
router.delete('/projects/:id/files/drafts', async (req, res) => {
  const { id: projectId } = req.params;

  try {
    // Get all draft files
    const draftFiles = await ProjectFile.findAll({
      where: {
        project_id: projectId,
        file_category: 'EDIT_DRAFT'
      }
    });

    const keys = draftFiles.map(f => f.file_path);

    // Delete from S3
    const result = await deleteFiles(keys);

    // Delete from database
    await ProjectFile.destroy({
      where: {
        file_id: draftFiles.map(f => f.file_id)
      }
    });

    res.json({
      deleted: result.deleted.length,
      errors: result.errors.length,
      details: result
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

## Error Handling

All functions throw errors that should be caught and handled:

```javascript
try {
  const result = await uploadLargeFile(filePath, key);
} catch (error) {
  if (error.message.includes('File not found')) {
    // Handle missing file
  } else if (error.message.includes('Missing required AWS configuration')) {
    // Handle configuration error
  } else if (error.code === 'NoSuchBucket') {
    // Handle bucket not found
  } else if (error.code === 'AccessDenied') {
    // Handle permission error
  } else {
    // Generic error handling
    console.error('S3 operation failed:', error);
  }
}
```

## Security Best Practices

1. **Environment Variables**: Never commit AWS credentials to version control
2. **IAM Permissions**: Use least-privilege principle for IAM policies
3. **Presigned URLs**: Set appropriate expiration times (1 hour default)
4. **Encryption**: All uploads use server-side encryption (AES256) by default
5. **Validation**: Always validate file types and sizes on server-side
6. **Access Control**: Validate user permissions before generating download URLs

## Performance Considerations

1. **Large Files**: Automatic multipart upload for files >100MB
2. **Chunk Size**: 10MB chunks for optimal performance
3. **Retries**: Automatic retry with exponential backoff (max 3 retries)
4. **Progress Throttling**: Progress updates throttled to prevent excessive database writes
5. **Batch Operations**: Use `deleteFiles()` for bulk deletions (up to 1000 files)

## Testing

Test S3 connection and permissions:

```javascript
const { testConnection } = require('./utils/awsS3Client');

async function checkS3Setup() {
  const result = await testConnection();

  if (!result.configured) {
    console.error('AWS configuration missing');
    return;
  }

  if (!result.canWrite || !result.canRead) {
    console.error('Insufficient S3 permissions');
    console.error('Errors:', result.errors);
    return;
  }

  console.log('S3 setup verified successfully');
}
```

## Migration Notes

If migrating from Digital Ocean Spaces or another S3-compatible service:

1. Update endpoint configuration in the S3 instance
2. Ensure bucket naming conventions match
3. Test CORS settings if using presigned URLs
4. Verify IAM/access key permissions

## File Validation Module

The `fileValidation.js` module provides comprehensive validation for media files before upload.

### Import

```javascript
const {
  validateVideoFile,
  validateAudioFile,
  validateImageFile,
  validateFile,
  getMediaMetadata,
  validateFileSize,
  validateMimeType
} = require('./utils/fileValidation');
```

### Video Validation

```javascript
const result = await validateVideoFile('/tmp/uploads/video.mp4', {
  category: 'RAW_FOOTAGE',
  checkResolution: true,
  checkCodec: true,
  checkFrameRate: true,
  minFrameRate: 23.976
});

if (result.valid) {
  console.log('Video is valid');
  console.log('Resolution:', result.metadata.video.resolution);
  console.log('Codec:', result.metadata.video.codec);
  console.log('Frame Rate:', result.metadata.video.frameRate);
} else {
  console.error('Validation errors:', result.errors);
}

// Check warnings (non-blocking issues)
if (result.warnings.length > 0) {
  console.warn('Warnings:', result.warnings);
}
```

### Audio Validation

```javascript
const result = await validateAudioFile('/tmp/uploads/audio.wav', {
  category: 'RAW_AUDIO',
  checkSampleRate: true,
  minSampleRate: 44100,
  checkBitDepth: true,
  minBitDepth: 16
});

if (result.valid) {
  console.log('Sample Rate:', result.metadata.audio.sampleRate);
  console.log('Channels:', result.metadata.audio.channels);
  console.log('Bit Depth:', result.metadata.audio.bitDepth);
}
```

### Image Validation

```javascript
const result = await validateImageFile('/tmp/uploads/thumbnail.jpg', {
  category: 'THUMBNAILS',
  checkDimensions: true,
  minWidth: 100,
  minHeight: 100,
  maxWidth: 8192,
  maxHeight: 8192
});

if (result.valid && result.metadata.image) {
  console.log('Dimensions:', result.metadata.image.resolution);
}
```

### Automatic File Type Detection

```javascript
// Automatically detects file type and applies appropriate validation
const result = await validateFile('/tmp/uploads/file.mp4', {
  mimeType: 'video/mp4'  // Optional: validate against expected MIME type
});

console.log('File type:', result.fileType.type);
console.log('Category:', result.category);
console.log('Valid:', result.valid);
```

### Size and MIME Validation

```javascript
// Validate file size
const sizeResult = validateFileSize(5 * 1024 * 1024 * 1024, 'RAW_FOOTAGE');
console.log('Size valid:', sizeResult.valid);
console.log('Limit:', sizeResult.limitFormatted);

// Validate MIME type
const mimeResult = validateMimeType('video/mp4', 'RAW_FOOTAGE');
console.log('MIME valid:', mimeResult.valid);
console.log('Allowed types:', mimeResult.allowed);
```

### File Size Limits by Category

| Category | Size Limit |
|----------|------------|
| RAW_FOOTAGE | 50 GB |
| RAW_AUDIO | 5 GB |
| EDIT_DRAFT | 10 GB |
| EDIT_FINAL | 10 GB |
| CLIENT_DELIVERABLE | 5 GB |
| THUMBNAILS | 10 MB |
| REFERENCE | 500 MB |

### Minimum Video Resolution by Category

| Category | Minimum Resolution |
|----------|-------------------|
| RAW_FOOTAGE | 1920x1080 (1080p) |
| EDIT_DRAFT | 1280x720 (720p) |
| EDIT_FINAL | 1920x1080 (1080p) |
| CLIENT_DELIVERABLE | 1920x1080 (1080p) |

### Supported Codecs

**Video:**
- H.264, H.265/HEVC
- ProRes (all variants)
- VP9, AV1
- DNxHD, DNxHR
- MPEG-4, MJPEG

**Audio:**
- PCM (WAV variants)
- AAC, MP3, FLAC
- ALAC, Vorbis, Opus

### Integration Example

```javascript
const express = require('express');
const multer = require('multer');
const { validateFile } = require('./utils/fileValidation');
const { uploadFile, generateS3Key } = require('./utils/awsS3Client');

const router = express.Router();
const upload = multer({ dest: '/tmp/uploads/' });

router.post('/projects/:id/files/upload', upload.single('file'), async (req, res) => {
  const { id: projectId } = req.params;
  const { file } = req;
  const category = req.body.category || 'RAW_FOOTAGE';

  try {
    // Validate file before upload
    const validation = await validateFile(file.path, {
      category,
      mimeType: file.mimetype
    });

    if (!validation.valid) {
      fs.unlinkSync(file.path);
      return res.status(400).json({
        error: 'File validation failed',
        errors: validation.errors
      });
    }

    // Proceed with upload
    const key = generateS3Key(category, projectId, file.originalname);
    const result = await uploadFile(file.path, key, {
      metadata: {
        projectId: projectId.toString(),
        ...validation.metadata
      }
    });

    // Clean up
    fs.unlinkSync(file.path);

    res.json({
      success: true,
      file: result,
      validation: {
        warnings: validation.warnings,
        metadata: validation.metadata
      }
    });
  } catch (error) {
    fs.unlinkSync(file.path);
    res.status(500).json({ error: error.message });
  }
});
```

### ffprobe Requirement

The file validation module uses ffprobe for detailed metadata extraction. If ffprobe is not available:
- Basic file validation (size, extension) still works
- Detailed metadata (resolution, codec, frame rate) is not available
- A warning is added to the validation result

To install ffprobe:

```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt-get install ffmpeg

# Windows
# Download from https://ffmpeg.org/download.html
```

## Support

For issues or questions:
- Check AWS S3 documentation: https://docs.aws.amazon.com/s3/
- Review IAM permissions
- Test connection using `testConnection()`
- Check CloudWatch logs for AWS API errors
