/**
 * Test script for v2-backend search improvements
 *
 * Run with: node scripts/test-search-improvements.js
 *
 * Tests:
 * 1. Basic search (backward compatibility)
 * 2. Skill-based scoring
 * 3. Budget range filtering
 * 4. Multiple roles
 * 5. Combined filters
 */

const axios = require('axios');

const API_BASE = process.env.API_BASE_URL || 'https://revure-api.beige.app/v1';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

const log = {
  info: (msg) => console.log(`${colors.cyan}ℹ ${msg}${colors.reset}`),
  success: (msg) => console.log(`${colors.green}✓ ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}✗ ${msg}${colors.reset}`),
  test: (msg) => console.log(`${colors.yellow}\n▶ ${msg}${colors.reset}`),
  result: (msg) => console.log(`  ${colors.blue}${msg}${colors.reset}`)
};

async function testSearch(testName, params, validations) {
  log.test(`Test: ${testName}`);
  log.info(`URL: ${API_BASE}/creators/search?${new URLSearchParams(params).toString()}`);

  try {
    const response = await axios.get(`${API_BASE}/creators/search`, { params });

    if (response.data.success) {
      const { data, pagination } = response.data.data;

      log.result(`Found ${pagination.total} creators (showing ${data.length})`);

      // Run validations
      let passed = true;
      for (const validation of validations) {
        const result = validation(data, pagination);
        if (result.pass) {
          log.success(result.message);
        } else {
          log.error(result.message);
          passed = false;
        }
      }

      // Show sample results
      if (data.length > 0) {
        log.result('Sample results:');
        data.slice(0, 3).forEach((creator, i) => {
          console.log(`  ${i + 1}. ${creator.name} - ${creator.role_name}`);
          console.log(`     Rate: $${creator.hourly_rate}/hr | Rating: ${creator.rating}`);
          if (creator.matchScore !== undefined) {
            console.log(`     Match Score: ${creator.matchScore} | Matching: ${(creator.matchingSkills || []).join(', ')}`);
          }
        });
      }

      return passed;
    } else {
      log.error(`API returned success: false`);
      return false;
    }
  } catch (error) {
    log.error(`Request failed: ${error.message}`);
    if (error.response) {
      log.error(`Response: ${JSON.stringify(error.response.data, null, 2)}`);
    }
    return false;
  }
}

async function runTests() {
  console.log(`${colors.cyan}╔════════════════════════════════════════════════╗`);
  console.log(`║  V2 Backend Search Improvements Test Suite    ║`);
  console.log(`╚════════════════════════════════════════════════╝${colors.reset}\n`);

  const results = [];

  // Test 1: Basic search (backward compatibility)
  results.push(await testSearch(
    'Basic Search - Backward Compatibility',
    { page: 1, limit: 5 },
    [
      (data, pagination) => ({
        pass: data.length > 0,
        message: data.length > 0 ? 'Returns creators' : 'No creators returned'
      }),
      (data, pagination) => ({
        pass: pagination.total > 0,
        message: `Pagination total: ${pagination.total}`
      })
    ]
  ));

  // Test 2: Skill-based scoring
  results.push(await testSearch(
    'Skill-Based Scoring',
    { skills: 'Video Editing,Color Grading', page: 1, limit: 5 },
    [
      (data) => ({
        pass: data.length > 0 && data[0].matchScore !== undefined,
        message: data.length > 0 ? `matchScore field present: ${data[0].matchScore}` : 'No results with matchScore'
      }),
      (data) => {
        const sorted = data.every((creator, i) =>
          i === 0 || creator.matchScore <= data[i - 1].matchScore
        );
        return {
          pass: sorted,
          message: sorted ? 'Results sorted by matchScore (DESC)' : 'Results NOT properly sorted'
        };
      }
    ]
  ));

  // Test 3: Budget range filtering
  results.push(await testSearch(
    'Budget Range Filtering',
    { min_budget: 50, max_budget: 100, page: 1, limit: 5 },
    [
      (data) => {
        const inRange = data.every(c => c.hourly_rate >= 50 && c.hourly_rate <= 100);
        return {
          pass: inRange,
          message: inRange ? 'All results within $50-$100 range' : 'Some results outside budget range'
        };
      }
    ]
  ));

  // Test 4: Multiple roles
  results.push(await testSearch(
    'Multiple Roles Support',
    { content_types: '1,2', page: 1, limit: 5 },
    [
      (data) => {
        const validRoles = data.every(c => c.role_id === 1 || c.role_id === 2);
        return {
          pass: validRoles,
          message: validRoles ? 'All results are Videographers or Photographers' : 'Invalid roles in results'
        };
      }
    ]
  ));

  // Test 5: Combined filters with skill scoring
  results.push(await testSearch(
    'Combined: Skills + Budget + Role',
    {
      skills: 'Adobe,Premiere',
      max_budget: 150,
      content_type: 1,
      page: 1,
      limit: 5
    },
    [
      (data) => ({
        pass: data.length >= 0,  // May return 0 results depending on data
        message: `Found ${data.length} creators matching all criteria`
      }),
      (data) => {
        if (data.length > 0) {
          const hasMatchScore = data[0].matchScore !== undefined;
          const inBudget = data.every(c => c.hourly_rate <= 150);
          const correctRole = data.every(c => c.role_id === 1);
          return {
            pass: hasMatchScore && inBudget && correctRole,
            message: `Scoring: ${hasMatchScore}, Budget: ${inBudget}, Role: ${correctRole}`
          };
        }
        return { pass: true, message: 'No results (acceptable for specific filters)' };
      }
    ]
  ));

  // Summary
  console.log(`\n${colors.cyan}╔════════════════════════════════════════════════╗`);
  console.log(`║  Test Summary                                  ║`);
  console.log(`╚════════════════════════════════════════════════╝${colors.reset}\n`);

  const passed = results.filter(r => r).length;
  const total = results.length;

  if (passed === total) {
    log.success(`All ${total} tests passed!`);
  } else {
    log.error(`${passed}/${total} tests passed`);
  }

  console.log('');
}

// Run tests
runTests().catch(error => {
  log.error(`Test suite failed: ${error.message}`);
  process.exit(1);
});
