// server.js - Zero-dependency local web server for the Wennink Family Website

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  console.log(`${req.method} ${req.url}`);

  // Handle TFA Email Sending API
  if (req.method === 'POST' && req.url === '/api/send-tfa') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const { to, code, smtpConfig } = data;

        if (smtpConfig && smtpConfig.host) {
          const nodemailer = require('nodemailer');
          
          // Configure Nodemailer transporter dynamically
          const transporter = nodemailer.createTransport({
            host: smtpConfig.host,
            port: parseInt(smtpConfig.port) || 587,
            secure: smtpConfig.secure === true || smtpConfig.secure === 'true',
            auth: smtpConfig.user ? {
              user: smtpConfig.user,
              pass: smtpConfig.pass
            } : undefined,
            // Increase timeout and connection limits for reliability
            connectionTimeout: 10000,
            greetingTimeout: 10000
          });

          const mailOptions = {
            from: smtpConfig.from || '"Wennink Family Website" <no-reply@wennink.nl>',
            to: to,
            subject: data.subject || 'TFA Inlogcode - Familie Wennink / TFA Login Code',
            text: data.text || `Beste familielid,\n\nUw 5-cijferige verificatiecode voor de Familie Wennink website is: ${code}\n\nDeze code is 15 minuten geldig.\n\n---\nDear family member,\n\nYour 5-digit verification code for the Wennink Family website is: ${code}\n\nThis code is valid for 15 minutes.`
          };

          transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
              console.error('SMTP Delivery Error:', error);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, error: error.message }));
            } else {
              console.log('Email sent successfully:', info.messageId);
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, messageId: info.messageId }));
            }
          });
        } else {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: false, error: 'SMTP host is not configured' }));
        }
      } catch (err) {
        console.error('JSON parsing / general endpoint error:', err);
        res.statusCode = 400;
        res.setHeader('Content-Type', 'text/plain');
        res.end('Bad Request');
      }
    });
    return;
  }

  // Normalize URL path
  let filePath = req.url === '/' ? './index.html' : '.' + req.url;
  filePath = filePath.split('?')[0]; // Remove query params if any

  // Resolve absolute path
  const absolutePath = path.resolve(__dirname, filePath);

  // Prevent directory traversal attacks
  if (!absolutePath.startsWith(__dirname)) {
    res.statusCode = 403;
    res.end('Access Denied');
    return;
  }

  // Check if file exists
  fs.stat(absolutePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/plain');
      res.end('404 Not Found');
      return;
    }

    // Read and serve file
    const ext = path.extname(absolutePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(absolutePath, (err, content) => {
      if (err) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'text/plain');
        res.end('500 Internal Server Error');
        return;
      }

      res.statusCode = 200;
      res.setHeader('Content-Type', contentType);
      res.end(content);
    });
  });
});

server.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(`Wennink Family Website is running locally!`);
  console.log(`Open your browser and visit: http://localhost:${PORT}`);
  console.log(`Press Ctrl+C to stop the server.`);
  console.log(`==================================================`);
});
