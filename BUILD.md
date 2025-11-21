# Building Desktop Applications

This guide covers building the Cheating Daddy client application into standalone executables for different platforms.

## Prerequisites

- Node.js 20+ installed
- npm or bun
- At least 4GB free disk space
- The application code on your local machine

## Build Commands

The project uses Electron Forge for building. Available commands:

### Development Build (Test locally)
```bash
npm start
# or
bun start
```

### Create Platform-Specific Installer

#### For Your Current Platform
```bash
npm run make
```

This creates installers/executables in the `out/make/` directory for your current OS.

#### For Specific Platforms

To build for specific platforms, update `forge.config.js`:

```javascript
makers: [
  // Windows
  {
    name: '@electron-forge/maker-squirrel',
    config: {
      name: 'cheating_daddy'
    }
  },
  // macOS
  {
    name: '@electron-forge/maker-dmg',
    config: {
      format: 'ULFO'
    }
  },
  // Linux (Debian/Ubuntu)
  {
    name: '@electron-forge/maker-deb',
    config: {}
  },
  // Linux (Red Hat/Fedora)
  {
    name: '@electron-forge/maker-rpm',
    config: {}
  },
  // Linux (AppImage - universal)
  {
    name: '@reforged/maker-appimage',
    config: {}
  },
  // Cross-platform ZIP
  {
    name: '@electron-forge/maker-zip',
    platforms: ['darwin', 'linux', 'win32']
  }
]
```

## Build Instructions by Platform

### Windows (from Windows machine)

```bash
# Install dependencies
npm install

# Build for Windows
npm run make

# Output location:
# out/make/squirrel.windows/x64/CheatingDaddySetup.exe
```

**Installer types:**
- `.exe` - NSIS installer (recommended)
- Squirrel installer
- Portable ZIP

### macOS (from Mac machine)

```bash
# Install dependencies
npm install

# Build for macOS
npm run make

# Output location:
# out/make/CheatingDaddy-x64.dmg
# out/make/zip/darwin/x64/cheating-daddy-darwin-x64-0.4.0.zip
```

**Installer types:**
- `.dmg` - Disk image (recommended)
- `.app` - Application bundle
- ZIP archive

**Note:** For distribution outside App Store, you may need to sign the app:
```bash
# Set up code signing
export APPLE_ID="your-apple-id@email.com"
export APPLE_ID_PASSWORD="app-specific-password"
npm run make
```

### Linux (from Linux machine)

```bash
# Install dependencies
npm install

# Build for Linux
npm run make

# Output locations:
# out/make/deb/x64/cheating-daddy_0.4.0_amd64.deb  (Debian/Ubuntu)
# out/make/rpm/x64/cheating-daddy-0.4.0-1.x86_64.rpm  (Fedora/RHEL)
# out/make/cheating-daddy-0.4.0.AppImage  (Universal)
```

**Installer types:**
- `.deb` - Debian/Ubuntu package
- `.rpm` - Red Hat/Fedora package
- `.AppImage` - Universal Linux executable (recommended for portability)
- `.zip` - Portable archive

## Package the App (Without Installer)

If you just want the executable without an installer:

```bash
npm run package

# Output: out/cheating-daddy-<platform>-<arch>/
```

This creates a folder with the executable and all required files.

## Cross-Platform Building

To build for multiple platforms from one machine, you need to set up cross-compilation:

### Using Docker (Recommended for Linux builds from any OS)

```bash
# Install Docker
# Then build using docker

# For Linux from Windows/Mac:
docker run --rm -ti \
  --env ELECTRON_CACHE="/root/.cache/electron" \
  --env ELECTRON_BUILDER_CACHE="/root/.cache/electron-builder" \
  -v ${PWD}:/project \
  -v ~/.cache/electron:/root/.cache/electron \
  -v ~/.cache/electron-builder:/root/.cache/electron-builder \
  electronuserland/builder:wine \
  /bin/bash -c "cd /project && npm install && npm run make"
```

