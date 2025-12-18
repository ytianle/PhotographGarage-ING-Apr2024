'use strict';

const jwt = require('jsonwebtoken');

const SECRET_KEY = 'your_secret_key'; // 生产环境建议存入 AWS Secrets Manager
const validUsers = {
  'myUsername': 'myPassword' // 预设的用户名和密码
};

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body);
    const { username, password } = body;

    if (validUsers[username] && validUsers[username] === password) {
      // 生成 JWT 令牌（有效期 1 小时）
      const token = jwt.sign({ username }, SECRET_KEY, { expiresIn: '1h' });
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      };
    } else {
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: '用户名或密码错误' })
      };
    }
  } catch (error) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: '请求格式错误' })
    };
  }
};