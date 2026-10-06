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
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.tv.material3.Text
import com.ultratv.tv.nativeapp.BuildConfig
import com.ultratv.tv.nativeapp.data.license.LicenseClient
import com.ultratv.tv.nativeapp.data.license.LicenseLogic
import com.ultratv.tv.nativeapp.data.license.LicensePayload
import com.ultratv.tv.nativeapp.data.repo.ProviderRepository
import com.ultratv.tv.nativeapp.data.xtream.XtreamAccount
import com.ultratv.tv.nativeapp.data.xtream.XtreamClient
import com.ultratv.tv.nativeapp.ui.design.PillButton
import com.ultratv.tv.nativeapp.ui.design.QrCode
import com.ultratv.tv.nativeapp.ui.design.Ux
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import java.text.DateFormat
import java.util.Date
import javax.inject.Inject

/** Textes de l'écran Abonnement (anglais par défaut, français et arabe selon la langue de l'appareil). */
object ProText {
    private val lang get() = java.util.Locale.getDefault().language
    private fun t(en: String, fr: String, ar: String) = when (lang) { "fr" -> fr; "ar" -> ar; else -> en }
    val menu get() = t("Subscription", "Abonnement", "الاشتراك")
    val sub get() = t("Validity of Ultra TV Pro and of your IPTV subscription.", "Validité d'Ultra TV Pro et de votre abonnement IPTV.", "صلاحية Ultra TV Pro واشتراك IPTV الخاص بك.")
    val lic get() = t("Ultra TV Pro license", "Licence Ultra TV Pro", "ترخيص Ultra TV Pro")
    val status get() = t("Status", "Statut", "الحالة")
    val validUntil get() = t("Valid until", "Valide jusqu'au", "صالح حتى")
    val left get() = t("Days left", "Jours restants", "الأيام المتبقية")
    val code get() = t("Device code", "Code de l'appareil", "رمز الجهاز")
    val provider get() = t("Provider", "Fournisseur", "المزوّد")
    val check get() = t("Check now", "Vérifier maintenant", "تحقّق الآن")
    val iptv get() = t("IPTV subscription", "Abonnement IPTV", "اشتراك IPTV")
    val source get() = t("Source", "Source", "المصدر")
    val account get() = t("Account status", "État du compte", "حالة الحساب")
    val expires get() = t("Expires", "Expire le", "ينتهي في")
    val conns get() = t("Connections", "Connexions", "الاتصالات")
    val created get() = t("Created", "Créé le", "أُنشئ في")
    val trial get() = t("Trial account", "Compte d'essai", "حساب تجريبي")
    val never get() = t("No expiry", "Sans expiration", "بدون انتهاء")
    val unknown get() = t("Unknown", "Inconnu", "غير معروف")
    val offline get() = t("Could not reach the provider.", "Fournisseur injoignable.", "تعذّر الوصول إلى المزوّد.")
    val noSource get() = t("No source configured.", "Aucune source configurée.", "لا يوجد مصدر.")
    val contact get() = t("Contact support", "Contacter le support", "التواصل مع الدعم")
    val scan get() = t("Scan to contact support", "Scannez pour contacter le support", "امسح للتواصل مع الدعم")
    val messages get() = t("Messages", "Messages", "الرسائل")
    val noMessages get() = t("No message from your provider.", "Aucun message de votre fournisseur.", "لا توجد رسائل من مزوّدك.")
    val devices get() = t("Devices", "Appareils", "الأجهزة")
    val renewTitle get() = t("Your Ultra TV Pro license expires soon", "Votre licence Ultra TV Pro expire bientôt", "ترخيص Ultra TV Pro ينتهي قريبًا")
    fun renewBody(date: String, who: String?) = t(
        "Your license expires on $date. Contact ${who ?: "your provider"} to renew it.",
        "Votre licence expire le $date. Contactez ${who ?: "votre fournisseur"} pour la renouveler.",
        "ينتهي ترخيصك في $date. تواصل مع ${who ?: "مزوّدك"} لتجديده.",
    )
    /** Titre et texte affichés : traduits pour un rappel automatique, tels quels pour une annonce du revendeur. */
    fun title(a: com.ultratv.tv.nativeapp.data.license.Announcement) = if (a.kind == "renewal") renewTitle else a.title
    fun body(a: com.ultratv.tv.nativeapp.data.license.Announcement, who: String?) =
        if (a.kind == "renewal" && a.until != null) renewBody(DateFormat.getDateInstance(DateFormat.LONG).format(Date(a.until)), who) else a.body
    /** Étiquette du type d'annonce choisi par le revendeur (rappel automatique : « Rappel »). */
    fun tag(a: com.ultratv.tv.nativeapp.data.license.Announcement) = when {
        a.kind == "renewal" -> t("Reminder", "Rappel", "تذكير")
        a.category == "maintenance" -> t("Maintenance", "Maintenance", "صيانة")
        a.category == "promo" -> t("Promotion", "Promotion", "عرض")
        else -> t("Information", "Information", "معلومة")
    }
    fun tagColor(a: com.ultratv.tv.nativeapp.data.license.Announcement) = when {
        a.kind == "renewal" || a.category == "maintenance" -> androidx.compose.ui.graphics.Color(0xFFFBBF5C)
        a.category == "promo" -> androidx.compose.ui.graphics.Color(0xFF4ADE80)
        else -> androidx.compose.ui.graphics.Color(0xFFFF6B75)
    }
    fun st(s: String) = when (s) {
        "trial" -> t("Free trial", "Essai gratuit", "تجربة مجانية")
        "active" -> t("Active", "Active", "نشط")
        "expired" -> t("Expired", "Expirée", "منتهٍ")
        "suspended" -> t("Suspended", "Suspendue", "موقوف")
        else -> s
    }
}

