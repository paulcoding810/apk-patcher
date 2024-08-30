import chalk from "chalk";

export const log = console.log;
export const info = (msg) => console.log(chalk.blue(msg));
export const success = (msg) => console.log(chalk.green(msg));
export const error = (msg) => console.log(chalk.red(msg));
