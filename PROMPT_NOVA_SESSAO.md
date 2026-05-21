# PROMPT PARA NOVA SESSÃO DO GOOGLE AI STUDIO (Kotlin / Android)
**Instrução para o usuário:** Copie todo o conteúdo abaixo e cole no primeiro prompt da sua nova sessão no Google AI Studio. 

---
**[COPIAR A PARTIR DAQUI]**

Você é o Google AI Studio. Seu objetivo hoje é criar do absoluto zero um aplicativo Android Nativo chamado **"Pomodoro Estratégico Judicial"** usando a linguagem **Kotlin** e **Jetpack Compose** para a interface do usuário. 

O aplicativo deve possuir um visual super premium, luxuoso e minimalista, focado em advogados e estudantes de direito.

## 1. Arquitetura e Tecnologias
- **Linguagem:** Kotlin
- **UI:** Jetpack Compose (Material Design 3)
- **Arquitetura:** MVVM (Model-View-ViewModel) utilizando `StateFlow` e `Coroutines`.
- **Backend:** Firebase (Authentication e Firestore)
- **Servidor em Segundo Plano (CRÍTICO):** O cronômetro DEVE usar um **Foreground Service** (Serviço em Primeiro Plano) com uma notificação persistente para garantir que não feche, não pare de contar e não perca precisão quando o usuário minimizar o app, desligar a tela ou abrir outros aplicativos. O controle da notificação também deve exibir o tempo restante na tela de bloqueio.

## 2. Identidade Visual (Design System)
O design deve evitar totalmente o aspecto "padrão/barato" do Android. 
- **Cofiguração do Tema Escuro:** Padrão e principal.
- **Cores principais:**
  - Background (Fundo): `#0A2417` (Verde Esmeralda Profundo/Escuro)
  - Color OnBackground (Texto Principal): `#C2B8A3` (Dourado Suave / Areia)
  - Botões Ativos: `#C2B8A3` com texto `#0A2417`
  - Cores de Alerta (Pausas): `#14412B` ou Tons sutis de Teal (`#0D5C46`).
- **Tipografia:** Fonte limpa (sem serifa), similar ao *Inter* ou *Space Grotesk*. Textos proeminentes, muito espaço em branco (padding/margin generosos).
- **Sem poluição:** Não insira textos de sistema no meio da UI. Ícones elegantes e traços refinados.

## 3. Funcionalidades Principais

### A. Cronômetro (Timer)
- Modos disponíveis: 
  1. Foco (Padrão 25m)
  2. Pausa Curta (Padrão 5m)
  3. Descanso (Padrão 15m)
  4. Estudo (Padrão 45m)
  5. Pausa Estudo (Padrão 15m)
- Interface de um relógio com formatação clássica `MM:SS` (ex: `25:00`). O andamento precisa atualizar em tempo real em um círculo progressivo fino e suave ao redor do tempo.
- Deve tocar um som de alarme suave quando um ciclo acabar e lançar uma notificação local informando o fim do ciclo.
- Registro Automático: Ao concluir, o tempo/tipo de sessão vai para o "Arquivo de Sessões" (Firebase).

### B. Gestão de Tarefas (To-Do List)
- Adição de tarefas com Título, Prioridade (Alta, Média, Baixa) e Data de Vencimento.
- Marcação de conclusão (Checkbox animado).
- Deve salvar localmente via `DataStore` ou `Room` (caso o usuário não esteja logado) e sincronizar via Firebase Firestore se logado.

### C. Calculadoras Jurídicas (Ferramentas extras)
- Sessão/Tela para que a lógica calcule prazos processuais e honorários.

## 4. Banco de Dados / Autenticação (Firebase)
O aplicativo deve suportar modo *Offline-first*. Funciona sem conta (dados armazenados localmente via Room/DataStore). Se o usuário autenticar (Email/Senha via Firebase Auth), tudo será sincronizado com o Firestore.

**Estrutura de Coleções do Firestore:**
- Coleção: `tasks` (Tarefas)
  - Campos: `id`, `userId`, `title`, `completed` (boolean), `priority` (string), `dueDate` (string/data), `createdAt` (timestamp).
- Coleção: `history` (Histórico de sessões do Pomodoro)
  - Campos: `id`, `userId`, `type` (string - focus, short, long, learning), `duration` (integer), `timestamp` (integer).
- Coleção: `calculations` (Histórico de cálculos)
  - Campos: `id`, `userId`, `type` (string), `data` (map/object), `createdAt` (timestamp).
- Coleção: `userSettings` (Configurações)
  - Campos: `userId`, `theme`, `notificationsEnabled`, configurações de ciclo (minutos base p/ cada tipo de sessão).

## 5. Requisitos Críticos de Execução
- Crie o `AndroidManifest.xml` prevendo as permissões necessárias:
  `<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />`
  `<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />`
- Não resuma o código: Mostre como estruturar as Views com Jetpack Compose detalhadamente.
- Planeje as pastas do projeto: `ui/theme`, `ui/screens`, `ui/components`, `viewmodel`, `data`, `model`, `service`.
- Inicie a sua resposta construindo a infraestrutura principal do **Foreground Service** que fará o relógio rodar em background. Isso é a reclamação primária dos usuários e deve ser o núcleo da aplicação. 

Lembre-se: o resultado deve ser um projeto limpo, arquitetura impecável e design extraordinariamente luxuoso e simples (minimalista).

**[FIM DO PROMPT]**
