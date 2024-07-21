import { applyPatches, observeListr } from "apk-mitm"
import chalk from 'chalk'
import { exec } from 'child_process'
import { Command } from 'commander'
import fs from 'fs'
import path from 'path'
import readline from 'readline'
import util from 'util'

const {
  UBER_APK_SIGNER_PATH,
  APKTOOL_PATH
} = process.env

const info = (msg) => console.log(chalk.blue(msg))
const success = (msg) => console.log(chalk.green(msg))
const execPromise = util.promisify(exec)

const program = new Command();

program
  .name('apk patcher')
  .description('CLI for patching apk')
  .version('1.0.1');

var packageName
var versionName
var apkName
var projectDir
var distPath

program.command('loop')
  .description('Building loop')
  .argument('<string>', 'path to apk')
  .action(async (str, options) => {

    const apkPath = str

    // check if path exists
    if (!fs.existsSync(apkPath)) {
      console.error(`${apkPath} does not exist!`)
      return 1
    }

    info('get package info')
    const { stdout, stderr } = await execPromise(`aapt dump badging "${apkPath}"`);

    if (stderr) {
      console.error(stderr);
      return 1;
    }

    const regex = /name='([\w.]+)'.*versionName='([\d.]+)'/;
    const match = stdout.match(regex);

    if (match) {
      packageName = match[1];
      versionName = match[2];
      projectDir = `${path.dirname(apkPath)}/${packageName}`
      apkName = `${path.basename(apkPath)}`
      distPath = `${projectDir}/dist/${apkName}`
    } else {
      console.error('Can not parse apk info')
      return 2
    }

    console.log({ packageName, versionName, projectDir, apkName })
    console.log('_____________________________')

    if (fs.existsSync(projectDir)) {
      info(`${projectDir} exists, skip to building loop`)
      loop()
    } else {
      info('decode apk')
      const { stderr, stdout } = await execPromise(`java -jar ${process.env.APKTOOL_PATH} d "${apkPath}" -o "${projectDir}" --only-main-classes`)
      if (stderr) {
        console.error(error)
        return 3
      }

      info('init git project')
      const gitState = await execPromise(`cd ${projectDir} && git init && echo '/build\n/dist' > ${projectDir}/.gitignore && git add . && git commit -m "init project"`, { maxBuffer: 1024 * 500 })
      if (gitState.stderr) {
        console.error(gitState.error)
        return
      }

      info('prepare for mitm')
      try {

        await observeListr(applyPatches(projectDir)).forEach((line) =>
          console.log(line),
        );
        success("\nSuccessfully applied MITM patches!")
        await execPromise(`cd ${projectDir} &&  git add . && git commit -m "mitm"`)
      } catch (error) {
        console.error(error)
        return
      }

      info('open in sublime text')
      await execPromise(`subl ${projectDir}`)
    }
  })

program
  .command('env')
  .action(() => {
    console.log({
      APKTOOL_PATH,
      UBER_APK_SIGNER_PATH
    })
  })

const loop = () => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.question("Please enter 'yes' or 'no': ", async (input) => {
    input = input.trim().toLowerCase();
    const pwd = await execPromise(`pwd`)

    if (input.startsWith('y')) {
      const buildState = await execPromise(`
              java -jar ${process.env.APKTOOL_PATH} b "${projectDir}" --use-aapt2;
              java -jar ${process.env.UBER_APK_SIGNER_PATH} -a "$${distPath}" --allowResign --overwrite;
              adb install -r "$${distPath}";
            `)
      if (buildState.error) {
        console.error(buildState.error)
      } else {
        success('apk installed')
      }
      loop()
    }
    if (input.startsWith('n')) {
      await execPromise(`
                    git --git-dir "${projectDir}/.git" add .
                    git --git-dir "${projectDir}/.git" commit -m "modded ${packageName} ${versionName}"
                    subl .
                    subl readme.md
                    git --git-dir "${projectDir}/.git" show --pretty="" > "${packageName}/${versionName}.patch"
              `)
    }
  })
}



program.parse();