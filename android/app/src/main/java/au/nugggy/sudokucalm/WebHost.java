package au.nugggy.sudokucalm;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * A tiny web server so a friend can play in a browser (an iPhone, say) on the same wifi or hotspot.
 * It serves the game's own files and accepts WebSocket connections. Plain java.net only and no Android
 * classes, so it can be tested on a desktop JVM: files come through {@link Assets}, sockets through {@link Listener}.
 */
class WebHost {
    interface Assets { InputStream open(String path) throws IOException; }

    interface Listener {
        void onOpen(Conn c, String path, Map<String, String> query);
        void onText(Conn c, String text);
        void onClose(Conn c);
    }

    static final int PREFERRED_PORT = 8080;
    static final String WS_MAGIC = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
    private static final int MAX_HEADER = 16 * 1024, MAX_MESSAGE = 4 * 1024 * 1024;

    private final Assets assets;
    private final Listener listener;
    private ServerSocket server;
    private volatile boolean running;

    WebHost(Assets assets, Listener listener) { this.assets = assets; this.listener = listener; }

    /** Starts listening on all interfaces, on the preferred port if it is free. Returns the port. */
    synchronized int start(int preferred) throws IOException {
        stop();
        ServerSocket ss = new ServerSocket();
        ss.setReuseAddress(true);
        try { ss.bind(new InetSocketAddress(preferred)); }
        catch (IOException e) { ss.close(); ss = new ServerSocket(0); }
        server = ss;
        running = true;
        final ServerSocket s0 = ss;
        Thread t = new Thread(() -> {
            while (running && s0 == server) {
                try { final Socket s = s0.accept(); new Thread(() -> handle(s), "webhost-conn").start(); }
                catch (IOException e) { if (!running || s0 != server) return; }
            }
        }, "webhost-accept");
        t.setDaemon(true);
        t.start();
        return ss.getLocalPort();
    }

    synchronized void stop() {
        running = false;
        if (server != null) { try { server.close(); } catch (IOException ignored) { } server = null; }
    }

    int port() { ServerSocket s = server; return s == null ? 0 : s.getLocalPort(); }

    // ---------- HTTP ----------
    static String mime(String path) {
        String p = path.toLowerCase(Locale.ROOT);
        int dot = p.lastIndexOf('.');
        String ext = dot < 0 ? "" : p.substring(dot + 1);
        switch (ext) {
            case "html": case "htm": return "text/html; charset=utf-8";
            case "js": case "mjs": return "text/javascript; charset=utf-8";
            case "css": return "text/css; charset=utf-8";
            case "json": return "application/json; charset=utf-8";
            case "txt": case "md": return "text/plain; charset=utf-8";
            case "svg": return "image/svg+xml";
            case "png": return "image/png";
            case "jpg": case "jpeg": return "image/jpeg";
            case "webp": return "image/webp";
            case "gif": return "image/gif";
            case "ico": return "image/x-icon";
            case "wasm": return "application/wasm";
            case "glb": return "model/gltf-binary";
            case "gltf": return "model/gltf+json";
            case "mp3": return "audio/mpeg";
            case "ogg": return "audio/ogg";
            case "wav": return "audio/wav";
            case "woff2": return "font/woff2";
            case "woff": return "font/woff";
            case "ttf": return "font/ttf";
            default: return "application/octet-stream";
        }
    }

    /** Turns a request path into a safe asset path, or null when it tries to leave the game folder. */
    static String safePath(String raw) {
        String p = raw;
        int q = p.indexOf('?'); if (q >= 0) p = p.substring(0, q);
        int h = p.indexOf('#'); if (h >= 0) p = p.substring(0, h);
        try { p = URLDecoder.decode(p.replace("+", "%2B"), "UTF-8"); } catch (Exception e) { return null; }
        if (p.indexOf('\\') >= 0 || p.indexOf('\0') >= 0) return null;
        while (p.startsWith("/")) p = p.substring(1);
        if (p.isEmpty()) return "index.html";
        for (String seg : p.split("/")) if (seg.equals("..") || seg.equals(".") || seg.isEmpty()) return null;
        if (p.endsWith("/")) p += "index.html";
        return p;
    }

    static Map<String, String> query(String target) {
        Map<String, String> m = new HashMap<>();
        int q = target.indexOf('?');
        if (q < 0) return m;
        for (String kv : target.substring(q + 1).split("&")) {
            if (kv.isEmpty()) continue;
            int e = kv.indexOf('=');
            try {
                String k = URLDecoder.decode(e < 0 ? kv : kv.substring(0, e), "UTF-8");
                String v = e < 0 ? "" : URLDecoder.decode(kv.substring(e + 1), "UTF-8");
                m.put(k, v);
            } catch (Exception ignored) { }
        }
        return m;
    }

