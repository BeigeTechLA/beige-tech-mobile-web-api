const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { promisify } = require('util');

// Configuration
AWS.config.update({
  region: process.env.AWS_REGION || 'us-east-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const s3 = new AWS.S3({
  apiVersion: '2006-03-01',
  signatureVersion: 'v4',
  maxRetries: 3,
  httpOptions: {
    timeout: 300000, // 5 minutes
    connectTimeout: 5000
  }
});

// Constants
const S3_BUCKET_NAME = process.env.AWS_S3_BUCKET || 'revure-projects';
const MULTIPART_THRESHOLD = 100 * 1024 * 1024; // 100MB
const PART_SIZE = 10 * 1024 * 1024; // 10MB chunks
const MAX_CONCURRENT_PARTS = 5; // Parallel part uploads
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000; // Base delay for exponential backoff

// Folder structure constants - maps file categories to S3 folder paths
const FOLDER_STRUCTURE = {
  RAW_FOOTAGE: process.env.S3_RAW_FOLDER || 'raw-footage',
  RAW_AUDIO: process.env.S3_RAW_FOLDER || 'raw-footage', // Audio stored with footage
  EDIT_DRAFT: process.env.S3_EDITS_FOLDER || 'edits',
  EDIT_FINAL: process.env.S3_FINALS_FOLDER || 'finals',
  CLIENT_DELIVERABLE: process.env.S3_FINALS_FOLDER || 'finals',
  EDITS: process.env.S3_EDITS_FOLDER || 'edits', // Legacy alias
  FINALS: process.env.S3_FINALS_FOLDER || 'finals', // Legacy alias
  THUMBNAILS: process.env.S3_THUMBNAILS_FOLDER || 'thumbnails',
  REFERENCE: process.env.S3_REFERENCE_FOLDER || 'reference'
};

/**
 * Validate S3 configuration
 * @throws {Error} If required environment variables are missing
 */
