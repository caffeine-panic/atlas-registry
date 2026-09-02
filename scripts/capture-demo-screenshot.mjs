import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const outputPath = resolve(
  projectRoot,
  process.argv[2] ?? "docs/assets/atlas-registry-demo.png",
);
const demoUrl = "http://127.0.0.1:1420/?demo=1";
const demoReadySelector = '[data-demo-ready="true"]';
const browserProfile = await mkdtemp(join(tmpdir(), "atlas-demo-browser-"));
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
let previewProcess;
let browserProcess;

try {
  await run(npmCommand, ["run", "build"], 120_000);
  previewProcess = spawn(
    npmCommand,
    ["run", "preview", "--", "--host", "127.0.0.1", "--port", "1420"],
    { cwd: projectRoot, stdio: ["ignore", "pipe", "pipe"] },
  );
  const previewOutput = collectOutput(previewProcess);
  await waitForServer(demoUrl, previewProcess, previewOutput);

  const browser = await findBrowser();
  const debuggingPort = await availablePort();
  browserProcess = spawn(
    browser,
    [
      "--headless=new",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-default-apps",
      "--disable-extensions",
      "--disable-sync",
      "--hide-scrollbars",
      "--no-first-run",
      "--force-device-scale-factor=1",
      "--window-size=1440,900",
      `--remote-debugging-port=${debuggingPort}`,
      `--user-data-dir=${browserProfile}`,
      demoUrl,
    ],
    { cwd: projectRoot, stdio: ["ignore", "pipe", "pipe"] },
  );
  const browserOutput = collectOutput(browserProcess);
  const target = await waitForPageTarget(
    debuggingPort,
    browserProcess,
    browserOutput,
  );
  const client = await connectCdp(target.webSocketDebuggerUrl);
  try {
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await waitForDemoReady(client);
    const capture = await client.send("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
      captureBeyondViewport: false,
    });
    if (typeof capture.data !== "string") {
      throw new Error("浏览器未返回有效的 PNG 截图数据");
    }
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, Buffer.from(capture.data, "base64"));
  } finally {
    try {
      await Promise.race([client.send("Browser.close"), delay(2_000)]);
    } catch {
      // Browser.close 可能先关闭 DevTools socket，再返回协议响应。
    }
    client.close();
  }

  process.stdout.write(`${outputPath}\n`);
} finally {
  await stopProcess(browserProcess);
  await stopProcess(previewProcess);
  await rm(browserProfile, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  });
}

function collectOutput(processHandle) {
  let output = "";
  processHandle.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  processHandle.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });
  return () => output;
}

async function waitForServer(url, processHandle, output) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (processHandle.exitCode !== null) {
      throw new Error(`演示服务器提前退出\n${output()}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Vite 尚未监听端口时继续短暂轮询。
    }
    await delay(100);
  }
  throw new Error(`等待演示服务器超时\n${output()}`);
}

async function waitForPageTarget(port, processHandle, output) {
  const deadline = Date.now() + 20_000;
  const endpoint = `http://127.0.0.1:${port}/json/list`;
  while (Date.now() < deadline) {
    if (processHandle.exitCode !== null) {
      throw new Error(`浏览器提前退出\n${output()}`);
    }
    try {
      const response = await fetch(endpoint);
      if (response.ok) {
        const targets = await response.json();
        const target = targets.find(
          (item) => item.type === "page" && item.url.startsWith(demoUrl),
        );
        if (target?.webSocketDebuggerUrl) return target;
      }
    } catch {
      // DevTools 端口尚未就绪时继续短暂轮询。
    }
    await delay(100);
  }
  throw new Error(`等待浏览器 DevTools 页面超时\n${output()}`);
}

async function waitForDemoReady(client) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const result = await client.send("Runtime.evaluate", {
      expression: `document.querySelector(${JSON.stringify(demoReadySelector)}) !== null`,
      returnByValue: true,
    });
    if (result.result?.value === true) return;
    await delay(100);
  }
  throw new Error("合成演示工作区未在截图前进入 ready 状态");
}

async function connectCdp(url) {
  const socket = new WebSocket(url);
  await new Promise((resolveOpen, reject) => {
    socket.addEventListener("open", resolveOpen, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  let nextId = 1;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id === undefined) return;
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result ?? {});
  });
  socket.addEventListener("close", () => {
    for (const request of pending.values()) {
      request.reject(new Error("浏览器 DevTools 连接已关闭"));
    }
    pending.clear();
  });

  return {
    send(method, params = {}) {
      const id = nextId;
      nextId += 1;
      return new Promise((resolveRequest, reject) => {
        pending.set(id, { resolve: resolveRequest, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    close() {
      socket.close();
    },
  };
}

async function availablePort() {
  const server = createServer();
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  const port =
    typeof address === "object" && address ? address.port : undefined;
  await new Promise((resolveClose) => server.close(resolveClose));
  if (!port) throw new Error("无法分配浏览器 DevTools 端口");
  return port;
}

async function findBrowser() {
  const configured = process.env.ATLAS_DEMO_BROWSER;
  const candidates = [
    configured,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    process.env.PROGRAMFILES
      ? join(process.env.PROGRAMFILES, "Google/Chrome/Application/chrome.exe")
      : undefined,
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // 继续检查下一个受支持的本机浏览器位置。
    }
  }
  throw new Error(
    "未找到 Chrome、Chromium 或 Edge；可通过 ATLAS_DEMO_BROWSER 指定可执行文件",
  );
}

function run(command, arguments_, timeoutMs = 30_000) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, arguments_, {
      cwd: projectRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`子进程在 ${timeoutMs} ms 后超时：${command}`));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("exit", (code) => {
      clearTimeout(timeout);
      if (code === 0) resolveRun(stdout);
      else reject(new Error(`子进程退出码 ${code}\n${stderr}`));
    });
  });
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

async function stopProcess(processHandle) {
  if (!processHandle || processHandle.exitCode !== null) return;
  processHandle.kill("SIGTERM");
  await new Promise((resolveExit) => {
    processHandle.once("exit", resolveExit);
    setTimeout(resolveExit, 2_000);
  });
}
