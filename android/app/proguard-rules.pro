# Keep the methods the web app calls through the JavaScript bridge.
-keepclassmembers class au.nugggy.sudokucalm.NativeBridge {
    @android.webkit.JavascriptInterface <methods>;
}
