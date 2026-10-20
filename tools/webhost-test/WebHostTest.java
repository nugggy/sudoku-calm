package au.nugggy.sudokucalm;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

/**
 * Desktop tests for WebHost (files and WebSockets) and WebLink (the browser friend's session).
 * Run with tools/webhost-test/run.mjs, or: javac -d out WebHost.java WebLink.java WebHostTest.java && java -cp out au.nugggy.sudokucalm.WebHostTest
 */
public class WebHostTest {
    static int fails = 0, checks = 0;
    static void check(boolean ok, String what) { checks++; if (!ok) { fails++; System.out.println("FAIL " + what); } }

    // ---------- a bare-bones client ----------
    static String http(int port, String raw) throws IOException {
        try (Socket s = new Socket("127.0.0.1", port)) {
            s.setSoTimeout(5000);
            s.getOutputStream().write(raw.getBytes(StandardCharsets.ISO_8859_1));
            return new String(readAll(s.getInputStream()), StandardCharsets.ISO_8859_1);
        }
    }
    static byte[] readAll(InputStream in) throws IOException {
        ByteArrayOutputStream b = new ByteArrayOutputStream(); byte[] buf = new byte[8192]; int n;
        try { while ((n = in.read(buf)) > 0) b.write(buf, 0, n); } catch (java.net.SocketTimeoutException ignored) { }
        return b.toByteArray();
    }
    static String get(int port, String path) throws IOException { return http(port, "GET " + path + " HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n"); }

    static class Ws {
        final Socket s; final InputStream in; final OutputStream out; final String headers;
        final Random rnd = new Random(7);
        Ws(int port, String path, String key) throws IOException {
            s = new Socket("127.0.0.1", port);
            s.setSoTimeout(5000);
            in = s.getInputStream(); out = s.getOutputStream();
            out.write(("GET " + path + " HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: " + key + "\r\nSec-WebSocket-Version: 13\r\n\r\n").getBytes(StandardCharsets.ISO_8859_1));
            ByteArrayOutputStream b = new ByteArrayOutputStream(); int last = 0;
            while (true) { int c = in.read(); if (c < 0) break; b.write(c); last = (last << 8) | c; if (last == 0x0d0a0d0a) break; }
            headers = b.toString("ISO-8859-1");
        }
        void frame(int op, byte[] p, boolean fin) throws IOException {
            ByteArrayOutputStream b = new ByteArrayOutputStream();
            b.write((fin ? 0x80 : 0) | op);
            if (p.length < 126) b.write(0x80 | p.length);
            else if (p.length < 65536) { b.write(0x80 | 126); b.write(p.length >> 8); b.write(p.length); }
            else { b.write(0x80 | 127); for (int i = 7; i >= 0; i--) b.write((int) ((long) p.length >> (8 * i))); }
            byte[] m = new byte[4]; rnd.nextBytes(m); b.write(m);
            for (int i = 0; i < p.length; i++) b.write(p[i] ^ m[i & 3]);
            out.write(b.toByteArray()); out.flush();
        }
        void text(String t) throws IOException { frame(1, t.getBytes(StandardCharsets.UTF_8), true); }
        int lastOp; byte[] lastRaw = new byte[0];
        int closeCode() { return lastRaw.length >= 2 ? ((lastRaw[0] & 255) << 8) | (lastRaw[1] & 255) : -1; }
        String read() throws IOException {
            int b0 = in.read(), b1 = in.read();
            if (b0 < 0 || b1 < 0) return null;
            lastOp = b0 & 15;
            long len = b1 & 127;
            if (len == 126) len = (in.read() << 8) | in.read();
            else if (len == 127) { len = 0; for (int i = 0; i < 8; i++) len = (len << 8) | in.read(); }
            byte[] p = new byte[(int) len]; int got = 0;
            while (got < len) { int n = in.read(p, got, (int) len - got); if (n < 0) return null; got += n; }
            lastRaw = p;
            return new String(p, StandardCharsets.UTF_8);
        }
        /** Next text frame, skipping heartbeats ("a|...") when asked. */
        String next(boolean skipBeats) throws IOException {
            while (true) { String t = read(); if (t == null) return null; if (lastOp != 1) continue; if (skipBeats && t.startsWith("a|")) continue; return t; }
        }
        void close() { try { s.close(); } catch (IOException ignored) { } }
    }

