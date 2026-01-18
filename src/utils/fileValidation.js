/**
 * File Validation Utilities for CMS Approval States
 *
 * Provides validation for video, audio, and image files including:
 * - Resolution and codec verification
 * - File size limits
 * - MIME type validation
 * - Media metadata extraction via ffprobe
 *
 * @module fileValidation
 */

const { exec, spawn } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');

const execAsync = promisify(exec);

// File size limits by category (in bytes)
const FILE_SIZE_LIMITS = {
  RAW_FOOTAGE: 50 * 1024 * 1024 * 1024, // 50GB max for raw footage
  RAW_AUDIO: 5 * 1024 * 1024 * 1024,    // 5GB max for raw audio
  EDIT_DRAFT: 10 * 1024 * 1024 * 1024,  // 10GB max for draft edits
  EDIT_FINAL: 10 * 1024 * 1024 * 1024,  // 10GB max for final edits
  CLIENT_DELIVERABLE: 5 * 1024 * 1024 * 1024, // 5GB max for deliverables
  THUMBNAILS: 10 * 1024 * 1024,          // 10MB max for thumbnails
  REFERENCE: 500 * 1024 * 1024           // 500MB max for reference files
};

// Minimum video resolution requirements (width x height)
const MIN_VIDEO_RESOLUTION = {
  RAW_FOOTAGE: { width: 1920, height: 1080 },    // 1080p minimum
  EDIT_DRAFT: { width: 1280, height: 720 },      // 720p minimum
  EDIT_FINAL: { width: 1920, height: 1080 },     // 1080p minimum
  CLIENT_DELIVERABLE: { width: 1920, height: 1080 } // 1080p minimum
};

// Supported video codecs
const SUPPORTED_VIDEO_CODECS = [
  'h264',
  'h265', 'hevc',
  'prores', 'prores_ks', 'prores_aw',
  'vp9',
  'av1',
  'dnxhd', 'dnxhr',
  'mpeg4',
  'mjpeg'
];

// Supported audio codecs
const SUPPORTED_AUDIO_CODECS = [
  'pcm_s16le', 'pcm_s24le', 'pcm_s32le', // WAV variants
  'pcm_s16be', 'pcm_s24be', 'pcm_s32be',
  'aac',
  'mp3', 'libmp3lame',
  'flac',
  'alac',
  'vorbis',
  'opus'
];

// MIME type mappings by category
const MIME_TYPES = {
  video: [
    'video/mp4',
    'video/quicktime',
    'video/x-msvideo',
    'video/x-matroska',
    'video/webm',
    'video/x-m4v',
    'video/mpeg',
    'video/x-ms-wmv',
    'video/x-flv',
    'video/3gpp',
    'application/mxf' // Professional video format
  ],
  audio: [
    'audio/wav',
    'audio/x-wav',
    'audio/wave',
    'audio/aiff',
    'audio/x-aiff',
    'audio/mpeg',
    'audio/mp3',
    'audio/aac',
    'audio/x-m4a',
    'audio/flac',
    'audio/ogg',
    'audio/opus'
  ],
  image: [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/tiff',
    'image/bmp',
    'image/heic',
    'image/heif',
    'image/raw',
    'image/x-raw',
    'image/x-canon-cr2',
    'image/x-nikon-nef',
    'image/x-sony-arw',
    'image/x-adobe-dng'
  ]
};

// Allowed MIME types by file category
const CATEGORY_MIME_TYPES = {
  RAW_FOOTAGE: [...MIME_TYPES.video],
  RAW_AUDIO: [...MIME_TYPES.audio],
  EDIT_DRAFT: [...MIME_TYPES.video],
  EDIT_FINAL: [...MIME_TYPES.video],
  CLIENT_DELIVERABLE: [...MIME_TYPES.video, ...MIME_TYPES.audio, ...MIME_TYPES.image],
  THUMBNAILS: [...MIME_TYPES.image],
  REFERENCE: [...MIME_TYPES.video, ...MIME_TYPES.audio, ...MIME_TYPES.image, 'application/pdf']
};

/**
 * Check if ffprobe is available on the system
 * @returns {Promise<boolean>} True if ffprobe is available
 */