function validateConfig() {
  const required = ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'];
  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required AWS configuration: ${missing.join(', ')}`);
  }
}

/**
 * Detect MIME type from file extension
 * @param {string} fileName - File name with extension
 * @returns {string} MIME type
 */
function detectContentType(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  const contentTypes = {
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.avi': 'video/x-msvideo',
    '.mkv': 'video/x-matroska',
    '.wmv': 'video/x-ms-wmv',
    '.flv': 'video/x-flv',
    '.webm': 'video/webm',
    '.m4v': 'video/x-m4v',
    '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg',
    '.aac': 'audio/aac',
    '.flac': 'audio/flac',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.pdf': 'application/pdf',
    '.zip': 'application/zip',
    '.json': 'application/json',
    '.txt': 'text/plain'
  };

  return contentTypes[ext] || 'application/octet-stream';
}

/**
 * Generate S3 key based on folder structure
 * @param {string} category - File category (RAW_FOOTAGE, EDITS, etc.)
 * @param {number} projectId - Project ID
 * @param {string} fileName - Original file name
 * @returns {string} S3 key
 */
function generateS3Key(category, projectId, fileName) {
  const folder = FOLDER_STRUCTURE[category];
  if (!folder) {
    throw new Error(`Invalid file category: ${category}`);
  }
  return `${folder}/${projectId}/${fileName}`;
}

/**
 * Upload large file to S3 with multipart upload and progress tracking
 * @param {string} filePath - Local file path
 * @param {string} key - S3 key (path)
 * @param {Object} options - Upload options
 * @param {string} options.contentType - MIME type
 * @param {Function} options.onProgress - Progress callback (percentage, loaded, total)
 * @param {Object} options.metadata - Custom metadata
 * @param {boolean} options.serverSideEncryption - Enable AES256 encryption (default: true)
 * @returns {Promise<Object>} Upload result with Location, ETag, Bucket, Key
 */
async function uploadLargeFile(filePath, key, options = {}) {
  validateConfig();

  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const fileStream = fs.createReadStream(filePath);
  const fileStats = fs.statSync(filePath);
  const fileSize = fileStats.size;

  const uploadParams = {
    Bucket: S3_BUCKET_NAME,
    Key: key,
    Body: fileStream,
    ContentType: options.contentType || detectContentType(filePath),
    ServerSideEncryption: options.serverSideEncryption !== false ? 'AES256' : undefined,
    Metadata: options.metadata || {}
  };

  // Add content disposition for downloads
  if (options.contentDisposition) {
    uploadParams.ContentDisposition = options.contentDisposition;
  }

  let uploadedBytes = 0;
  let lastProgressUpdate = 0;

  return new Promise((resolve, reject) => {
    const upload = s3.upload(uploadParams);

    // Track progress
    upload.on('httpUploadProgress', (progress) => {
      uploadedBytes = progress.loaded;
      const percentage = Math.round((progress.loaded * 100) / progress.total);

      // Throttle progress updates (every 1% or 1MB)
      const progressDelta = percentage - lastProgressUpdate;
      const bytesDelta = progress.loaded - uploadedBytes;

      if (progressDelta >= 1 || bytesDelta >= 1024 * 1024) {
        lastProgressUpdate = percentage;

        if (options.onProgress && typeof options.onProgress === 'function') {
          options.onProgress({
            percentage,
            loaded: progress.loaded,
            total: progress.total,
            speed: calculateSpeed(progress.loaded, fileSize)
          });
        }
      }
    });

    // Complete upload
    upload.send((err, data) => {
      if (err) {
        console.error(`S3 upload failed for ${key}:`, err);
        reject(err);
      } else {
        console.log(`S3 upload successful: ${data.Location}`);
        resolve({
          location: data.Location,
          etag: data.ETag,
          bucket: data.Bucket,
          key: data.Key,
          versionId: data.VersionId
        });
      }
    });
  });
}

/**
 * Calculate upload speed estimate
 * @param {number} loaded - Bytes loaded
 * @param {number} total - Total bytes
 * @returns {string} Speed in MB/s
 */
function calculateSpeed(loaded, total) {
  const mbLoaded = (loaded / (1024 * 1024)).toFixed(2);
  return `${mbLoaded} MB`;
}

/**
 * Generate presigned URL for secure file download
 * @param {string} key - S3 key
 * @param {number} expiresIn - Expiration time in seconds (default: 1 hour)
 * @param {Object} options - Additional options
 * @param {string} options.responseContentDisposition - Force download with filename
 * @returns {Promise<string>} Presigned URL
 */
async function getSignedDownloadUrl(key, expiresIn = 3600, options = {}) {
  validateConfig();

  const params = {
    Bucket: S3_BUCKET_NAME,
    Key: key,
    Expires: expiresIn
  };

  if (options.responseContentDisposition) {
    params.ResponseContentDisposition = options.responseContentDisposition;
  }

  try {
    const url = await s3.getSignedUrlPromise('getObject', params);
    return url;
  } catch (error) {
    console.error(`Failed to generate signed download URL for ${key}:`, error);
    throw error;
  }
}

/**
 * Generate presigned URL for direct client upload to S3
 * @param {string} key - S3 key
 * @param {string} contentType - MIME type
 * @param {number} expiresIn - Expiration time in seconds (default: 1 hour)
 * @param {Object} options - Additional options
 * @param {number} options.maxFileSize - Maximum file size in bytes
 * @param {Object} options.metadata - Custom metadata
 * @returns {Promise<Object>} Presigned URL and fields for multipart form upload
 */
async function getSignedUploadUrl(key, contentType, expiresIn = 3600, options = {}) {
  validateConfig();

  const params = {
    Bucket: S3_BUCKET_NAME,
    Key: key,
    ContentType: contentType,
    Expires: expiresIn,
    ServerSideEncryption: 'AES256'
  };

  if (options.metadata) {
    params.Metadata = options.metadata;
  }

  try {
    const url = await s3.getSignedUrlPromise('putObject', params);

    return {
      url,
      method: 'PUT',
      headers: {
        'Content-Type': contentType
      },
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString()
    };
  } catch (error) {
    console.error(`Failed to generate signed upload URL for ${key}:`, error);
    throw error;
  }
}

/**
 * Generate presigned POST for browser-based multipart form upload
 * @param {string} key - S3 key
 * @param {Object} options - Upload options
 * @param {number} options.expiresIn - Expiration time in seconds (default: 1 hour)
 * @param {number} options.maxFileSize - Maximum file size in bytes
 * @param {string} options.contentType - Allowed content type
 * @returns {Promise<Object>} Presigned POST data with url and fields
 */
async function getPresignedPost(key, options = {}) {
  validateConfig();

  const expiresIn = options.expiresIn || 3600;
  const conditions = [
    { bucket: S3_BUCKET_NAME },
    ['starts-with', '$key', key.split('/').slice(0, -1).join('/') + '/'],
    { 'x-amz-server-side-encryption': 'AES256' }
  ];

  if (options.maxFileSize) {
    conditions.push(['content-length-range', 0, options.maxFileSize]);
  }

  if (options.contentType) {
    conditions.push(['starts-with', '$Content-Type', options.contentType.split('/')[0] + '/']);
  }

  const params = {
    Bucket: S3_BUCKET_NAME,
    Fields: {
      key,
      // acl: 'private',
      'x-amz-server-side-encryption': 'AES256'
    },
    Expires: expiresIn,
    Conditions: conditions
  };

  try {
    const data = await promisify(s3.createPresignedPost.bind(s3))(params);
    return {
      url: data.url,
      fields: data.fields,
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString()
    };
  } catch (error) {
    console.error(`Failed to generate presigned POST for ${key}:`, error);
    throw error;
  }
}

/**
 * Delete file from S3
 * @param {string} key - S3 key
 * @returns {Promise<Object>} Deletion result
 */
async function deleteFile(key) {
  validateConfig();

  const params = {
    Bucket: S3_BUCKET_NAME,
    Key: key
  };

  try {
    const result = await s3.deleteObject(params).promise();
    console.log(`Successfully deleted ${key} from S3`);
    return result;
  } catch (error) {
    console.error(`Failed to delete ${key} from S3:`, error);
    throw error;
  }
}

/**
 * Delete multiple files from S3
 * @param {Array<string>} keys - Array of S3 keys
 * @returns {Promise<Object>} Deletion result with deleted and errors
 */
async function deleteFiles(keys) {
  validateConfig();

  if (!Array.isArray(keys) || keys.length === 0) {
    throw new Error('Keys must be a non-empty array');
  }

  // S3 allows max 1000 objects per delete request
  const chunks = [];
  for (let i = 0; i < keys.length; i += 1000) {
    chunks.push(keys.slice(i, i + 1000));
  }

  const results = {
    deleted: [],
    errors: []
  };

  for (const chunk of chunks) {
    const params = {
      Bucket: S3_BUCKET_NAME,
      Delete: {
        Objects: chunk.map(key => ({ Key: key })),
        Quiet: false
      }
    };

    try {
      const result = await s3.deleteObjects(params).promise();

      if (result.Deleted) {
        results.deleted.push(...result.Deleted.map(d => d.Key));
      }

      if (result.Errors) {
        results.errors.push(...result.Errors.map(e => ({
          key: e.Key,
          code: e.Code,
          message: e.Message
        })));
      }
    } catch (error) {
      console.error('Failed to delete batch of files:', error);
      results.errors.push(...chunk.map(key => ({
        key,
        code: 'DELETE_FAILED',
        message: error.message
      })));
    }
  }

  console.log(`Deleted ${results.deleted.length} files, ${results.errors.length} errors`);
  return results;
}

/**
 * List files in S3 folder with pagination
 * @param {string} prefix - Folder prefix
 * @param {Object} options - List options
 * @param {number} options.maxKeys - Maximum number of keys to return (default: 1000)
 * @param {string} options.continuationToken - Token for pagination
 * @returns {Promise<Object>} List result with files and nextToken
 */
async function listFiles(prefix, options = {}) {
  validateConfig();

  const params = {
    Bucket: S3_BUCKET_NAME,
    Prefix: prefix,
    MaxKeys: options.maxKeys || 1000
  };

  if (options.continuationToken) {
    params.ContinuationToken = options.continuationToken;
  }

  try {
    const result = await s3.listObjectsV2(params).promise();

    return {
      files: result.Contents.map(file => ({
        key: file.Key,
        size: file.Size,
        lastModified: file.LastModified,
        etag: file.ETag,
        storageClass: file.StorageClass
      })),
      isTruncated: result.IsTruncated,
      nextContinuationToken: result.NextContinuationToken,
      totalCount: result.KeyCount
    };
  } catch (error) {
    console.error(`Failed to list files with prefix ${prefix}:`, error);
    throw error;
  }
}

/**
 * List all files in project folder (across all categories)
 * @param {number} projectId - Project ID
 * @returns {Promise<Object>} Files grouped by category
 */
async function listProjectFiles(projectId) {
  validateConfig();

  const results = {};

  for (const [category, folder] of Object.entries(FOLDER_STRUCTURE)) {
    const prefix = `${folder}/${projectId}/`;
    try {
      const { files } = await listFiles(prefix);
      results[category] = files;
    } catch (error) {
      console.error(`Failed to list ${category} files for project ${projectId}:`, error);
      results[category] = [];
    }
  }

  return results;
}

/**
 * Get file metadata from S3
 * @param {string} key - S3 key
 * @returns {Promise<Object>} File metadata
 */
async function getFileMetadata(key) {
  validateConfig();

  const params = {
    Bucket: S3_BUCKET_NAME,
    Key: key
  };

  try {
    const result = await s3.headObject(params).promise();

    return {
      key,
      size: result.ContentLength,
      contentType: result.ContentType,
      lastModified: result.LastModified,
      etag: result.ETag,
      versionId: result.VersionId,
      metadata: result.Metadata,
      serverSideEncryption: result.ServerSideEncryption,
      storageClass: result.StorageClass
    };
  } catch (error) {
    if (error.code === 'NotFound') {
      throw new Error(`File not found: ${key}`);
    }
    console.error(`Failed to get metadata for ${key}:`, error);
    throw error;
  }
}

/**
 * Check if file exists in S3
 * @param {string} key - S3 key
 * @returns {Promise<boolean>} True if file exists
 */
async function fileExists(key) {
  try {
    await getFileMetadata(key);
    return true;
  } catch (error) {
    if (error.message.includes('not found')) {
      return false;
    }
    throw error;
  }
}

/**
 * Copy file within S3
 * @param {string} sourceKey - Source S3 key
 * @param {string} destinationKey - Destination S3 key
 * @param {Object} options - Copy options
 * @returns {Promise<Object>} Copy result
 */
async function copyFile(sourceKey, destinationKey, options = {}) {
  validateConfig();

  const params = {
    Bucket: S3_BUCKET_NAME,
    CopySource: `${S3_BUCKET_NAME}/${sourceKey}`,
    Key: destinationKey,
    ServerSideEncryption: options.serverSideEncryption !== false ? 'AES256' : undefined,
    MetadataDirective: options.metadata ? 'REPLACE' : 'COPY',
    Metadata: options.metadata || {}
  };

  try {
    const result = await s3.copyObject(params).promise();
    console.log(`Successfully copied ${sourceKey} to ${destinationKey}`);
    return {
      etag: result.ETag,
      versionId: result.VersionId
    };
  } catch (error) {
    console.error(`Failed to copy ${sourceKey} to ${destinationKey}:`, error);
    throw error;
  }
}

/**
 * Move file within S3 (copy + delete)
 * @param {string} sourceKey - Source S3 key
 * @param {string} destinationKey - Destination S3 key
 * @returns {Promise<Object>} Move result
 */
async function moveFile(sourceKey, destinationKey) {
  validateConfig();

  try {
    // Copy file
    await copyFile(sourceKey, destinationKey);

    // Delete original
    await deleteFile(sourceKey);

    console.log(`Successfully moved ${sourceKey} to ${destinationKey}`);
    return { success: true };
  } catch (error) {
    console.error(`Failed to move ${sourceKey} to ${destinationKey}:`, error);
    throw error;
  }
}

/**
 * Calculate MD5 checksum for a file
 * @param {string} filePath - Path to the file
 * @returns {Promise<string>} MD5 checksum as hex string
 */
function calculateChecksum(filePath) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(filePath)) {
      return reject(new Error(`File not found: ${filePath}`));
    }

    const hash = crypto.createHash('md5');
    const stream = fs.createReadStream(filePath);

    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', (error) => reject(error));
  });
}

/**
 * Calculate MD5 checksum for a buffer
 * @param {Buffer} buffer - Data buffer
 * @returns {string} MD5 checksum as hex string
 */
function calculateBufferChecksum(buffer) {
  return crypto.createHash('md5').update(buffer).digest('hex');
}

/**
 * Verify uploaded file integrity by comparing checksums
 * @param {string} key - S3 key
 * @param {string} expectedChecksum - Expected MD5 checksum (hex string)
 * @returns {Promise<Object>} Verification result with match status
 */
async function verifyUpload(key, expectedChecksum) {
  validateConfig();

  try {
    const metadata = await getFileMetadata(key);

    // S3 ETag for non-multipart uploads is the MD5 hash (with quotes)
    const actualEtag = metadata.etag.replace(/"/g, '');

    // For multipart uploads, ETag format is "hash-partcount"
    const isMultipartUpload = actualEtag.includes('-');

    if (isMultipartUpload) {
      // Cannot directly verify multipart uploads via ETag
      // Return partial verification - file exists with expected size
      console.log(`Multipart upload verification: file exists at ${key}, ETag: ${actualEtag}`);
      return {
        verified: true,
        partial: true,
        message: 'Multipart upload - checksum verification not available via ETag',
        key,
        size: metadata.size,
        etag: actualEtag
      };
    }

    const checksumMatch = actualEtag.toLowerCase() === expectedChecksum.toLowerCase();

    if (!checksumMatch) {
      console.warn(`Checksum mismatch for ${key}: expected ${expectedChecksum}, got ${actualEtag}`);
    }

    return {
      verified: checksumMatch,
      partial: false,
      key,
      expectedChecksum,
      actualChecksum: actualEtag,
      size: metadata.size,
      message: checksumMatch ? 'Checksum verified' : 'Checksum mismatch - file may be corrupted'
    };
  } catch (error) {
    console.error(`Failed to verify upload for ${key}:`, error);
    return {
      verified: false,
      partial: false,
      key,
      error: error.message,
      message: 'Verification failed'
    };
  }
}

/**
 * Helper function to retry failed operations with exponential backoff
 * @param {Function} operation - Async function to retry
 * @param {number} retries - Number of retries (default: MAX_RETRIES)
 * @param {number} delay - Initial delay in ms (default: RETRY_DELAY_MS)
 * @returns {Promise<any>} Operation result
 */
async function withRetry(operation, retries = MAX_RETRIES, delay = RETRY_DELAY_MS) {
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      // Do not retry on non-retryable errors
      if (error.code === 'AccessDenied' || error.code === 'NoSuchBucket') {
        throw error;
      }

      if (attempt < retries) {
        const backoffDelay = delay * Math.pow(2, attempt - 1);
        console.log(`Retry attempt ${attempt}/${retries} after ${backoffDelay}ms: ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
      }
    }
  }

  throw lastError;
}

