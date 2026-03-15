import chalk from "chalk";
import { isTTY, sleep } from "./theme.js";

// ─── ASCII DNA double helix ─────────────────────────────────────

const DNA_HELIX = `
     ╭─A═══T─╮
    ╱ G       C ╲
   │  T       A  │
    ╲ C       G ╱
     ╰─G═══C─╯
    ╱ A       T ╲
   │  C       G  │
    ╲ T       A ╱
     ╰─A═══T─╯
    ╱ G       C ╲
   │  T       A  │
    ╲ C       G ╱
     ╰─G═══C─╯
`.trimEnd();

const BRAND_LINES = [
  "",
  "",
  "",
  "    genomic-report",
  `    ${chalk.gray("v0.1.0")}`,
  "",
  `    ${chalk.gray("Personal genomic analysis")}`,
  `    ${chalk.gray("powered by science.")}`,
  "",
  "",
  "",
  "",
  "",
];

export async function printBanner(): Promise<void> {
  console.log("");

  if (!isTTY) {
    console.log(chalk.bold("🧬 genomic-report v0.1.0"));
    console.log(chalk.gray("Personal genomic analysis\n"));
    return;
  }

  let gradient: any;
  try {
    gradient = (await import("gradient-string")).default;
  } catch {
    // Fallback if gradient-string not available
    console.log(chalk.bold.cyan("🧬 genomic-report v0.1.0"));
    console.log(chalk.gray("Personal genomic analysis\n"));
    return;
  }

  const helixLines = DNA_HELIX.split("\n");
  const colored = gradient.pastel.multiline(DNA_HELIX);
  const coloredLines = colored.split("\n");

  for (let i = 0; i < coloredLines.length; i++) {
    const brand = BRAND_LINES[i] ?? "";
    const helix = coloredLines[i] ?? "";
    console.log(`  ${helix}${brand}`);
    await sleep(25);
  }

  console.log("");
}

export async function printCompactBanner(icon: string, title: string): Promise<void> {
  console.log("");

  if (!isTTY) {
    console.log(chalk.bold(`${icon} ${title}`));
    console.log("");
    return;
  }

  let gradient: any;
  try {
    gradient = (await import("gradient-string")).default;
  } catch {
    console.log(chalk.bold.cyan(`${icon} ${title}`));
    console.log("");
    return;
  }

  console.log(`  ${icon} ${gradient.pastel(title)}`);
  console.log("");
}
