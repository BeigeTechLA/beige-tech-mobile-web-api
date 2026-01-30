# AWS S3 Client - Quick Start Guide

## Installation Steps

### 1. Install AWS SDK

```bash
cd /Users/amrik/Documents/revure/revure-v2-backend
yarn add aws-sdk
```

### 2. Configure Environment Variables

Copy the example environment file if you haven't already:

```bash
cp .env.example .env
```

Add your AWS credentials to `.env`:

```bash
# AWS S3 Configuration
AWS_REGION=us-east-1
AWS_S3_BUCKET=revure-projects
AWS_ACCESS_KEY_ID=your_actual_access_key_id
AWS_SECRET_ACCESS_KEY=your_actual_secret_access_key

# S3 Folder Structure (optional - uses defaults if not set)
S3_RAW_FOLDER=raw-footage
S3_EDITS_FOLDER=edits
S3_FINALS_FOLDER=finals
S3_THUMBNAILS_FOLDER=thumbnails
S3_REFERENCE_FOLDER=reference
```

### 3. Create S3 Bucket (if not exists)

Using AWS Console or AWS CLI:

```bash
aws s3 mb s3://revure-projects --region us-east-1
```

### 4. Set Bucket Permissions

Ensure your IAM user has these permissions:

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

### 5. Verify Setup

Run the verification script:

```bash
node scripts/verify-s3-setup.js
```

This will check:
- AWS SDK installation
- Environment variable configuration
- S3 connection
- Bucket permissions (list, read, write, delete)

## Quick Usage Example

```javascript
const {
  uploadLargeFile,
  getSignedDownloadUrl,
  generateS3Key,
  listProjectFiles
} = require('./src/utils/awsS3Client');

// Upload a file
const s3Key = generateS3Key('RAW_FOOTAGE', 123, 'video.mp4');
const result = await uploadLargeFile('/tmp/video.mp4', s3Key, {
  onProgress: ({ percentage }) => {
    console.log(`Upload progress: ${percentage}%`);
  }
});

// Generate download link
const downloadUrl = await getSignedDownloadUrl(s3Key, 3600);

// List all files for a project
const files = await listProjectFiles(123);
console.log('Raw footage:', files.RAW_FOOTAGE.length);
```

## Documentation

Full API documentation: `/Users/amrik/Documents/revure/revure-v2-backend/src/utils/AWS_S3_CLIENT_README.md`

## Files Created

1. **`/src/utils/awsS3Client.js`** - Main S3 client utility (850+ lines)
   - Upload operations (multipart, presigned URLs)
   - Download operations (presigned URLs)
   - File management (delete, copy, move)
   - Listing and metadata operations
   - Full error handling and retry logic

2. **`/src/utils/AWS_S3_CLIENT_README.md`** - Comprehensive documentation
   - Complete API reference
   - Usage examples
   - Security best practices
   - Error handling guide

3. **`/scripts/verify-s3-setup.js`** - Setup verification script
   - Checks installation and configuration
   - Tests S3 permissions
   - Displays bucket structure

4. **`.env.example`** - Updated with AWS configuration variables

## Bucket Structure

```
revure-projects/
├── raw-footage/{project_id}/
│   └── video files uploaded by creators
├── edits/{project_id}/
│   └── draft versions and revisions
├── finals/{project_id}/
│   └── final deliverables
├── thumbnails/{project_id}/
│   └── preview thumbnails
└── reference/{project_id}/
    └── client reference materials
```

## Security Features

- Server-side encryption (AES256) enabled by default
- Presigned URLs expire after 1 hour (configurable)
- No public bucket access - all downloads via signed URLs
- Automatic retry with exponential backoff (max 3 retries)
- Comprehensive error handling

## Performance Features

- Automatic multipart upload for files >100MB
- 10MB chunk size for optimal performance
- Progress tracking with throttling
- Batch operations for bulk deletions (up to 1000 files)
- Connection pooling and timeout configuration

## Next Steps

1. **Install Dependencies**: `yarn add aws-sdk`
2. **Configure Environment**: Update `.env` with AWS credentials
3. **Verify Setup**: `node scripts/verify-s3-setup.js`
4. **Read Documentation**: Review `src/utils/AWS_S3_CLIENT_README.md`
5. **Integrate into Controllers**: Use in your file upload/download endpoints

## Support

Reference the implementation plan:
`/Users/amrik/.claude/plans/rippling-sprouting-prism.md` (Section 3: AWS S3 Configuration)

For AWS-specific issues:
- AWS S3 Documentation: https://docs.aws.amazon.com/s3/
- AWS IAM Permissions: https://docs.aws.amazon.com/IAM/latest/UserGuide/
- AWS SDK for JavaScript: https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/