/**
 * Upload small file to S3 (< 100MB)
 * For larger files, use uploadLargeFile or uploadMultipart
 * @param {string} filePath - Local file path
 * @param {string} key - S3 key (path)
 * @param {Object} options - Upload options
 * @param {string} options.contentType - MIME type
 * @param {Object} options.metadata - Custom metadata
 * @param {boolean} options.serverSideEncryption - Enable AES256 encryption (default: true)
 * @param {boolean} options.verifyChecksum - Verify upload integrity (default: true)
 * @returns {Promise<Object>} Upload result with Location, ETag, checksum
 */
async function uploadFile(filePath, key, options = {}) {
  validateConfig();

  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const fileStats = fs.statSync(filePath);
  const fileSize = fileStats.size;

  // Redirect to multipart upload for large files
  if (fileSize > MULTIPART_THRESHOLD) {
    console.log(`File size ${fileSize} exceeds threshold, using multipart upload`);
    return uploadMultipart(filePath, key, options);
  }

  // Calculate checksum before upload
  const checksum = await calculateChecksum(filePath);
  const fileContent = fs.readFileSync(filePath);

  const uploadParams = {
    Bucket: S3_BUCKET_NAME,
    Key: key,
    Body: fileContent,
    ContentType: options.contentType || detectContentType(filePath),
    ContentMD5: Buffer.from(checksum, 'hex').toString('base64'),
    ServerSideEncryption: options.serverSideEncryption !== false ? 'AES256' : undefined,
    Metadata: {
      ...options.metadata,
      'original-checksum': checksum,
      'original-filename': path.basename(filePath)
    }
  };

  if (options.contentDisposition) {
    uploadParams.ContentDisposition = options.contentDisposition;
  }

  try {
    const result = await withRetry(async () => {
      return await s3.putObject(uploadParams).promise();
    });

    console.log(`S3 upload successful: ${key}`);

    const uploadResult = {
      location: `https://${S3_BUCKET_NAME}.s3.amazonaws.com/${key}`,
      etag: result.ETag,
      bucket: S3_BUCKET_NAME,
      key,
      versionId: result.VersionId,
      checksum,
      size: fileSize
    };

    // Verify upload integrity if requested
    if (options.verifyChecksum !== false) {
      const verification = await verifyUpload(key, checksum);
      uploadResult.verified = verification.verified;

      if (!verification.verified && !verification.partial) {
        console.error(`Upload verification failed for ${key}`);
        throw new Error(`Upload verification failed: ${verification.message}`);
      }
    }

    return uploadResult;
  } catch (error) {
    console.error(`S3 upload failed for ${key}:`, error);
    throw error;
  }
}

