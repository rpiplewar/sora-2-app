#!/usr/bin/env node

/**
 * Pre-flight verification script
 * Checks that all required setup is complete before local development
 */

import { sql } from '@vercel/postgres';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

function success(msg) {
  console.log(`${GREEN}✓${RESET} ${msg}`);
}

function error(msg) {
  console.log(`${RED}✗${RESET} ${msg}`);
}

function warning(msg) {
  console.log(`${YELLOW}⚠${RESET} ${msg}`);
}

function section(msg) {
  console.log(`\n${BOLD}${msg}${RESET}`);
}

async function checkEnvVariables() {
  section('1. Checking Environment Variables...');

  const requiredVars = [
    'POSTGRES_URL',
    'GCS_PROJECT_ID',
    'GCS_CLIENT_EMAIL',
    'GCS_PRIVATE_KEY',
    'GCS_BUCKET_NAME',
  ];

  const envFile = join(__dirname, '..', '.env.local');

  if (!fs.existsSync(envFile)) {
    error('.env.local file not found');
    warning('Please create .env.local with required variables');
    return false;
  }

  success('.env.local file exists');

  const envContent = fs.readFileSync(envFile, 'utf-8');
  let allPresent = true;

  for (const varName of requiredVars) {
    if (envContent.includes(`${varName}=`)) {
      success(`${varName} is set`);
    } else {
      error(`${varName} is missing`);
      allPresent = false;
    }
  }

  return allPresent;
}

async function checkDatabase() {
  section('2. Checking Neon Postgres Database...');

  try {
    // Test connection
    const result = await sql`SELECT NOW() as current_time`;
    success('Database connection successful');
    console.log(`   Current time: ${result.rows[0].current_time}`);

    // Check tables exist
    const tables = await sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `;

    const requiredTables = ['video_metadata', 'scene_segments'];
    const existingTables = tables.rows.map((r) => r.table_name);

    let allTablesExist = true;
    for (const table of requiredTables) {
      if (existingTables.includes(table)) {
        success(`Table '${table}' exists`);
      } else {
        error(`Table '${table}' is missing`);
        allTablesExist = false;
      }
    }

    if (!allTablesExist) {
      warning('Run: node --env-file=.env.local scripts/init-neon-db.js');
    }

    return allTablesExist;
  } catch (err) {
    error('Database connection failed');
    console.log(`   Error: ${err.message}`);
    warning('Check POSTGRES_URL in .env.local');
    return false;
  }
}

async function checkGCSCredentials() {
  section('3. Checking Google Cloud Storage Credentials...');

  const credFile = join(__dirname, '..', 'luminous-style-464500-c1-382597b71a58.json');

  if (!fs.existsSync(credFile)) {
    error('GCS credentials file not found');
    warning('Expected: luminous-style-464500-c1-382597b71a58.json');
    return false;
  }

  success('GCS credentials file exists');

  try {
    const creds = JSON.parse(fs.readFileSync(credFile, 'utf-8'));

    if (creds.project_id) {
      success(`Project ID: ${creds.project_id}`);
    }

    if (creds.client_email) {
      success(`Service account: ${creds.client_email}`);
    }

    return true;
  } catch (err) {
    error('Failed to parse GCS credentials');
    console.log(`   Error: ${err.message}`);
    return false;
  }
}

async function checkDependencies() {
  section('4. Checking NPM Dependencies...');

  const packageJsonPath = join(__dirname, '..', 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

  const requiredDeps = [
    '@google-cloud/storage',
    '@vercel/postgres',
    'react-router-dom',
    'zustand',
  ];

  const nodeModulesPath = join(__dirname, '..', 'node_modules');

  if (!fs.existsSync(nodeModulesPath)) {
    error('node_modules not found');
    warning('Run: npm install');
    return false;
  }

  success('node_modules exists');

  let allInstalled = true;
  for (const dep of requiredDeps) {
    const depPath = join(nodeModulesPath, dep);
    if (fs.existsSync(depPath)) {
      success(`${dep} is installed`);
    } else {
      error(`${dep} is missing`);
      allInstalled = false;
    }
  }

  if (!allInstalled) {
    warning('Run: npm install');
  }

  return allInstalled;
}

async function checkAPIFiles() {
  section('5. Checking API Endpoints...');

  const apiDir = join(__dirname, '..', 'api');
  const requiredEndpoints = [
    'get-upload-url.ts',
    'save-video-metadata.ts',
    'get-video-url.ts',
    'list-scenes.ts',
    'proxy-remix-video.ts',
  ];

  let allExist = true;
  for (const endpoint of requiredEndpoints) {
    const endpointPath = join(apiDir, endpoint);
    if (fs.existsSync(endpointPath)) {
      success(`api/${endpoint} exists`);
    } else {
      error(`api/${endpoint} is missing`);
      allExist = false;
    }
  }

  return allExist;
}

async function checkComponents() {
  section('6. Checking SceneBuilder Components...');

  const componentsDir = join(__dirname, '..', 'src', 'components', 'scene-builder');
  const requiredComponents = [
    'VideoCanvas.tsx',
    'RemixHistoryStack.tsx',
    'PromptEditor.tsx',
    'TimelineView.tsx',
    'TimelineThumbnail.tsx',
    'PlannerToggle.tsx',
  ];

  let allExist = true;
  for (const component of requiredComponents) {
    const componentPath = join(componentsDir, component);
    if (fs.existsSync(componentPath)) {
      success(`${component} exists`);
    } else {
      error(`${component} is missing`);
      allExist = false;
    }
  }

  return allExist;
}

async function main() {
  console.log(`${BOLD}SceneBuilder V2 - Pre-Flight Verification${RESET}\n`);

  const checks = [
    checkEnvVariables(),
    checkDatabase(),
    checkGCSCredentials(),
    checkDependencies(),
    checkAPIFiles(),
    checkComponents(),
  ];

  const results = await Promise.all(checks);
  const allPassed = results.every((r) => r === true);

  section('\n📊 Summary:');

  if (allPassed) {
    console.log(`\n${GREEN}${BOLD}✓ All checks passed!${RESET}`);
    console.log(`\n${BOLD}You're ready to start local development:${RESET}`);
    console.log(`  npm run dev:vercel\n`);
    console.log(`Then navigate to:`);
    console.log(`  http://localhost:3000/scene-builder\n`);
  } else {
    console.log(`\n${RED}${BOLD}✗ Some checks failed${RESET}`);
    console.log(`\nPlease fix the issues above before running locally.`);
    console.log(`See PRE-FLIGHT-CHECKLIST.md for detailed instructions.\n`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`\n${RED}Error during verification:${RESET}`, err);
  process.exit(1);
});
