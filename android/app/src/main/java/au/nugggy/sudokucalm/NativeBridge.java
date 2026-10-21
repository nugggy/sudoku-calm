package au.nugggy.sudokucalm;

import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.widget.Toast;

import androidx.core.content.FileProvider;
import androidx.core.view.WindowInsetsControllerCompat;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/** Methods the web app can call as window.SCNative. */
public class NativeBridge {
    private final MainActivity activity;
    private volatile boolean downloading = false;
    private volatile int lastPct = -1; // how far the current update download has got
    private File pendingApk = null;

    private LanLink lan;
    private BtLink bt;

    NativeBridge(MainActivity activity) { this.activity = activity; }

    private synchronized LanLink lan() { if (lan == null) lan = new LanLink(activity); return lan; }
    private synchronized BtLink bt() { if (bt == null) bt = new BtLink(activity); return bt; }

    // ---------- Local two-phone games (see LanLink) ----------
    @JavascriptInterface public void lanHost(String name) { if (bt != null) bt.close(); lan().host(name); }
    @JavascriptInterface public void lanDiscover() { lan().discover(); }
    @JavascriptInterface public void lanStopDiscover() { lan().stopDiscover(); }
    @JavascriptInterface public void lanJoin(String id) { if (bt != null) bt.close(); lan().join(id); }
    @JavascriptInterface public void lanJoinIp(String ip, int port) { if (bt != null) bt.close(); lan().joinIp(ip, port); }
    @JavascriptInterface public void lanSend(String json) { lan().send(json); }
    @JavascriptInterface public void lanClose() { lan().close(); }
    @JavascriptInterface public String lanIp() { return LanLink.localIp(); }
    /** While hosting on wifi, also serve the game so a friend can join from a browser (see WebHost). */
    @JavascriptInterface public void lanWebStart() { lan().webStart(); }

    // ---------- The same over Bluetooth (see BtLink). Events also arrive through window.__lan, tagged via: "bt". ----------
    @JavascriptInterface public boolean btAvailable() { return activity.getPackageManager().hasSystemFeature(android.content.pm.PackageManager.FEATURE_BLUETOOTH); }
    @JavascriptInterface public void btHost(String name) { lan().close(); bt().host(name); }
    @JavascriptInterface public void btDiscover() { bt().discover(); }
    @JavascriptInterface public void btStopDiscover() { bt().stopDiscover(); }
    @JavascriptInterface public void btJoin(String address) { lan().close(); bt().join(address); }
    @JavascriptInterface public void btSend(String json) { bt().send(json); }
    @JavascriptInterface public void btClose() { bt().close(); }

    @JavascriptInterface
    public String getVersionName() {
        try {
            PackageInfo p = activity.getPackageManager().getPackageInfo(activity.getPackageName(), 0);
            return p.versionName;
        } catch (Exception e) { return "0.0.0"; }
    }

    @JavascriptInterface
    public int getVersionCode() {
        try {
            PackageInfo p = activity.getPackageManager().getPackageInfo(activity.getPackageName(), 0);
            return (int) p.getLongVersionCode();
        } catch (Exception e) { return 0; }
    }

    /** Matches the system bars to the current screen colour. */
    @JavascriptInterface
    public void setSystemBars(String color, boolean darkIcons) {
        activity.runOnUiThread(() -> {
            try { activity.root.setBackgroundColor(Color.parseColor(color)); } catch (Exception ignored) { }
            WindowInsetsControllerCompat c = new WindowInsetsControllerCompat(activity.getWindow(), activity.getWindow().getDecorView());
            c.setAppearanceLightStatusBars(darkIcons);
            c.setAppearanceLightNavigationBars(darkIcons);
        });
    }

    @JavascriptInterface
    public void vibrate(int ms) {
        Vibrator v = (Vibrator) activity.getSystemService(Context.VIBRATOR_SERVICE);
        if (v == null || !v.hasVibrator()) return;
        v.vibrate(VibrationEffect.createOneShot(Math.max(1, Math.min(ms, 400)), VibrationEffect.DEFAULT_AMPLITUDE));
    }

