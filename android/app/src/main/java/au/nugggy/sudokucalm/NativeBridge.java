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
    private File pendingApk = null;

    NativeBridge(MainActivity activity) { this.activity = activity; }

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

    /** Downloads a release APK from GitHub (with retries) and hands it to the Android installer. */
    @JavascriptInterface
    public void downloadAndInstall(String url, String version) {
        if (!url.startsWith("https://github.com/")) return;
        if (downloading) return;
        downloading = true;
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
                if (done) { js("window.__scUpdateProgress && window.__scUpdateProgress(100)"); install(apk); }
                else js("window.__scUpdateFailed && window.__scUpdateFailed()");
            });
        }).start();
    }

    private boolean fetch(String url, File out) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setInstanceFollowRedirects(true);
        c.setConnectTimeout(15000);
        c.setReadTimeout(30000);
        c.setRequestProperty("User-Agent", "GameHub-Updater");
        try {
            if (c.getResponseCode() != 200) return false;
            long total = c.getContentLengthLong(), got = 0;
            int lastPct = -1;
            try (InputStream in = c.getInputStream(); FileOutputStream fo = new FileOutputStream(out)) {
                byte[] buf = new byte[32768];
                int n;
                while ((n = in.read(buf)) > 0) {
                    fo.write(buf, 0, n);
                    got += n;
                    int pct = total > 0 ? (int) (got * 100 / total) : -1;
                    if (pct >= 0 && pct != lastPct && pct % 5 == 0) {
                        lastPct = pct;
                        final int p = pct;
                        activity.runOnUiThread(() -> js("window.__scUpdateProgress && window.__scUpdateProgress(" + p + ")"));
                    }
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
            Toast.makeText(activity, "Allow GameHub to install updates, then come back.", Toast.LENGTH_LONG).show();
            activity.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + activity.getPackageName())));
            return;
        }
        Uri uri = FileProvider.getUriForFile(activity, activity.getPackageName() + ".files", apk);
        Intent i = new Intent(Intent.ACTION_VIEW)
                .setDataAndType(uri, "application/vnd.android.package-archive")
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        activity.startActivity(i);
    }

    /** Called from onResume: finish an install that was waiting on the permission screen. */
    void resumePendingInstall() {
        if (pendingApk != null && activity.getPackageManager().canRequestPackageInstalls()) {
            File apk = pendingApk;
            pendingApk = null;
            install(apk);
        }
    }

    void release() { }
}
