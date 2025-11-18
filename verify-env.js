#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🔍 Verifying .env file...\n');

const envPath = path.join(__dirname, '.env');

if (!fs.existsSync(envPath)) {
  console.error('❌ .env file not found!');
  console.log('💡 Run: cp .env.example .env');
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf8');
const envLines = envContent.split('\n').filter(line => line.trim() && !line.trim().startsWith('#'));

const requiredVars = {
  'DATABASE_HOST': 'localhost',
  'DATABASE_PORT': '5432',
  'DATABASE_USER': 'postgres',
  'DATABASE_PASSWORD': null, // Must be set but value varies
  'DATABASE_NAME': 'health_app_db',
  'JWT_SECRET': null, // Must be set and >= 32 chars
  'GOOGLE_CLIENT_ID': null, // Must be set
  'GOOGLE_CLIENT_SECRET': null, // Must be set
  'GOOGLE_CALLBACK_URL': 'http://localhost:3000/auth/google/callback',
  'PORT': '3000',
  'NODE_ENV': 'development'
};

const found = {};
const missing = [];
const issues = [];

// Parse .env file
envLines.forEach(line => {
  const [key, ...valueParts] = line.split('=');
  if (key && valueParts.length > 0) {
    const value = valueParts.join('=').trim();
    found[key.trim()] = value;
  }
});

// Check required variables
Object.keys(requiredVars).forEach(key => {
  if (!found[key]) {
    missing.push(key);
  } else {
    const value = found[key];
    const expected = requiredVars[key];
    
    // Special validations
    if (key === 'JWT_SECRET' && value.length < 32) {
      issues.push(`⚠️  JWT_SECRET is too short (${value.length} chars, need >= 32)`);
    }
    
    if (key === 'GOOGLE_CALLBACK_URL' && value !== expected) {
      issues.push(`⚠️  GOOGLE_CALLBACK_URL should be: ${expected}`);
    }
    
    if (key === 'DATABASE_PASSWORD' && (value === 'your_postgres_password' || value === '')) {
      issues.push(`⚠️  DATABASE_PASSWORD needs to be set to your actual PostgreSQL password`);
    }
    
    if (key === 'GOOGLE_CLIENT_ID' && (value.includes('your_') || value === '')) {
      issues.push(`⚠️  GOOGLE_CLIENT_ID needs to be set from Google Cloud Console`);
    }
    
    if (key === 'GOOGLE_CLIENT_SECRET' && (value.includes('your_') || value === '')) {
      issues.push(`⚠️  GOOGLE_CLIENT_SECRET needs to be set from Google Cloud Console`);
    }
  }
});

// Print results
console.log('📋 Configuration Status:\n');

if (missing.length === 0 && issues.length === 0) {
  console.log('✅ All required variables are present!\n');
  console.log('Found variables:');
  Object.keys(found).forEach(key => {
    if (key === 'DATABASE_PASSWORD' || key === 'JWT_SECRET' || key === 'GOOGLE_CLIENT_SECRET') {
      console.log(`  ✅ ${key} = ${'*'.repeat(Math.min(found[key].length, 20))}`);
    } else {
      console.log(`  ✅ ${key} = ${found[key]}`);
    }
  });
  console.log('\n✨ Your .env file looks good! You can start the server with: npm run start:dev');
} else {
  if (missing.length > 0) {
    console.log('❌ Missing required variables:');
    missing.forEach(key => console.log(`   - ${key}`));
    console.log('');
  }
  
  if (issues.length > 0) {
    console.log('⚠️  Issues found:');
    issues.forEach(issue => console.log(`   ${issue}`));
    console.log('');
  }
  
  console.log('💡 Please fix the issues above and run this script again.');
  process.exit(1);
}