### Using electron-builder (Alternative)

If you want better cross-platform support, consider switching to electron-builder:

```bash
npm install --save-dev electron-builder

# Update package.json:
{
  "scripts": {
    "build": "electron-builder",
    "build:win": "electron-builder --win",
    "build:mac": "electron-builder --mac",
    "build:linux": "electron-builder --linux"
  },
  "build": {
    "appId": "com.cheatingdaddy.app",
    "productName": "Cheating Daddy",
    "files": ["src/**/*", "package.json"],
    "win": {
      "target": ["nsis", "portable"]
    },
    "mac": {
      "target": ["dmg", "zip"],
      "category": "public.app-category.utilities"
    },
    "linux": {
      "target": ["AppImage", "deb", "rpm"],
      "category": "Utility"
    }
  }
}
```

## Distributing Your App

### Option 1: Direct Distribution

Simply share the built executables:
1. Upload to cloud storage (Google Drive, Dropbox, etc.)
2. Share download link with users
3. Users download and run the installer

### Option 2: GitHub Releases

```bash
# 1. Tag your release
git tag v0.4.0
git push origin v0.4.0

# 2. Create release on GitHub
# 3. Upload built executables to the release
# 4. Users download from GitHub releases page
```

### Option 3: Auto-Update Setup

For automatic updates, configure Electron Forge's publish:

```javascript
// forge.config.js
module.exports = {
  publishers: [
    {
      name: '@electron-forge/publisher-github',
      config: {
        repository: {
          owner: 'yourusername',
          name: 'cheating-daddy'
        },
        prerelease: false
      }
    }
  ]
};

// Then publish:
npm run publish
```

## Post-Build Configuration

### Configure Server URL

After building, users will enter the server configuration at startup:

1. **Protocol**: `ws://` or `wss://`
2. **Host**: Your Azure VM IP or domain
3. **Port**: `8080` (or custom)

No hardcoding needed - all configurable via UI!

### For Enterprise/Internal Use

If distributing internally, you can pre-configure the server URL:

**Option 1: Environment Variables**
Create a `.env` file alongside the executable:
```
WS_SERVER_URL=ws://your-server-ip:8080
```

**Option 2: Config File**
Create `config.json`:
```json
{
  "defaultServer": {
    "protocol": "ws",
    "host": "your-server-ip",
    "port": 8080
  }
}
```

## Build Sizes

Approximate sizes per platform:

- **Windows**: ~150-200 MB (installer), ~300 MB (extracted)
- **macOS**: ~200-250 MB (DMG)
- **Linux**: ~150-200 MB (AppImage/DEB)

The size is large because Electron bundles Chromium and Node.js.

## Troubleshooting Build Issues

### "Cannot find module" errors
```bash
rm -rf node_modules package-lock.json
npm install
npm run make
```

### Out of memory during build
```bash
# Increase Node.js memory
export NODE_OPTIONS="--max-old-space-size=4096"
npm run make
```

### macOS signing errors
```bash
# Skip signing for local builds
export CSC_IDENTITY_AUTO_DISCOVERY=false
npm run make
```

### Linux missing dependencies
```bash
# Debian/Ubuntu
sudo apt install -y build-essential libssl-dev rpm

# Fedora/RHEL
sudo dnf install -y @development-tools rpm-build
```

## Quick Start for End Users

Once built, provide these instructions to your users:

1. **Download** the installer for your platform
2. **Install** the application
3. **Launch** the app
4. **Configure** server connection:
   - Enter the WebSocket server details
   - Select your role (Asker or Helper)
   - Start session

That's it! No technical knowledge required.

## Summary

**On Azure VM (Server):**
```bash
npm run server
# or with PM2:
pm2 start ecosystem.config.js
```

**On Local Machine (Build Client):**
```bash
npm install
npm run make
# Distribute the files from out/make/
```

Users install the client app and connect to your Azure server by entering the server details at startup.
