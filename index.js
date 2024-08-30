import { applyPatches, observeListr } from "apk-mitm";
import { Command } from "commander";
import { execa } from "execa";
import fs from "fs";
import { Listr } from "listr2";
import readline from "node:readline/promises";
import path from "path";
import { error, info, log, success } from "./log.js";

const {
  UBER_APK_SIGNER_PATH,
  APKEDITOR_PATH,
  APKTOOL_PATH,
  OUTPUT_PATCH_PATH,
} = process.env;

const program = new Command();

program
  .name("apk patcher")
  .description("CLI for patching apk")
  .version("1.0.1");

var packageName;
var versionName;
var apkName;
var projectDir;
var distPath;

program
  .command("merge")
  .description("Merging slit apk")
  .argument("<string>", "path to apk")
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
  .command("loop")
  .description("Building loop")
  .argument("<string>", "path to apk")
  .action(async (str) => {
    const apkPath = str;

    if (!fs.existsSync(apkPath)) {
      error(`${apkPath} does not exist!`);
      return 1;
    }

    info("get package info");
    try {
      const { stdout } = await execa("aapt", ["dump", "badging", apkPath]);
      const regex = /name='(.*?)'.*versionName='(.*?)'/;
      const match = stdout.match(regex);

      if (match) {
        packageName = match[1];
        versionName = match[2];
        projectDir = `${path.dirname(apkPath)}/${packageName}`;
        apkName = `${path.basename(apkPath)}`;
        distPath = `${projectDir}/dist/${apkName}`;
      } else {
        throw new Error("Can not parse apk info");
      }

      log({ packageName, versionName, projectDir, apkName });
      log("_____________________________");

      if (!fs.existsSync(projectDir)) {
        const tasks = new Listr([
          {
            title: "Decode APK",
            task: () =>
              execa("java", [
                "-jar",
                APKTOOL_PATH,
                "d",
                apkPath,
                "-o",
                projectDir,
                "--only-main-classes",
              ]),
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
            title: "Open in Sublime Text",
            task: () => execa("subl", [projectDir]),
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

program.command("env").action(() => {
  log({
    APKTOOL_PATH,
    APKEDITOR_PATH,
    UBER_APK_SIGNER_PATH,
    OUTPUT_PATCH_PATH,
  });
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
        execa("adb", ["-s", ctx.device, "install", "-r", distPath]),
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

  await tasks.run();
  success("APK installed\n");
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
