#!/usr/bin/env node

import { applyPatches, observeListr } from "apk-mitm";
import { Command } from "commander";
import { execa } from "execa";
import fs from "fs";
import { Listr } from "listr2";
import readline from "node:readline/promises";
import path from "path";
import { parse_aapt } from "./helpers.js";
import { error, info, log, success } from "./log.js";

const CONFIG_PATH = path.join(import.meta.dirname, "config.json");

let config;

try {
  config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
} catch (err) {
  error(`Error reading config file: ${err.message}`);
  process.exit(1);
}

const {
  UBER_APK_SIGNER_PATH,
  APKEDITOR_PATH,
  APKTOOL_PATH,
  OUTPUT_PATCH_PATH,
  EDITOR,
} = config;

const program = new Command();

program
  .name("apk patcher")
  .description("CLI for patching apk")
  .version("1.0.3");

var packageName;
var versionName;
var apkName;
var projectDir;
var distPath;

async function editConfig() {
  try {
    await execa("vim", [CONFIG_PATH], { stdio: "inherit" });

    const updatedConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    Object.assign(config, updatedConfig);

    success("Configuration updated successfully!");
  } catch (error) {
    error(`Error editing configuration: ${error.message}`);
  }
}

program
  .option("-e, --edit-config", "Edit configuration file")
  .action(async () => {
    try {
      await editConfig();
    } catch (err) {
      error(err.message);
      process.exit(1);
    }
  });

program
  .command("info")
  .description("Get apk info")
  .argument("<apk-path>", "path to apk")
  .action(async (apkPath) => {
    try {
      const { stdout } = await execa("aapt", ["dump", "badging", apkPath]);
      const result = parse_aapt(stdout, apkPath);
      log(result);
    } catch (error) {
      console.log("Can not parse apk info, try parsing from error...");
      ({ packageName, versionName, projectDir, apkName, distPath } = parse_aapt(
        error.toString(),
        apkPath
      ));
    }
  });

program
  .command("merge")
  .description("Merging slit apk")
  .argument("<xapk-path>", "path to apk")
  .action(async (str) => {
    try {
      await execa("java", ["-jar", APKEDITOR_PATH, "m", "-i", str]);
      success("apk merged");
      process.exit();
    } catch (err) {
      error(err.message);
      process.exit(1);
    }
  });

program
  .description("Building loop")
  .argument("<apk-path>", "path to apk")
  .option("-r, --no-res", "Do not decode resources.")
  .option("-s, --no-src", "Do not decode sources.")
  .action(async (apkPath, options) => {
    if (!fs.existsSync(apkPath)) {
      error(`${apkPath} does not exist!`);
      return 1;
    }

    info("get package info");
    try {
      try {
        const { stdout } = await execa("aapt", ["dump", "badging", apkPath]);
        ({ packageName, versionName, projectDir, apkName, distPath } =
          parse_aapt(stdout, apkPath));
      } catch (error) {
        console.log("Can not parse apk info, try parsing from error...");
        ({ packageName, versionName, projectDir, apkName, distPath } =
          parse_aapt(error.toString(), apkPath));
      }
      log({ packageName, versionName, projectDir, apkName });
      log("_____________________________");

      if (!fs.existsSync(projectDir)) {
        let listCmd = ["-jar", APKTOOL_PATH];
        if (!options.res) {
          listCmd.push("-r");
        }
        if (!options.src) {
          listCmd.push("-s");
        }
        listCmd.push("d", apkPath, "-o", projectDir, "--only-main-classes");
        const tasks = new Listr([
          {
            title: "Decode APK",
            task: () => execa("java", listCmd),
          },
          {
            title: "Init git project",
            task: async () => {
              await execa("git", ["init"], { cwd: projectDir });
              await fs.promises.writeFile(
                `${projectDir}/.gitignore`,
                "/build\n/dist\n.DS_Store"
              );
              await execa("git", ["add", "."], { cwd: projectDir });
              await execa("git", ["commit", "-m", "init project"], {
                cwd: projectDir,
              });
            },
          },
          {
            title: "Prepare for MITM",
            task: async () => {
              await observeListr(applyPatches(projectDir)).forEach((line) =>
                log(line)
              );
              await execa("git", ["add", "."], { cwd: projectDir });
              await execa("git", ["commit", "-m", "mitm"], { cwd: projectDir });
            },
          },
          {
            title: "Open in Editor",
            task: () => execa(EDITOR, [projectDir]),
          },
          {
            title: "Perform first build & install",
            task: () => buildAndInstall(),
          },
        ]);

        await tasks.run();
      }

      info("build loop");
      await loop();
    } catch (err) {
      error(err.message);
      return 1;
    }
  });

program
  .command("config")
  .description("Show current configuration")
  .action(() => {
    log(config);
  });

async function buildAndInstall() {
  const tasks = new Listr([
    {
      title: "Building APK",
      task: () =>
        execa("java", ["-jar", APKTOOL_PATH, "b", projectDir, "--use-aapt2"]),
    },
    {
      title: "Signing APK",
      task: () =>
        execa("java", [
          "-jar",
          UBER_APK_SIGNER_PATH,
          "-a",
          distPath,
          "--allowResign",
          "--overwrite",
        ]),
    },
    {
      title: "Checking for connected devices",
      task: async (ctx, task) => {
        const { stdout } = await execa("adb", ["devices"]);
        const devices = stdout
          .split("\n")
          .slice(1)
          .filter((line) => line.trim() !== "")
          .map((line) => line.split("\t")[0]);

        if (devices.length === 0) {
          throw new Error(
            "No devices connected. Please connect a device and try again."
          );
        }

        if (devices.length > 1) {
          task.output = "Multiple devices detected. Using the first one.";
        }

        ctx.device = devices[0];
      },
    },
    {
      title: "Installing APK",
      task: (ctx) =>
        execa("adb", [
          "-s",
          ctx.device,
          "install",
          "--bypass-low-target-sdk-block",
          "-r",
          distPath,
        ]),
    },
    {
      title: "Launching app",
      task: (ctx) =>
        execa("adb", [
          "-s",
          ctx.device,
          "shell",
          "monkey",
          "-p",
          packageName,
          "1",
        ]),
    },
  ]);

  await tasks
    .run()
    .then(() => {
      success("APK installed\n");
    })
    .catch((e) => error(e));
}

const loop = async () => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  while (true) {
    let input = await rl.question("Build now? ('yes' or 'no'): ");
    input = input.trim().toLowerCase();

    if (input.startsWith("y")) {
      await buildAndInstall();
    } else if (input.startsWith("n")) {
      await execa("git", ["add", "."], { cwd: projectDir });
      await execa(
        "git",
        ["commit", "-m", `modded ${packageName} ${versionName}`],
        { cwd: projectDir }
      );
      await execa("mkdir", ["-p", `${OUTPUT_PATCH_PATH}/${packageName}`]);
      await execa("git", ["show", "--pretty="], { cwd: projectDir }).then(
        (result) =>
          fs.promises.writeFile(
            `${OUTPUT_PATCH_PATH}/${packageName}/${versionName}.patch`,
            result.stdout
          )
      );

      info(
        `patch file: ${OUTPUT_PATCH_PATH}/${packageName}/${versionName}.patch`
      );
      success("finished, exiting...\n");
      process.exit();
    } else if (input.startsWith("q")) {
      process.exit();
    }
  }
};

program.parse();
