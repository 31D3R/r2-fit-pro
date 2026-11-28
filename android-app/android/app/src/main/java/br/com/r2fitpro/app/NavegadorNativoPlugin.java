package br.com.r2fitpro.app;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Abre o login do Google no navegador do celular (o Google bloqueia login dentro do app/WebView).
 * Depois do login, o Supabase manda de volta para br.com.r2fitpro.app://login (intent-filter no AndroidManifest)
 * e o site, dentro do app, conclui a entrada.
 */
@CapacitorPlugin(name = "NavegadorNativo")
public class NavegadorNativoPlugin extends Plugin {
    // Só o início do login do Supabase deste app (outro site não usa esta porta para abrir o navegador)
    private static final String PERMITIDO = "https://pzmhlxhdqghamyxgegwq.supabase.co/auth/v1/authorize?";

    @PluginMethod
    public void abrir(PluginCall call) {
        String url = call.getString("url");
        if (url == null || !url.startsWith(PERMITIDO) || url.length() > 4000) {
            call.reject("endereço não permitido");
            return;
        }
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        i.addCategory(Intent.CATEGORY_BROWSABLE);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getActivity().startActivity(i);
            call.resolve();
        } catch (ActivityNotFoundException e) {
            call.reject("nenhum navegador instalado");
        }
    }
}
