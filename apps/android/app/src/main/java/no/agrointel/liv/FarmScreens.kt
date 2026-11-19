// SPDX-License-Identifier: AGPL-3.0-only
package no.agrointel.liv

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import kotlinx.serialization.json.*
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

@Composable
fun FarmScreens(state: LivState, modifier: Modifier) {
    when (state.screen) {
        Screen.PAGE -> Box(modifier.fillMaxWidth().testTag("page-webview").semantics {
            contentDescription = state.selectedPage?.title.orEmpty()
        }) { FarmWebView(state, isSystemInDarkTheme(), Modifier.fillMaxSize()) }
        Screen.ACCOUNT -> Account(state, modifier)
        Screen.CHATS -> Column(modifier) {
            Button(onClick = { state.newChat() }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text(stringResource(R.string.new_chat)) }
            if (state.sessions.isEmpty()) Empty(R.string.empty_chats)
            LazyColumn {
                items(state.sessions, key = { it.id }) { chat ->
                    TextButton(onClick = { state.openChat(chat.id) }, modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp)) {
                        Text(chat.title, modifier = Modifier.fillMaxWidth())
                    }
                    HorizontalDivider()
                }
            }
        }
        Screen.PAGES -> Column(modifier) {
            if (state.pages.isEmpty()) Empty(R.string.empty_pages)
            LazyColumn {
                items(state.pages, key = { it.id }) { page ->
                    TextButton(onClick = { state.selectedPage = page; state.screen = Screen.PAGE },
                        modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp)) {
                        Text(page.title, modifier = Modifier.fillMaxWidth())
                    }
                    HorizontalDivider()
                }
            }
        }
        Screen.ALERTS -> Column(modifier) {
            if (state.alerts.isEmpty()) Empty(R.string.empty_alerts)
            LazyColumn(verticalArrangement = Arrangement.spacedBy(20.dp), contentPadding = PaddingValues(vertical = 12.dp)) {
                items(state.alerts) { alert ->
                    val kind = when (alert.string("kind")) {
                        "calving_alert" -> R.string.calving_alert
                        "heat_alert" -> R.string.heat_alert
                        else -> R.string.health_event
                    }
                    SelectionContainer {
                        Column {
                            Text(stringResource(kind), style = MaterialTheme.typography.titleMedium)
                            val time = alert.string("ts")
                            if (time.isNotEmpty()) Text(localTime(time), style = MaterialTheme.typography.bodyMedium)
                            val details = alert.objectAt("valueJson").string("message")
                            if (details.isNotEmpty()) Text(details)
                        }
                    }
                }
            }
        }
        Screen.HOME -> Unit
    }
}

private fun localTime(value: String): String = try {
    DateTimeFormatter.ofPattern("d MMM, HH:mm", Locale.getDefault()).withZone(ZoneId.systemDefault()).format(Instant.parse(value))
} catch (e: java.time.format.DateTimeParseException) { "" }

@Composable
private fun Empty(text: Int) { Text(stringResource(text), modifier = Modifier.padding(vertical = 24.dp)) }

@Composable
private fun Account(state: LivState, modifier: Modifier) {
    val link by state.relay.state.collectAsState()
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(20.dp)) {
        Text(stringResource(R.string.farm), style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 16.dp))
        Text(state.farm?.name.orEmpty())
        if (state.farms.size > 1) state.farms.filter { it.id != state.farm?.id }.forEach { farm ->
            TextButton(onClick = { state.selectFarm(farm) }) { Text(farm.name) }
        }
        HorizontalDivider()
        Text(stringResource(if (link == Link.ONLINE) R.string.pc_online else R.string.pc_offline))
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(stringResource(R.string.talk_notification), modifier = Modifier.weight(1f))
            val label = stringResource(R.string.talk_notification)
            Switch(state.quickTalk, { state.updateQuickTalk(it) }, modifier = Modifier.semantics { contentDescription = label })
        }
        if (!(state.app as LivApplication).pushEnabled) Text(stringResource(R.string.push_disabled), style = MaterialTheme.typography.bodyMedium)
        Spacer(Modifier.weight(1f))
        OutlinedButton(onClick = { state.signOut() }, enabled = !state.busy,
            modifier = Modifier.fillMaxWidth().padding(bottom = 20.dp).heightIn(min = 48.dp)) {
            Text(stringResource(R.string.signout))
        }
    }
}
