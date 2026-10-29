import chalk from "chalk";

// Detect if output is TTY and NO_COLOR is not set
function isColorSupported(): boolean {
  if (process.env.NO_COLOR) return false;
  return process.stdout.isTTY === true;
}

export function displayBanner(): void {
  const useColor = isColorSupported();
  const width = process.stdout.columns ?? 80;

  // ASCII art banner (width-aware)
  const banner = `
 _  _ __     _ _        _
| |/ /|  |   | | |      | |
| ' / |  |__ | | | ___  | |__  ___  ___ _ __ 
| . \\ |  '_ \\| | |/ _ \\ | '_ \\/ _ \\/ _ \\ '_ \\
| |\\ \\| |_) | | | (_) || |_) | (_) | (_) | | |
|_| \\_\\____/|_|_|\\___/ |_.__/ \\___/\\___/|_| |_|
`;

  const tagline = "API performance testing, made simple.";

  if (width < 50) {
    // Minimal output for very narrow terminals
    console.log(useColor ? chalk.cyan("k6boost") : "k6boost");
  } else {
    // Full banner
    if (useColor) {
      console.log(chalk.cyan(banner));
    } else {
      console.log(banner);
    }
  }

  // Tagline
  if (useColor) {
    console.log(chalk.gray(`${tagline}\n`));
  } else {
    console.log(`${tagline}\n`);
  }
}

export function displayHeader(title: string): void {
  const useColor = isColorSupported();

  if (useColor) {
    console.log(chalk.bold.cyan(`\n→ ${title}`));
  } else {
    console.log(`\n→ ${title}`);
  }
}

export function displaySuccess(message: string): void {
  const useColor = isColorSupported();

  if (useColor) {
    console.log(chalk.green(`✓ ${message}`));
  } else {
    console.log(`✓ ${message}`);
  }
}

export function displayError(message: string): void {
  const useColor = isColorSupported();

  if (useColor) {
    console.error(chalk.red(`✗ ${message}`));
  } else {
    console.error(`✗ ${message}`);
  }
}

export function displayWarning(message: string): void {
  const useColor = isColorSupported();

  if (useColor) {
    console.log(chalk.yellow(`⚠ ${message}`));
  } else {
    console.log(`⚠ ${message}`);
  }
}

export function displayInfo(message: string): void {
  const useColor = isColorSupported();

  if (useColor) {
    console.log(chalk.blue(`ℹ ${message}`));
  } else {
    console.log(`ℹ ${message}`);
  }
}

export function maskSecret(value: string, visibleChars: number = 4): string {
  if (value.length <= visibleChars) return "*".repeat(value.length);
  const visible = value.slice(-visibleChars);
  return "*".repeat(Math.max(3, value.length - visibleChars)) + visible;
}
