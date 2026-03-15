import ora, { type Ora } from "ora";
import chalk from "chalk";
import { isTTY } from "./theme.js";

export function createSpinner(text: string): Ora {
  return ora({
    text: chalk.cyan(text),
    spinner: "dots",
    color: "cyan",
    isSilent: !isTTY,
  });
}

export function succeedSpinner(spinner: Ora, text: string, detail?: string): void {
  spinner.succeed(
    chalk.green(text) + (detail ? chalk.gray(` ${detail}`) : "")
  );
}

export function failSpinner(spinner: Ora, text: string): void {
  spinner.fail(chalk.red(text));
}