data class AccountUi(
    val license: LicensePayload? = null,
    val inbox: List<com.ultratv.tv.nativeapp.data.license.Announcement> = emptyList(),
    val sourceName: String? = null,
    val iptv: XtreamAccount? = null,
    val iptvFailed: Boolean = false,
    val loading: Boolean = true,
)

@HiltViewModel
class AccountViewModel @Inject constructor(
    private val license: LicenseClient,
    private val providers: ProviderRepository,
    private val xtream: XtreamClient,
) : ViewModel() {
    private val _ui = MutableStateFlow(AccountUi(license = license.cached()))
    val ui: StateFlow<AccountUi> = _ui

    init { refresh() }

    fun refresh() {
        _ui.value = _ui.value.copy(loading = true)
        viewModelScope.launch {
            val lic = if (license.enabled) runCatching { license.refresh() }.getOrNull() ?: license.cached() else null
            val list = providers.observeProviders().first()
            val p = list.firstOrNull { it.active } ?: list.firstOrNull()
            val acc = if (p != null && p.kind == "XTREAM") xtream.fetchAccount(p) else null
            val inbox = if (license.enabled && lic != null) runCatching { license.inbox() }.getOrDefault(emptyList()) else emptyList()
            _ui.value = AccountUi(license = lic, inbox = inbox, sourceName = p?.name, iptv = acc, iptvFailed = p != null && p.kind == "XTREAM" && acc == null, loading = false)
        }
    }

    /** Message ouvert : marqué lu (ici, sur le serveur et dans la pastille du menu). */
    fun open(a: com.ultratv.tv.nativeapp.data.license.Announcement) {
        if (a.read) return
        _ui.value = _ui.value.copy(inbox = _ui.value.inbox.map { if (it.id == a.id) it.copy(read = true) else it })
        com.ultratv.tv.nativeapp.data.license.InboxBus.unread.value = _ui.value.inbox.count { !it.read }
        viewModelScope.launch { license.markRead(listOf(a.id)) }
    }
}

