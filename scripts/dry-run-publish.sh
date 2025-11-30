#!/bin/bash
set -e

# Dry-run script for publish-packages.yml workflow
# This simulates the GitHub Actions workflow locally without publishing

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🧪 LOCAL DRY-RUN: publish-packages.yml"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

cd "$(dirname "$0")/.."
ROOT_DIR=$(pwd)

export DRY_RUN=true

echo ""
echo "📁 Working directory: $ROOT_DIR"
echo ""

# Step 1: Check SDK regeneration needed
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 1: Check if SDK regeneration needed"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

KAFKA_PRODUCER_CHANGED=false
ALTSTACK_SERVER_CHANGED=false

# Get changed files (use HEAD~1 instead of HEAD^1 for zsh compatibility)
CHANGED_FILES=$(git diff --name-only HEAD~1 HEAD 2>/dev/null || echo "")

if echo "$CHANGED_FILES" | grep -q "^apps/example-kafka-producer/"; then
  KAFKA_PRODUCER_CHANGED=true
  echo "📦 Kafka producer app changed - would regenerate SDK"
fi

if echo "$CHANGED_FILES" | grep -q "^apps/example-altstack-server/"; then
  ALTSTACK_SERVER_CHANGED=true
  echo "📦 Altstack server app changed - would regenerate SDK"
fi

if [ "$KAFKA_PRODUCER_CHANGED" = "false" ] && [ "$ALTSTACK_SERVER_CHANGED" = "false" ]; then
  echo "ℹ️  No SDK regeneration needed"
fi

# Step 2: Detect changed packages
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 2: Detect changed packages"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

node << 'EOF'
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Get all packages and their directories
const packageDirs = fs.readdirSync('packages')
  .map(dir => path.join('packages', dir))
  .filter(dir => {
    const pkgPath = path.join(dir, 'package.json');
    if (!fs.existsSync(pkgPath)) return false;
    try {
      const pkgJson = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      const name = pkgJson.name;
      return name && name.startsWith('@alt-stack/') && name !== '@alt-stack/typescript-config';
    } catch {
      return false;
    }
  });

// Get changed files (use HEAD~1 for zsh compatibility)
let changedFiles = [];
try {
  changedFiles = execSync('git diff --name-only HEAD~1 HEAD', { encoding: 'utf-8' })
    .trim()
    .split('\n')
    .filter(Boolean);
} catch (e) {
  console.error('Error getting changed files:', e.message);
  // If HEAD~1 doesn't exist, check all files
  try {
    changedFiles = execSync('git diff --name-only HEAD', { encoding: 'utf-8' })
      .trim()
      .split('\n')
      .filter(Boolean);
  } catch {
    changedFiles = [];
  }
}

console.log('Changed files:');
changedFiles.forEach(f => console.log(`  - ${f}`));
console.log('');

// Also use Turbo to detect changed packages
let turboPackages = [];
try {
  const turboOutput = execSync('turbo run build --filter="[HEAD~1]" --dry-run=json 2>/dev/null', { 
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe']
  });
  const turboData = JSON.parse(turboOutput);
  if (turboData.tasks) {
    turboPackages = turboData.tasks
      .map(task => task.package)
      .filter(pkg => pkg && pkg.startsWith('@alt-stack/') && pkg !== '@alt-stack/typescript-config');
  }
} catch (e) {
  console.log('Turbo detection skipped (this is normal if turbo is not available)');
}

const changedPackages = new Set();

// Add packages detected by Turbo
turboPackages.forEach(pkg => changedPackages.add(pkg));

// Check git changes for each package
for (const pkgDir of packageDirs) {
  const pkgJson = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf-8'));
  const pkgName = pkgJson.name;
  
  if (pkgName === '@alt-stack/typescript-config') continue;
  
  // Check if any files in this package changed
  const hasChanges = changedFiles.some(file => file.startsWith(pkgDir + '/'));
  
  if (hasChanges) {
    changedPackages.add(pkgName);
  }
}

// If example apps changed, add their corresponding SDKs
const kafkaProducerChanged = changedFiles.some(f => f.startsWith('apps/example-kafka-producer/'));
const altStackServerChanged = changedFiles.some(f => f.startsWith('apps/example-altstack-server/'));

if (kafkaProducerChanged) {
  changedPackages.add('@alt-stack/example-kafka-producer-sdk');
  console.log('Added @alt-stack/example-kafka-producer-sdk (source app changed)');
}

if (altStackServerChanged) {
  changedPackages.add('@alt-stack/example-altstack-server-sdk');
  console.log('Added @alt-stack/example-altstack-server-sdk (source app changed)');
}

const result = Array.from(changedPackages);
console.log('');
console.log('Changed packages:', JSON.stringify(result, null, 2));
fs.writeFileSync('changed-packages.json', JSON.stringify(result, null, 2));
EOF

# Step 3: Analyze commits and bump versions (dry-run)
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 3: Analyze commits and calculate version bumps"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

node << 'EOF'
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Read changed packages
let packages = [];
try {
  packages = JSON.parse(fs.readFileSync('changed-packages.json', 'utf-8'));
} catch {
  console.log('No changed packages found');
  fs.writeFileSync('bump-results.json', '[]');
  process.exit(0);
}

if (!Array.isArray(packages) || packages.length === 0) {
  console.log('No packages changed, skipping version bump');
  fs.writeFileSync('bump-results.json', '[]');
  process.exit(0);
}

const results = [];

// SDK to source app mapping for commit analysis
const sdkToAppDir = {
  '@alt-stack/example-kafka-producer-sdk': 'apps/example-kafka-producer',
  '@alt-stack/example-altstack-server-sdk': 'apps/example-altstack-server'
};

