package au.nugggy.sudokucalm;

import android.Manifest;
import android.annotation.SuppressLint;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothClass;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothServerSocket;
import android.bluetooth.BluetoothSocket;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.os.Build;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Two-phone games over classic Bluetooth (RFCOMM), for when there is no shared wifi.
 * Same message format and events as LanLink: single lines of JSON, events to window.__lan({...}).
 * The host listens on a fixed service UUID and asks to be discoverable; the friend picks the host
 * from paired phones or a scan. Insecure sockets, so phones do not have to be paired first.
 */
@SuppressLint("MissingPermission") // every entry point goes through ready(), which checks permissions first
class BtLink {
    static final UUID APP_UUID = UUID.fromString("6f3c2a14-9d1e-4b7a-8c55-3e0b9a7d1f42");
    static final String SERVICE = "GameHub";

    private final MainActivity activity;
    private BluetoothServerSocket server;
    private BluetoothSocket sock;
    private BufferedWriter out;
    private ExecutorService writer;
    private BroadcastReceiver scan;
    private final Set<String> seen = new HashSet<>();
    private int gen = 0;

    BtLink(MainActivity activity) { this.activity = activity; }

    private void emit(String type, Object... kv) {
        try {
            JSONObject o = new JSONObject();
            o.put("type", type);
            o.put("via", "bt");
            for (int i = 0; i + 1 < kv.length; i += 2) o.put((String) kv[i], kv[i + 1]);
            final String code = "window.__lan && window.__lan(" + o + ")";
            activity.runOnUiThread(() -> { try { activity.web.evaluateJavascript(code, null); } catch (Exception ignored) { } });
        } catch (Exception ignored) { }
    }

    private BluetoothAdapter adapter() {
        BluetoothManager m = (BluetoothManager) activity.getSystemService(Context.BLUETOOTH_SERVICE);
        return m == null ? null : m.getAdapter();
    }

    static String[] permissions(boolean host) {
        if (Build.VERSION.SDK_INT >= 31) {
            return host ? new String[] { Manifest.permission.BLUETOOTH_CONNECT, Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_ADVERTISE }
                    : new String[] { Manifest.permission.BLUETOOTH_CONNECT, Manifest.permission.BLUETOOTH_SCAN };
        }
        return new String[] { Manifest.permission.ACCESS_FINE_LOCATION };
    }

    private boolean granted(String[] perms) {
        for (String p : perms) if (activity.checkSelfPermission(p) != PackageManager.PERMISSION_GRANTED) return false;
        return true;
    }

