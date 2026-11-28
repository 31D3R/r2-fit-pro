package br.com.r2fitpro.app;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    /** Link de convite (personal ou amigo): só o caminho, ex.: /convite/K7P2QX */
    private static final Pattern CONVITE = Pattern.compile("^https://(?:www\\.)?r2fitpro\\.com\\.br(/(?:convite|amigo)/[A-Za-z0-9]{6})/?(?:[?#].*)?$");
    private static final Pattern CONVITE_NO_TEXTO = Pattern.compile("https://(?:www\\.)?r2fitpro\\.com\\.br/(?:convite|amigo)/[A-Za-z0-9]{6}");
    private boolean conferiuAreaTransferencia = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ContadorNativoPlugin.class);
        registerPlugin(LembretesNativoPlugin.class);
        registerPlugin(ArquivosNativoPlugin.class);
        super.onCreate(savedInstanceState);
        if (abrirLink(getIntent(), 1500)) conferiuAreaTransferencia = true;
        else abrirDestino(getIntent(), 1500);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (!abrirLink(intent, 0)) abrirDestino(intent, 0);
    }

    /** Link de convite tocado no WhatsApp/Chrome com o app instalado (App Links): abre a tela do convite aqui dentro. */
    private boolean abrirLink(Intent intent, long atraso) {
        if (intent == null || !Intent.ACTION_VIEW.equals(intent.getAction())) return false;
        Uri dados = intent.getData();
        if (dados == null) return false;
        Matcher m = CONVITE.matcher(dados.toString());
        if (!m.matches()) return false;
        intent.setData(null);
        navegar(m.group(1), atraso);
        return true;
    }

    /**
     * Primeira abertura depois de instalar pelo link de convite: o site copiou o link antes do download.
     * Se a área de transferência tem um link de convite do R2 Fit Pro, abre o convite (uma única vez na vida do app).
     */
    @Override
    public void onWindowFocusChanged(boolean temFoco) {
        super.onWindowFocusChanged(temFoco);
        if (!temFoco || conferiuAreaTransferencia) return;
        conferiuAreaTransferencia = true;
        SharedPreferences prefs = getSharedPreferences("r2", Context.MODE_PRIVATE);
        if (prefs.getBoolean("convite_conferido", false)) return;
        prefs.edit().putBoolean("convite_conferido", true).apply();
        try {
            ClipboardManager cb = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
            if (cb == null || !cb.hasPrimaryClip()) return;
            ClipData clip = cb.getPrimaryClip();
            if (clip == null || clip.getItemCount() == 0 || clip.getItemAt(0).getText() == null) return;
            String texto = clip.getItemAt(0).getText().toString();
            if (texto.length() > 1000) return;
            Matcher m = CONVITE_NO_TEXTO.matcher(texto);
            if (!m.find()) return;
            Matcher c = CONVITE.matcher(m.group());
            if (c.matches()) navegar(c.group(1), 1500);
        } catch (Exception ignorado) { /* sem acesso à área de transferência: segue normal */ }
    }

    /** Toque numa notificação de lembrete: abre a tela certa (ex.: /calorias). */
    private void abrirDestino(Intent intent, long atraso) {
        if (intent == null) return;
        String url = intent.getStringExtra("url");
        // só caminhos do próprio site (outro app pode mandar este pedido: nada de "//site" ou "/\\site")
        if (url == null || url.length() > 300 || !url.matches("^/(?![/\\\\])[A-Za-z0-9/_\\-?=&.%#+:~]*$") || url.contains("//") || getBridge() == null) return;
        // contador tocando: o toque num lembrete abre o app sem trocar de tela (o treino continua na frente)
        if (ContadorServico.contadorTocando) { intent.removeExtra("url"); return; }
        intent.removeExtra("url");
        navegar(url, atraso);
    }

    private void navegar(String url, long atraso) {
        if (getBridge() == null) return;
        // Navega dentro do site já aberto (não recarrega: um treino em andamento continua); se o site não respondeu, carrega a página
        String js = "window.__r2Navegar ? (window.__r2Navegar(" + org.json.JSONObject.quote(url) + "), 'ok') : 'nao'";
        getBridge().getWebView().postDelayed(() -> getBridge().getWebView().evaluateJavascript(js, r -> {
            if (!"\"ok\"".equals(r)) getBridge().getWebView().loadUrl(Lembretes.SITE + url);
        }), atraso);
    }
}