    static String acceptKey(String key) {
        try {
            MessageDigest sha = MessageDigest.getInstance("SHA-1");
            byte[] d = sha.digest((key.trim() + WS_MAGIC).getBytes(StandardCharsets.ISO_8859_1));
            return Base64.getEncoder().encodeToString(d);
        } catch (Exception e) { throw new RuntimeException(e); }
    }

    /** Reads one request head (up to the blank line). Returns null at end of stream. */
    private static String readHead(InputStream in) throws IOException {
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        int last = 0; // the last four bytes, to spot the blank line that ends the head
        while (true) {
            int c = in.read();
            if (c < 0) return b.size() == 0 ? null : b.toString("ISO-8859-1");
            b.write(c);
            if (b.size() > MAX_HEADER) throw new IOException("header too large");
            last = (last << 8) | c;
            if (last == 0x0d0a0d0a) return b.toString("ISO-8859-1");
        }
    }

    private void handle(Socket s) {
        boolean upgraded = false;
        try {
            s.setTcpNoDelay(true);
            s.setSoTimeout(20000);
            InputStream in = s.getInputStream();
            OutputStream out = s.getOutputStream();
            while (running) {
                String head;
                try { head = readHead(in); } catch (SocketTimeoutException e) { break; }
                if (head == null) break;
                String[] lines = head.split("\r\n");
                String[] rl = lines[0].split(" ");
                if (rl.length < 3) { respond(out, 400, "text/plain", "Bad request".getBytes(StandardCharsets.UTF_8), false, true); break; }
                Map<String, String> hd = new HashMap<>();
                for (int i = 1; i < lines.length; i++) {
                    int c = lines[i].indexOf(':');
                    if (c > 0) hd.put(lines[i].substring(0, c).trim().toLowerCase(Locale.ROOT), lines[i].substring(c + 1).trim());
                }
                String method = rl[0], target = rl[1];
                boolean http10 = rl[2].equals("HTTP/1.0");
                boolean close = http10 || "close".equalsIgnoreCase(hd.get("connection"));
                String bare = target.split("\\?")[0];
                if ("websocket".equalsIgnoreCase(hd.get("upgrade")) && hd.containsKey("sec-websocket-key")) {
                    String resp = "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: "
                        + acceptKey(hd.get("sec-websocket-key")) + "\r\n\r\n";
                    out.write(resp.getBytes(StandardCharsets.ISO_8859_1));
                    out.flush();
                    s.setSoTimeout(0);
                    upgraded = true;
                    Conn conn = new Conn(s, in, out, bare);
                    listener.onOpen(conn, bare, query(target));
                    conn.readLoop(listener);
                    return; // the WebSocket owns the socket now
                }
                if (!method.equals("GET") && !method.equals("HEAD")) {
                    respond(out, 405, "text/plain", "Method not allowed".getBytes(StandardCharsets.UTF_8), false, close);
                    if (close) break; else continue;
                }
                String path = safePath(target);
                byte[] body = null;
                if (path != null) {
                    try (InputStream a = assets.open(path)) { body = readAll(a); } catch (IOException e) { body = null; }
                }
                if (body == null) respond(out, path == null ? 403 : 404, "text/plain; charset=utf-8", (path == null ? "Not allowed" : "Not found").getBytes(StandardCharsets.UTF_8), method.equals("HEAD"), close);
                else respond(out, 200, mime(path), body, method.equals("HEAD"), close);
                if (close) break;
            }
        } catch (IOException ignored) {
        } finally {
            // after an upgrade the WebSocket closes its own socket, once its last frame is written
            if (!upgraded && !s.isClosed()) { try { s.close(); } catch (IOException ignored) { } }
        }
    }

    private static byte[] readAll(InputStream a) throws IOException {
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        byte[] buf = new byte[16384];
        int n;
        while ((n = a.read(buf)) > 0) b.write(buf, 0, n);
        return b.toByteArray();
    }

    private static void respond(OutputStream out, int code, String type, byte[] body, boolean head, boolean close) throws IOException {
        String reason = code == 200 ? "OK" : code == 403 ? "Forbidden" : code == 404 ? "Not Found" : code == 405 ? "Method Not Allowed" : "Bad Request";
        String h = "HTTP/1.1 " + code + " " + reason + "\r\nContent-Type: " + type + "\r\nContent-Length: " + body.length
            + "\r\nCache-Control: no-cache\r\nX-Content-Type-Options: nosniff\r\nConnection: " + (close ? "close" : "keep-alive") + "\r\n\r\n";
        out.write(h.getBytes(StandardCharsets.ISO_8859_1));
        if (!head) out.write(body);
        out.flush();
    }

