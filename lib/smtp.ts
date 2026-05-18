import tls from "node:tls";

type SmtpConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  fromName: string;
};

type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export function getSmtpConfig(): SmtpConfig {
  const host = process.env.SMTP_HOST || "smtp.hostinger.com";
  const port = Number(process.env.SMTP_PORT || 465);
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASSWORD;
  const fromName = process.env.SMTP_FROM_NAME || "Decoralia Pintores";

  if (!user || !password) {
    throw new Error("Faltan SMTP_USER y SMTP_PASSWORD en variables de entorno.");
  }

  return { host, port, user, password, fromName };
}

export async function sendSmtpEmail(input: SendEmailInput) {
  const config = getSmtpConfig();
  const message = buildMimeMessage(input, config);
  await sendRawSmtpMessage(config, input.to, message);
}

function buildMimeMessage(input: SendEmailInput, config: SmtpConfig) {
  const alternativeBoundary = `decoralia-alt-${Date.now()}`;
  const from = `"${escapeHeader(config.fromName)}" <${config.user}>`;
  const headers = [
    `From: ${from}`,
    `To: ${input.to}`,
    `Subject: ${encodeHeader(input.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`,
  ];

  return [
    ...headers,
    "",
    `--${alternativeBoundary}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    "Content-Transfer-Encoding: 8bit",
    "",
    input.text,
    "",
    `--${alternativeBoundary}`,
    `Content-Type: text/html; charset="UTF-8"`,
    "Content-Transfer-Encoding: 8bit",
    "",
    input.html,
    "",
    `--${alternativeBoundary}--`,
    "",
  ].join("\r\n");
}

async function sendRawSmtpMessage(config: SmtpConfig, to: string, message: string) {
  const socket = tls.connect({
    host: config.host,
    port: config.port,
    servername: config.host,
  });
  socket.setEncoding("utf8");

  await new Promise<void>((resolve, reject) => {
    socket.once("secureConnect", resolve);
    socket.once("error", reject);
  });

  const reader = createSmtpReader(socket);
  await reader.expect([220]);
  await command(socket, reader, `EHLO decoralia.local`, [250]);
  await command(socket, reader, `AUTH PLAIN ${Buffer.from(`\0${config.user}\0${config.password}`).toString("base64")}`, [235]);
  await command(socket, reader, `MAIL FROM:<${config.user}>`, [250]);
  await command(socket, reader, `RCPT TO:<${to}>`, [250, 251]);
  await command(socket, reader, "DATA", [354]);
  socket.write(`${escapeSmtpData(message)}\r\n.\r\n`);
  await reader.expect([250]);
  await command(socket, reader, "QUIT", [221]);
  socket.end();
}

function createSmtpReader(socket: tls.TLSSocket) {
  let buffer = "";
  const pending: Array<() => void> = [];

  socket.on("data", (chunk) => {
    buffer += String(chunk);
    pending.splice(0).forEach((resolve) => resolve());
  });

  async function waitForData() {
    if (buffer.includes("\n")) return;
    await new Promise<void>((resolve) => pending.push(resolve));
  }

  return {
    async expect(validCodes: number[]) {
      while (true) {
        await waitForData();
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? "";
        const completed = [...lines].reverse().find((line) => /^\d{3} /.test(line));
        if (!completed) continue;

        const code = Number(completed.slice(0, 3));
        if (!validCodes.includes(code)) {
          throw new Error(`SMTP ${completed}`);
        }
        return completed;
      }
    },
  };
}

async function command(socket: tls.TLSSocket, reader: ReturnType<typeof createSmtpReader>, value: string, validCodes: number[]) {
  socket.write(`${value}\r\n`);
  return reader.expect(validCodes);
}

function encodeHeader(value: string) {
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function escapeHeader(value: string) {
  return value.replaceAll('"', "'");
}

function escapeSmtpData(value: string) {
  return value.replace(/^\./gm, "..");
}
