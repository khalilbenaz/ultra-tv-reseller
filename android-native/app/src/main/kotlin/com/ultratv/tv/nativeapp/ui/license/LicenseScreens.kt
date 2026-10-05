package com.ultratv.tv.nativeapp.ui.license

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Text
import com.ultratv.tv.nativeapp.data.license.Announcement
import com.ultratv.tv.nativeapp.data.license.LicenseLogic
import com.ultratv.tv.nativeapp.data.license.LicensePayload
import com.ultratv.tv.nativeapp.ui.design.PillButton
import com.ultratv.tv.nativeapp.ui.design.QrCode
import com.ultratv.tv.nativeapp.ui.design.Ux

/** Textes de l'édition Pro (anglais par défaut, français et arabe selon la langue de l'appareil). */
private object L {
    private val lang = java.util.Locale.getDefault().language
    private fun t(en: String, fr: String, ar: String) = when (lang) { "fr" -> fr; "ar" -> ar; else -> en }
    val activate get() = t("Activate Ultra TV Pro", "Activer Ultra TV Pro", "تفعيل Ultra TV Pro")
    val giveCode get() = t("Give this code to your provider to activate the app:", "Donnez ce code à votre fournisseur pour activer l'application :", "أعطِ هذا الرمز لمزوّدك لتفعيل التطبيق:")
    val expired get() = t("Your license has expired.", "Votre licence a expiré.", "انتهت صلاحية ترخيصك.")
    val trialOver get() = t("Your free trial is over.", "Votre essai gratuit est terminé.", "انتهت الفترة التجريبية المجانية.")
    val suspended get() = t("This device is suspended. Please contact your provider.", "Cet appareil est suspendu. Contactez votre fournisseur.", "هذا الجهاز موقوف. يرجى التواصل مع مزوّدك.")
    val offline get() = t("No connection to the activation server. Check your internet connection.", "Pas de connexion au serveur d'activation. Vérifiez votre connexion internet.", "لا يوجد اتصال بخادم التفعيل. تحقّق من اتصالك بالإنترنت.")
    val checkAgain get() = t("Check again", "Vérifier à nouveau", "تحقّق مجددًا")
    val checking get() = t("Checking…", "Vérification…", "جارٍ التحقق…")
    val contact get() = t("Contact support", "Contacter le support", "التواصل مع الدعم")
    val trialLeft get() = t("Free trial: %d day(s) left · code %s", "Essai gratuit : %d jour(s) restant(s) · code %s", "تجربة مجانية: %d يوم متبقٍ · الرمز %s")
    val expiresIn get() = t("License expires in %d day(s) — contact your provider to renew", "La licence expire dans %d jour(s) — contactez votre fournisseur", "ينتهي الترخيص خلال %d يوم — تواصل مع مزوّدك للتجديد")
    val ok get() = t("OK", "OK", "حسنًا")
    val from get() = t("Message from %s", "Message de %s", "رسالة من %s")
    val provider get() = t("your provider", "votre fournisseur", "مزوّدك")
}

private fun supportUri(p: LicensePayload?): String? = when {
    p?.whatsapp != null -> "https://wa.me/${p.whatsapp.trimStart('+')}"
    p?.telegram != null -> "https://t.me/${p.telegram}"
    else -> null
}

