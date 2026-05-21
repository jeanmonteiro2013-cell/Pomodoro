# Blueprint do Aplicativo Android (Kotlin + Jetpack Compose)

Este arquivo contém toda a estrutura e o código necessário para recriar o **Pomodoro Estratégico Judicial** como um aplicativo nativo para Android, utilizando **Kotlin**, **Jetpack Compose** (para a interface nativa) e **Firebase** (Firestore/Auth).

Você pode usar este guia para clonar as regras de negócio deste projeto dentro do **Android Studio**.

## 1. Estrutura do Projeto (Packages)

No seu Android Studio, crie a seguinte estrutura de pacotes (ex: `com.seuapp.pomodoro`):

```text
com.seuapp.pomodoro
│
├── MainActivity.kt
│
├── model/
│   ├── SessionType.kt
│   ├── Task.kt
│   ├── HistoryEntry.kt
│   └── Settings.kt
│
├── viewmodel/
│   ├── TimerViewModel.kt
│   ├── TaskViewModel.kt
│   └── AuthViewModel.kt
│
├── ui/
│   ├── theme/
│   │   ├── Theme.kt
│   │   ├── Color.kt
│   │   └── Type.kt
│   │
│   ├── screens/
│   │   ├── TimerScreen.kt
│   │   ├── TaskScreen.kt
│   │   ├── HistoryScreen.kt
│   │   └── SettingsScreen.kt
│   │
│   └── components/
│       ├── CircularTimer.kt
│       └── TaskItem.kt
│
└── data/
    └── FirebaseRepository.kt
```

---

## 2. Dependências do Gradle (`build.gradle.kts` - Module :app)

No arquivo de módulos do Gradle, inclua o Firebase e o Compose:

```kotlin
dependencies {
    implementation("androidx.core:core-ktx:1.12.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.6.2")
    implementation("androidx.activity:activity-compose:1.8.1")
    implementation(platform("androidx.compose:compose-bom:2023.10.01"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    
    // ViewModel no Compose
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.6.2")

    // Firebase (BOM)
    implementation(platform("com.google.firebase:firebase-bom:32.7.0"))
    implementation("com.google.firebase:firebase-auth-ktx")
    implementation("com.google.firebase:firebase-firestore-ktx")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.7.3")

    // Navegação no Compose
    implementation("androidx.navigation:navigation-compose:2.7.5")
}
```

---

## 3. Modelos de Dados (Data Classes)

Crie os arquivos Kotlin na pasta `model`:

**`SessionType.kt`**
```kotlin
enum class SessionType {
    FOCUS, SHORT_BREAK, LONG_BREAK, LEARNING, LEARNING_BREAK
}
```

**`Task.kt`**
```kotlin
data class Task(
    val id: String = "",
    val userId: String = "",
    val title: String = "",
    val completed: Boolean = false,
    val createdAt: Long = System.currentTimeMillis()
)
```

**`HistoryEntry.kt`**
```kotlin
data class HistoryEntry(
    val id: String = "",
    val userId: String = "",
    val type: String = "", // FOCUS, SHORT_BREAK...
    val durationMin: Int = 0,
    val timestamp: Long = System.currentTimeMillis()
)
```

---

## 4. O Coração do App: Timer ViewModel

Toda a lógica de contagem do tempo, que antes ficava no `useEffect` do React, agora vai para uma `ViewModel` em Kotlin com `StateFlow`.