@Composable
private fun InfoRow(k: String, v: String, color: Color = Ux.Text) {
    Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(k, color = Ux.Muted, fontSize = 17.sp)
        Text(v, color = color, fontSize = 17.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun Card(title: String, content: @Composable () -> Unit) {
    Column(Modifier.widthIn(max = 640.dp).fillMaxWidth().background(Ux.Surface, RoundedCornerShape(20.dp)).padding(24.dp)) {
        Text(title, color = Ux.Text, fontSize = 22.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(bottom = 8.dp))
        content()
    }
}

private val OK = Color(0xFF1F8A4C)

/** Écran « Abonnement » (édition Pro) : validité de l'application et compte IPTV de la source active. */
@Composable
fun AccountScreen(vm: AccountViewModel = hiltViewModel()) {
    val ui by vm.ui.collectAsState()
    val ctx = LocalContext.current
    val date = DateFormat.getDateInstance(DateFormat.LONG)
    fun fmt(ms: Long?) = ms?.let { date.format(Date(it)) } ?: "—"
    val p = ui.license
    val support = when {
        p?.whatsapp != null -> "https://wa.me/${p.whatsapp.trimStart('+')}"
        p?.telegram != null -> "https://t.me/${p.telegram}"
        else -> null
    }
    Box(Modifier.fillMaxSize().background(Ux.Bg)) {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(48.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
            Text(ProText.menu, color = Ux.Text, fontSize = 36.sp, fontWeight = FontWeight.Bold)
            Text(ProText.sub, color = Ux.Text2, fontSize = 18.sp)
            Row(horizontalArrangement = Arrangement.spacedBy(24.dp), verticalAlignment = Alignment.Top) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(20.dp)) {
                    if (BuildConfig.EDITION == "pro") Card("${ProText.lic}  ·  PRO") {
                        val okLic = p != null && LicenseLogic.allowed(p, System.currentTimeMillis())
                        InfoRow(ProText.status, p?.let { ProText.st(it.status) } ?: ProText.unknown, if (okLic) OK else Ux.Accent)
                        InfoRow(ProText.validUntil, fmt(p?.until))
                        InfoRow(ProText.left, LicenseLogic.daysLeft(p, System.currentTimeMillis())?.toString() ?: "—")
                        Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text(ProText.code, color = Ux.Muted, fontSize = 17.sp)
                            Text(p?.code ?: "—", color = Ux.Text, fontSize = 20.sp, fontWeight = FontWeight.Black, fontFamily = FontFamily.Monospace)
                        }
                        p?.resellerName?.let { InfoRow(ProText.provider, it + (p.supportText?.let { s -> " · $s" } ?: "")) }
                        if (p?.devicesMax != null) InfoRow(ProText.devices, "${p.devicesUsed ?: 0} / ${p.devicesMax}")
                    }
                    if (BuildConfig.EDITION == "pro") InboxCard(ui.inbox, p?.resellerName, onOpen = { vm.open(it) })
                    Card(ProText.iptv) {
                        val a = ui.iptv
                        when {
                            ui.sourceName == null -> Text(ProText.noSource, color = Ux.Muted, fontSize = 17.sp)
                            else -> {
                                InfoRow(ProText.source, ui.sourceName ?: "—")
                                InfoRow(ProText.account, a?.status ?: ProText.unknown, if (a?.status == "Active") OK else if (a?.status != null) Ux.Accent else Ux.Text)
                                val days = a?.expiresAt?.let { ((it - System.currentTimeMillis()).coerceAtLeast(0) + 86_399_999L) / 86_400_000L }
                                InfoRow(ProText.expires, when {
                                    a == null -> "—"
                                    a.expiresAt == null -> ProText.never
                                    else -> "${fmt(a.expiresAt)} · $days"
                                })
                                InfoRow(ProText.conns, if (a != null) "${a.activeConnections ?: 0} / ${a.maxConnections ?: 1}" else "—")
                                a?.createdAt?.let { InfoRow(ProText.created, fmt(it)) }
                                if (a?.trial == true) InfoRow(ProText.trial, "✓")
                                if (ui.iptvFailed) Text(ProText.offline, color = Ux.Muted, fontSize = 15.sp)
                            }
                        }
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                        PillButton(if (ui.loading) "…" else ProText.check, onClick = { vm.refresh() })
                        if (support != null) PillButton(ProText.contact, onClick = {
                            runCatching { ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(support)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
                        })
                    }
                }
                if (support != null) Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    QrCode(support, 220.dp)
                    Text(ProText.scan, color = Ux.Text2, fontSize = 15.sp)
                }
            }
        }
    }
}

/** Boîte de réception (édition Pro) : annonces du revendeur et rappels, relisibles ; ouvrir un message le marque lu. */
@Composable
private fun InboxCard(items: List<com.ultratv.tv.nativeapp.data.license.Announcement>, from: String?, onOpen: (com.ultratv.tv.nativeapp.data.license.Announcement) -> Unit) {
    var openId by androidx.compose.runtime.remember { androidx.compose.runtime.mutableStateOf<String?>(null) }
    val date = DateFormat.getDateInstance(DateFormat.MEDIUM)
    val unread = items.count { !it.read }
    Card(ProText.messages + if (unread > 0) "  ·  $unread" else "") {
        if (items.isEmpty()) Text(ProText.noMessages, color = Ux.Muted, fontSize = 17.sp)
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            items.forEach { a ->
                val expanded = openId == a.id
                com.ultratv.tv.nativeapp.ui.design.FocusSurface(
                    onClick = { openId = if (expanded) null else a.id; onOpen(a) },
                    shape = RoundedCornerShape(14.dp), bg = Ux.SurfaceDeep, ringWidth = 3.dp, focusedScale = 1f,
                    modifier = Modifier.fillMaxWidth(),
                ) { f ->
                    Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(ProText.tag(a).uppercase(), color = if (f) Ux.OnFocus2 else ProText.tagColor(a), fontSize = 12.sp,
                            fontWeight = FontWeight.Bold, letterSpacing = 1.5.sp)
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            if (!a.read) Box(Modifier.padding(end = 10.dp).background(Ux.Accent, RoundedCornerShape(50)).padding(5.dp))
                            Text(ProText.title(a), color = if (f) Ux.TextOnLight else Ux.Text, fontSize = 18.sp,
                                fontWeight = if (a.read) FontWeight.SemiBold else FontWeight.Bold, modifier = Modifier.weight(1f))
                            Text(date.format(Date(a.at)), color = if (f) Ux.OnFocus2 else Ux.Muted, fontSize = 14.sp)
                        }
                        Text(ProText.body(a, from), color = if (f) Ux.OnFocus2 else Ux.Text2, fontSize = 16.sp,
                            maxLines = if (expanded) Int.MAX_VALUE else 2, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
                    }
                }
            }
        }
    }
}
