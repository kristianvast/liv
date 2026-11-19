// SPDX-License-Identifier: AGPL-3.0-only
package no.agrointel.liv

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.input.*
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.ExperimentalComposeUiApi

@OptIn(ExperimentalComposeUiApi::class)
@Composable
fun LivApp(state: LivState, talk: () -> Unit) {
    LivTheme {
        val link by state.relay.state.collectAsState()
        androidx.activity.compose.BackHandler(enabled = state.signedIn && state.farm != null && state.screen != Screen.HOME) {
            state.screen = if (state.screen == Screen.PAGE) Screen.PAGES else Screen.HOME
        }
        Surface(Modifier.fillMaxSize().semantics { testTagsAsResourceId = true }) {
            Column(Modifier.fillMaxSize().safeDrawingPadding().imePadding().padding(horizontal = 20.dp)) {
                if (!state.signedIn) {
                    SignIn(state)
                } else if (state.farm == null) {
                    Text(stringResource(R.string.farm_picker), style = MaterialTheme.typography.headlineMedium, modifier = Modifier.padding(vertical = 24.dp))
                    if (state.farms.isEmpty()) {
                        Text(stringResource(R.string.no_farms))
                        TextButton(onClick = { state.run { state.profile() } }) { Text(stringResource(R.string.retry)) }
                        TextButton(onClick = { state.signOut() }) { Text(stringResource(R.string.signout)) }
                    }
                    state.farms.forEach { farm ->
                        OutlinedButton(onClick = { state.selectFarm(farm) }, modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) { Text(farm.name) }
                    }
                } else {
                    Header(state)
                    if (link != Link.ONLINE) {
                        Column(Modifier.fillMaxWidth().padding(vertical = 8.dp).testTag(if (link == Link.OFFLINE) "pc-offline" else "connection-state")) {
                            Text(stringResource(if (link == Link.CONNECTING) R.string.connecting else if (link == Link.UNAUTHORIZED) R.string.signin_expired else R.string.pc_offline),
                                style = MaterialTheme.typography.titleMedium)
                            if (link != Link.CONNECTING) {
                                Text(stringResource(R.string.pc_offline_hint), style = MaterialTheme.typography.bodyMedium)
                                TextButton(onClick = { state.relay.connect() }) { Text(stringResource(R.string.retry)) }
                            }
                        }
                    }
                    when (state.screen) {
                        Screen.HOME -> Home(state, talk, link, Modifier.weight(1f))
                        else -> FarmScreens(state, Modifier.weight(1f))
                    }
                }
                if (state.error.isNotEmpty()) {
                    SelectionContainer {
                        Text(state.error, color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(vertical = 8.dp))
                    }
                }
            }
        }
    }
}

@Composable
private fun SignIn(state: LivState) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.Center) {
        Orb(Modifier.align(Alignment.CenterHorizontally).size(72.dp))
        Spacer(Modifier.height(24.dp))
        Text(stringResource(R.string.signin), style = MaterialTheme.typography.headlineLarge)
        Text(stringResource(R.string.signin_hint), modifier = Modifier.padding(top = 8.dp, bottom = 28.dp))
        OutlinedTextField(email, { email = it }, label = { Text(stringResource(R.string.email)) },
            placeholder = { Text("you@example.com") }, singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next),
            modifier = Modifier.fillMaxWidth().testTag("signin-email"))
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(password, { password = it }, label = { Text(stringResource(R.string.password)) },
            visualTransformation = PasswordVisualTransformation(), singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
            modifier = Modifier.fillMaxWidth().testTag("signin-password"))
        Spacer(Modifier.height(24.dp))
        Button(onClick = { state.signIn(email, password); password = "" },
            enabled = !state.busy && email.isNotBlank() && password.isNotBlank(),
            modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).testTag("signin-submit")) {
            Text(stringResource(if (state.busy) R.string.connecting else R.string.signin))
        }
    }
}

