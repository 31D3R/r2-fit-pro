package br.com.r2fitpro.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Atualização com um toque (app 1.9.2+): baixa o APK novo dentro do app e abre a tela do Android "Atualizar este app?".
 * Fora da Play Store o Android sempre pede essa confirmação; a primeira vez também pede para permitir instalar do R2 Fit Pro.
 */
@CapacitorPlugin(name = "AtualizarApp")
public class AtualizarAppPlugin extends Plugin {
    private static volatile boolean baixando = false;

    /** url: endereço do APK em /baixar/ do próprio site. Responde { estado: 'instalando' | 'permissao' }. */
    @PluginMethod
    public void instalar(PluginCall call) {
        String url = call.getString("url", "");
        if (!(url.startsWith("https://r2fitpro.com.br/baixar/") || url.startsWith("https://www.r2fitpro.com.br/baixar/")
            || url.startsWith("https://r2-fit-pro.vercel.app/baixar/")) || !url.endsWith(".apk")) {
            call.reject("Endereço de atualização inválido");
            return;
        }
        // Android 8+: o app precisa da permissão "instalar apps desconhecidos" (a pessoa liga uma vez nos ajustes)
        if (Build.VERSION.SDK_INT >= 26 && !getContext().getPackageManager().canRequestPackageInstalls()) {
            Intent i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getActivity().startActivity(i);
            JSObject r = new JSObject();
            r.put("estado", "permissao");
            call.resolve(r);
            return;
        }
        if (baixando) { call.reject("Já está baixando"); return; }
        baixando = true;
        new Thread(() -> {
            HttpURLConnection conn = null;
            try {
                File pasta = new File(getContext().getCacheDir(), "atualizacao");
                if (!pasta.exists() && !pasta.mkdirs()) throw new Exception("pasta");
                File apk = new File(pasta, "r2-fit-pro.apk");
                conn = (HttpURLConnection) new URL(url).openConnection();
                conn.setConnectTimeout(20000);
                conn.setReadTimeout(30000);
                conn.setRequestProperty("Cache-Control", "no-cache");
                if (conn.getResponseCode() != 200) throw new Exception("HTTP " + conn.getResponseCode());
                long total = conn.getContentLengthLong();
                long feito = 0;
                int ultimo = -1;
                try (InputStream in = conn.getInputStream(); FileOutputStream out = new FileOutputStream(apk)) {
                    byte[] buf = new byte[64 * 1024];
                    int n;
                    while ((n = in.read(buf)) > 0) {
                        out.write(buf, 0, n);
                        feito += n;
                        int pct = total > 0 ? (int) (feito * 100 / total) : -1;
                        if (pct != ultimo && (pct < 0 || pct % 5 == 0)) {
                            ultimo = pct;
                            JSObject p = new JSObject();
                            p.put("pct", pct);
                            notifyListeners("progresso", p);
                        }
                    }
                }
                if (total > 0 && feito != total) throw new Exception("download incompleto");
                Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
                Intent instalar = new Intent(Intent.ACTION_VIEW)
                    .setDataAndType(uri, "application/vnd.android.package-archive")
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                getActivity().startActivity(instalar);
                JSObject r = new JSObject();
                r.put("estado", "instalando");
                call.resolve(r);
            } catch (Exception e) {
                call.reject("Não foi possível baixar a atualização. Confira a internet e tente de novo.", e);
            } finally {
                if (conn != null) conn.disconnect();
                baixando = false;
            }
        }).start();
    }
}
