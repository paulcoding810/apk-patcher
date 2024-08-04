import { applyPatches, observeListr } from "apk-mitm"
import chalk from 'chalk'
import { exec } from 'child_process'
import { Command } from 'commander'
import fs from 'fs'
import path from 'path'
import readline from 'node:readline/promises'
import util from 'util'

const {
  UBER_APK_SIGNER_PATH,
  APKEDITOR_PATH,
  APKTOOL_PATH,
  OUTPUT_PATCH_PATH,
  RES_SIMPLIFY_PATH,
} = process.env

const log = console.log
const info = (msg) => console.log(chalk.blue(msg))
const success = (msg) => console.log(chalk.green(msg))
const error = (msg) => console.log(chalk.red(msg))

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

program.command('merge')
  .description('Merging slit apk')
  .argument('<string>', 'path to apk')
  .action(async (str, options) => {
    const { stderr, stdout } = await execPromise(`java -jar ${APKEDITOR_PATH} m -i "${str}"`)
    if (stderr) {
      error(stderr);
      return 1;
    }
    success("apk merged")
    process.exit()
  })

  /**
   * deobfuscator resources
   * https://github.com/MrIkso/ResSimplify
   */
program.command('deobf')
  .description('Deobfuscator resources')
  .argument('<string>', 'path to apk')
  .action(async (str, options) => {
    const { stderr, stdout } = await execPromise(`java -jar ${RES_SIMPLIFY_PATH} --in "${str}" --out "${str}"`)
    if (stderr) {
      error(stderr);
      return 1;
    }
    success("Deobfuscated")
    process.exit()
  })


program.command('loop')
  .description('Building loop')
  .argument('<string>', 'path to apk')
  .action(async (str, options) => {

    const apkPath = str

    // check if path exists
    if (!fs.existsSync(apkPath)) {
      error(`${apkPath} does not exist!`)
      return 1
    }

    info('get package info')
    const { stdout, stderr } = await execPromise(`aapt dump badging "${apkPath}"`);

    if (stderr) {
      error(stderr);
      return 1;
    }

    const regex = /name='(.*?)'.*versionName='(.*?)'/
    const match = stdout.match(regex);

    if (match) {
      packageName = match[1];
      versionName = match[2];
      projectDir = `${path.dirname(apkPath)}/${packageName}`
      apkName = `${path.basename(apkPath)}`
      distPath = `${projectDir}/dist/${apkName}`
    } else {
      error('Can not parse apk info', match, stdout)
      return 2
    }

    log({ packageName, versionName, projectDir, apkName })
    log('_____________________________')

    if (!fs.existsSync(projectDir)) {
      info('decode apk')
      const { stderr, stdout } = await execPromise(`java -jar ${process.env.APKTOOL_PATH} d "${apkPath}" -o "${projectDir}" --only-main-classes`)
      if (stderr) {
        error(stderr)
        return 3
      }

      info('init git project')
      const gitState = await execPromise(`cd ${projectDir} && git init && echo '/build\n/dist\n.DS_Store' > ${projectDir}/.gitignore && git add . && git commit -m "init project"`, { maxBuffer: 5 * 1024 * 1024 })
      if (gitState.stderr) {
        error(gitState.stderr)
        // return
      }

      info('prepare for mitm')
      try {
        await observeListr(applyPatches(projectDir)).forEach((line) =>
          log(line),
        );
        success("\nSuccessfully applied MITM patches!")
        await execPromise(`cd ${projectDir} &&  git add . && git commit -m "mitm"`)
      } catch (error) {
        error(error)
        return
      }

      info('open in sublime text')
      await execPromise(`subl ${projectDir}`)

    }
    info('build loop')
    loop()
  })

program
  .command('env')
  .action(() => {
    log({
      APKTOOL_PATH,
      APKEDITOR_PATH,
      UBER_APK_SIGNER_PATH,
      OUTPUT_PATCH_PATH
    })
  })

const loop = async () => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  while (true) {
    let input = await rl.question("Build now? ('yes' or 'no'): ")
    input = input.trim().toLowerCase();

    if (input.startsWith('y')) {
      info('building apk')
      const buildState = await execPromise(`java -jar ${process.env.APKTOOL_PATH} b "${projectDir}" --use-aapt2`)

      if (buildState.error) {
        error(buildState.error)
      }

      info('signing apk')
      const signState = await execPromise(`java -jar ${process.env.UBER_APK_SIGNER_PATH} -a "${distPath}" --allowResign --overwrite`)
      if (signState.error) {
        error(signState.error)
      }

      info('installing apk')
      const installState = await execPromise(`adb install -r "${distPath}"`)

      if (installState.error) {
        error(installState.error)
      }

      success('apk installed\n')
    }
    else if (input.startsWith('n')) {
      await execPromise(`
                    cd "${projectDir}"
                    git add .
                    git commit -m "modded ${packageName} ${versionName}"
                    mkdir -p "${OUTPUT_PATCH_PATH}/${packageName}"
                    git show --pretty="" > "${OUTPUT_PATCH_PATH}/${packageName}/${versionName}.patch"
              `)
      info(`patch file: ${OUTPUT_PATCH_PATH}/${packageName}/${versionName}.patch`)
      success('finished, exiting...\n')
      process.exit()
    } else if (input.startsWith('q')) {
      break
    }
  }
}



program.parse();