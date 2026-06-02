/** Minimal colorized console logger. Memory's run-log handles persistence. */

const colors = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
};

function stamp(): string {
  return new Date().toLocaleTimeString();
}

export const log = {
  info(scope: string, msg: string) {
    console.log(`${colors.dim}${stamp()}${colors.reset} ${colors.cyan}[${scope}]${colors.reset} ${msg}`);
  },
  step(scope: string, msg: string) {
    console.log(`${colors.dim}${stamp()}${colors.reset} ${colors.magenta}▸ [${scope}]${colors.reset} ${msg}`);
  },
  ok(scope: string, msg: string) {
    console.log(`${colors.dim}${stamp()}${colors.reset} ${colors.green}✓ [${scope}]${colors.reset} ${msg}`);
  },
  warn(scope: string, msg: string) {
    console.warn(`${colors.dim}${stamp()}${colors.reset} ${colors.yellow}! [${scope}]${colors.reset} ${msg}`);
  },
  error(scope: string, msg: string) {
    console.error(`${colors.dim}${stamp()}${colors.reset} ${colors.red}✗ [${scope}]${colors.reset} ${msg}`);
  },
  banner(text: string) {
    console.log(`\n${colors.blue}━━━ ${text} ━━━${colors.reset}\n`);
  },
};
