// SPDX-License-Identifier: AGPL-3.0-only
package no.agrointel.liv

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

private val day = lightColorScheme(
    primary = Color(0xff3f7f0c), onPrimary = Color(0xfffbfcf9),
    background = Color(0xfff5f7f2), onBackground = Color(0xff0b1020),
    surface = Color(0xfff5f7f2), onSurface = Color(0xff0b1020),
    surfaceVariant = Color(0xffebefe6), onSurfaceVariant = Color(0xff3e4656),
    outline = Color(0xff7c8596), error = Color(0xffb42318)
)
private val night = darkColorScheme(
    primary = Color(0xff86de28), onPrimary = Color(0xff0a0f1c),
    background = Color(0xff0a0f1c), onBackground = Color(0xfff2f5ef),
    surface = Color(0xff0a0f1c), onSurface = Color(0xfff2f5ef),
    surfaceVariant = Color(0xff151d30), onSurfaceVariant = Color(0xffb9c1ce),
    outline = Color(0xff8e98aa), error = Color(0xfff97066)
)

// The TTF files in res/font are Fontshare's own downloads; the ITF FFL forbids converting formats.
val LivDisplay = FontFamily(Font(R.font.tanker_regular, FontWeight.Normal))
private val ui = FontFamily(
    Font(R.font.switzer_regular, FontWeight.Normal),
    Font(R.font.switzer_medium, FontWeight.Medium),
    Font(R.font.switzer_semibold, FontWeight.SemiBold),
    Font(R.font.switzer_bold, FontWeight.Bold),
)
private fun TextStyle.ui() = copy(fontFamily = ui)
private val base = Typography()
private val switzer = Typography(
    displayLarge = base.displayLarge.ui(), displayMedium = base.displayMedium.ui(), displaySmall = base.displaySmall.ui(),
    headlineLarge = base.headlineLarge.ui(), headlineMedium = base.headlineMedium.ui(), headlineSmall = base.headlineSmall.ui(),
    titleLarge = base.titleLarge.ui(), titleMedium = base.titleMedium.ui(), titleSmall = base.titleSmall.ui(),
    bodyLarge = base.bodyLarge.ui(), bodyMedium = base.bodyMedium.ui(), bodySmall = base.bodySmall.ui(),
    labelLarge = base.labelLarge.ui(), labelMedium = base.labelMedium.ui(), labelSmall = base.labelSmall.ui(),
)

@Composable
fun LivTheme(content: @Composable () -> Unit) {
    val type = switzer
    MaterialTheme(colorScheme = if (isSystemInDarkTheme()) night else day,
        typography = type.copy(
            headlineLarge = type.headlineLarge.copy(fontFamily = LivDisplay, fontSize = 32.sp),
            headlineMedium = type.headlineMedium.copy(fontFamily = LivDisplay, fontSize = 26.sp),
            titleLarge = type.titleLarge.copy(fontFamily = LivDisplay, fontSize = 22.sp),
            bodyLarge = type.bodyLarge.copy(fontFamily = ui, fontSize = 17.sp),
            bodyMedium = type.bodyMedium.copy(fontFamily = ui, fontSize = 15.sp),
            labelLarge = type.labelLarge.copy(fontFamily = ui, fontSize = 15.sp, fontWeight = FontWeight.Medium)
        ), content = content)
}