@Composable
private fun Header(state: LivState) {
    Row(Modifier.fillMaxWidth().height(64.dp), verticalAlignment = Alignment.CenterVertically) {
        if (state.screen != Screen.HOME) {
            NavIcon(Icons.AutoMirrored.Outlined.ArrowBack, R.string.back, "nav-back") { state.screen = if (state.screen == Screen.PAGE) Screen.PAGES else Screen.HOME }
        }
        Text(stringResource(when (state.screen) {
            Screen.HOME -> R.string.liv
            Screen.CHATS -> R.string.chats
            Screen.PAGES, Screen.PAGE -> R.string.pages
            Screen.ALERTS -> R.string.alerts
            Screen.ACCOUNT -> R.string.account
        }), style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f))
        if (state.screen == Screen.HOME) {
            NavIcon(Icons.Outlined.ChatBubbleOutline, R.string.chats, "nav-chats") { state.navigate(Screen.CHATS) }
            NavIcon(Icons.Outlined.GridView, R.string.pages, "nav-pages") { state.navigate(Screen.PAGES) }
            NavIcon(Icons.Outlined.NotificationsNone, R.string.alerts, "nav-alerts") { state.navigate(Screen.ALERTS) }
            NavIcon(Icons.Outlined.PersonOutline, R.string.account, "nav-account") { state.navigate(Screen.ACCOUNT) }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NavIcon(icon: ImageVector, label: Int, tag: String, click: () -> Unit) {
    TooltipBox(positionProvider = TooltipDefaults.rememberPlainTooltipPositionProvider(),
        tooltip = { PlainTooltip { Text(stringResource(label)) } }, state = rememberTooltipState()) {
        IconButton(click, Modifier.size(48.dp).testTag(tag)) { Icon(icon, stringResource(label)) }
    }
}

@Composable
fun Orb(modifier: Modifier) {
    val ink = MaterialTheme.colorScheme.primary
    Canvas(modifier.semantics { contentDescription = "Liv" }) {
        val radius = size.minDimension / 2
        drawCircle(ink.copy(alpha = .12f), radius)
        drawCircle(ink.copy(alpha = .35f), radius * .74f, style = androidx.compose.ui.graphics.drawscope.Stroke(1.5.dp.toPx()))
        drawCircle(ink, radius * .44f)
        drawOval(ink.copy(alpha = .6f), topLeft = androidx.compose.ui.geometry.Offset(radius * .2f, radius * .7f),
            size = androidx.compose.ui.geometry.Size(radius * 1.6f, radius * .6f), style = androidx.compose.ui.graphics.drawscope.Stroke(1.5.dp.toPx()))
    }
}

@Composable
private fun Home(state: LivState, talk: () -> Unit, link: Link, modifier: Modifier) {
    var text by remember { mutableStateOf("") }
    val list = rememberLazyListState()
    LaunchedEffect(state.lines.size, state.lines.lastOrNull()?.text) {
        if (state.lines.isNotEmpty()) list.animateScrollToItem(state.lines.lastIndex)
    }
    Column(modifier.fillMaxWidth()) {
        Orb(Modifier.align(Alignment.CenterHorizontally).size(80.dp).padding(4.dp))
        val callLabel = when (state.callState) {
            "connecting" -> R.string.call_connecting
            "listening" -> R.string.call_active
            "speaking" -> R.string.call_speaking
            "text" -> R.string.call_text_only
            "ended" -> R.string.call_ended
            else -> R.string.call_idle
        }
        Text(stringResource(callLabel), modifier = Modifier.align(Alignment.CenterHorizontally).padding(top = 8.dp, bottom = 16.dp).testTag("call-state"),
            style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        LazyColumn(Modifier.weight(1f).fillMaxWidth(), state = list, verticalArrangement = Arrangement.spacedBy(16.dp),
            contentPadding = PaddingValues(vertical = 12.dp)) {
            if (state.lines.isEmpty()) item {
                Text(stringResource(R.string.ask_hint), style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 24.dp))
            }
            items(state.lines, key = { it.id }) { line ->
                if (line.text.isNotEmpty()) SelectionContainer {
                    Text(line.text, style = MaterialTheme.typography.bodyLarge,
                        modifier = Modifier.fillMaxWidth().then(if (line.role == "user")
                            Modifier.clip(MaterialTheme.shapes.medium).background(MaterialTheme.colorScheme.surfaceVariant).padding(12.dp) else Modifier))
                }
            }
        }
        if (state.accessWaiting) Row(Modifier.fillMaxWidth().padding(vertical = 8.dp).testTag("access-waiting"), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Outlined.DesktopWindows, null, Modifier.size(20.dp))
            Spacer(Modifier.width(8.dp))
            Text(stringResource(R.string.access_waiting), style = MaterialTheme.typography.bodyMedium)
        }
        if (state.activity.isNotEmpty() && !state.accessWaiting) Row(Modifier.padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Outlined.Build, null, Modifier.size(16.dp))
            Spacer(Modifier.width(8.dp))
            Text(state.activity, maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis, style = MaterialTheme.typography.bodyMedium)
        }
        OutlinedTextField(text, { text = it }, label = { Text(stringResource(R.string.ask)) }, maxLines = 3,
            modifier = Modifier.fillMaxWidth().testTag("ask-input"))
        Row(Modifier.fillMaxWidth().padding(vertical = 12.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            OutlinedButton(onClick = { if (state.voice.active) state.run { state.voice.stop() } else talk() },
                enabled = link == Link.ONLINE && (!state.running || state.voice.active),
                modifier = Modifier.weight(1f).heightIn(min = 48.dp).testTag(if (state.voice.active) "call-end" else "talk-start")) {
                Icon(if (state.voice.active) Icons.Outlined.CallEnd else Icons.Outlined.MicNone, null, Modifier.size(20.dp))
                Spacer(Modifier.width(8.dp))
                Text(stringResource(if (state.voice.active) R.string.call_end else R.string.talk))
            }
            Button(onClick = { if (state.running && !state.voice.active) state.stopChat() else { state.send(text); text = "" } },
                enabled = link == Link.ONLINE && (state.running || text.isNotBlank()),
                modifier = Modifier.weight(1f).heightIn(min = 48.dp).testTag(if (state.running && !state.voice.active) "chat-stop" else "ask-send")) {
                Icon(if (state.running && !state.voice.active) Icons.Outlined.Stop else Icons.Outlined.ArrowUpward, null, Modifier.size(20.dp))
                Spacer(Modifier.width(8.dp))
                Text(stringResource(if (state.running && !state.voice.active) R.string.stop else R.string.send))
            }
        }
    }
}