    public static void main(String[] a) throws Exception {
        File root = Files.createTempDirectory("webhost").toFile();
        File secret = new File(root.getParentFile(), "webhost-secret.txt");
        Files.write(secret.toPath(), "secret".getBytes());
        Files.write(new File(root, "index.html").toPath(), "<!doctype html>hi".getBytes());
        new File(root, "js").mkdirs();
        Files.write(new File(root, "js/app.js").toPath(), "export const x = 1;".getBytes());
        Files.write(new File(root, "pic.webp").toPath(), new byte[] { 1, 2, 3 });
        Files.write(new File(root, "m.glb").toPath(), new byte[] { 4 });
        WebHost.Assets assets = (path) -> new FileInputStream(new File(root, path));

        // ---------- files ----------
        final LinkedBlockingQueue<String> echoed = new LinkedBlockingQueue<>();
        WebHost echo = new WebHost(assets, new WebHost.Listener() {
            public void onOpen(WebHost.Conn c, String path, Map<String, String> q) { if (!path.equals("/echo")) c.close(4004, "unknown"); }
            public void onText(WebHost.Conn c, String text) { echoed.add(text); c.sendText(text); }
            public void onClose(WebHost.Conn c) { echoed.add("<closed>"); }
        });
        int port = echo.start(0);
        String r = get(port, "/");
        check(r.startsWith("HTTP/1.1 200") && r.contains("Content-Type: text/html") && r.endsWith("hi"), "index served at /");
        r = get(port, "/?join=duo");
        check(r.startsWith("HTTP/1.1 200") && r.endsWith("hi"), "query string ignored for files");
        r = get(port, "/js/app.js");
        check(r.contains("Content-Type: text/javascript"), "js mime");
        check(get(port, "/pic.webp").contains("Content-Type: image/webp"), "webp mime");
        check(get(port, "/m.glb").contains("Content-Type: model/gltf-binary"), "glb mime");
        check(get(port, "/nothing.js").startsWith("HTTP/1.1 404"), "404 for a missing file");
        check(get(port, "/../webhost-secret.txt").startsWith("HTTP/1.1 403"), "../ blocked");
        check(get(port, "/%2e%2e/webhost-secret.txt").startsWith("HTTP/1.1 403"), "encoded ../ blocked");
        check(get(port, "/js/..%2f..%2fwebhost-secret.txt").startsWith("HTTP/1.1 403"), "encoded slash traversal blocked");
        check(get(port, "/js\\..\\..\\webhost-secret.txt").startsWith("HTTP/1.1 403"), "backslash blocked");
        check(!get(port, "/../webhost-secret.txt").contains("secret\r\n") && !get(port, "/%2e%2e/webhost-secret.txt").endsWith("secret"), "secret never served");
        r = http(port, "HEAD /js/app.js HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n");
        check(r.contains("Content-Length: 19") && !r.contains("export"), "HEAD has length, no body");
        r = http(port, "POST / HTTP/1.1\r\nHost: x\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
        check(r.startsWith("HTTP/1.1 405"), "POST refused");
        // keep-alive: two requests on one connection
        r = http(port, "GET /js/app.js HTTP/1.1\r\nHost: x\r\n\r\nGET / HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n");
        check(r.indexOf("HTTP/1.1 200") != r.lastIndexOf("HTTP/1.1 200") && r.endsWith("hi"), "keep-alive serves two requests");

        // ---------- WebSocket ----------
        check(WebHost.acceptKey("dGhlIHNhbXBsZSBub25jZQ==").equals("s3pPLMBiTxaQ9kYGzzhZRbK+xOo="), "accept key matches RFC 6455 example");
        Ws w = new Ws(port, "/echo", "dGhlIHNhbXBsZSBub25jZQ==");
        check(w.headers.startsWith("HTTP/1.1 101") && w.headers.contains("Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo="), "handshake");
        w.text("hello");
        check("hello".equals(w.next(false)), "masked text echoed");
        StringBuilder big = new StringBuilder(); for (int i = 0; i < 70 * 1024; i++) big.append((char) ('a' + i % 26));
        w.text(big.toString());
        check(big.toString().equals(w.next(false)), "70 KB message both ways");
        w.text("héllo wörld");
        check("héllo wörld".equals(w.next(false)), "utf-8");
        w.frame(1, "frag".getBytes(), false); w.frame(0, "ment".getBytes(), false); w.frame(0, "ed".getBytes(), true);
        check("fragmented".equals(w.next(false)), "fragmented message joined");
        w.frame(9, "png".getBytes(), true);
        String pong = w.read();
        check(w.lastOp == 0xA && "png".equals(pong), "ping answered with pong");
        w.frame(8, new byte[] { 0x03, (byte) 0xe8 }, true);
        w.read();
        check(w.lastOp == 8, "close answered");
        check(waitFor(echoed, "<closed>"), "server sees the close");
        w.close();
        Ws bad = new Ws(port, "/other", "x3JJHMbDL1EzLkh9GBhXDw==");
        bad.read();
        check(bad.lastOp == 8, "unknown socket path closed");
        bad.close();
        echo.stop();

        // ---------- WebLink: the browser friend's session ----------
        final List<String> ev = Collections.synchronizedList(new ArrayList<>());
        final boolean[] open = { true };
        WebLink link = new WebLink(new WebLink.Events() {
            public boolean canAccept() { return open[0]; }
            public void connected(String peer) { ev.add("connected"); }
            public void message(String json) { ev.add("msg " + json); }
            public void reconnecting() { ev.add("reconnecting"); }
            public void resumed() { ev.add("resumed"); }
            public void closed() { ev.add("closed"); }
        });
        link.leaveMs = 1500; link.silentMs = 60000;
        WebHost host = new WebHost(assets, link);
        port = host.start(0);
        Ws g = new Ws(port, "/ws?t=tok1&r=0", "dGhlIHNhbXBsZSBub25jZQ==");
        check("h|0".equals(g.next(true)), "fresh session says h|0");
        waitUntil(() -> ev.contains("connected"));
        check(ev.contains("connected"), "host told a friend connected");
        g.text("m|1|{\"k\":\"hello\"}");
        g.text("m|1|{\"k\":\"hello\"}"); // a repeat after a resend must be dropped
        g.text("m|2|{\"k\":\"g\",\"d\":1}");
        waitUntil(() -> ev.contains("msg {\"k\":\"g\",\"d\":1}"));
        check(ev.stream().filter((x) -> x.equals("msg {\"k\":\"hello\"}")).count() == 1, "duplicate dropped");
        check(ev.contains("msg {\"k\":\"g\",\"d\":1}"), "second message delivered");
        link.send("{\"n\":1}"); link.send("{\"n\":2}");
        check("m|1|{\"n\":1}".equals(g.next(true)) && "m|2|{\"n\":2}".equals(g.next(true)), "host messages numbered");
        g.text("a|1"); // the browser got message 1 only (pretend 2 was lost)
        Thread.sleep(150);
        // a second browser with another token is turned away while this one plays
        Ws other = new Ws(port, "/ws?t=tok2&r=0", "x3JJHMbDL1EzLkh9GBhXDw==");
        String o = other.read();
        check(other.lastOp == 8 && other.closeCode() == 4009, "second browser gets busy (4009) got " + other.lastOp + "/" + other.closeCode());
        other.close();
        // drop and come back
        g.close();
        waitUntil(() -> ev.contains("reconnecting"));
        check(ev.contains("reconnecting"), "host sees the drop");
        link.send("{\"n\":3}"); // sent while the friend is away
        Ws g2 = new Ws(port, "/ws?t=tok1&r=1", "dGhlIHNhbXBsZSBub25jZQ==");
        check("h|2".equals(g2.next(true)), "resume tells the browser what the host has (h|2)");
        check("m|2|{\"n\":2}".equals(g2.next(true)) && "m|3|{\"n\":3}".equals(g2.next(true)), "missed messages replayed in order");
        waitUntil(() -> ev.contains("resumed"));
        check(ev.contains("resumed"), "host sees the resume");
        g2.text("m|3|{\"k\":\"after\"}");
        waitUntil(() -> ev.contains("msg {\"k\":\"after\"}"));
        check(ev.contains("msg {\"k\":\"after\"}"), "messages flow after resume");
        String beat = null; long until = System.currentTimeMillis() + 2500;
        while (System.currentTimeMillis() < until) { String t = g2.read(); if (t != null && t.startsWith("a|")) { beat = t; break; } }
        check("a|3".equals(beat), "heartbeat acknowledges what arrived (a|3)");
        // gone for good: the host is told after the leave timeout, not before
        g2.close();
        Thread.sleep(600);
        check(!ev.contains("closed"), "not closed straight after a drop");
        waitUntil(() -> ev.contains("closed"));
        check(ev.contains("closed"), "closed after the leave timeout");
        // leaving on purpose is immediate
        ev.clear();
        Ws g3 = new Ws(port, "/ws?t=tok3&r=0", "dGhlIHNhbXBsZSBub25jZQ==");
        g3.next(true);
        g3.text("x|");
        waitUntil(() -> ev.contains("closed"));
        check(ev.contains("closed"), "x| ends the session at once");
        g3.close();
        // a session is refused when the host is not taking friends
        open[0] = false;
        Ws g4 = new Ws(port, "/ws?t=tok4&r=0", "dGhlIHNhbXBsZSBub25jZQ==");
        g4.read();
        check(g4.lastOp == 8 && g4.closeCode() == 4009, "refused when not hosting got " + g4.lastOp + "/" + g4.closeCode());
        g4.close();
        host.stop();
        link.shutdown();

        System.out.println(fails == 0 ? "WebHost: all " + checks + " checks passed" : "WebHost: " + fails + " of " + checks + " checks failed");
        System.exit(fails == 0 ? 0 : 1);
    }

    interface Cond { boolean ok(); }
    static void waitUntil(Cond c) throws InterruptedException { long t = System.currentTimeMillis() + 4000; while (!c.ok() && System.currentTimeMillis() < t) Thread.sleep(20); }
    static boolean waitFor(LinkedBlockingQueue<String> q, String want) throws InterruptedException {
        long t = System.currentTimeMillis() + 3000;
        while (System.currentTimeMillis() < t) { String s = q.poll(200, TimeUnit.MILLISECONDS); if (want.equals(s)) return true; }
        return false;
    }
}
