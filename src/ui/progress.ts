import chalk from "chalk";
import type { Ora } from "ora";
import { createSpinner, succeedSpinner, failSpinner } from "./spinner.js";
import { isTTY, SYM } from "./theme.js";

// ─── Step-by-step progress tracker ──────────────────────────────

export class ProgressTracker {
  private current = 0;
  private readonly total: number;
  private readonly globalStart: number;
  private stepStart = 0;

  constructor(totalSteps: number) {
    this.total = totalSteps;
    this.globalStart = performance.now();
  }

  nextStep(label: string): Ora {
    this.current++;
    this.stepStart = performance.now();
    const prefix = chalk.gray(`[${this.current}/${this.total}]`);
    return createSpinner(`${prefix} ${label}`);
  }

  complete(spinner: Ora, summary: string): void {
    const dt = ((performance.now() - this.stepStart) / 1000).toFixed(1);
    const prefix = chalk.gray(`[${this.current}/${this.total}]`);
    succeedSpinner(spinner, `${prefix} ${summary}`, `${dt}s`);
  }

  fail(spinner: Ora, message: string): void {
    const prefix = chalk.gray(`[${this.current}/${this.total}]`);
    failSpinner(spinner, `${prefix} ${message}`);
  }

  elapsed(): string {
    return ((performance.now() - this.globalStart) / 1000).toFixed(1) + "s";
  }
}

// ─── Live SNP counter ───────────────────────────────────────────

export interface SnpCounter {
  update(current: number): void;
  finish(): void;
}

export function createSnpCounter(total: number): SnpCounter {
  if (!isTTY || total < 1000) {
    return { update() {}, finish() {} };
  }

  let lastRender = 0;
  const BAR_WIDTH = 20;

  function render(current: number): void {
    const pct = Math.min(100, Math.round((current / total) * 100));
    const filled = Math.round((pct / 100) * BAR_WIDTH);
    const bar =
      chalk.cyan(SYM.bar.repeat(filled)) +
      chalk.gray(SYM.barEmpty.repeat(BAR_WIDTH - filled));

    const currentFmt = current.toLocaleString().padStart(
      total.toLocaleString().length
    );
    const totalFmt = total.toLocaleString();

    const line = `  Scanning SNP ${currentFmt} / ${totalFmt}  [${bar}]  ${String(pct).padStart(3)}%`;
    process.stdout.write(`\r${line}`);
  }

  return {
    update(current: number): void {
      const now = performance.now();
      if (current < total && now - lastRender < 16 && current % 1000 !== 0) return;
      lastRender = now;
      render(current);
    },
    finish(): void {
      // Clear the counter line
      process.stdout.write("\r" + " ".repeat(80) + "\r");
    },
  };
}