/**
 * Upload large file using true multipart upload with parallel parts
 * Optimized for files > 100MB
 * @param {string} filePath - Local file path
 * @param {string} key - S3 key (path)
 * @param {Object} options - Upload options
 * @param {string} options.contentType - MIME type
 * @param {Function} options.onProgress - Progress callback ({ percentage, loaded, total, parts })
 * @param {Object} options.metadata - Custom metadata
 * @param {number} options.partSize - Part size in bytes (default: 10MB)
 * @param {number} options.concurrency - Concurrent part uploads (default: 5)
 * @returns {Promise<Object>} Upload result
 */
async function uploadMultipart(filePath, key, options = {}) {
  validateConfig();

  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const fileStats = fs.statSync(filePath);
  const fileSize = fileStats.size;
  const partSize = options.partSize || PART_SIZE;
  const concurrency = options.concurrency || MAX_CONCURRENT_PARTS;
  const contentType = options.contentType || detectContentType(filePath);

  // Calculate checksum for the entire file
  const fileChecksum = await calculateChecksum(filePath);

  // Initialize multipart upload
  const createParams = {
    Bucket: S3_BUCKET_NAME,
    Key: key,
    ContentType: contentType,
    ServerSideEncryption: options.serverSideEncryption !== false ? 'AES256' : undefined,
    Metadata: {
      ...options.metadata,
      'original-checksum': fileChecksum,
      'original-filename': path.basename(filePath)
    }
  };

  let uploadId;

  try {
    const createResult = await s3.createMultipartUpload(createParams).promise();
    uploadId = createResult.UploadId;
    console.log(`Initiated multipart upload: ${uploadId}`);
  } catch (error) {
    console.error(`Failed to initiate multipart upload for ${key}:`, error);
    throw error;
  }

  // Calculate number of parts
  const numParts = Math.ceil(fileSize / partSize);
  const completedParts = [];
  let uploadedBytes = 0;

  // Create array of part upload tasks
  const partTasks = [];
  for (let partNumber = 1; partNumber <= numParts; partNumber++) {
    const start = (partNumber - 1) * partSize;
    const end = Math.min(start + partSize, fileSize);

    partTasks.push({
      partNumber,
      start,
      end,
      size: end - start
    });
  }

  // Upload parts in parallel with limited concurrency
  const uploadPart = async (task) => {
    const { partNumber, start, end, size } = task;

    // Read file chunk
    const buffer = Buffer.alloc(size);
    const fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, buffer, 0, size, start);
    fs.closeSync(fd);

    const partParams = {
      Bucket: S3_BUCKET_NAME,
      Key: key,
      PartNumber: partNumber,
      UploadId: uploadId,
      Body: buffer,
      ContentLength: size
    };

    try {
      const result = await withRetry(async () => {
        return await s3.uploadPart(partParams).promise();
      });

      uploadedBytes += size;

      // Report progress
      if (options.onProgress && typeof options.onProgress === 'function') {
        const percentage = Math.round((uploadedBytes * 100) / fileSize);
        options.onProgress({
          percentage,
          loaded: uploadedBytes,
          total: fileSize,
          parts: {
            completed: completedParts.length + 1,
            total: numParts
          }
        });
      }

      return {
        PartNumber: partNumber,
        ETag: result.ETag
      };
    } catch (error) {
      console.error(`Failed to upload part ${partNumber}:`, error);
      throw error;
    }
  };

  try {
    // Process parts in batches for controlled concurrency
    for (let i = 0; i < partTasks.length; i += concurrency) {
      const batch = partTasks.slice(i, i + concurrency);
      const batchResults = await Promise.all(batch.map(uploadPart));
      completedParts.push(...batchResults);
    }

    // Sort parts by part number (required by S3)
    completedParts.sort((a, b) => a.PartNumber - b.PartNumber);

    // Complete multipart upload
    const completeParams = {
      Bucket: S3_BUCKET_NAME,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: completedParts
      }
    };

    const completeResult = await s3.completeMultipartUpload(completeParams).promise();
    console.log(`Completed multipart upload: ${completeResult.Location}`);

    return {
      location: completeResult.Location,
      etag: completeResult.ETag,
      bucket: completeResult.Bucket,
      key: completeResult.Key,
      versionId: completeResult.VersionId,
      checksum: fileChecksum,
      size: fileSize,
      parts: numParts
    };
  } catch (error) {
    // Abort multipart upload on failure
    console.error(`Multipart upload failed, aborting: ${error.message}`);

    try {
      await s3.abortMultipartUpload({
        Bucket: S3_BUCKET_NAME,
        Key: key,
        UploadId: uploadId
      }).promise();
      console.log(`Aborted multipart upload: ${uploadId}`);
    } catch (abortError) {
      console.error(`Failed to abort multipart upload: ${abortError.message}`);
    }

    throw error;
  }
}

