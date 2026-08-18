const nodemailer = require("nodemailer");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_NAME_LENGTH = 100;
const MAX_MESSAGE_LENGTH = 5000;

function getSingleValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function getRequestBody(req) {
  if (typeof req.body === "string") {
    return JSON.parse(req.body);
  }

  return req.body || {};
}

function sendJson(res, status, payload) {
  res.status(status).json(payload);
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { ok: false, error: "仅支持 POST 请求" });
  }

  let body;
  try {
    body = getRequestBody(req);
  } catch {
    return sendJson(res, 400, { ok: false, error: "请求内容格式不正确" });
  }

  const name = String(getSingleValue(body.name) || "").trim();
  const email = String(getSingleValue(body.email) || "").trim();
  const message = String(getSingleValue(body.message) || "").trim();

  if (!name || !email || !message) {
    return sendJson(res, 400, { ok: false, error: "请填写所有字段" });
  }

  if (!EMAIL_RE.test(email)) {
    return sendJson(res, 400, { ok: false, error: "请输入有效的邮箱地址" });
  }

  if (name.length > MAX_NAME_LENGTH || message.length > MAX_MESSAGE_LENGTH) {
    return sendJson(res, 400, { ok: false, error: "输入内容过长" });
  }

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, CONTACT_TO_EMAIL } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !CONTACT_TO_EMAIL) {
    console.error("Contact email environment variables are not configured.");
    return sendJson(res, 503, { ok: false, error: "联系服务暂未配置" });
  }

  const port = Number(SMTP_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error("SMTP_PORT is invalid.");
    return sendJson(res, 503, { ok: false, error: "联系服务暂未配置" });
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });

  try {
    await transporter.sendMail({
      from: SMTP_USER,
      to: CONTACT_TO_EMAIL,
      replyTo: email,
      subject: "个人作品集新留言：" + name,
      text: "姓名：" + name + "\n邮箱：" + email + "\n\n留言内容：\n" + message,
    });
    return sendJson(res, 200, { ok: true });
  } catch (error) {
    console.error("Unable to send contact email.", error);
    return sendJson(res, 502, { ok: false, error: "邮件发送失败" });
  }
};