    // ---------- WebSocket (RFC 6455) ----------
    static final class Conn {
        final Socket sock;
        final String path;
        private final InputStream in;
        private final OutputStream out;
        private final ExecutorService writer = Executors.newSingleThreadExecutor();
        private volatile boolean closed;
        Object tag; // free for the owner (WebLink keeps its session here)

        Conn(Socket sock, InputStream in, OutputStream out, String path) { this.sock = sock; this.in = in; this.out = out; this.path = path; }

        String remote() { try { return sock.getInetAddress().getHostAddress(); } catch (Exception e) { return ""; } }
        boolean isOpen() { return !closed; }

        void sendText(String text) { if (!closed) { final byte[] p = text.getBytes(StandardCharsets.UTF_8); queue(0x1, p); } }

        void close(int code, String reason) {
            if (closed) return;
            byte[] r = reason.getBytes(StandardCharsets.UTF_8);
            byte[] p = new byte[2 + r.length];
            p[0] = (byte) (code >> 8); p[1] = (byte) code;
            System.arraycopy(r, 0, p, 2, r.length);
            queue(0x8, p);
            closed = true;
            later(this::shut);
        }

        void kill() { closed = true; later(this::shut); }

        private void later(Runnable r) { try { writer.execute(r); } catch (Exception e) { r.run(); } }

        private void shut() { try { sock.close(); } catch (IOException ignored) { } writer.shutdown(); }

        private void queue(final int op, final byte[] payload) {
            try { writer.execute(() -> { try { writeFrame(op, payload); } catch (IOException e) { closed = true; shut(); } }); }
            catch (Exception ignored) { }
        }

        private void writeFrame(int op, byte[] p) throws IOException {
            ByteArrayOutputStream b = new ByteArrayOutputStream(p.length + 10);
            b.write(0x80 | op);
            if (p.length < 126) b.write(p.length);
            else if (p.length < 65536) { b.write(126); b.write(p.length >> 8); b.write(p.length); }
            else { b.write(127); for (int i = 7; i >= 0; i--) b.write((int) ((long) p.length >> (8 * i))); }
            b.write(p);
            out.write(b.toByteArray());
            out.flush();
        }

        private int read1() throws IOException { int c = in.read(); if (c < 0) throw new IOException("eof"); return c; }

        void readLoop(Listener l) {
            ByteArrayOutputStream msg = null;
            int msgOp = 0;
            try {
                while (!closed) {
                    int b0 = read1(), b1 = read1();
                    boolean fin = (b0 & 0x80) != 0;
                    int op = b0 & 0x0f;
                    boolean masked = (b1 & 0x80) != 0;
                    long len = b1 & 0x7f;
                    if (len == 126) len = (read1() << 8) | read1();
                    else if (len == 127) { len = 0; for (int i = 0; i < 8; i++) len = (len << 8) | read1(); }
                    if (len > MAX_MESSAGE) throw new IOException("frame too large");
                    byte[] mask = new byte[4];
                    if (masked) for (int i = 0; i < 4; i++) mask[i] = (byte) read1();
                    byte[] p = new byte[(int) len];
                    int got = 0;
                    while (got < len) { int n = in.read(p, got, (int) len - got); if (n < 0) throw new IOException("eof"); got += n; }
                    if (masked) for (int i = 0; i < p.length; i++) p[i] ^= mask[i & 3];
                    if (op == 0x8) { // close: answer and stop
                        if (!closed) { queue(0x8, p.length >= 2 ? new byte[] { p[0], p[1] } : new byte[0]); closed = true; later(this::shut); }
                        break;
                    } else if (op == 0x9) { queue(0xA, p); continue; } // ping
                    else if (op == 0xA) continue; // pong
                    if (op == 0x1 || op == 0x2) { msg = new ByteArrayOutputStream(); msgOp = op; }
                    else if (op != 0x0 || msg == null) throw new IOException("bad frame");
                    msg.write(p);
                    if (msg.size() > MAX_MESSAGE) throw new IOException("message too large");
                    if (fin) {
                        if (msgOp == 0x1) l.onText(this, msg.toString("UTF-8"));
                        msg = null;
                    }
                }
            } catch (IOException ignored) {
            } finally {
                closed = true;
                later(this::shut);
                l.onClose(this);
            }
        }
    }
}
