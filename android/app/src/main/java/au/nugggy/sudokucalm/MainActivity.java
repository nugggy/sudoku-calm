package au.nugggy.sudokucalm;

import android.annotation.SuppressLint;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import androidx.activity.ComponentActivity;
import androidx.activity.EdgeToEdge;
import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;

import java.util.Map;
import java.util.function.Consumer;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.webkit.WebViewAssetLoader;

/** Hosts the game (bundled web assets) in a full-screen WebView. */
public class MainActivity extends ComponentActivity {
    static final String HOST = "appassets.androidplatform.net";
    static final String START_URL = "https://" + HOST + "/assets/index.html";

    FrameLayout root;
    WebView web;
    NativeBridge bridge;

    // Runtime permission and system prompts (Bluetooth). One at a time; the callback gets true when allowed.
    private Consumer<Boolean> permDone, actDone;
    private final ActivityResultLauncher<String[]> permLauncher = registerForActivityResult(new ActivityResultContracts.RequestMultiplePermissions(), (Map<String, Boolean> r) -> {
        boolean ok = !r.isEmpty();
        for (Boolean v : r.values()) ok &= Boolean.TRUE.equals(v);
        Consumer<Boolean> d = permDone; permDone = null;
        if (d != null) d.accept(ok);
    });
    private final ActivityResultLauncher<Intent> actLauncher = registerForActivityResult(new ActivityResultContracts.StartActivityForResult(), r -> {
        Consumer<Boolean> d = actDone; actDone = null;
        if (d != null) d.accept(r.getResultCode() != RESULT_CANCELED);
    });

    void askPermissions(String[] perms, Consumer<Boolean> done) {
        permDone = done;
        try { permLauncher.launch(perms); } catch (Exception e) { permDone = null; done.accept(false); }
    }

    void startForResult(Intent i, Consumer<Boolean> done) {
        actDone = done;
        try { actLauncher.launch(i); } catch (Exception e) { actDone = null; done.accept(false); }
    }

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        EdgeToEdge.enable(this);
        super.onCreate(savedInstanceState);

        root = new FrameLayout(this);
        web = new WebView(this);
        root.addView(web, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);

        // Keep the game clear of the status bar, navigation bar and camera cut-outs.
        ViewCompat.setOnApplyWindowInsetsListener(root, (v, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return WindowInsetsCompat.CONSUMED;
        });

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setTextZoom(100);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setBackgroundColor(Color.TRANSPARENT);

        WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return loader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (HOST.equals(uri.getHost())) return false;
                // Links that leave the app open in the browser.
                try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (Exception ignored) { }
                return true;
            }
        });

        bridge = new NativeBridge(this);
        web.addJavascriptInterface(bridge, "SCNative");

        // Android back button: let the web app close sheets and screens first.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                web.evaluateJavascript("window.__scBack ? window.__scBack() : false", value -> {
                    if (!"true".equals(value)) finish();
                });
            }
        });

        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl(START_URL);
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    protected void onPause() {
        super.onPause();
        web.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        bridge.resumePendingInstall();
    }

    @Override
    protected void onDestroy() {
        bridge.release();
        web.destroy();
        super.onDestroy();
    }
}
