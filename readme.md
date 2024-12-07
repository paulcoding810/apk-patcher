# APK Patcher CLI

A command-line tool that minimize [APKLab](https://github.com/APKLab/) for patching and modifying Android APK files with MITM capabilities.

## Installation

```bash
npm install @paulcoding810/apk-patcher
```

## Configuration

Create a `config.json` file in your project root with the following structure:

```json
{
  "UBER_APK_SIGNER_PATH": "/path/to/uber-apk-signer.jar",
  "APKEDITOR_PATH": "/path/to/apkeditor.jar",
  "APKTOOL_PATH": "/path/to/apktool.jar",
  "OUTPUT_PATCH_PATH": "/path/to/patches/output",
  "EDITOR": "code"  // or any preferred text editor
}
```

## Usage

### View Current Configuration

```bash
apk-patcher config
```

### Edit Configuration

```bash
apk-patcher --edit-config
```

### Merge Split APK

```bash
apk-patcher merge <path-to-apk>
```

### Start Patching Loop

```bash
apk-patcher loop <path-to-apk>
```

The loop command will:

1. Decode the APK
2. Initialize a git repository
3. Apply MITM patches
4. Open the project in your configured editor
5. Start a build-test loop where you can:
   - Build and install the modified APK (enter 'y')
   - Save changes and generate patch file (enter 'n')
   - Quit without saving (enter 'q')

## Features

- APK decompilation and recompilation
- Automatic MITM patching
- Git integration for tracking changes
- Automatic APK signing
- Direct installation to connected Android device
- Patch file generation
- Build and test loop for rapid development

## Working Directory Structure

When working with an APK, the tool creates the following structure:

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
