function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
var MAX_MESSAGE_LEN = 5000;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/contact' && request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    if (url.pathname === '/api/contact' && request.method === 'POST') {
      let data;
      try {
        data = await request.json();
      } catch {
        return json({ ok: false, error: '无效的请求数据' }, 400);
      }

      const name = typeof data.name === 'string' ? data.name.trim() : '';
      const email = typeof data.email === 'string' ? data.email.trim() : '';
      const message = typeof data.message === 'string' ? data.message.trim() : '';

      if (!name || !email || !message) {
        return json({ ok: false, error: '请填写所有字段' }, 400);
      }

      if (!EMAIL_RE.test(email)) {
        return json({ ok: false, error: '请输入有效的邮箱地址' }, 400);
      }

      if (message.length > MAX_MESSAGE_LEN) {
        return json({ ok: false, error: '留言内容过长，请精简后发送' }, 400);
      }

      if (!env.RESEND_API_KEY) {
        console.log('新留言:', JSON.stringify({ name, email, message }));
        return json({ ok: true });
      }

      const html = [
        '<h2>新的咨询留言</h2>',
        '<p><strong>姓名：</strong>' + escapeHtml(name) + '</p>',
        '<p><strong>邮箱：</strong>' + escapeHtml(email) + '</p>',
        '<p><strong>留言：</strong>' + escapeHtml(message) + '</p>',
      ].join('');

      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + env.RESEND_API_KEY,
          },
          body: JSON.stringify({
            from: '个人作品集 <onboarding@resend.dev>',
            to: '1449157740@qq.com',
            subject: name + ' 的咨询留言',
            html,
            reply_to: email,
          }),
        });

        if (!res.ok) {
          const err = await res.text();
          console.error('Resend error:', err);
          return json({ ok: false, error: '发送失败，请稍后重试' }, 500);
        }

        return json({ ok: true });
      } catch (err) {
        console.error('Fetch error:', err);
        return json({ ok: false, error: '发送失败，请稍后重试' }, 500);
      }
    }

    return env.ASSETS.fetch(request);
  },
};
