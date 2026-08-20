import { connect, type TLSSocket } from "node:tls";

const SMTP_HOST = "smtp.gmail.com";
const SMTP_PORT = 465;
const SMTP_TIMEOUT_MS = 20_000;

export type GmailSmtpMessage = {
  fromHeader: string;
  fromAddress: string;
  to: string;
  replyTo?: string;
  subject: string;
  text: string;
  html: string;
};

export function getGmailSmtpConfig(): { user: string; password: string } | null {
  const user = process.env.GMAIL_SMTP_USER?.trim() || "";
  const password = process.env.GMAIL_SMTP_APP_PASSWORD?.replace(/\s+/g, "") || "";
  if (!user || !password) return null;
  return { user, password };
}

function toBase64(value: string): string {
  return Buffer.from(value, "utf8").toString("base64");
}

function encodeSubject(value: string): string {
  return `=?UTF-8?B?${toBase64(value)}?=`;
}

function buildMime(message: GmailSmtpMessage): string {
  const boundary = `neutrottt-${Date.now().toString(16)}`;
  const headers = [
    `From: ${message.fromHeader}`,
    `To: ${message.to}`,
    message.replyTo ? `Reply-To: ${message.replyTo}` : "",
    `Subject: ${encodeSubject(message.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ].filter((line) => line.length > 0);

  return [
    ...headers,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    toBase64(message.text),
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    toBase64(message.html),
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

function isCompleteSmtpReply(buffer: string): boolean {
  const lines = buffer.split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length === 0) return false;
  return /^\d{3} /.test(lines[lines.length - 1] ?? "");
}

function readReply(socket: TLSSocket): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const onData = (chunk: string | Buffer) => {
      buffer += chunk.toString();
      if (isCompleteSmtpReply(buffer)) {
        cleanup();
        resolve(buffer);
      }
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const onTimeout = () => {
      cleanup();
      reject(new Error("Gmail SMTP timeout."));
    };
    const cleanup = () => {
      socket.off("data", onData);
      socket.off("error", onError);
      socket.off("timeout", onTimeout);
    };
    socket.on("data", onData);
    socket.once("error", onError);
    socket.once("timeout", onTimeout);
  });
}

async function expectCode(socket: TLSSocket, allowed: number[]): Promise<string> {
  const reply = await readReply(socket);
  const code = Number(reply.slice(0, 3));
  if (!allowed.includes(code)) {
    throw new Error(`Gmail SMTP ${code}: ${reply.trim().slice(0, 300)}`);
  }
  return reply;
}

function writeLine(socket: TLSSocket, line: string): void {
  socket.write(`${line}\r\n`);
}

export async function sendViaGmailSmtp(message: GmailSmtpMessage): Promise<void> {
  const config = getGmailSmtpConfig();
  if (!config) {
    throw new Error("Faltan GMAIL_SMTP_USER o GMAIL_SMTP_APP_PASSWORD.");
  }

  const socket = await new Promise<TLSSocket>((resolve, reject) => {
    const connection = connect(
      {
        host: SMTP_HOST,
        port: SMTP_PORT,
        servername: SMTP_HOST,
        timeout: SMTP_TIMEOUT_MS,
      },
      () => resolve(connection),
    );
    connection.once("error", reject);
  });
  socket.setTimeout(SMTP_TIMEOUT_MS);

  try {
    await expectCode(socket, [220]);
    writeLine(socket, "EHLO neutrottt");
    await expectCode(socket, [250]);
    writeLine(socket, "AUTH LOGIN");
    await expectCode(socket, [334]);
    writeLine(socket, toBase64(config.user));
    await expectCode(socket, [334]);
    writeLine(socket, toBase64(config.password));
    await expectCode(socket, [235]);
    writeLine(socket, `MAIL FROM:<${message.fromAddress}>`);
    await expectCode(socket, [250]);
    writeLine(socket, `RCPT TO:<${message.to}>`);
    await expectCode(socket, [250, 251]);
    writeLine(socket, "DATA");
    await expectCode(socket, [354]);
    socket.write(`${buildMime(message)}\r\n.\r\n`);
    await expectCode(socket, [250]);
    writeLine(socket, "QUIT");
    await expectCode(socket, [221, 250]).catch(() => undefined);
  } finally {
    socket.end();
  }
}