/** Écran bloquant : code appareil en grand, QR du contact support, contrôle manuel. */
@Composable
fun LicenseBlockedScreen(ui: LicenseUi.Blocked, vm: LicenseViewModel) {
    val checking by vm.checking.collectAsState()
    val ctx = LocalContext.current
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) { runCatching { focus.requestFocus() } }
    val p = ui.payload
    val reason = when {
        p == null && ui.offline -> L.offline
        p?.status == "suspended" -> L.suspended
        p?.status == "expired" && p.resellerName != null -> L.expired
        p?.status == "expired" -> L.trialOver
        ui.offline -> L.offline
        else -> null
    }
    val support = supportUri(p)
    Box(Modifier.fillMaxSize().background(Ux.Bg), contentAlignment = Alignment.Center) {
        Row(horizontalArrangement = Arrangement.spacedBy(56.dp), verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(48.dp)) {
            Column(Modifier.widthIn(max = 640.dp), verticalArrangement = Arrangement.spacedBy(18.dp)) {
                Text(L.activate, color = Ux.Text, fontSize = 40.sp, fontWeight = FontWeight.Bold)
                if (reason != null) Text(reason, color = Ux.Err, fontSize = 20.sp)
                Text(L.giveCode, color = Ux.Text2, fontSize = 20.sp)
                Text(
                    ui.code ?: "—",
                    color = Ux.Text, fontSize = 64.sp, fontWeight = FontWeight.Black, fontFamily = FontFamily.Monospace, letterSpacing = 6.sp,
                    modifier = Modifier.background(Ux.Surface, RoundedCornerShape(20.dp)).padding(horizontal = 28.dp, vertical = 14.dp),
                )
                p?.resellerName?.let { name ->
                    Text(name + (p.supportText?.let { " · $it" } ?: ""), color = Ux.Text2, fontSize = 18.sp)
                }
                Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                    PillButton(if (checking) L.checking else L.checkAgain, onClick = { vm.check() }, modifier = Modifier.focusRequester(focus))
                    if (support != null) PillButton(L.contact, onClick = {
                        runCatching { ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(support)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
                    })
                }
            }
            if (support != null) QrCode(support, 240.dp)
        }
    }
}

/** Bandeau discret : jours d'essai restants, ou licence qui expire sous 15 jours. */
@Composable
fun LicenseBanner(p: LicensePayload) {
    val days = LicenseLogic.daysLeft(p, System.currentTimeMillis()) ?: return
    val text = when {
        p.status == "trial" -> L.trialLeft.format(days, p.code)
        p.status == "active" && days <= 15 -> L.expiresIn.format(days)
        else -> return
    }
    Box(Modifier.fillMaxWidth().background(Ux.Accent).padding(horizontal = 24.dp, vertical = 6.dp), contentAlignment = Alignment.Center) {
        Text(text, color = Ux.White, fontSize = 15.sp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center)
    }
}

/** Annonce du revendeur (une à la fois, au démarrage) ; « OK » la marque lue. */
@Composable
fun AnnouncementDialog(a: Announcement, from: String?, onDismiss: () -> Unit) {
    val focus = remember { FocusRequester() }
    LaunchedEffect(a.id) { runCatching { focus.requestFocus() } }
    Box(Modifier.fillMaxSize().background(Ux.Scrim), contentAlignment = Alignment.Center) {
        Column(
            Modifier.widthIn(max = 720.dp).background(Ux.SurfaceDeep, RoundedCornerShape(24.dp)).padding(32.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Text(L.from.format(from ?: L.provider), color = Ux.Muted, fontSize = 15.sp)
            Text(ProText.title(a), color = Ux.Text, fontSize = 28.sp, fontWeight = FontWeight.Bold)
            Column(Modifier.verticalScroll(rememberScrollState()).weight(1f, fill = false)) {
                Text(ProText.body(a, from), color = Ux.Text2, fontSize = 19.sp)
            }
            PillButton(L.ok, onClick = onDismiss, modifier = Modifier.focusRequester(focus))
        }
    }
}

/**
 * Porte de l'édition Pro : édition standard → contenu tel quel ; Pro → écran d'activation tant que la licence
 * (ou l'essai) ne le permet pas, bandeau d'essai/expiration et annonces du revendeur par-dessus l'application.
 */
@Composable
fun LicenseGate(vm: LicenseViewModel = androidx.hilt.navigation.compose.hiltViewModel(), content: @Composable () -> Unit) {
    val state by vm.state.collectAsState()
    when (val s = state) {
        LicenseUi.Free -> content()
        LicenseUi.Loading -> Box(Modifier.fillMaxSize().background(Ux.Bg))
        is LicenseUi.Blocked -> LicenseBlockedScreen(s, vm)
        is LicenseUi.Allowed -> {
            val unread by vm.unread.collectAsState()
            Box(Modifier.fillMaxSize()) {
                Column(Modifier.fillMaxSize()) {
                    LicenseBanner(s.payload)
                    Box(Modifier.weight(1f)) { content() }
                }
                unread.firstOrNull()?.let { a -> AnnouncementDialog(a, s.payload.resellerName) { vm.dismiss(a) } }
            }
        }
    }
}
