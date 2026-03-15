import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.join(__dirname, '..');
const srcDir = path.join(rootDir, 'src');
const distDir = path.join(rootDir, 'dist');

if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir);
}

// Read the package.json to sync versions
const pkgRaw = fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8');
const pkg = JSON.parse(pkgRaw);

function syncVersions(version) {
  // Sync src/manifest.json
  const manifestPath = path.join(srcDir, 'manifest.json');
  const manifestStr = fs.readFileSync(manifestPath, 'utf8');
  const manifest = JSON.parse(manifestStr);
  if (manifest.version !== version) {
    manifest.version = version;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`Updated src/manifest.json version to ${version}`);
  }

  // Sync README.md
  const readmePath = path.join(rootDir, 'README.md');
  if (fs.existsSync(readmePath)) {
    let readme = fs.readFileSync(readmePath, 'utf8');
    readme = readme.replace(/\*\*Version:\*\* .*/g, `**Version:** ${version}`);
    fs.writeFileSync(readmePath, readme);
  }

  // Sync UPDATE_NOTES.md
  // According to rules.md: "Remove old versions from the changelog and replace them with new ones."
  const updateNotesPath = path.join(rootDir, 'UPDATE_NOTES.md');
  if (fs.existsSync(updateNotesPath)) {
    let notes = fs.readFileSync(updateNotesPath, 'utf8');
    notes = notes.replace(/## Version .*/g, `## Version ${version}`);
    fs.writeFileSync(updateNotesPath, notes);
  }
}

// Automatically sync all version occurrences to match package.json
syncVersions(pkg.version);

// Load the newly synced manifest
const baseManifest = JSON.parse(fs.readFileSync(path.join(srcDir, 'manifest.json'), 'utf8'));

function buildChrome() {
  const zip = new AdmZip();
  const chromeDir = path.join(distDir, 'chrome');
  if (fs.existsSync(chromeDir)) fs.rmSync(chromeDir, { recursive: true, force: true });
  fs.mkdirSync(chromeDir);

  // Write updated manifest
  const manifest = { ...baseManifest };
  fs.writeFileSync(path.join(chromeDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  // Copy files
  ['content.js', 'background.js', 'styles.css', 'icon48.png', 'icon128.png'].forEach(file => {
    fs.copyFileSync(path.join(srcDir, file), path.join(chromeDir, file));
  });

  zip.addLocalFolder(chromeDir);
  zip.writeZip(path.join(rootDir, `chrome-build-v${pkg.version}.zip`));
  console.log('Chrome build created.');
}

function buildFirefox() {
  const zip = new AdmZip();
  const ffDir = path.join(distDir, 'firefox');
  if (fs.existsSync(ffDir)) fs.rmSync(ffDir, { recursive: true, force: true });
  fs.mkdirSync(ffDir);

  // Modify manifest for Firefox
  const manifest = { ...baseManifest };
  delete manifest.background.service_worker;
  delete manifest.background.type;
  manifest.background.scripts = ['background.js'];
  manifest.browser_specific_settings = {
    gecko: {
      id: "x-one-click-block@tomergamertv.com",
      strict_min_version: "140.0",
      data_collection_permissions: {
        required: ["none"]
      }
    }
  };
  fs.writeFileSync(path.join(ffDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  // Copy files
  ['content.js', 'background.js', 'styles.css', 'icon48.png', 'icon128.png'].forEach(file => {
    fs.copyFileSync(path.join(srcDir, file), path.join(ffDir, file));
  });

  zip.addLocalFolder(ffDir);
  zip.writeZip(path.join(rootDir, `firefox-build-v${pkg.version}.zip`));
  console.log('Firefox build created.');
}

function buildSource(target) {
  const zip = new AdmZip();
  
  // Create an explicit list of things to zip for source code to avoid node_modules and output zips
  ['src', 'scripts', 'package.json', 'README.md', 'UPDATE_NOTES.md', 'rules.md'].forEach(item => {
    const itemPath = path.join(rootDir, item);
    if (fs.existsSync(itemPath)) {
      if (fs.lstatSync(itemPath).isDirectory()) {
         zip.addLocalFolder(itemPath, item);
      } else {
         zip.addLocalFile(itemPath);
      }
    }
  });

  zip.writeZip(path.join(rootDir, `source-${target}-v${pkg.version}.zip`));
  console.log(`${target} source zip created.`);
}

buildChrome();
buildFirefox();
buildSource('chrome');
buildSource('firefox');
