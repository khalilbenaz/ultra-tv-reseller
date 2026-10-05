package com.ultratv.tv.nativeapp.ui.license

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.ultratv.tv.nativeapp.data.license.Announcement
import com.ultratv.tv.nativeapp.data.license.LicenseClient
import com.ultratv.tv.nativeapp.data.license.LicenseLogic
import com.ultratv.tv.nativeapp.data.license.LicensePayload
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

/** État de la licence (édition Pro). `Free` = édition standard, aucune vérification. */
sealed interface LicenseUi {
    data object Free : LicenseUi
    data object Loading : LicenseUi
    data class Allowed(val payload: LicensePayload) : LicenseUi
    /** `payload` null : jamais joint le serveur (premier lancement hors ligne). */
    data class Blocked(val payload: LicensePayload?, val code: String?, val offline: Boolean) : LicenseUi
}

@HiltViewModel
class LicenseViewModel @Inject constructor(private val client: LicenseClient) : ViewModel() {
    private val _state = MutableStateFlow<LicenseUi>(if (client.enabled) LicenseUi.Loading else LicenseUi.Free)
    val state: StateFlow<LicenseUi> = _state

    private val _unread = MutableStateFlow<List<Announcement>>(emptyList())
    /** Annonces non lues à présenter (une à la fois). */
    val unread: StateFlow<List<Announcement>> = _unread

    private val _checking = MutableStateFlow(false)
    val checking: StateFlow<Boolean> = _checking

    init {
        if (client.enabled) {
            // Démarrage immédiat sur le dernier statut signé (hors ligne), puis contrôle serveur.
            client.cached()?.let { apply(it, offline = true) }
            viewModelScope.launch {
                while (true) {
                    check()
                    delay(6 * 3600_000L)
                }
            }
        }
    }

    fun check() {
        if (!client.enabled || _checking.value) return
        viewModelScope.launch {
            _checking.value = true
            try {
                val p = client.refresh()
                apply(p, offline = false)
                if (p.unread > 0) _unread.value = client.inbox().filter { !it.read }.sortedBy { it.at }
            } catch (_: Exception) {
                val cached = client.cached()
                if (cached != null) apply(cached, offline = true)
                else _state.value = LicenseUi.Blocked(null, client.code(), offline = true)
            } finally {
                _checking.value = false
            }
        }
    }

    private fun apply(p: LicensePayload, offline: Boolean) {
        _state.value = if (LicenseLogic.allowed(p, System.currentTimeMillis())) LicenseUi.Allowed(p)
        else LicenseUi.Blocked(p, p.code, offline)
    }

    /** Annonce lue : retirée de la file et signalée au serveur. */
    fun dismiss(a: Announcement) {
        _unread.value = _unread.value.filterNot { it.id == a.id }
        viewModelScope.launch { client.markRead(listOf(a.id)) }
    }
}
