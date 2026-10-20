package au.nugggy.sudokucalm;

import java.io.File;
import java.io.FileInputStream;
import java.util.Map;

/**
 * The host phone, on a desktop: serves www/ with the real WebHost and WebLink, so a browser "friend" can join at
 * /?join=duo exactly as on a phone. The host page itself runs in Chrome with a stand-in for the Android bridge
 * (shim.js), which talks to this program over /hostctl in place of LanLink.
 * Usage: java -cp out au.nugggy.sudokucalm.DesktopHost <www folder> [port]   (prints "PORT <n>")
 */
public class DesktopHost {
    static volatile WebHost.Conn ctl;
    static volatile boolean hosting;
    static WebLink link;
    static int port;

    static String q(String s) {
        StringBuilder b = new StringBuilder("\"");
        for (char c : s.toCharArray()) {
            if (c == '"' || c == '\\') b.append('\\').append(c);
            else if (c < 0x20) b.append(String.format("\\u%04x", (int) c));
            else b.append(c);
        }
        return b.append('"').toString();
    }
    static void emit(String json) { WebHost.Conn c = ctl; if (c != null) c.sendText(json); }

    public static void main(String[] a) throws Exception {
        final File root = new File(a.length > 0 ? a[0] : "www");
        link = new WebLink(new WebLink.Events() {
            public boolean canAccept() { return hosting; }
            public void connected(String peer) { hosting = false; emit("{\"type\":\"connected\",\"role\":\"host\",\"peer\":" + q(peer) + ",\"web\":true}"); }
            public void message(String json) { emit("{\"type\":\"msg\",\"data\":" + q(json) + "}"); }
            public void reconnecting() { emit("{\"type\":\"reconnecting\"}"); }
            public void resumed() { emit("{\"type\":\"resumed\"}"); }
            public void closed() { emit("{\"type\":\"closed\"}"); }
        });
        if (System.getenv("LEAVE_MS") != null) link.leaveMs = Long.parseLong(System.getenv("LEAVE_MS"));
        WebHost web = new WebHost((path) -> new FileInputStream(new File(root, path)), new WebHost.Listener() {
            public void onOpen(WebHost.Conn c, String path, Map<String, String> query) {
                if (path.equals("/hostctl")) { ctl = c; return; }
                link.onOpen(c, path, query);
            }
            public void onText(WebHost.Conn c, String text) {
                if (c != ctl) { link.onText(c, text); return; }
                int bar = text.indexOf('|');
                String cmd = bar < 0 ? text : text.substring(0, bar), arg = bar < 0 ? "" : text.substring(bar + 1);
                switch (cmd) {
                    case "host": hosting = true; emit("{\"type\":\"hosting\",\"ip\":\"127.0.0.1\",\"port\":0}"); break;
                    case "webstart": emit("{\"type\":\"webhost\",\"ip\":\"127.0.0.1\",\"port\":" + port + "}"); break;
                    case "send": link.send(arg); break;
                    case "close": hosting = false; link.close(); break;
                    default: break;
                }
            }
            public void onClose(WebHost.Conn c) { if (c == ctl) ctl = null; else link.onClose(c); }
        });
        port = web.start(a.length > 1 ? Integer.parseInt(a[1]) : 0);
        System.out.println("PORT " + port);
        System.out.flush();
        Thread.currentThread().join();
    }
}
