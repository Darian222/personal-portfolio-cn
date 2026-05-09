const nodemailer = require("nodemailer");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_MESSAGE_LEN = 5000;

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";

  if (!name || !email || !message) {
    return res.status(400).json({ ok: false, error: "请填写所有字段" });
  }

  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ ok: false, error: "请输入有效的邮箱地址" });
  }

  if (message.length > MAX_MESSAGE_LEN) {
    return res.status(400).json({ ok: false, error: "留言内容过长，请精简后发送" });
  }

  const smtpUser = process.env.QQ_SMTP_USER || "1449157740@qq.com";
  const smtpPass = process.env.QQ_SMTP_PASS;

  if (!smtpPass) {
    console.log("QQ_SMTP_PASS not configured, logging message:", { name, email, message });
    return res.status(200).json({ ok: true });
  }

  const transporter = nodemailer.createTransport({
    host: "smtp.qq.com",
    port: 465,
    secure: true,
    auth: { user: smtpUser, pass: smtpPass },
  });

  const html = [
    "<h2>新的咨询留言</h2>",
    "<p><strong>姓名：</strong>" + escapeHtml(name) + "</p>",
    "<p><strong>邮箱：</strong>" + escapeHtml(email) + "</p>",
    "<p><strong>留言：</strong>" + escapeHtml(message) + "</p>",
  ].join("");

  try {
    await transporter.sendMail({
      from: smtpUser,
      to: smtpUser,
      replyTo: email,
      subject: name + " 的咨询留言",
      html: html,
    });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Send error:", err);
    return res.status(500).json({ ok: false, error: "发送失败，请稍后重试" });
  }
};