/**
 * Get bucket CORS configuration
 * @returns {Promise<Object>} CORS configuration
 */
async function getBucketCORS() {
  validateConfig();

  const params = {
    Bucket: S3_BUCKET_NAME
  };

  try {
    const result = await s3.getBucketCors(params).promise();
    return result.CORSRules;
  } catch (error) {
    console.error('Failed to get bucket CORS:', error);
    throw error;
  }
}

/**
 * Test S3 connection and permissions
 * @returns {Promise<Object>} Test result with status and capabilities
 */
async function testConnection() {
  const results = {
    configured: false,
    canList: false,
    canRead: false,
    canWrite: false,
    canDelete: false,
    errors: []
  };

  try {
    validateConfig();
    results.configured = true;
  } catch (error) {
    results.errors.push({ operation: 'config', message: error.message });
    return results;
  }

  const testKey = `test/${Date.now()}-test.txt`;
  const testContent = 'S3 connection test';

  try {
    // Test list
    await s3.listObjectsV2({ Bucket: S3_BUCKET_NAME, MaxKeys: 1 }).promise();
    results.canList = true;
  } catch (error) {
    results.errors.push({ operation: 'list', message: error.message });
  }

  try {
    // Test write
    await s3.putObject({
      Bucket: S3_BUCKET_NAME,
      Key: testKey,
      Body: testContent,
      ServerSideEncryption: 'AES256'
    }).promise();
    results.canWrite = true;

    // Test read
    const readResult = await s3.getObject({
      Bucket: S3_BUCKET_NAME,
      Key: testKey
    }).promise();

    if (readResult.Body.toString() === testContent) {
      results.canRead = true;
    }

    // Test delete
    await s3.deleteObject({
      Bucket: S3_BUCKET_NAME,
      Key: testKey
    }).promise();
    results.canDelete = true;
  } catch (error) {
    results.errors.push({ operation: 'write/read/delete', message: error.message });
  }

  return results;
}

module.exports = {
  // Core S3 instance
  s3,

  // Configuration
  S3_BUCKET_NAME,
  FOLDER_STRUCTURE,
  MULTIPART_THRESHOLD,
  PART_SIZE,
  validateConfig,

  // Upload operations
  uploadFile,
  uploadLargeFile,
  uploadMultipart,
  getSignedUploadUrl,
  getPresignedPost,

  // Download operations
  getSignedDownloadUrl,

  // File management
  deleteFile,
  deleteFiles,
  copyFile,
  moveFile,

  // Listing operations
  listFiles,
  listProjectFiles,

  // Metadata operations
  getFileMetadata,
  fileExists,

  // Checksum and verification
  calculateChecksum,
  calculateBufferChecksum,
  verifyUpload,

  // Utilities
  generateS3Key,
  detectContentType,
  getBucketCORS,
  testConnection,
  withRetry
};
