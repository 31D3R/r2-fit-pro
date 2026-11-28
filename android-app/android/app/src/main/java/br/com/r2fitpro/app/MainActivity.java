package br.com.r2fitpro.app;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ContadorNativoPlugin.class);
        registerPlugin(LembretesNativoPlugin.class);
        registerPlugin(ArquivosNativoPlugin.class);
        registerPlugin(NavegadorNativoPlugin.class);
        super.onCreate(savedInstanceState);
        abrirDestino(getIntent(), 1500);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        abrirDestino(intent, 0);
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
        // Navega dentro do site já aberto (não recarrega: um treino em andamento continua); se o site não respondeu, carrega a página
        String js = "window.__r2Navegar ? (window.__r2Navegar(" + org.json.JSONObject.quote(url) + "), 'ok') : 'nao'";
        getBridge().getWebView().postDelayed(() -> getBridge().getWebView().evaluateJavascript(js, r -> {
            if (!"\"ok\"".equals(r)) getBridge().getWebView().loadUrl(Lembretes.SITE + url);
        }), atraso);
    }
}