    @JavascriptInterface
    public void openUrl(String url) {
        activity.runOnUiThread(() -> {
            try { activity.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); } catch (Exception ignored) { }
        });
    }

    @JavascriptInterface
    public void exitApp() { activity.runOnUiThread(activity::finish); }

    /** Opens Android's share sheet with some text (a message and a link). */
    @JavascriptInterface
    public void shareText(String text) {
        activity.runOnUiThread(() -> {
            try {
                Intent send = new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text);
                activity.startActivity(Intent.createChooser(send, "Share GameHub"));
            } catch (Exception ignored) { }
        });
    }

    /**
     * Downloads a release APK from GitHub (with retries) and hands it to the Android installer.
     * Every outcome is reported back to the page, so the update screen never just sits there:
     * __scUpdateProgress(pct) as it goes, __scUpdateNeedsPermission() if Android has to be told to allow
     * installs from this app first, and __scUpdateFailed(reason) if the download or the installer fails.
     */
    @JavascriptInterface
    public void downloadAndInstall(String url, String version) {
        if (url == null || !url.startsWith("https://github.com/")) { failed("link"); return; }
        if (downloading) { progress(Math.max(0, lastPct)); return; } // already on its way: say how far
        downloading = true;
        lastPct = 0;
        progress(0);
        new Thread(() -> {
            File dir = activity.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
            if (dir == null) dir = activity.getFilesDir();
            File[] old = dir.listFiles();
            if (old != null) for (File f : old) if (f.getName().endsWith(".apk")) f.delete();
            File apk = new File(dir, "sudoku-calm-" + version.replaceAll("[^0-9A-Za-z.-]", "") + ".apk");
            boolean ok = false;
            for (int attempt = 1; attempt <= 4 && !ok; attempt++) {
                try {
                    ok = fetch(url, apk);
                } catch (Exception e) {
                    try { Thread.sleep(1500L * attempt); } catch (InterruptedException ignored) { }
                }
            }
            downloading = false;
            final boolean done = ok;
            activity.runOnUiThread(() -> {
                if (done) { progress(100); install(apk); }
                else failed("download");
            });
        }).start();
    }

    private void progress(int pct) { activity.runOnUiThread(() -> js("window.__scUpdateProgress && window.__scUpdateProgress(" + pct + ")")); }
    private void failed(String why) { activity.runOnUiThread(() -> js("window.__scUpdateFailed && window.__scUpdateFailed('" + why + "')")); }

    private boolean fetch(String url, File out) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setInstanceFollowRedirects(true);
        c.setConnectTimeout(15000);
        c.setReadTimeout(30000);
        c.setRequestProperty("User-Agent", "GameHub-Updater");
        try {
            if (c.getResponseCode() != 200) return false;
            long total = c.getContentLengthLong(), got = 0;
            try (InputStream in = c.getInputStream(); FileOutputStream fo = new FileOutputStream(out)) {
                byte[] buf = new byte[32768];
                int n;
                while ((n = in.read(buf)) > 0) {
                    fo.write(buf, 0, n);
                    got += n;
                    int pct = total > 0 ? (int) (got * 100 / total) : -1;
                    if (pct >= 0 && pct != lastPct && pct < 100) { lastPct = pct; progress(pct); }
                }
            }
            return total <= 0 || got == total;
        } finally {
            c.disconnect();
        }
    }

    private void js(String code) {
        try { activity.web.evaluateJavascript(code, null); } catch (Exception ignored) { }
    }

    private void install(File apk) {
        if (!activity.getPackageManager().canRequestPackageInstalls()) {
            // Android needs a one-off permission to install updates from this app.
            pendingApk = apk;
            js("window.__scUpdateNeedsPermission && window.__scUpdateNeedsPermission()");
            Toast.makeText(activity, "Allow GameHub to install updates, then come back.", Toast.LENGTH_LONG).show();
            try {
                activity.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + activity.getPackageName())));
            } catch (Exception e) { failed("permission"); }
            return;
        }
        try {
            Uri uri = FileProvider.getUriForFile(activity, activity.getPackageName() + ".files", apk);
            Intent i = new Intent(Intent.ACTION_VIEW)
                    .setDataAndType(uri, "application/vnd.android.package-archive")
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            activity.startActivity(i);
        } catch (Exception e) { failed("install"); }
    }

    /** Called from onResume: finish an install that was waiting on the permission screen. */
    void resumePendingInstall() {
        if (pendingApk != null && activity.getPackageManager().canRequestPackageInstalls()) {
            File apk = pendingApk;
            pendingApk = null;
            install(apk);
        }
    }

    void release() { if (lan != null) lan.close(); if (bt != null) bt.close(); }
}