for (const pkgName of packages) {
  try {
    // Get package directory - find it by reading package.json files
    let pkgDir = null;
    const packageDirs = fs.readdirSync('packages');
    for (const dir of packageDirs) {
      const pkgPath = path.join('packages', dir, 'package.json');
      if (fs.existsSync(pkgPath)) {
        const pkgJson = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        if (pkgJson.name === pkgName) {
          pkgDir = path.join('packages', dir);
          break;
        }
      }
    }
    
    if (!pkgDir) {
      console.error(`Package ${pkgName} not found`);
      continue;
    }
    
    const pkgPath = path.join(pkgDir, 'package.json');
    
    // Get current version
    const pkgJson = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    const currentVersion = pkgJson.version;
    
    // Get commits affecting this package since last tag
    // Try to find last tag for this package
    let lastTag = null;
    try {
      const tags = execSync('git tag --sort=-version:refname', { encoding: 'utf-8' })
        .trim()
        .split('\n')
        .filter(Boolean);
      
      // Find tag matching package name pattern
      const pkgTagPattern = pkgName.replace('@alt-stack/', '').replace('@', '');
      for (const tag of tags) {
        if (tag.includes(pkgTagPattern) || tag.startsWith(pkgName + '@')) {
          lastTag = tag;
          break;
        }
      }
    } catch (e) {
      // No tags found
    }
    
    // Determine commit range (use HEAD~1 for zsh compatibility)
    let sinceRef = 'HEAD~1';
    try {
      execSync('git rev-parse HEAD~1', { stdio: 'ignore' });
    } catch {
      // HEAD~1 doesn't exist, use first commit
      sinceRef = execSync('git rev-list --max-parents=0 HEAD', { encoding: 'utf-8' }).trim();
    }
    
    if (lastTag) {
      sinceRef = lastTag;
    }
    
    console.log(`\n📦 ${pkgName}`);
    console.log(`   Directory: ${pkgDir}`);
    console.log(`   Current version: ${currentVersion}`);
    console.log(`   Since ref: ${sinceRef}`);
    
    // For SDKs, also check commits in the source app directory
    const commitDirs = [pkgDir];
    if (sdkToAppDir[pkgName]) {
      commitDirs.push(sdkToAppDir[pkgName]);
    }
    
    // Get commits affecting this package (and source app if SDK)
    let commits = [];
    for (const dir of commitDirs) {
      try {
        const commitOutput = execSync(
          `git log ${sinceRef}..HEAD --pretty=format:"%s" -- ${dir}`,
          { encoding: 'utf-8', cwd: process.cwd(), stdio: ['pipe', 'pipe', 'ignore'] }
        );
        commits.push(...commitOutput.trim().split('\n').filter(Boolean));
      } catch (e) {
        // No commits found or error
      }
    }
    
    console.log(`   Commits found: ${commits.length}`);
    if (commits.length > 0) {
      console.log('   Commit messages:');
      commits.forEach(c => console.log(`     - ${c}`));
    }
    
    // Analyze commits for version bump type
    let bumpType = 'patch'; // default
    let hasBreaking = false;
    let hasFeature = false;
    
    for (const commit of commits) {
      // Check for breaking changes
      if (commit.includes('BREAKING CHANGE') || 
          commit.includes('BREAKING:') ||
          /^[^:]+!:/.test(commit)) {
        hasBreaking = true;
        break;
      }
      
      // Check for features
      if (/^(feat|feature)(\(.+\))?:/i.test(commit)) {
        hasFeature = true;
      }
    }
    
    if (hasBreaking) {
      bumpType = 'major';
    } else if (hasFeature) {
      bumpType = 'minor';
    }
    
    // Calculate what the new version would be
    const versionParts = currentVersion.split('.');
    
    // Don't bump to major while on 0.x.x - treat breaking changes as minor
    if (bumpType === 'major' && parseInt(versionParts[0]) === 0) {
      console.log(`   ⚠️  Pre-1.0, treating breaking change as minor bump`);
      bumpType = 'minor';
    }
    
    let newVersion;
    if (bumpType === 'major') {
      newVersion = `${parseInt(versionParts[0]) + 1}.0.0`;
    } else if (bumpType === 'minor') {
      newVersion = `${versionParts[0]}.${parseInt(versionParts[1]) + 1}.0`;
    } else {
      newVersion = `${versionParts[0]}.${versionParts[1]}.${parseInt(versionParts[2]) + 1}`;
    }
    
    console.log(`   Bump type: ${bumpType}`);
    console.log(`   New version: ${currentVersion} → ${newVersion}`);
    
    results.push({
      name: pkgName,
      directory: pkgDir,
      oldVersion: currentVersion,
      newVersion: newVersion,
      bumpType: bumpType
    });
    
  } catch (error) {
    console.error(`Error processing ${pkgName}:`, error.message);
    console.error(error.stack);
  }
}

fs.writeFileSync('bump-results.json', JSON.stringify(results, null, 2));
EOF

# Step 4: Summary
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🧪 DRY-RUN SUMMARY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ -f bump-results.json ]; then
  echo ""
  echo "📦 Packages that would be published:"
  node -e "
    const fs = require('fs');
    const results = JSON.parse(fs.readFileSync('bump-results.json', 'utf-8'));
    if (results.length === 0) {
      console.log('  (none)');
    } else {
      results.forEach(r => {
        console.log(\`  • \${r.name}: \${r.oldVersion} → \${r.newVersion} (\${r.bumpType})\`);
      });
    }
  "
  echo ""
  echo "✅ Dry-run complete! No packages were actually published."
else
  echo ""
  echo "ℹ️  No packages would be published (no changes detected)"
fi

# Cleanup
rm -f changed-packages.json bump-results.json

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

