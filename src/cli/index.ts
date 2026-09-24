#!/usr/bin/env bun
import { Command } from "commander";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { startCommand } from "./commands/start.js";
import { initCommand } from "./commands/init.js";
import { serveCommand } from "./commands/serve.js";
import { listCommand } from "./commands/list.js";
import { stopCommand } from "./commands/stop.js";
import { unregisterCommand } from "./commands/unregister.js";
import { reloadCommand } from "./commands/reload.js";
import { validateCommand } from "./commands/validate.js";
import { createCommand } from "./commands/create.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const packageJson = JSON.parse(
  readFileSync(join(__dirname, "../../package.json"), "utf-8"),
);

const program = new Command();

program
  .name("artifact")
  .description("CLI for managing and viewing HTML artifacts")
  .version(packageJson.version);
initCommand(program);
serveCommand(program);
startCommand(program);
listCommand(program);
stopCommand(program);
unregisterCommand(program);
reloadCommand(program);
validateCommand(program);
createCommand(program);
program.parse();
