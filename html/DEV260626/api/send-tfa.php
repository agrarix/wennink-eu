<?php
// api/send-tfa.php - PHP SMTP Mailer fallback for shared hosting environments
header('Content-Type: application/json');

// Read JSON input
$input = file_get_contents('php://input');
$data = json_decode($input, true);

if (!$data) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Invalid JSON input']);
    exit;
}

$to = $data['to'] ?? '';
$subject = $data['subject'] ?? '';
$text = $data['text'] ?? '';
$smtp = $data['smtpConfig'] ?? null;

if (!$to || !$smtp || !isset($smtp['host'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Missing parameters']);
    exit;
}

try {
    $host = $smtp['host'];
    $port = intval($smtp['port'] ?? 587);
    $user = $smtp['user'] ?? '';
    $pass = $smtp['pass'] ?? '';
    $secure = $smtp['secure'] === true || $smtp['secure'] === 'true';
    $from = $smtp['from'] ?? 'no-reply@wennink.nl';

    // Parse 'from' email address
    $fromEmail = $from;
    if (preg_match('/<([^>]+)>/', $from, $matches)) {
        $fromEmail = $matches[1];
    }

    $socketHost = $host;
    if ($secure && $port == 465) {
        $socketHost = 'ssl://' . $host;
    }

    $socket = fsockopen($socketHost, $port, $errno, $errstr, 15);
    if (!$socket) {
        throw new Exception("Connection failed: $errstr ($errno)");
    }

    function readResponse($socket, $expectedCode) {
        $response = '';
        while ($str = fgets($socket, 515)) {
            $response .= $str;
            if (substr($str, 3, 1) == ' ') {
                break;
            }
        }
        $code = intval(substr($response, 0, 3));
        if ($code !== $expectedCode) {
            throw new Exception("Unexpected response: " . trim($response));
        }
        return $response;
    }

    readResponse($socket, 220);

    fwrite($socket, "EHLO " . ($_SERVER['SERVER_NAME'] ?? 'localhost') . "\r\n");
    readResponse($socket, 250);

    // STARTTLS if port is 587 or 25 and secure is requested
    if ($port != 465 && $secure) {
        fwrite($socket, "STARTTLS\r\n");
        readResponse($socket, 220);
        if (!stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
            throw new Exception("TLS encryption failed");
        }
        // Resend EHLO after STARTTLS
        fwrite($socket, "EHLO " . ($_SERVER['SERVER_NAME'] ?? 'localhost') . "\r\n");
        readResponse($socket, 250);
    }

    if ($user && $pass) {
        fwrite($socket, "AUTH LOGIN\r\n");
        readResponse($socket, 334);
        fwrite($socket, base64_encode($user) . "\r\n");
        readResponse($socket, 334);
        fwrite($socket, base64_encode($pass) . "\r\n");
        readResponse($socket, 235);
    }

    fwrite($socket, "MAIL FROM:<$fromEmail>\r\n");
    readResponse($socket, 250);

    fwrite($socket, "RCPT TO:<$to>\r\n");
    readResponse($socket, 250);

    fwrite($socket, "DATA\r\n");
    readResponse($socket, 354);

    // Construct headers
    $headers = [
        "MIME-Version: 1.0",
        "Content-Type: text/plain; charset=UTF-8",
        "From: $from",
        "To: $to",
        "Subject: =?UTF-8?B?" . base64_encode($subject) . "?=",
        "Date: " . date('r'),
        "Message-ID: <" . uniqid('', true) . "@" . ($host ?? 'wennink.eu') . ">"
    ];

    $message = implode("\r\n", $headers) . "\r\n\r\n" . $text;
    // Period at the start of a line must be doubled in SMTP RFC
    $message = preg_replace('/^\./m', '..', $message);
    
    fwrite($socket, $message . "\r\n.\r\n");
    readResponse($socket, 250);

    fwrite($socket, "QUIT\r\n");
    fclose($socket);

    echo json_encode(['success' => true]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
?>
