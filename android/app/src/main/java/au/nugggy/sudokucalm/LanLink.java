package au.nugggy.sudokucalm;

import android.content.Context;
import android.net.nsd.NsdManager;
import android.net.nsd.NsdServiceInfo;
import android.net.wifi.WifiManager;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Two-phone games over the local network (same wifi, or one phone's hotspot). No internet needed.
 * The host advertises itself with Network Service Discovery and accepts one friend on a TCP socket.
 * Messages are single lines of JSON. Events go back to the page as window.__lan({...}).
 */
class LanLink {
    static final String TYPE = "_gamehub._tcp.";
    static final int PORT = 47123;

    private final MainActivity activity;
    private final NsdManager nsd;
    private ServerSocket server;
    private Socket sock;
    private BufferedWriter out;
    private ExecutorService writer;
    private NsdManager.RegistrationListener reg;
    private NsdManager.DiscoveryListener disc;
    private WifiManager.MulticastLock lock;
    private final Map<String, NsdServiceInfo> found = new HashMap<>();
    private int gen = 0; // bumps on every close, so stale threads stay quiet
    private boolean hosting;      // waiting for a friend (app or browser)
    private WebHost web;          // serves the game to a friend's browser while hosting (see WebHost)
    private WebLink webLink;      // that browser friend's session
    private boolean webGuest;     // the friend is in a browser rather than the app

    LanLink(MainActivity activity) {
        this.activity = activity;
        this.nsd = (NsdManager) activity.getSystemService(Context.NSD_SERVICE);
    }

    // ---------- events to the page ----------
    private void emit(String type, Object... kv) {
        try {
            JSONObject o = new JSONObject();
            o.put("type", type);
            for (int i = 0; i + 1 < kv.length; i += 2) o.put((String) kv[i], kv[i + 1]);
            final String code = "window.__lan && window.__lan(" + o + ")";
            activity.runOnUiThread(() -> { try { activity.web.evaluateJavascript(code, null); } catch (Exception ignored) { } });
        } catch (Exception ignored) { }
    }

    /** IPv4 addresses of this phone on wifi or hotspot, best first. */
    static String localIp() {
        List<String> good = new ArrayList<>(), other = new ArrayList<>();
        try {
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!ni.isUp() || ni.isLoopback()) continue;
                String n = ni.getName();
                for (InetAddress a : Collections.list(ni.getInetAddresses())) {
                    if (!(a instanceof Inet4Address) || a.isLoopbackAddress()) continue;
                    String ip = a.getHostAddress();
                    if (n.startsWith("wlan") || n.startsWith("ap") || n.startsWith("swlan") || n.startsWith("eth")) good.add(ip);
                    else if (a.isSiteLocalAddress()) other.add(ip);
                }
            }
        } catch (Exception ignored) { }
        good.addAll(other);
        return good.isEmpty() ? "" : good.get(0);
    }

    // ---------- host ----------
    synchronized void host(String name) {
        close();
        hosting = true;
        final int g = gen;
        try {
            server = new ServerSocket();
            server.setReuseAddress(true);
            try { server.bind(new InetSocketAddress(PORT)); } catch (Exception e) { server = new ServerSocket(0); }
        } catch (Exception e) { emit("error", "msg", "Could not start hosting"); return; }
        final ServerSocket ss = server;
        int port = ss.getLocalPort();
        emit("hosting", "ip", localIp(), "port", port);
        try {
            NsdServiceInfo info = new NsdServiceInfo();
            info.setServiceName("GameHub " + (name == null || name.isEmpty() ? "player" : name));
            info.setServiceType(TYPE);
            info.setPort(port);
            reg = new NsdManager.RegistrationListener() {
                public void onServiceRegistered(NsdServiceInfo s) { }
                public void onRegistrationFailed(NsdServiceInfo s, int err) { }
                public void onServiceUnregistered(NsdServiceInfo s) { }
                public void onUnregistrationFailed(NsdServiceInfo s, int err) { }
            };
            nsd.registerService(info, NsdManager.PROTOCOL_DNS_SD, reg);
        } catch (Exception ignored) { reg = null; } // joining by address still works
        new Thread(() -> {
            try {
                Socket s = ss.accept();
                synchronized (LanLink.this) {
                    if (g != gen || webGuest) { s.close(); return; }
                    try { ss.close(); } catch (Exception ignored) { }
                    server = null;
                    attach(s, "host", g);
                }
            } catch (Exception e) { synchronized (LanLink.this) { if (g == gen && !webGuest) emit("error", "msg", "Hosting stopped"); } }
        }).start();
    }

    // ---------- a friend in a browser (iPhone or computer) ----------
    /** While hosting on wifi, also serve the game at http://ip:port/ so a friend can play in their browser. */
    synchronized void webStart() {
        if (!hosting) { emit("error", "msg", "Start hosting first"); return; }
        if (web != null) { emit("webhost", "ip", localIp(), "port", web.port()); return; }
        final int g = gen;
        webLink = new WebLink(new WebLink.Events() {
            public boolean canAccept() { synchronized (LanLink.this) { return g == gen && hosting && sock == null && !webGuest; } }
            public void connected(String peer) {
                synchronized (LanLink.this) {
                    if (g != gen) return;
                    webGuest = true; hosting = false;
                    // stop advertising to app users: this game is taken
                    if (reg != null) { try { nsd.unregisterService(reg); } catch (Exception ignored) { } reg = null; }
                    if (server != null) { try { server.close(); } catch (Exception ignored) { } server = null; }
                }
                emit("connected", "role", "host", "peer", peer, "web", true);
            }
            public void message(String json) { if (g == gen) emit("msg", "data", json); }
            public void reconnecting() { if (g == gen) emit("reconnecting"); }
            public void resumed() { if (g == gen) emit("resumed"); }
            public void closed() { if (g == gen) { emit("closed"); synchronized (LanLink.this) { if (g == gen) close(); } } }
        });
        web = new WebHost(path -> activity.getAssets().open(path), webLink);
        try {
            int port = web.start(WebHost.PREFERRED_PORT);
            emit("webhost", "ip", localIp(), "port", port);
        } catch (Exception e) {
            web = null; webLink.shutdown(); webLink = null;
            emit("error", "msg", "Could not start the browser game");
        }
    }

    // ---------- discovery ----------
    synchronized void discover() {
        stopDiscover();
        found.clear();
        try {
            WifiManager wm = (WifiManager) activity.getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wm != null) { lock = wm.createMulticastLock("gamehub-lan"); lock.setReferenceCounted(false); lock.acquire(); }
        } catch (Exception ignored) { }
        disc = new NsdManager.DiscoveryListener() {
            public void onDiscoveryStarted(String t) { }
            public void onDiscoveryStopped(String t) { }
            public void onStartDiscoveryFailed(String t, int err) { emit("error", "msg", "Could not search for games"); }
            public void onStopDiscoveryFailed(String t, int err) { }
            public void onServiceFound(NsdServiceInfo s) {
                String id = s.getServiceName();
                synchronized (LanLink.this) { found.put(id, s); }
                emit("found", "id", id, "name", id.replaceFirst("^GameHub ", ""));
            }
            public void onServiceLost(NsdServiceInfo s) {
                String id = s.getServiceName();
                synchronized (LanLink.this) { found.remove(id); }
                emit("lost", "id", id);
            }
        };
        try { nsd.discoverServices(TYPE, NsdManager.PROTOCOL_DNS_SD, disc); }
        catch (Exception e) { disc = null; emit("error", "msg", "Could not search for games"); }
    }

    synchronized void stopDiscover() {
        if (disc != null) { try { nsd.stopServiceDiscovery(disc); } catch (Exception ignored) { } disc = null; }
        if (lock != null) { try { lock.release(); } catch (Exception ignored) { } lock = null; }
    }

    // ---------- join ----------
    @SuppressWarnings("deprecation")
    synchronized void join(String id) {
        NsdServiceInfo s = found.get(id);
        if (s == null) { emit("error", "msg", "That game is no longer available"); return; }
        final int g = gen;
        try {
            nsd.resolveService(s, new NsdManager.ResolveListener() {
                public void onResolveFailed(NsdServiceInfo i, int err) { if (g == gen) emit("error", "msg", "Could not reach that game"); }
                public void onServiceResolved(NsdServiceInfo i) {
                    InetAddress h = i.getHost();
                    if (h == null) { emit("error", "msg", "Could not reach that game"); return; }
                    connect(h.getHostAddress(), i.getPort(), g);
                }
            });
        } catch (Exception e) { emit("error", "msg", "Could not reach that game"); }
    }

    synchronized void joinIp(String ip, int port) { connect(ip, port > 0 ? port : PORT, gen); }

    private void connect(String ip, int port, int g) {
        new Thread(() -> {
            try {
                Socket s = new Socket();
                s.connect(new InetSocketAddress(ip, port), 6000);
                synchronized (LanLink.this) {
                    if (g != gen) { s.close(); return; }
                    stopDiscover();
                    attach(s, "guest", g);
                }
            } catch (Exception e) { if (g == gen) emit("error", "msg", "Could not connect to " + ip); }
        }).start();
    }

    // ---------- connection ----------
    private void attach(Socket s, String role, int g) {
        try {
            s.setTcpNoDelay(true);
            s.setKeepAlive(true);
            sock = s;
            hosting = false;
            out = new BufferedWriter(new OutputStreamWriter(s.getOutputStream(), StandardCharsets.UTF_8));
            writer = Executors.newSingleThreadExecutor();
            final BufferedReader in = new BufferedReader(new InputStreamReader(s.getInputStream(), StandardCharsets.UTF_8));
            emit("connected", "role", role, "peer", s.getInetAddress().getHostAddress());
            new Thread(() -> {
                try {
                    String line;
                    while ((line = in.readLine()) != null) { if (g != gen) return; emit("msg", "data", line); }
                } catch (Exception ignored) { }
                if (g == gen) { emit("closed"); synchronized (LanLink.this) { if (g == gen) close(); } }
            }).start();
        } catch (Exception e) { emit("error", "msg", "Connection failed"); }
    }

    synchronized void send(String line) {
        if (webLink != null && webLink.active()) { if (line != null) webLink.send(line); return; }
        final BufferedWriter w = out;
        final ExecutorService ex = writer;
        if (w == null || ex == null || line == null) return;
        final String clean = line.replace('\n', ' ');
        try {
            ex.execute(() -> { try { w.write(clean); w.write('\n'); w.flush(); } catch (Exception ignored) { } });
        } catch (Exception ignored) { }
    }

    synchronized void close() {
        gen++;
        hosting = false; webGuest = false;
        if (webLink != null) { webLink.shutdown(); webLink = null; }
        if (web != null) { web.stop(); web = null; }
        stopDiscover();
        if (reg != null) { try { nsd.unregisterService(reg); } catch (Exception ignored) { } reg = null; }
        if (server != null) { try { server.close(); } catch (Exception ignored) { } server = null; }
        if (sock != null) { try { sock.close(); } catch (Exception ignored) { } sock = null; }
        if (writer != null) { writer.shutdownNow(); writer = null; }
        out = null;
    }
}
