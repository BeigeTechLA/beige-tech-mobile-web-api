/**
 * Project Files Controller
 *
 * Handles chunked file uploads, file management, and S3 integration
 * for project media files.
 */

const db = require('../models');
const { Op } = require('sequelize');
const constants = require('../utils/constants');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { promisify } = require('util');
const stateMachineService = require('../services/stateMachine.service');
const { PROJECT_STATES, ROLES } = require('../config/stateTransitions');

const mkdir = promisify(fs.mkdir);
const writeFile = promisify(fs.writeFile);
const readFile = promisify(fs.readFile);
const unlink = promisify(fs.unlink);
const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);
const rmdir = promisify(fs.rmdir);

// ============================================================================
// CONFIGURATION
// ============================================================================

// Default chunk size: 5MB (can be overridden in request)
const DEFAULT_CHUNK_SIZE = 5 * 1024 * 1024;
const MAX_CHUNK_SIZE = 50 * 1024 * 1024; // 50MB max
const TEMP_UPLOAD_DIR = process.env.TEMP_UPLOAD_DIR || '/tmp/revure-uploads';

// File validation rules by category
const FILE_VALIDATION_RULES = {
  RAW_FOOTAGE: {
    allowedExtensions: ['.mp4', '.mov', '.avi', '.mkv', '.mxf', '.r3d', '.braw'],
    maxSize: 100 * 1024 * 1024 * 1024, // 100GB
    minResolution: { width: 1920, height: 1080 },
  },
  RAW_AUDIO: {
    allowedExtensions: ['.wav', '.aiff', '.flac', '.mp3', '.aac'],
    maxSize: 10 * 1024 * 1024 * 1024, // 10GB
  },
  EDIT_DRAFT: {
    allowedExtensions: ['.mp4', '.mov', '.prproj', '.aep'],
    maxSize: 50 * 1024 * 1024 * 1024, // 50GB
  },
  EDIT_REVISION: {
    allowedExtensions: ['.mp4', '.mov'],
    maxSize: 50 * 1024 * 1024 * 1024,
  },
  EDIT_FINAL: {
    allowedExtensions: ['.mp4', '.mov', '.mxf'],
    maxSize: 50 * 1024 * 1024 * 1024,
  },
  CLIENT_DELIVERABLE: {
    allowedExtensions: ['.mp4', '.mov', '.zip'],
    maxSize: 100 * 1024 * 1024 * 1024,
  },
  THUMBNAIL: {
    allowedExtensions: ['.jpg', '.jpeg', '.png', '.webp'],
    maxSize: 50 * 1024 * 1024, // 50MB
  },
  REFERENCE_MATERIAL: {
    allowedExtensions: ['.jpg', '.jpeg', '.png', '.pdf', '.doc', '.docx', '.mp4', '.mov'],
    maxSize: 5 * 1024 * 1024 * 1024, // 5GB
  },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Map user_type to role string
 */
function mapUserTypeToRole(userType) {
  const roleMap = {
    1: ROLES.CLIENT,
    2: ROLES.CREATOR,
    3: ROLES.EDITOR,
    4: ROLES.QC,
    5: ROLES.ADMIN,
    6: ROLES.REVIEWER,
  };
  return roleMap[userType] || ROLES.CLIENT;
}

/**
 * Generate unique session ID for upload
 */
function generateSessionId() {
  return `upload_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
}

/**
 * Get temp directory path for upload session
 */
function getSessionTempPath(sessionId) {
  return path.join(TEMP_UPLOAD_DIR, sessionId);
}

/**
 * Get chunk file path
 */
function getChunkPath(sessionId, chunkIndex) {
  return path.join(getSessionTempPath(sessionId), `chunk_${String(chunkIndex).padStart(6, '0')}`);
}

/**
 * Check if user has access to project
 */
function hasProjectAccess(project, userId, userRole) {
  if ([ROLES.ADMIN, ROLES.QC, ROLES.REVIEWER].includes(userRole)) {
    return true;
  }
  return (
    project.client_user_id === userId ||
    project.assigned_creator_id === userId ||
    project.assigned_editor_id === userId ||
    project.assigned_qc_id === userId
  );
}

/**
 * Validate file based on category rules
 */
function validateFileForCategory(fileName, fileSize, category) {
  const rules = FILE_VALIDATION_RULES[category];
  if (!rules) {
    return { valid: false, error: `Unknown file category: ${category}` };
  }

  const ext = path.extname(fileName).toLowerCase();
  if (!rules.allowedExtensions.includes(ext)) {
    return {
      valid: false,
      error: `File extension ${ext} not allowed for category ${category}. Allowed: ${rules.allowedExtensions.join(', ')}`,
    };
  }

  if (fileSize > rules.maxSize) {
    const maxSizeGB = (rules.maxSize / (1024 * 1024 * 1024)).toFixed(2);
    return {
      valid: false,
      error: `File size exceeds maximum allowed size of ${maxSizeGB}GB for category ${category}`,
    };
  }

  return { valid: true };
}

/**
 * Calculate MD5 hash of file
 */
async function calculateFileHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('md5');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/**
 * Clean up temp directory recursively
 */
async function cleanupTempDirectory(dirPath) {
  try {
    const exists = fs.existsSync(dirPath);
    if (!exists) return;

    const files = await readdir(dirPath);
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const fileStat = await stat(filePath);
      if (fileStat.isDirectory()) {
        await cleanupTempDirectory(filePath);
      } else {
        await unlink(filePath);
      }
    }
    await rmdir(dirPath);
  } catch (error) {
    console.error('Error cleaning up temp directory:', error);
  }
}

// ============================================================================
// CHUNKED UPLOAD ENDPOINTS
// ============================================================================

/**
 * Initiate chunked upload
 * POST /v1/projects/:id/files/initiate-upload
 */
exports.initiateUpload = async (req, res) => {
  try {
    const { id: projectId } = req.params;
    const userId = req.user.userId;
    const userRole = mapUserTypeToRole(req.user.userTypeId);

    const {
      file_name,
      file_size,
      file_category,
      chunk_size = DEFAULT_CHUNK_SIZE,
      mime_type,
    } = req.body;

    // Validate required fields
    if (!file_name || !file_size || !file_category) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'file_name, file_size, and file_category are required',
      });
    }

    // Verify project exists
    const project = await db.projects.findOne({
      where: { project_id: projectId },
    });

    if (!project) {
      return res.status(constants.NOT_FOUND.code).json({
        success: false,
        message: 'Project not found',
      });
    }

    // Check access
    if (!hasProjectAccess(project.toJSON(), userId, userRole)) {
      return res.status(constants.FORBIDDEN.code).json({
        success: false,
        message: 'You do not have access to this project',
      });
    }

    // Validate file
    const validation = validateFileForCategory(file_name, file_size, file_category);
    if (!validation.valid) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: validation.error,
      });
    }

    // Ensure chunk size is within limits
    const finalChunkSize = Math.min(Math.max(chunk_size, 1024 * 1024), MAX_CHUNK_SIZE);
    const totalChunks = Math.ceil(file_size / finalChunkSize);

    // Generate session ID
    const sessionId = generateSessionId();

    // Create temp directory for chunks
    const sessionPath = getSessionTempPath(sessionId);
    await mkdir(sessionPath, { recursive: true });

    // Get file extension
    const fileExtension = path.extname(file_name).toLowerCase().replace('.', '');

    // Create file record with pending status
    const projectFile = await db.project_files.create({
      project_id: projectId,
      file_category,
      file_name,
      file_path: '', // Will be set after S3 upload
      file_size_bytes: file_size,
      file_extension: fileExtension,
      mime_type: mime_type || null,
      upload_status: 'PENDING',
      upload_progress: 0,
      upload_session_id: sessionId,
      uploaded_by_user_id: userId,
      validation_status: 'PENDING',
    });

    // Store session metadata (in-memory or could use Redis for production)
    const sessionMetadata = {
      session_id: sessionId,
      file_id: projectFile.file_id,
      project_id: projectId,
      file_name,
      file_size,
      file_category,
      chunk_size: finalChunkSize,
      total_chunks: totalChunks,
      uploaded_chunks: 0,
      user_id: userId,
      created_at: new Date().toISOString(),
    };

    // Store metadata in temp file
    await writeFile(
      path.join(sessionPath, 'metadata.json'),
      JSON.stringify(sessionMetadata, null, 2)
    );

    res.status(constants.CREATED.code).json({
      success: true,
      message: 'Upload session initiated',
      data: {
        session_id: sessionId,
        file_id: projectFile.file_id,
        chunk_size: finalChunkSize,
        total_chunks: totalChunks,
        file_category,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
      },
    });
  } catch (error) {
    console.error('Error initiating upload:', error);
    res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to initiate upload',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Upload a chunk
 * POST /v1/projects/:id/files/upload-chunk
 */
exports.uploadChunk = async (req, res) => {
  try {
    const { id: projectId } = req.params;
    const userId = req.user.userId;

    const {
      session_id,
      chunk_index,
      chunk_data, // Base64 encoded chunk data
      chunk_hash, // MD5 hash for verification
    } = req.body;

    // Validate required fields
    if (session_id === undefined || chunk_index === undefined || !chunk_data) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'session_id, chunk_index, and chunk_data are required',
      });
    }

    const sessionPath = getSessionTempPath(session_id);

    // Check if session exists
    if (!fs.existsSync(sessionPath)) {
      return res.status(constants.NOT_FOUND.code).json({
        success: false,
        message: 'Upload session not found or expired',
      });
    }

    // Read session metadata
    const metadataPath = path.join(sessionPath, 'metadata.json');
    const metadata = JSON.parse(await readFile(metadataPath, 'utf-8'));

    // Verify session belongs to user and project
    if (metadata.user_id !== userId || metadata.project_id !== parseInt(projectId)) {
      return res.status(constants.FORBIDDEN.code).json({
        success: false,
        message: 'Invalid upload session',
      });
    }

    // Validate chunk index
    if (chunk_index < 0 || chunk_index >= metadata.total_chunks) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: `Invalid chunk index. Must be between 0 and ${metadata.total_chunks - 1}`,
      });
    }

    // Decode chunk data
    const chunkBuffer = Buffer.from(chunk_data, 'base64');

    // Verify chunk hash if provided
    if (chunk_hash) {
      const calculatedHash = crypto.createHash('md5').update(chunkBuffer).digest('hex');
      if (calculatedHash !== chunk_hash) {
        return res.status(constants.BAD_REQUEST.code).json({
          success: false,
          message: 'Chunk hash mismatch - data may be corrupted',
        });
      }
    }

    // Write chunk to temp file
    const chunkPath = getChunkPath(session_id, chunk_index);
    await writeFile(chunkPath, chunkBuffer);

    // Update metadata
    metadata.uploaded_chunks++;
    const progress = Math.round((metadata.uploaded_chunks / metadata.total_chunks) * 100);
    await writeFile(metadataPath, JSON.stringify(metadata, null, 2));

    // Update file record progress
    await db.project_files.update(
      {
        upload_status: 'IN_PROGRESS',
        upload_progress: progress,
      },
      { where: { file_id: metadata.file_id } }
    );

    res.status(constants.OK.code).json({
      success: true,
      message: 'Chunk uploaded successfully',
      data: {
        session_id,
        chunk_index,
        uploaded_chunks: metadata.uploaded_chunks,
        total_chunks: metadata.total_chunks,
        progress,
      },
    });
  } catch (error) {
    console.error('Error uploading chunk:', error);
    res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to upload chunk',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Complete chunked upload
 * POST /v1/projects/:id/files/complete-upload
 */
exports.completeUpload = async (req, res) => {
  try {
    const { id: projectId } = req.params;
    const userId = req.user.userId;
    const userRole = mapUserTypeToRole(req.user.userTypeId);

    const { session_id, file_hash } = req.body;

    if (!session_id) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'session_id is required',
      });
    }

    const sessionPath = getSessionTempPath(session_id);

    // Check if session exists
    if (!fs.existsSync(sessionPath)) {
      return res.status(constants.NOT_FOUND.code).json({
        success: false,
        message: 'Upload session not found or expired',
      });
    }

    // Read session metadata
    const metadataPath = path.join(sessionPath, 'metadata.json');
    const metadata = JSON.parse(await readFile(metadataPath, 'utf-8'));

    // Verify session belongs to user and project
    if (metadata.user_id !== userId || metadata.project_id !== parseInt(projectId)) {
      return res.status(constants.FORBIDDEN.code).json({
        success: false,
        message: 'Invalid upload session',
      });
    }

    // Verify all chunks uploaded
    if (metadata.uploaded_chunks !== metadata.total_chunks) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: `Upload incomplete. ${metadata.uploaded_chunks}/${metadata.total_chunks} chunks uploaded`,
      });
    }

    // Get project for state transition check
    const project = await db.projects.findOne({
      where: { project_id: projectId },
    });

    if (!project) {
      return res.status(constants.NOT_FOUND.code).json({
        success: false,
        message: 'Project not found',
      });
    }

    // Merge chunks into final file
    const finalFilePath = path.join(sessionPath, 'merged_file');
    const writeStream = fs.createWriteStream(finalFilePath);

    for (let i = 0; i < metadata.total_chunks; i++) {
      const chunkPath = getChunkPath(session_id, i);
      const chunkData = await readFile(chunkPath);
      writeStream.write(chunkData);
    }
    writeStream.end();

    // Wait for write to complete
    await new Promise((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });

    // Verify file hash if provided
    const calculatedHash = await calculateFileHash(finalFilePath);
    if (file_hash && calculatedHash !== file_hash) {
      // Clean up and fail
      await cleanupTempDirectory(sessionPath);
      await db.project_files.update(
        {
          upload_status: 'FAILED',
          validation_status: 'FAILED',
          validation_errors: 'File hash mismatch after merge',
        },
        { where: { file_id: metadata.file_id } }
      );

      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'File hash mismatch - upload failed',
      });
    }

    // Generate S3 path (for now, store locally - TODO: integrate actual S3)
    const timestamp = Date.now();
    const sanitizedFileName = metadata.file_name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const s3Key = `projects/${projectId}/${metadata.file_category}/${timestamp}_${sanitizedFileName}`;

    // In production, upload to S3 here
    // For now, move to a permanent local storage location
    const permanentDir = path.join(
      process.env.UPLOAD_DIR || '/tmp/revure-storage',
      'projects',
      String(projectId),
      metadata.file_category
    );
    await mkdir(permanentDir, { recursive: true });
    const permanentPath = path.join(permanentDir, `${timestamp}_${sanitizedFileName}`);

    // Move file to permanent location
    fs.renameSync(finalFilePath, permanentPath);

    // Update file record
    const fileUpdate = {
      file_path: permanentPath, // In production: s3Key
      upload_status: 'COMPLETED',
      upload_progress: 100,
      md5_hash: calculatedHash,
      validation_status: 'PASSED', // Basic validation passed
      s3_bucket: process.env.S3_BUCKET || 'local',
      s3_region: process.env.S3_REGION || 'local',
    };

    await db.project_files.update(fileUpdate, { where: { file_id: metadata.file_id } });

    // Update project totals
    await db.projects.increment(
      {
        total_files_count: 1,
        total_raw_size_bytes: metadata.file_size,
      },
      { where: { project_id: projectId } }
    );

    // Clean up temp directory
    await cleanupTempDirectory(sessionPath);

    // Check for auto state transition (first RAW upload)
    let transitionResult = null;
    if (
      metadata.file_category === 'RAW_FOOTAGE' &&
      project.current_state === PROJECT_STATES.RAW_UPLOADED
    ) {
      // Check if this is the first completed RAW file
      const rawFilesCount = await db.project_files.count({
        where: {
          project_id: projectId,
          file_category: 'RAW_FOOTAGE',
          upload_status: 'COMPLETED',
        },
      });

      if (rawFilesCount === 1) {
        // Auto-transition to QC pending
        transitionResult = await stateMachineService.transitionState(
          projectId,
          PROJECT_STATES.RAW_TECH_QC_PENDING,
          userId,
          'First RAW file upload completed',
          { file_id: metadata.file_id }
        );
      }
    }

    // Fetch updated file record
    const updatedFile = await db.project_files.findOne({
      where: { file_id: metadata.file_id },
    });

    res.status(constants.OK.code).json({
      success: true,
      message: 'Upload completed successfully',
      data: {
        file_id: updatedFile.file_id,
        project_id: projectId,
        file_name: updatedFile.file_name,
        file_category: updatedFile.file_category,
        file_size_bytes: updatedFile.file_size_bytes,
        file_path: updatedFile.file_path,
        upload_status: updatedFile.upload_status,
        validation_status: updatedFile.validation_status,
        md5_hash: updatedFile.md5_hash,
        state_transitioned: transitionResult?.success || false,
        new_project_state: transitionResult?.project?.current_state || project.current_state,
        created_at: updatedFile.created_at,
      },
    });
  } catch (error) {
    console.error('Error completing upload:', error);
    res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to complete upload',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Cancel upload and clean up
 * POST /v1/projects/:id/files/cancel-upload
 */
exports.cancelUpload = async (req, res) => {
  try {
    const { id: projectId } = req.params;
    const userId = req.user.userId;

    const { session_id } = req.body;

    if (!session_id) {
      return res.status(constants.BAD_REQUEST.code).json({
        success: false,
        message: 'session_id is required',
      });
    }

    const sessionPath = getSessionTempPath(session_id);

    // Check if session exists
    if (!fs.existsSync(sessionPath)) {
      return res.status(constants.NOT_FOUND.code).json({
        success: false,
        message: 'Upload session not found or already cancelled',
      });
    }

    // Read session metadata
    const metadataPath = path.join(sessionPath, 'metadata.json');
    const metadata = JSON.parse(await readFile(metadataPath, 'utf-8'));

    // Verify session belongs to user and project
    if (metadata.user_id !== userId || metadata.project_id !== parseInt(projectId)) {
      return res.status(constants.FORBIDDEN.code).json({
        success: false,
        message: 'Invalid upload session',
      });
    }

    // Update file record to failed
    await db.project_files.update(
      {
        upload_status: 'FAILED',
        validation_errors: 'Upload cancelled by user',
      },
      { where: { file_id: metadata.file_id } }
    );

    // Clean up temp directory
    await cleanupTempDirectory(sessionPath);

    res.status(constants.OK.code).json({
      success: true,
      message: 'Upload cancelled and cleaned up',
      data: {
        session_id,
        file_id: metadata.file_id,
      },
    });
  } catch (error) {
    console.error('Error cancelling upload:', error);
    res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to cancel upload',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

// ============================================================================
// FILE MANAGEMENT ENDPOINTS
// ============================================================================

/**
 * Get project files
 * GET /v1/projects/:id/files
 */
exports.getProjectFiles = async (req, res) => {
  try {
    const { id: projectId } = req.params;
    const userId = req.user.userId;
    const userRole = mapUserTypeToRole(req.user.userTypeId);

    const {
      file_category,
      upload_status,
      validation_status,
      limit = 50,
      offset = 0,
    } = req.query;

    // Verify project exists
    const project = await db.projects.findOne({
      where: { project_id: projectId },
    });

    if (!project) {
      return res.status(constants.NOT_FOUND.code).json({
        success: false,
        message: 'Project not found',
      });
    }

    // Check access
    if (!hasProjectAccess(project.toJSON(), userId, userRole)) {
      return res.status(constants.FORBIDDEN.code).json({
        success: false,
        message: 'You do not have access to this project',
      });
    }

    // Build where clause
    const whereClause = {
      project_id: projectId,
      is_deleted: 0,
    };

    if (file_category) {
      whereClause.file_category = file_category;
    }

    if (upload_status) {
      whereClause.upload_status = upload_status;
    }

    if (validation_status) {
      whereClause.validation_status = validation_status;
    }

    const { count, rows: files } = await db.project_files.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: db.users,
          as: 'uploader',
          attributes: ['id', 'name', 'email'],
        },
      ],
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

    const formattedFiles = files.map((file) => {
      const fileData = file.toJSON();
      return {
        file_id: fileData.file_id,
        file_category: fileData.file_category,
        file_name: fileData.file_name,
        file_size_bytes: fileData.file_size_bytes,
        file_extension: fileData.file_extension,
        mime_type: fileData.mime_type,
        upload_status: fileData.upload_status,
        upload_progress: fileData.upload_progress,
        validation_status: fileData.validation_status,
        validation_errors: fileData.validation_errors,
        video_duration_seconds: fileData.video_duration_seconds,
        video_resolution: fileData.video_resolution,
        video_fps: fileData.video_fps,
        version_number: fileData.version_number,
        uploaded_by: fileData.uploader
          ? {
              user_id: fileData.uploader.id,
              name: fileData.uploader.name,
            }
          : null,
        created_at: fileData.created_at,
        updated_at: fileData.updated_at,
      };
    });

    res.status(constants.OK.code).json({
      success: true,
      data: {
        project_id: projectId,
        files: formattedFiles,
        pagination: {
          total: count,
          limit: parseInt(limit),
          offset: parseInt(offset),
        },
      },
    });
  } catch (error) {
    console.error('Error fetching project files:', error);
    res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to fetch project files',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Get presigned download URL for a file
 * GET /v1/projects/files/:fileId/download-url
 */
exports.getDownloadUrl = async (req, res) => {
  try {
    const { fileId } = req.params;
    const userId = req.user.userId;
    const userRole = mapUserTypeToRole(req.user.userTypeId);

    const { expires_in = 3600 } = req.query; // Default 1 hour

    // Fetch file
    const file = await db.project_files.findOne({
      where: {
        file_id: fileId,
        is_deleted: 0,
        upload_status: 'COMPLETED',
      },
      include: [
        {
          model: db.projects,
          as: 'project',
        },
      ],
    });

    if (!file) {
      return res.status(constants.NOT_FOUND.code).json({
        success: false,
        message: 'File not found or not available for download',
      });
    }

    // Check access to project
    if (!hasProjectAccess(file.project.toJSON(), userId, userRole)) {
      return res.status(constants.FORBIDDEN.code).json({
        success: false,
        message: 'You do not have access to this file',
      });
    }

    // In production, generate presigned S3 URL
    // For now, return local file path with token
    const downloadToken = crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + parseInt(expires_in) * 1000);

    // In production: Store download token in cache/DB for verification
    // For now, include file path in response

    // Log download for audit
    console.log(`[AUDIT] File download requested: file_id=${fileId}, user_id=${userId}, ip=${req.ip}`);

    res.status(constants.OK.code).json({
      success: true,
      data: {
        file_id: file.file_id,
        file_name: file.file_name,
        file_size_bytes: file.file_size_bytes,
        download_url: `/v1/projects/files/${fileId}/download?token=${downloadToken}`,
        // In production: Presigned S3 URL
        expires_at: expiresAt.toISOString(),
        expires_in: parseInt(expires_in),
      },
    });
  } catch (error) {
    console.error('Error generating download URL:', error);
    res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to generate download URL',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Soft delete a file
 * DELETE /v1/projects/files/:fileId
 */
exports.deleteFile = async (req, res) => {
  try {
    const { fileId } = req.params;
    const userId = req.user.userId;
    const userRole = mapUserTypeToRole(req.user.userTypeId);

    // Fetch file with project
    const file = await db.project_files.findOne({
      where: {
        file_id: fileId,
        is_deleted: 0,
      },
      include: [
        {
          model: db.projects,
          as: 'project',
        },
      ],
    });

    if (!file) {
      return res.status(constants.NOT_FOUND.code).json({
        success: false,
        message: 'File not found',
      });
    }

    // Check permissions - only admin or uploader can delete
    const canDelete =
      userRole === ROLES.ADMIN || file.uploaded_by_user_id === userId;

    if (!canDelete) {
      return res.status(constants.FORBIDDEN.code).json({
        success: false,
        message: 'You do not have permission to delete this file',
      });
    }

    // Soft delete
    await file.update({
      is_deleted: 1,
      deleted_at: new Date(),
      deleted_by_user_id: userId,
    });

    // Update project totals
    await db.projects.decrement(
      {
        total_files_count: 1,
        total_raw_size_bytes: file.file_size_bytes,
      },
      { where: { project_id: file.project_id } }
    );

    // In production: Schedule S3 deletion or move to archive

    res.status(constants.OK.code).json({
      success: true,
      message: 'File deleted successfully',
      data: {
        file_id: file.file_id,
        file_name: file.file_name,
        deleted_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to delete file',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Get file details
 * GET /v1/projects/files/:fileId
 */
exports.getFileDetails = async (req, res) => {
  try {
    const { fileId } = req.params;
    const userId = req.user.userId;
    const userRole = mapUserTypeToRole(req.user.userTypeId);

    // Fetch file with project
    const file = await db.project_files.findOne({
      where: {
        file_id: fileId,
        is_deleted: 0,
      },
      include: [
        {
          model: db.projects,
          as: 'project',
          attributes: ['project_id', 'project_code', 'project_name', 'client_user_id', 'assigned_creator_id', 'assigned_editor_id', 'assigned_qc_id'],
        },
        {
          model: db.users,
          as: 'uploader',
          attributes: ['id', 'name', 'email'],
        },
        {
          model: db.project_files,
          as: 'previous_version',
          attributes: ['file_id', 'file_name', 'version_number'],
        },
      ],
    });

    if (!file) {
      return res.status(constants.NOT_FOUND.code).json({
        success: false,
        message: 'File not found',
      });
    }

    // Check access to project
    if (!hasProjectAccess(file.project.toJSON(), userId, userRole)) {
      return res.status(constants.FORBIDDEN.code).json({
        success: false,
        message: 'You do not have access to this file',
      });
    }

    const fileData = file.toJSON();

    res.status(constants.OK.code).json({
      success: true,
      data: {
        file_id: fileData.file_id,
        project: {
          project_id: fileData.project.project_id,
          project_code: fileData.project.project_code,
          project_name: fileData.project.project_name,
        },
        file_category: fileData.file_category,
        file_name: fileData.file_name,
        file_size_bytes: fileData.file_size_bytes,
        file_extension: fileData.file_extension,
        mime_type: fileData.mime_type,
        upload_status: fileData.upload_status,
        upload_progress: fileData.upload_progress,
        validation_status: fileData.validation_status,
        validation_errors: fileData.validation_errors,
        video_duration_seconds: fileData.video_duration_seconds,
        video_resolution: fileData.video_resolution,
        video_fps: fileData.video_fps,
        video_codec: fileData.video_codec,
        video_bitrate_kbps: fileData.video_bitrate_kbps,
        audio_codec: fileData.audio_codec,
        audio_sample_rate: fileData.audio_sample_rate,
        audio_channels: fileData.audio_channels,
        version_number: fileData.version_number,
        replaces_file: fileData.previous_version
          ? {
              file_id: fileData.previous_version.file_id,
              file_name: fileData.previous_version.file_name,
              version_number: fileData.previous_version.version_number,
            }
          : null,
        md5_hash: fileData.md5_hash,
        sha256_hash: fileData.sha256_hash,
        uploaded_by: fileData.uploader
          ? {
              user_id: fileData.uploader.id,
              name: fileData.uploader.name,
              email: fileData.uploader.email,
            }
          : null,
        created_at: fileData.created_at,
        updated_at: fileData.updated_at,
      },
    });
  } catch (error) {
    console.error('Error fetching file details:', error);
    res.status(constants.INTERNAL_SERVER_ERROR.code).json({
      success: false,
      message: 'Failed to fetch file details',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};