async function isFFprobeAvailable() {
  try {
    await execAsync('ffprobe -version');
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Get media metadata using ffprobe
 * @param {string} filePath - Path to the media file
 * @returns {Promise<Object>} Media metadata including streams, format, duration, etc.
 */
async function getMediaMetadata(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const ffprobeAvailable = await isFFprobeAvailable();
  if (!ffprobeAvailable) {
    // Return basic file info if ffprobe is not available
    const stats = fs.statSync(filePath);
    const ext = path.extname(filePath).toLowerCase();

    return {
      ffprobeAvailable: false,
      file: {
        path: filePath,
        name: path.basename(filePath),
        size: stats.size,
        extension: ext
      },
      format: {
        filename: path.basename(filePath),
        size: stats.size.toString()
      },
      streams: [],
      warning: 'ffprobe not available - limited metadata extraction'
    };
  }

  try {
    const command = `ffprobe -v quiet -print_format json -show_format -show_streams "${filePath}"`;
    const { stdout } = await execAsync(command, { maxBuffer: 10 * 1024 * 1024 });
    const metadata = JSON.parse(stdout);

    // Parse video streams
    const videoStreams = metadata.streams?.filter(s => s.codec_type === 'video') || [];
    const audioStreams = metadata.streams?.filter(s => s.codec_type === 'audio') || [];

    // Extract primary video stream info
    const primaryVideo = videoStreams[0];
    const primaryAudio = audioStreams[0];

    const result = {
      ffprobeAvailable: true,
      file: {
        path: filePath,
        name: path.basename(filePath),
        size: parseInt(metadata.format?.size || 0),
        extension: path.extname(filePath).toLowerCase()
      },
      format: {
        name: metadata.format?.format_name,
        longName: metadata.format?.format_long_name,
        duration: parseFloat(metadata.format?.duration || 0),
        bitrate: parseInt(metadata.format?.bit_rate || 0),
        size: parseInt(metadata.format?.size || 0)
      },
      streams: metadata.streams || [],
      streamCount: {
        video: videoStreams.length,
        audio: audioStreams.length,
        total: metadata.streams?.length || 0
      }
    };

    // Add video-specific metadata
    if (primaryVideo) {
      result.video = {
        codec: primaryVideo.codec_name,
        codecLongName: primaryVideo.codec_long_name,
        profile: primaryVideo.profile,
        width: primaryVideo.width,
        height: primaryVideo.height,
        resolution: `${primaryVideo.width}x${primaryVideo.height}`,
        aspectRatio: primaryVideo.display_aspect_ratio,
        pixelFormat: primaryVideo.pix_fmt,
        colorSpace: primaryVideo.color_space,
        frameRate: parseFrameRate(primaryVideo.r_frame_rate),
        avgFrameRate: parseFrameRate(primaryVideo.avg_frame_rate),
        bitrate: parseInt(primaryVideo.bit_rate || 0),
        duration: parseFloat(primaryVideo.duration || metadata.format?.duration || 0),
        isProgressive: primaryVideo.field_order === 'progressive',
        bitDepth: primaryVideo.bits_per_raw_sample
      };
    }

    // Add audio-specific metadata
    if (primaryAudio) {
      result.audio = {
        codec: primaryAudio.codec_name,
        codecLongName: primaryAudio.codec_long_name,
        sampleRate: parseInt(primaryAudio.sample_rate || 0),
        channels: primaryAudio.channels,
        channelLayout: primaryAudio.channel_layout,
        bitrate: parseInt(primaryAudio.bit_rate || 0),
        bitDepth: primaryAudio.bits_per_sample || primaryAudio.bits_per_raw_sample,
        duration: parseFloat(primaryAudio.duration || metadata.format?.duration || 0)
      };
    }

    return result;
  } catch (error) {
    console.error(`ffprobe error for ${filePath}:`, error.message);
    throw new Error(`Failed to extract metadata: ${error.message}`);
  }
}

/**
 * Parse frame rate string (e.g., "30000/1001" or "30/1") to decimal
 * @param {string} frameRateStr - Frame rate as fraction string
 * @returns {number} Frame rate as decimal
 */
function parseFrameRate(frameRateStr) {
  if (!frameRateStr) return 0;

  if (frameRateStr.includes('/')) {
    const [num, den] = frameRateStr.split('/').map(Number);
    return den ? num / den : 0;
  }

  return parseFloat(frameRateStr) || 0;
}

/**
 * Validate video file against requirements
 * @param {string} filePath - Path to the video file
 * @param {Object} options - Validation options
 * @param {string} options.category - File category (RAW_FOOTAGE, EDIT_DRAFT, etc.)
 * @param {boolean} options.checkResolution - Check minimum resolution (default: true)
 * @param {boolean} options.checkCodec - Check supported codecs (default: true)
 * @param {boolean} options.checkFrameRate - Check frame rate (default: false)
 * @param {number} options.minFrameRate - Minimum frame rate (default: 23.976)
 * @returns {Promise<Object>} Validation result with valid, errors, warnings, metadata
 */
async function validateVideoFile(filePath, options = {}) {
  const {
    category = 'RAW_FOOTAGE',
    checkResolution = true,
    checkCodec = true,
    checkFrameRate = false,
    minFrameRate = 23.976
  } = options;

  const result = {
    valid: true,
    errors: [],
    warnings: [],
    metadata: null
  };

  // Check file exists
  if (!fs.existsSync(filePath)) {
    result.valid = false;
    result.errors.push({ code: 'FILE_NOT_FOUND', message: `File not found: ${filePath}` });
    return result;
  }

  // Check file size
  const stats = fs.statSync(filePath);
  const sizeLimit = FILE_SIZE_LIMITS[category] || FILE_SIZE_LIMITS.RAW_FOOTAGE;

  if (stats.size > sizeLimit) {
    result.valid = false;
    result.errors.push({
      code: 'FILE_TOO_LARGE',
      message: `File size ${formatBytes(stats.size)} exceeds limit of ${formatBytes(sizeLimit)}`,
      actual: stats.size,
      limit: sizeLimit
    });
  }

  if (stats.size === 0) {
    result.valid = false;
    result.errors.push({ code: 'FILE_EMPTY', message: 'File is empty' });
    return result;
  }

  // Get metadata
  try {
    const metadata = await getMediaMetadata(filePath);
    result.metadata = metadata;

    if (!metadata.video) {
      result.valid = false;
      result.errors.push({ code: 'NO_VIDEO_STREAM', message: 'No video stream found in file' });
      return result;
    }

    // Check resolution
    if (checkResolution) {
      const minRes = MIN_VIDEO_RESOLUTION[category] || MIN_VIDEO_RESOLUTION.RAW_FOOTAGE;
      const { width, height } = metadata.video;

      if (width < minRes.width || height < minRes.height) {
        result.valid = false;
        result.errors.push({
          code: 'RESOLUTION_TOO_LOW',
          message: `Resolution ${width}x${height} below minimum ${minRes.width}x${minRes.height}`,
          actual: { width, height },
          minimum: minRes
        });
      }
    }

    // Check codec
    if (checkCodec) {
      const codec = metadata.video.codec?.toLowerCase();
      if (codec && !SUPPORTED_VIDEO_CODECS.includes(codec)) {
        result.warnings.push({
          code: 'UNSUPPORTED_CODEC',
          message: `Video codec '${codec}' may not be fully supported`,
          codec,
          supported: SUPPORTED_VIDEO_CODECS
        });
      }
    }

    // Check frame rate
    if (checkFrameRate) {
      const frameRate = metadata.video.frameRate;
      if (frameRate && frameRate < minFrameRate) {
        result.warnings.push({
          code: 'LOW_FRAME_RATE',
          message: `Frame rate ${frameRate.toFixed(3)} fps below recommended ${minFrameRate} fps`,
          actual: frameRate,
          minimum: minFrameRate
        });
      }
    }

    // Check for audio stream in video files
    if (!metadata.audio) {
      result.warnings.push({
        code: 'NO_AUDIO_STREAM',
        message: 'Video file has no audio stream'
      });
    }

  } catch (error) {
    if (error.message.includes('ffprobe not available')) {
      result.warnings.push({
        code: 'FFPROBE_UNAVAILABLE',
        message: 'ffprobe not available - detailed validation skipped'
      });
    } else {
      result.valid = false;
      result.errors.push({
        code: 'METADATA_EXTRACTION_FAILED',
        message: `Failed to extract metadata: ${error.message}`
      });
    }
  }

  return result;
}

/**
 * Validate audio file against requirements
 * @param {string} filePath - Path to the audio file
 * @param {Object} options - Validation options
 * @param {string} options.category - File category (RAW_AUDIO, etc.)
 * @param {boolean} options.checkSampleRate - Check minimum sample rate (default: true)
 * @param {number} options.minSampleRate - Minimum sample rate (default: 44100)
 * @param {boolean} options.checkBitDepth - Check minimum bit depth (default: false)
 * @param {number} options.minBitDepth - Minimum bit depth (default: 16)
 * @returns {Promise<Object>} Validation result
 */
async function validateAudioFile(filePath, options = {}) {
  const {
    category = 'RAW_AUDIO',
    checkSampleRate = true,
    minSampleRate = 44100,
    checkBitDepth = false,
    minBitDepth = 16
  } = options;

  const result = {
    valid: true,
    errors: [],
    warnings: [],
    metadata: null
  };

  // Check file exists
  if (!fs.existsSync(filePath)) {
    result.valid = false;
    result.errors.push({ code: 'FILE_NOT_FOUND', message: `File not found: ${filePath}` });
    return result;
  }

  // Check file size
  const stats = fs.statSync(filePath);
  const sizeLimit = FILE_SIZE_LIMITS[category] || FILE_SIZE_LIMITS.RAW_AUDIO;

  if (stats.size > sizeLimit) {
    result.valid = false;
    result.errors.push({
      code: 'FILE_TOO_LARGE',
      message: `File size ${formatBytes(stats.size)} exceeds limit of ${formatBytes(sizeLimit)}`,
      actual: stats.size,
      limit: sizeLimit
    });
  }

  if (stats.size === 0) {
    result.valid = false;
    result.errors.push({ code: 'FILE_EMPTY', message: 'File is empty' });
    return result;
  }

  // Get metadata
  try {
    const metadata = await getMediaMetadata(filePath);
    result.metadata = metadata;

    if (!metadata.audio) {
      result.valid = false;
      result.errors.push({ code: 'NO_AUDIO_STREAM', message: 'No audio stream found in file' });
      return result;
    }

    // Check sample rate
    if (checkSampleRate) {
      const sampleRate = metadata.audio.sampleRate;
      if (sampleRate && sampleRate < minSampleRate) {
        result.warnings.push({
          code: 'LOW_SAMPLE_RATE',
          message: `Sample rate ${sampleRate}Hz below recommended ${minSampleRate}Hz`,
          actual: sampleRate,
          minimum: minSampleRate
        });
      }
    }

    // Check bit depth
    if (checkBitDepth) {
      const bitDepth = metadata.audio.bitDepth;
      if (bitDepth && bitDepth < minBitDepth) {
        result.warnings.push({
          code: 'LOW_BIT_DEPTH',
          message: `Bit depth ${bitDepth} below recommended ${minBitDepth}`,
          actual: bitDepth,
          minimum: minBitDepth
        });
      }
    }

    // Check codec
    const codec = metadata.audio.codec?.toLowerCase();
    if (codec && !SUPPORTED_AUDIO_CODECS.includes(codec)) {
      result.warnings.push({
        code: 'UNSUPPORTED_CODEC',
        message: `Audio codec '${codec}' may not be fully supported`,
        codec,
        supported: SUPPORTED_AUDIO_CODECS
      });
    }

  } catch (error) {
    if (error.message.includes('ffprobe not available')) {
      result.warnings.push({
        code: 'FFPROBE_UNAVAILABLE',
        message: 'ffprobe not available - detailed validation skipped'
      });
    } else {
      result.valid = false;
      result.errors.push({
        code: 'METADATA_EXTRACTION_FAILED',
        message: `Failed to extract metadata: ${error.message}`
      });
    }
  }

  return result;
}

/**
 * Validate image file against requirements
 * @param {string} filePath - Path to the image file
 * @param {Object} options - Validation options
 * @param {string} options.category - File category (THUMBNAILS, etc.)
 * @param {boolean} options.checkDimensions - Check minimum dimensions (default: true)
 * @param {number} options.minWidth - Minimum width (default: 100)
 * @param {number} options.minHeight - Minimum height (default: 100)
 * @param {number} options.maxWidth - Maximum width (default: 8192)
 * @param {number} options.maxHeight - Maximum height (default: 8192)
 * @returns {Promise<Object>} Validation result
 */
async function validateImageFile(filePath, options = {}) {
  const {
    category = 'THUMBNAILS',
    checkDimensions = true,
    minWidth = 100,
    minHeight = 100,
    maxWidth = 8192,
    maxHeight = 8192
  } = options;

  const result = {
    valid: true,
    errors: [],
    warnings: [],
    metadata: null
  };

  // Check file exists
  if (!fs.existsSync(filePath)) {
    result.valid = false;
    result.errors.push({ code: 'FILE_NOT_FOUND', message: `File not found: ${filePath}` });
    return result;
  }

  // Check file size
  const stats = fs.statSync(filePath);
  const sizeLimit = FILE_SIZE_LIMITS[category] || FILE_SIZE_LIMITS.THUMBNAILS;

  if (stats.size > sizeLimit) {
    result.valid = false;
    result.errors.push({
      code: 'FILE_TOO_LARGE',
      message: `File size ${formatBytes(stats.size)} exceeds limit of ${formatBytes(sizeLimit)}`,
      actual: stats.size,
      limit: sizeLimit
    });
  }

  if (stats.size === 0) {
    result.valid = false;
    result.errors.push({ code: 'FILE_EMPTY', message: 'File is empty' });
    return result;
  }

  // Get metadata using ffprobe (works for images too)
  try {
    const metadata = await getMediaMetadata(filePath);
    result.metadata = metadata;

    // For images, the video stream contains image dimensions
    const imageStream = metadata.video || metadata.streams?.find(s => s.codec_type === 'video');

    if (!imageStream) {
      // Try to get basic info without stream details
      result.metadata = {
        file: {
          path: filePath,
          name: path.basename(filePath),
          size: stats.size,
          extension: path.extname(filePath).toLowerCase()
        }
      };
      result.warnings.push({
        code: 'NO_IMAGE_METADATA',
        message: 'Could not extract image dimensions'
      });
      return result;
    }

    const width = imageStream.width || imageStream.coded_width;
    const height = imageStream.height || imageStream.coded_height;

    result.metadata.image = {
      width,
      height,
      resolution: `${width}x${height}`,
      codec: imageStream.codec_name,
      pixelFormat: imageStream.pix_fmt
    };

    // Check dimensions
    if (checkDimensions && width && height) {
      if (width < minWidth || height < minHeight) {
        result.warnings.push({
          code: 'IMAGE_TOO_SMALL',
          message: `Image dimensions ${width}x${height} below minimum ${minWidth}x${minHeight}`,
          actual: { width, height },
          minimum: { width: minWidth, height: minHeight }
        });
      }

      if (width > maxWidth || height > maxHeight) {
        result.warnings.push({
          code: 'IMAGE_TOO_LARGE',
          message: `Image dimensions ${width}x${height} exceed maximum ${maxWidth}x${maxHeight}`,
          actual: { width, height },
          maximum: { width: maxWidth, height: maxHeight }
        });
      }
    }

  } catch (error) {
    if (error.message.includes('ffprobe not available')) {
      result.warnings.push({
        code: 'FFPROBE_UNAVAILABLE',
        message: 'ffprobe not available - detailed validation skipped'
      });
    } else {
      // For images, metadata extraction failure is a warning, not an error
      result.warnings.push({
        code: 'METADATA_EXTRACTION_FAILED',
        message: `Could not extract image metadata: ${error.message}`
      });
    }
  }

  return result;
}

/**
 * Validate file size against category limits
 * @param {number} sizeBytes - File size in bytes
 * @param {string} category - File category
 * @returns {Object} Validation result with valid, limit, message
 */
function validateFileSize(sizeBytes, category) {
  const limit = FILE_SIZE_LIMITS[category];

  if (!limit) {
    return {
      valid: true,
      limit: null,
      message: `No size limit defined for category: ${category}`
    };
  }

  const valid = sizeBytes <= limit;

  return {
    valid,
    size: sizeBytes,
    limit,
    sizeFormatted: formatBytes(sizeBytes),
    limitFormatted: formatBytes(limit),
    message: valid
      ? `File size ${formatBytes(sizeBytes)} within limit`
      : `File size ${formatBytes(sizeBytes)} exceeds limit of ${formatBytes(limit)}`
  };
}

/**
 * Validate MIME type against allowed types for category
 * @param {string} mimeType - MIME type to validate
 * @param {string} category - File category
 * @returns {Object} Validation result with valid, allowed, message
 */
function validateMimeType(mimeType, category) {
  const allowedTypes = CATEGORY_MIME_TYPES[category];

  if (!allowedTypes) {
    return {
      valid: false,
      mimeType,
      allowed: [],
      message: `Unknown category: ${category}`
    };
  }

  // Normalize MIME type (lowercase, no parameters)
  const normalizedMime = mimeType.toLowerCase().split(';')[0].trim();

  const valid = allowedTypes.some(allowed =>
    normalizedMime === allowed.toLowerCase() ||
    normalizedMime.startsWith(allowed.split('/')[0] + '/')
  );

  return {
    valid,
    mimeType: normalizedMime,
    allowed: allowedTypes,
    category,
    message: valid
      ? `MIME type '${normalizedMime}' is valid for ${category}`
      : `MIME type '${normalizedMime}' not allowed for ${category}`
  };
}

/**
 * Detect file type from extension and optionally content
 * @param {string} filePath - Path to the file
 * @returns {Object} File type info
 */
function detectFileType(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.wmv', '.flv', '.webm', '.m4v', '.mxf', '.3gp'];
  const audioExtensions = ['.wav', '.mp3', '.aiff', '.aif', '.flac', '.aac', '.m4a', '.ogg', '.opus'];
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.tiff', '.tif', '.bmp', '.heic', '.heif', '.raw', '.cr2', '.nef', '.arw', '.dng'];

  let type = 'unknown';
  let category = 'REFERENCE';

  if (videoExtensions.includes(ext)) {
    type = 'video';
    category = 'RAW_FOOTAGE';
  } else if (audioExtensions.includes(ext)) {
    type = 'audio';
    category = 'RAW_AUDIO';
  } else if (imageExtensions.includes(ext)) {
    type = 'image';
    category = 'THUMBNAILS';
  }

  return {
    type,
    extension: ext,
    suggestedCategory: category
  };
}

/**
 * Format bytes to human-readable string
 * @param {number} bytes - Size in bytes
 * @param {number} decimals - Decimal places (default: 2)
 * @returns {string} Formatted size string
 */
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Comprehensive file validation
 * Automatically detects file type and applies appropriate validation
 * @param {string} filePath - Path to the file
 * @param {Object} options - Validation options
 * @param {string} options.category - Override auto-detected category
 * @param {string} options.mimeType - Expected MIME type
 * @returns {Promise<Object>} Validation result
 */
async function validateFile(filePath, options = {}) {
  const fileType = detectFileType(filePath);
  const category = options.category || fileType.suggestedCategory;

  let result;

  switch (fileType.type) {
    case 'video':
      result = await validateVideoFile(filePath, { ...options, category });
      break;
    case 'audio':
      result = await validateAudioFile(filePath, { ...options, category });
      break;
    case 'image':
      result = await validateImageFile(filePath, { ...options, category });
      break;
    default:
      // Basic validation for unknown types
      result = {
        valid: true,
        errors: [],
        warnings: [{ code: 'UNKNOWN_TYPE', message: `Unknown file type: ${fileType.extension}` }],
        metadata: {
          file: {
            path: filePath,
            name: path.basename(filePath),
            size: fs.existsSync(filePath) ? fs.statSync(filePath).size : 0,
            extension: fileType.extension
          }
        }
      };
  }

  // Add MIME type validation if provided
  if (options.mimeType) {
    const mimeValidation = validateMimeType(options.mimeType, category);
    if (!mimeValidation.valid) {
      result.errors.push({
        code: 'INVALID_MIME_TYPE',
        message: mimeValidation.message,
        mimeType: options.mimeType,
        allowed: mimeValidation.allowed
      });
      result.valid = false;
    }
  }

  // Add file type info to result
  result.fileType = fileType;
  result.category = category;

  return result;
}

module.exports = {
  // Core validation functions
  validateVideoFile,
  validateAudioFile,
  validateImageFile,
  validateFile,

  // Metadata extraction
  getMediaMetadata,
  isFFprobeAvailable,

  // Size and MIME validation
  validateFileSize,
  validateMimeType,

  // Utilities
  detectFileType,
  formatBytes,

  // Constants
  FILE_SIZE_LIMITS,
  MIN_VIDEO_RESOLUTION,
  SUPPORTED_VIDEO_CODECS,
  SUPPORTED_AUDIO_CODECS,
  MIME_TYPES,
  CATEGORY_MIME_TYPES
};
