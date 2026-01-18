#!/usr/bin/env node

/**
 * AWS S3 Setup Verification Script
 *
 * This script verifies:
 * 1. AWS SDK is installed
 * 2. Environment variables are configured
 * 3. S3 connection works
 * 4. Bucket permissions are correct
 *
 * Usage: node scripts/verify-s3-setup.js
 */

require('dotenv').config();

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSuccess(message) {
  log(`✓ ${message}`, 'green');
}

function logError(message) {
  log(`✗ ${message}`, 'red');
}

function logWarning(message) {
  log(`⚠ ${message}`, 'yellow');
}

function logInfo(message) {
  log(`ℹ ${message}`, 'cyan');
}

async function verifyAwsSdkInstalled() {
  logInfo('Checking AWS SDK installation...');

  try {
    require('aws-sdk');
    logSuccess('AWS SDK is installed');
    return true;
  } catch (error) {
    logError('AWS SDK is not installed');
    logInfo('Run: yarn add aws-sdk');
    return false;
  }
}

function verifyEnvironmentVariables() {
  logInfo('Checking environment variables...');

  const required = [
    'AWS_REGION',
    'AWS_S3_BUCKET',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY'
  ];

  const missing = required.filter(key => !process.env[key]);

  if (missing.length === 0) {
    logSuccess('All required environment variables are set');

    // Display configuration (masked)
    log('\nConfiguration:', 'blue');
    console.log(`  AWS_REGION: ${process.env.AWS_REGION}`);
    console.log(`  AWS_S3_BUCKET: ${process.env.AWS_S3_BUCKET}`);
    console.log(`  AWS_ACCESS_KEY_ID: ${maskCredential(process.env.AWS_ACCESS_KEY_ID)}`);
    console.log(`  AWS_SECRET_ACCESS_KEY: ${maskCredential(process.env.AWS_SECRET_ACCESS_KEY)}`);

    return true;
  } else {
    logError(`Missing environment variables: ${missing.join(', ')}`);
    logInfo('Add these to your .env file');
    return false;
  }
}

function maskCredential(credential) {
  if (!credential || credential.length < 8) return '***';
  return credential.substring(0, 4) + '***' + credential.substring(credential.length - 4);
}

async function testS3Connection() {
  logInfo('Testing S3 connection and permissions...');

  try {
    const { testConnection } = require('../src/utils/awsS3Client');
    const result = await testConnection();

    if (!result.configured) {
      logError('S3 configuration is invalid');
      return false;
    }

    log('\nPermission Test Results:', 'blue');

    if (result.canList) {
      logSuccess('List objects: OK');
    } else {
      logError('List objects: FAILED');
    }

    if (result.canWrite) {
      logSuccess('Write objects: OK');
    } else {
      logError('Write objects: FAILED');
    }

    if (result.canRead) {
      logSuccess('Read objects: OK');
    } else {
      logError('Read objects: FAILED');
    }

    if (result.canDelete) {
      logSuccess('Delete objects: OK');
    } else {
      logError('Delete objects: FAILED');
    }

    if (result.errors.length > 0) {
      log('\nErrors encountered:', 'red');
      result.errors.forEach(error => {
        console.log(`  ${error.operation}: ${error.message}`);
      });
    }

    const allPermissionsOk = result.canList && result.canWrite && result.canRead && result.canDelete;

    if (allPermissionsOk) {
      logSuccess('\nAll S3 permissions verified successfully');
      return true;
    } else {
      logError('\nSome S3 permissions are missing');
      logInfo('Check your IAM user permissions');
      return false;
    }
  } catch (error) {
    logError(`S3 connection test failed: ${error.message}`);
    return false;
  }
}

function displayBucketStructure() {
  const { FOLDER_STRUCTURE } = require('../src/utils/awsS3Client');

  log('\nExpected S3 Bucket Structure:', 'blue');
  console.log(`\n${process.env.AWS_S3_BUCKET || 'revure-projects'}/`);

  Object.entries(FOLDER_STRUCTURE).forEach(([category, folder]) => {
    console.log(`├── ${folder}/{project_id}/`);
  });

  console.log('');
}

async function main() {
  log('='.repeat(60), 'cyan');
  log('AWS S3 Setup Verification', 'cyan');
  log('='.repeat(60), 'cyan');
  console.log('');

  const checks = [
    { name: 'AWS SDK Installation', fn: verifyAwsSdkInstalled },
    { name: 'Environment Variables', fn: verifyEnvironmentVariables },
    { name: 'S3 Connection', fn: testS3Connection }
  ];

  let allPassed = true;

  for (const check of checks) {
    log(`\n${'='.repeat(60)}`, 'cyan');
    log(check.name, 'cyan');
    log('='.repeat(60), 'cyan');

    const passed = await check.fn();
    allPassed = allPassed && passed;

    if (!passed && check.name === 'AWS SDK Installation') {
      // Can't continue without SDK
      break;
    }
  }

  displayBucketStructure();

  log('\n' + '='.repeat(60), 'cyan');

  if (allPassed) {
    logSuccess('All checks passed! AWS S3 is ready to use.');
    log('\nNext steps:', 'blue');
    console.log('  1. Start using the S3 client in your controllers');
    console.log('  2. Review the documentation: src/utils/AWS_S3_CLIENT_README.md');
    console.log('  3. Test file uploads in your application');
  } else {
    logError('Some checks failed. Please fix the issues above.');
    log('\nCommon Solutions:', 'blue');
    console.log('  1. Install AWS SDK: yarn add aws-sdk');
    console.log('  2. Copy .env.example to .env and add your AWS credentials');
    console.log('  3. Verify IAM user has S3 permissions');
    console.log('  4. Check that the S3 bucket exists and is accessible');
  }

  log('='.repeat(60) + '\n', 'cyan');

  process.exit(allPassed ? 0 : 1);
}

// Run verification
main().catch(error => {
  logError(`\nUnexpected error: ${error.message}`);
  console.error(error);
  process.exit(1);
});
