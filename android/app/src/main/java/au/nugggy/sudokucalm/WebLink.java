package au.nugggy.sudokucalm;

import java.util.ArrayDeque;
import java.util.Iterator;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

/**
 * One friend playing in a browser, connected to {@link WebHost} at /ws. No Android classes, so it is tested on a desktop JVM.
 *
 * The browser can drop its connection at any time (an iPhone locks, the tab sleeps, wifi blips), so messages are numbered
 * and kept until the other side acknowledges them, and the browser can come back with the same token and carry on.
 * Frames (text): "m|seq|json" a game message, "a|n" everything up to n arrived (also a heartbeat once a second),
 * "h|n" from the host on (re)connect: the host has everything up to n, "x|" the browser is leaving on purpose.
 * The browser opens /ws?t=token&amp;r=lastSeqItReceived.
 */
class WebLink implements WebHost.Listener {
    interface Events {
        /** May a new friend join now? (False once someone is already playing, by browser or by app.) */
        boolean canAccept();
        void connected(String peer);
        void message(String json);
        void reconnecting();
        void resumed();
        void closed();
    }

    static final long LEAVE_AFTER_MS = 30000, SILENT_MS = 8000, BEAT_MS = 1000;
    private static final int KEEP = 6000;

    private final Events ev;
    long leaveMs = LEAVE_AFTER_MS, silentMs = SILENT_MS; // shorter in tests
    private final ScheduledExecutorService timer = Executors.newSingleThreadScheduledExecutor(r -> { Thread t = new Thread(r, "weblink"); t.setDaemon(true); return t; });
    private ScheduledFuture<?> beat, leave;
    private WebHost.Conn conn;
    private String token;
    private boolean active;
    private long sendSeq, recvSeq, lastHeard;
    private final ArrayDeque<Object[]> unacked = new ArrayDeque<>();

    WebLink(Events ev) { this.ev = ev; }

    synchronized boolean active() { return active; }
    synchronized boolean present() { return active && conn != null && conn.isOpen(); }

    // ---------- from WebHost ----------
    @Override public void onOpen(WebHost.Conn c, String path, Map<String, String> q) {
        if (!"/ws".equals(path)) { c.close(4004, "unknown"); return; }
        String t = q.getOrDefault("t", "");
        long r;
        try { r = Long.parseLong(q.getOrDefault("r", "0")); } catch (NumberFormatException e) { r = 0; }
        boolean fresh = false, resumed = false;
        synchronized (this) {
            if (t.isEmpty() || t.length() > 64) { c.close(4000, "bad token"); return; }
            if (active && t.equals(token)) {
                if (conn != null && conn != c) conn.kill();
                conn = c; resumed = true;
                if (leave != null) { leave.cancel(false); leave = null; }
            } else if (!active && ev.canAccept()) {
                active = true; token = t; conn = c; sendSeq = 0; recvSeq = 0; unacked.clear(); fresh = true;
                beat = timer.scheduleAtFixedRate(this::tick, BEAT_MS, BEAT_MS, TimeUnit.MILLISECONDS);
            } else { c.close(4009, "busy"); return; }
            lastHeard = System.currentTimeMillis();
            c.sendText("h|" + recvSeq);
            // send again whatever the browser has not got yet
            for (Object[] m : unacked) if ((Long) m[0] > r) c.sendText("m|" + m[0] + "|" + m[1]);
            prune(r);
        }
        if (fresh) ev.connected(c.remote());
        else if (resumed) ev.resumed();
    }

    @Override public void onText(WebHost.Conn c, String s) {
        String deliver = null;
        boolean bye = false;
        synchronized (this) {
            if (c != conn || !active) return;
            lastHeard = System.currentTimeMillis();
            if (s.startsWith("m|")) {
                int bar = s.indexOf('|', 2);
                if (bar < 0) return;
                long seq;
                try { seq = Long.parseLong(s.substring(2, bar)); } catch (NumberFormatException e) { return; }
                if (seq <= recvSeq) return; // already had it
                recvSeq = seq;
                deliver = s.substring(bar + 1);
            } else if (s.startsWith("a|")) {
                try { prune(Long.parseLong(s.substring(2))); } catch (NumberFormatException ignored) { }
            } else if (s.startsWith("x|")) {
                bye = true;
            }
        }
        if (deliver != null) ev.message(deliver);
        if (bye) end(true);
    }

    @Override public void onClose(WebHost.Conn c) {
        synchronized (this) {
            if (c != conn || !active) return;
            conn = null;
            if (leave == null) leave = timer.schedule(() -> end(true), leaveMs, TimeUnit.MILLISECONDS);
        }
        ev.reconnecting();
    }

    // ---------- from the host page ----------
    synchronized void send(String json) {
        if (!active) return;
        long seq = ++sendSeq;
        unacked.add(new Object[] { seq, json });
        while (unacked.size() > KEEP) unacked.poll();
        if (conn != null) conn.sendText("m|" + seq + "|" + json);
    }

    /** Stops the session without telling the page (the host is leaving anyway). */
    void close() {
        WebHost.Conn c;
        synchronized (this) {
            c = conn; conn = null; active = false; token = null; unacked.clear();
            if (beat != null) { beat.cancel(false); beat = null; }
            if (leave != null) { leave.cancel(false); leave = null; }
        }
        if (c != null) c.close(1000, "host left");
    }

    void shutdown() { close(); timer.shutdownNow(); }

    // ---------- internals ----------
    private void prune(long upTo) {
        for (Iterator<Object[]> it = unacked.iterator(); it.hasNext();) { if ((Long) it.next()[0] <= upTo) it.remove(); else break; }
    }

    private void tick() {
        WebHost.Conn dead = null;
        synchronized (this) {
            if (!active || conn == null) return;
            if (System.currentTimeMillis() - lastHeard > silentMs) dead = conn; // phone asleep or out of range
            else conn.sendText("a|" + recvSeq);
        }
        if (dead != null) { dead.kill(); onClose(dead); }
    }

    private void end(boolean tell) {
        boolean was;
        synchronized (this) { was = active; }
        close();
        if (was && tell) ev.closed();
    }
}
