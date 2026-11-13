// SPDX-License-Identifier: AGPL-3.0-only
package no.agrointel.orbit

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
    primary = Color(0xffb84a14), onPrimary = Color(0xfffcfaf5),
    background = Color(0xfff6f3ec), onBackground = Color(0xff181612),
    surface = Color(0xfff6f3ec), onSurface = Color(0xff181612),
    surfaceVariant = Color(0xffefeae0), onSurfaceVariant = Color(0xff433e34),
    outline = Color(0xff8a806e), error = Color(0xffb42318)
)
private val night = darkColorScheme(
    primary = Color(0xffe88245), onPrimary = Color(0xff111310),
    background = Color(0xff111310), onBackground = Color(0xfff3f0e6),
    surface = Color(0xff111310), onSurface = Color(0xfff3f0e6),
    surfaceVariant = Color(0xff21251f), onSurfaceVariant = Color(0xffc9c3b5),
    outline = Color(0xff9a9383), error = Color(0xfff97066)
)

// The TTF files in res/font are Fontshare's own downloads; the ITF FFL forbids converting formats.
val OrbitDisplay = FontFamily(Font(R.font.tanker_regular, FontWeight.Normal))
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
fun OrbitTheme(content: @Composable () -> Unit) {
    val type = switzer
    MaterialTheme(colorScheme = if (isSystemInDarkTheme()) night else day,
        typography = type.copy(
            headlineLarge = type.headlineLarge.copy(fontFamily = OrbitDisplay, fontSize = 32.sp),
            headlineMedium = type.headlineMedium.copy(fontFamily = OrbitDisplay, fontSize = 26.sp),
            titleLarge = type.titleLarge.copy(fontFamily = OrbitDisplay, fontSize = 22.sp),
            bodyLarge = type.bodyLarge.copy(fontFamily = ui, fontSize = 17.sp),
            bodyMedium = type.bodyMedium.copy(fontFamily = ui, fontSize = 15.sp),
            labelLarge = type.labelLarge.copy(fontFamily = ui, fontSize = 15.sp, fontWeight = FontWeight.Medium)
        ), content = content)
}