    /** Makes sure Bluetooth exists, permissions are granted and the radio is on, then runs next on the UI thread. */
    private void ready(boolean host, Runnable next) {
        activity.runOnUiThread(() -> {
            BluetoothAdapter a = adapter();
            if (a == null) { emit("error", "msg", "This phone has no Bluetooth", "code", "nobt"); return; }
            String[] perms = permissions(host);
            if (!granted(perms)) {
                activity.askPermissions(perms, ok -> {
                    if (ok) ready(host, next);
                    else emit("error", "msg", "Bluetooth needs permission to find nearby phones. Allow Nearby devices in the app settings.", "code", "perm");
                });
                return;
            }
            if (!a.isEnabled()) {
                activity.startForResult(new Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE), ok -> {
                    BluetoothAdapter b = adapter();
                    if (b != null && b.isEnabled()) next.run();
                    else emit("error", "msg", "Turn on Bluetooth to play over Bluetooth", "code", "off");
                });
                return;
            }
            next.run();
        });
    }

    // ---------- host ----------
    void host(String name) {
        ready(true, () -> {
            synchronized (this) {
                close();
                final int g = gen;
                BluetoothAdapter a = adapter();
                try { server = a.listenUsingInsecureRfcommWithServiceRecord(SERVICE, APP_UUID); }
                catch (Exception e) { emit("error", "msg", "Could not start hosting over Bluetooth"); return; }
                final BluetoothServerSocket ss = server;
                String me = "";
                try { me = a.getName(); } catch (Exception ignored) { }
                emit("hosting", "ip", "", "port", 0, "device", me == null ? "" : me);
                // let phones that have never paired find this one
                try {
                    Intent d = new Intent(BluetoothAdapter.ACTION_REQUEST_DISCOVERABLE);
                    d.putExtra(BluetoothAdapter.EXTRA_DISCOVERABLE_DURATION, 120);
                    activity.startForResult(d, ok -> { });
                } catch (Exception ignored) { }
                new Thread(() -> {
                    try {
                        BluetoothSocket s = ss.accept();
                        synchronized (BtLink.this) {
                            if (g != gen) { s.close(); return; }
                            try { ss.close(); } catch (Exception ignored) { }
                            server = null;
                            attach(s, "host", g);
                        }
                    } catch (Exception e) { if (g == gen) emit("error", "msg", "Hosting stopped"); }
                }).start();
            }
        });
    }

    // ---------- discovery ----------
    void discover() {
        ready(false, () -> {
            synchronized (this) {
                stopDiscover();
                seen.clear();
                BluetoothAdapter a = adapter();
                // paired phones first: they show up straight away
                try {
                    for (BluetoothDevice d : a.getBondedDevices()) if (isPhoneish(d)) found(d, true);
                } catch (Exception ignored) { }
                scan = new BroadcastReceiver() {
                    @Override public void onReceive(Context c, Intent i) {
                        if (BluetoothDevice.ACTION_FOUND.equals(i.getAction())) {
                            BluetoothDevice d = i.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE);
                            if (d != null && isPhoneish(d)) found(d, false);
                        } else if (BluetoothAdapter.ACTION_DISCOVERY_FINISHED.equals(i.getAction())) {
                            // keep looking while the list is open; scans only last about 12 seconds
                            synchronized (BtLink.this) {
                                if (scan != null) { try { adapter().startDiscovery(); } catch (Exception ignored) { } }
                            }
                        }
                    }
                };
                IntentFilter f = new IntentFilter(BluetoothDevice.ACTION_FOUND);
                f.addAction(BluetoothAdapter.ACTION_DISCOVERY_FINISHED);
                if (Build.VERSION.SDK_INT >= 33) activity.registerReceiver(scan, f, Context.RECEIVER_EXPORTED);
                else activity.registerReceiver(scan, f);
                try { a.cancelDiscovery(); a.startDiscovery(); } catch (Exception e) { emit("error", "msg", "Could not search for nearby phones"); }
            }
        });
    }

    private static boolean isPhoneish(BluetoothDevice d) {
        try {
            BluetoothClass c = d.getBluetoothClass();
            if (c == null) return true;
            int major = c.getMajorDeviceClass();
            return major == BluetoothClass.Device.Major.PHONE || major == BluetoothClass.Device.Major.COMPUTER || major == BluetoothClass.Device.Major.UNCATEGORIZED;
        } catch (Exception e) { return true; }
    }

    private void found(BluetoothDevice d, boolean paired) {
        String id = d.getAddress();
        synchronized (this) { if (!seen.add(id)) return; }
        String n = null;
        try { n = d.getName(); } catch (Exception ignored) { }
        emit("found", "id", id, "name", n == null || n.isEmpty() ? id : n, "paired", paired);
    }

    synchronized void stopDiscover() {
        if (scan != null) {
            try { activity.unregisterReceiver(scan); } catch (Exception ignored) { }
            scan = null;
        }
        try { BluetoothAdapter a = adapter(); if (a != null) a.cancelDiscovery(); } catch (Exception ignored) { }
    }

    // ---------- join ----------
    void join(String address) {
        ready(false, () -> {
            final int g;
            synchronized (this) { g = gen; stopDiscover(); }
            new Thread(() -> {
                try {
                    BluetoothDevice d = adapter().getRemoteDevice(address);
                    BluetoothSocket s = d.createInsecureRfcommSocketToServiceRecord(APP_UUID);
                    s.connect();
                    synchronized (BtLink.this) {
                        if (g != gen) { s.close(); return; }
                        attach(s, "guest", g);
                    }
                } catch (Exception e) {
                    if (g == gen) emit("error", "msg", "Could not connect. Check your friend is hosting over Bluetooth and try again.");
                }
            }).start();
        });
    }

    // ---------- connection ----------
    private void attach(BluetoothSocket s, String role, int g) {
        try {
            sock = s;
            out = new BufferedWriter(new OutputStreamWriter(s.getOutputStream(), StandardCharsets.UTF_8));
            writer = Executors.newSingleThreadExecutor();
            final BufferedReader in = new BufferedReader(new InputStreamReader(s.getInputStream(), StandardCharsets.UTF_8));
            String peer = "";
            try { peer = s.getRemoteDevice().getName(); } catch (Exception ignored) { }
            emit("connected", "role", role, "peer", peer == null ? "" : peer);
            new Thread(() -> {
                try {
                    String line;
                    while ((line = in.readLine()) != null) { if (g != gen) return; emit("msg", "data", line); }
                } catch (Exception ignored) { }
                if (g == gen) { emit("closed"); synchronized (BtLink.this) { if (g == gen) close(); } }
            }).start();
        } catch (Exception e) { emit("error", "msg", "Connection failed"); }
    }

    synchronized void send(String line) {
        final BufferedWriter w = out;
        final ExecutorService ex = writer;
        if (w == null || ex == null || line == null) return;
        final String clean = line.replace('\n', ' ');
        try { ex.execute(() -> { try { w.write(clean); w.write('\n'); w.flush(); } catch (Exception ignored) { } }); }
        catch (Exception ignored) { }
    }

    synchronized boolean connected() { return sock != null; }

    synchronized void close() {
        gen++;
        stopDiscover();
        if (server != null) { try { server.close(); } catch (Exception ignored) { } server = null; }
        if (sock != null) { try { sock.close(); } catch (Exception ignored) { } sock = null; }
        if (writer != null) { writer.shutdownNow(); writer = null; }
        out = null;
    }
}
