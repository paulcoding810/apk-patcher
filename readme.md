# APK Patcher CLI

[![npm version](https://img.shields.io/npm/v/@paulcoding810/apk-patcher?color=blue&label=npm)](https://www.npmjs.com/package/@paulcoding810/apk-patcher)

A command-line tool that minimize [APKLab](https://github.com/APKLab/) for patching and modifying Android APK files with MITM capabilities.

## Installation

```bash
npm install -g @paulcoding810/apk-patcher
```

## Usage

### Show help menu

```bash
apk-patcher --help
```

### Patching Loop

Running `apk-patcher <path-to-apk>` will:

1. Decode the APK
2. Initialize a git repository
3. Apply MITM patches
4. Open the project in your configured editor
5. Start a build-test loop where you can:
   - Build and install the modified APK (`y`)
   - Save changes and generate patch file (`n`)
   - Quit without saving (`q`)

## Features

- APK decompilation & recompilation
- Automatic MITM patching
- Git integration for tracking changes
- Automatic APK signing
- Direct installation to connected Android device
- Patch file generation
- Build & test loop for rapid development

## Working Directory Structure

When working with an APK, the tool creates:

```
patches/
  └── [package-name]/
      └── [version].patch
```

## Notes

- Requires an Android device connected via ADB for testing
- Automatically handles APK signing
- Generates patch files for version control
- Supports multiple device handling
- Maintains git history of modifications

## License

[MIT](./LICIENCE)
