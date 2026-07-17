import pc from 'picocolors';

export const log = {
  info: (msg) => console.log(pc.blue(msg)),
  success: (msg) => console.log(pc.green(msg)),
  error: (msg) => console.log(pc.red(msg)),
  warn: (msg) => console.log(pc.yellow(msg)),
  dim: (msg) => console.log(pc.gray(msg)),
  cyan: (msg) => console.log(pc.cyan(msg)),
  bold: (msg) => pc.bold(msg)
};