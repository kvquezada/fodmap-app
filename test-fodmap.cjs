#!/usr/bin/env node

// Quick test script for FODMAP functionality
const fs = require('node:fs');
const path = require('node:path');

console.log('🥬 FODMAP Food Helper - Local Test\n');

try {
  // Test 1: Load FODMAP data
  const dataPath = path.join(__dirname, 'data/fodmap-foods.json');
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  console.log(`✅ Loaded ${data.length} FODMAP foods from database`);

  // Test 2: Search functionality
  const searchTerm = process.argv[2] || 'banana';
  const results = data.filter((food) => food.name.toLowerCase().includes(searchTerm.toLowerCase()));

  console.log(`\n🔍 Search results for "${searchTerm}":`);

  if (results.length === 0) {
    console.log(`❌ No foods found matching "${searchTerm}"`);
    console.log('\nTry searching for: banana, apple, bread, rice, milk');
  } else {
    for (const food of results) {
      const rating =
        food.rating === 'low' ? '✅ LOW FODMAP' : food.rating === 'moderate' ? '⚠️ MODERATE FODMAP' : '❌ HIGH FODMAP';
      console.log(`\n${rating}`);
      console.log(`Food: ${food.name}`);
      console.log(`Safe serving: ${food.safeServing}`);
      console.log(`Tips: ${food.tips}`);
      if (food.alternatives.length > 0) {
        console.log(`Alternatives: ${food.alternatives.join(', ')}`);
      }
    }
  }

  // Test 3: API endpoints test
  console.log('\n🔧 Next Steps:');
  console.log('1. Fix Node.js version (v18 or v20) to run the API');
  console.log('2. Configure Azure AI models in packages/api/.env');
  console.log('3. Run "npm start" to start the full application');
  console.log('4. Open http://localhost:8000 to test the chat interface');
} catch (error) {
  console.error('❌ Error:', error.message);
}
