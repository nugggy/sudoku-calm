package au.nugggy.sudokucalm;

import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
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

import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import androidx.core.view.WindowInsetsControllerCompat;

import java.io.File;

/** Methods the web app can call as window.SCNative. */
public class NativeBridge {
    private final MainActivity activity;
    private long downloadId = -1;
    private File pendingApk = null;
    private BroadcastReceiver receiver = null;

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

    /** Downloads a release APK from GitHub and hands it to the Android installer. */
    @JavascriptInterface
    public void downloadAndInstall(String url, String version) {
        activity.runOnUiThread(() -> {
            if (!url.startsWith("https://github.com/") && !url.startsWith("https://objects.githubusercontent.com/")) return;
            File dir = activity.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
            if (dir == null) return;
            File[] old = dir.listFiles();
            if (old != null) for (File f : old) if (f.getName().endsWith(".apk")) f.delete();
            File apk = new File(dir, "sudoku-calm-" + version.replaceAll("[^0-9A-Za-z.-]", "") + ".apk");

            DownloadManager dm = (DownloadManager) activity.getSystemService(Context.DOWNLOAD_SERVICE);
            DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url))
                    .setTitle("Sudoku Calm " + version)
                    .setDescription("Downloading update")
                    .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE)
                    .setDestinationUri(Uri.fromFile(apk));
            downloadId = dm.enqueue(req);

            if (receiver == null) {
                receiver = new BroadcastReceiver() {
                    @Override
                    public void onReceive(Context context, Intent intent) {
                        long id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
                        if (id != downloadId) return;
                        if (apk.exists() && apk.length() > 0) install(apk);
                        else Toast.makeText(activity, "The update did not download. Please try again.", Toast.LENGTH_LONG).show();
                    }
                };
                ContextCompat.registerReceiver(activity, receiver, new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE), ContextCompat.RECEIVER_EXPORTED);
            }
        });
    }

    private void install(File apk) {
        if (!activity.getPackageManager().canRequestPackageInstalls()) {
            // Android needs a one-off permission to install updates from this app.
            pendingApk = apk;
            Toast.makeText(activity, "Allow Sudoku Calm to install updates, then come back.", Toast.LENGTH_LONG).show();
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

    void release() {
        if (receiver != null) {
            try { activity.unregisterReceiver(receiver); } catch (Exception ignored) { }
            receiver = null;
        }
    }
}
