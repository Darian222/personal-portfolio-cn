const encoder = new TextEncoder();
const decoder = new TextDecoder();

function json(data: unknown, status?: number) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

function escapeHtml(str: string) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function base64Encode(str: string) {
  let binary = "";
  for (let i = 0; i < str.length; i++) {
    binary += String.fromCharCode(str.charCodeAt(i) & 0xff);
  }
  return btoa(binary);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_MESSAGE_LEN = 5000;
const STATIC = "./public";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};

async function serveStatic(pathname: string) {
  const filePath = pathname === "/" ? "/index.html" : pathname;
  const ext = filePath.slice(filePath.lastIndexOf("."));
  const mime = MIME[ext] || "application/octet-stream";
  try {
    const data = await Deno.readFile(STATIC + filePath);
    return new Response(data, { headers: { "Content-Type": mime } });
  } catch {
    return null;
  }
}

class SmtpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SmtpError";
  }
}

async function smtpReadLine(conn: Deno.TlsConn): Promise<string> {
  const buf = new Uint8Array(1);
  let line = "";
  while (true) {
    const n = await conn.read(buf);
    if (n === null) throw new SmtpError("Connection closed");
    const ch = decoder.decode(buf.subarray(0, n));
    line += ch;
    if (line.endsWith("\r\n")) return line.trimEnd();
    if (line.length > 4096) throw new SmtpError("Line too long");
  }
}

async function smtpExpect(conn: Deno.TlsConn, prefix: string) {
  const line = await smtpReadLine(conn);
  if (!line.startsWith(prefix)) throw new SmtpError("SMTP error: " + line);
  return line;
}

async function smtpCommand(conn: Deno.TlsConn, cmd: string, expectPrefix: string) {
  await conn.write(encoder.encode(cmd + "\r\n"));
  return smtpExpect(conn, expectPrefix);
}

async function sendViaQQ(visitorName: string, visitorEmail: string, message: string) {
  const smtpUser = Deno.env.get("QQ_SMTP_USER") || "1449157740@qq.com";
  const smtpPass = Deno.env.get("QQ_SMTP_PASS");
  if (!smtpPass) throw new Error("QQ_SMTP_PASS not configured");

  const conn = await Deno.connectTls({ hostname: "smtp.qq.com", port: 465 });
  try {
    await smtpExpect(conn, "220");
    await smtpCommand(conn, "EHLO deno", "250");
    await smtpCommand(conn, "AUTH LOGIN", "334");
    await smtpCommand(conn, base64Encode(smtpUser), "334");
    await smtpCommand(conn, base64Encode(smtpPass), "235");
    await smtpCommand(conn, "MAIL FROM:<" + smtpUser + ">", "250");
    await smtpCommand(conn, "RCPT TO:<" + smtpUser + ">", "250");
    await smtpCommand(conn, "DATA", "354");

    const body = [
      "From: 个人作品集 <" + smtpUser + ">",
      "To: " + smtpUser,
      "Reply-To: " + visitorName + " <" + visitorEmail + ">",
      "Subject: =?UTF-8?B?" + base64Encode(visitorName + " 的咨询留言") + "?=",
      "MIME-Version: 1.0",
      'Content-Type: text/html; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      base64Encode(
        "<h2>新的咨询留言</h2>" +
        "<p><strong>姓名：</strong>" + escapeHtml(visitorName) + "</p>" +
        "<p><strong>邮箱：</strong>" + escapeHtml(visitorEmail) + "</p>" +
        "<p><strong>留言：</strong>" + escapeHtml(message) + "</p>"
      ),
      "",
      ".",
      "",
    ].join("\r\n");

    await conn.write(encoder.encode(body));
    await smtpExpect(conn, "250");
    await smtpCommand(conn, "QUIT", "221");
  } finally {
    try { conn.close(); } catch { /* ignore */ }
  }
}

Deno.serve(async (request) => {
  const url = new URL(request.url);

  if (url.pathname === "/api/contact" && request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  if (url.pathname === "/api/contact" && request.method === "POST") {
    let data;
    try {
      data = await request.json();
    } catch {
      return json({ ok: false, error: "无效的请求数据" }, 400);
    }

    const name = typeof data.name === "string" ? data.name.trim() : "";
    const email = typeof data.email === "string" ? data.email.trim() : "";
    const message = typeof data.message === "string" ? data.message.trim() : "";

    if (!name || !email || !message) {
      return json({ ok: false, error: "请填写所有字段" }, 400);
    }

    if (!EMAIL_RE.test(email)) {
      return json({ ok: false, error: "请输入有效的邮箱地址" }, 400);
    }

    if (message.length > MAX_MESSAGE_LEN) {
      return json({ ok: false, error: "留言内容过长，请精简后发送" }, 400);
    }

    try {
      await sendViaQQ(name, email, message);
      return json({ ok: true });
    } catch (err) {
      console.error("发送失败:", err);
      console.log("留言内容:", JSON.stringify({ name, email, message }));
      return json({ ok: false, error: "发送失败，请稍后重试" }, 500);
    }
  }

  const staticFile = await serveStatic(url.pathname);
  if (staticFile) return staticFile;
  return new Response("Not Found", { status: 404 });
});