**`TimerViewModel.kt`**
```kotlin
package com.seuapp.pomodoro.viewmodel

import android.os.CountDownTimer
import androidx.lifecycle.ViewModel
import com.seuapp.pomodoro.model.SessionType
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

class TimerViewModel : ViewModel() {
    private val _timeLeft = MutableStateFlow(60 * 60L) // Ex: 60 minutos em segundos
    val timeLeft: StateFlow<Long> = _timeLeft.asStateFlow()

    private val _isActive = MutableStateFlow(false)
    val isActive = _isActive.asStateFlow()

    private val _currentSessionType = MutableStateFlow(SessionType.FOCUS)
    val currentSessionType = _currentSessionType.asStateFlow()

    private var countDownTimer: CountDownTimer? = null

    fun toggleTimer() {
        if (_isActive.value) {
            pauseTimer()
        } else {
            startTimer()
        }
    }

    private fun startTimer() {
        _isActive.value = true
        countDownTimer = object : CountDownTimer(_timeLeft.value * 1000, 1000) {
            override fun onTick(millisUntilFinished: Long) {
                _timeLeft.value = millisUntilFinished / 1000
            }

            override fun onFinish() {
                _isActive.value = false
                _timeLeft.value = 0
                // Aqui podemos tocar o alarme e notificar!
                onSessionFinished()
            }
        }.start()
    }

    private fun pauseTimer() {
        _isActive.value = false
        countDownTimer?.cancel()
    }
    
    fun setSessionType(type: SessionType, durationMin: Long) {
        pauseTimer()
        _currentSessionType.value = type
        _timeLeft.value = durationMin * 60
    }

    private fun onSessionFinished() {
        // Enviar evento de registro (History) para o Firebase
    }

    override fun onCleared() {
        super.onCleared()
        countDownTimer?.cancel()
    }
}
```

---

## 5. Interface com Jetpack Compose (UI)

O Jetpack Compose usa o mesmo paradigma declarativo do React.

**`TimerScreen.kt`**
```kotlin
package com.seuapp.pomodoro.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.seuapp.pomodoro.viewmodel.TimerViewModel
import java.util.Locale

@Composable
fun TimerScreen(viewModel: TimerViewModel) {
    val timeLeft by viewModel.timeLeft.collectAsState()
    val isActive by viewModel.isActive.collectAsState()
    val sessionType by viewModel.currentSessionType.collectAsState()

    val minutes = timeLeft / 60
    val seconds = timeLeft % 60
    val timeString = String.format(Locale.getDefault(), "%02d:%02d", minutes, seconds)

    // Paleta em referência ao Tema Esmeralda/Ouro do Web App
    val bgColor = Color(0xFF0A2417)
    val primaryColor = Color(0xFFC2B8A3)

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(bgColor)
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(
            text = sessionType.name.replace("_", " "),
            color = primaryColor.copy(alpha = 0.5f),
            fontSize = 14.sp,
            fontWeight = FontWeight.Bold
        )
        
        Spacer(modifier = Modifier.height(24.dp))

        // O Circular Timer Visual
        Text(
            text = timeString,
            color = primaryColor,
            fontSize = 80.sp,
            fontWeight = FontWeight.ExtraBold
        )

        Spacer(modifier = Modifier.height(48.dp))

        Button(
            onClick = { viewModel.toggleTimer() },
            colors = ButtonDefaults.buttonColors(
                containerColor = primaryColor,
                contentColor = bgColor
            ),
            shape = CircleShape,
            modifier = Modifier.size(100.dp)
        ) {
            Text(if (isActive) "PAUSE" else "START", fontWeight = FontWeight.Bold)
        }
    }
}
```

---

## 6. Serviço de Notificação e Trabalho em Segundo Plano

No Android, quando você minimiza o App, o timer precisa rodar em um **Foreground Service** utilizando um `Foreground Notification` para ele não ser derrubado (igual ocorreu no seu relato de problema do App Web).

Nativamente, para o Android, você deve criar um `TimerService: Service()`:

```kotlin
// Este serviço garante que o cronômetro continue fluindo e avise o sistema 
// operando na barra de notificações (Notification Bar)!

class TimerService : Service() {
    
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val notification = NotificationCompat.Builder(this, "POMODORO_CHANNEL_ID")
            .setContentTitle("Pomodoro Ativo")
            .setContentText("Foco: 24:59")
            .setSmallIcon(R.drawable.ic_pomodoro)
            .setOngoing(true)
            .build()
        
        // Mantém vivo em segundo plano
        startForeground(1, notification)
        
        return START_NOT_STICKY
    }
    
    // ...
}
```

## Resumo dos Passos

1. Inicie um projeto "Empty Compose Activity" no **Android Studio**.
2. Adicione as bibliotecas do Jetpack Compose e Firebase (e faça o setup do seu pacote no Firebase Console, gerando o `google-services.json`).
3. Importe os ícones vetorizados na pasta `res/drawable`.
4. Copie as lógicas das `ViewModels` baseadas em `StateFlow`.
5. Programe as telas com `Jetpack Compose`.

Esse arquivo funciona como a "Planta Baixa" (Blueprint) de todo seu aplicativo migrado para o lado Mobile (Android).
