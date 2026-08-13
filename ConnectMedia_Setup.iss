; =======================================================================
;   SCRIPT DE COMPILAÇÃO DO INNO SETUP — CONNECT MEDIA v2.2
; =======================================================================
;   Para compilar no Inno Setup / Inno Script Studio:
;   Pressione Ctrl+F9 ou execute ISCC.exe ConnectMedia_Setup.iss
; =======================================================================

#define MyAppName "Connect Media"
#define MyAppVersion "2.2.0"
#define MyAppPublisher "Connect Media"
#define MyAppURL "http://localhost:3000"
#define MyAppExeName "iniciar_invisivel.vbs"

[Setup]
AppId={{C82F4E93-176C-4F91-[#A71-CONNECTMEDIA}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\ConnectMedia
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputDir=Output
OutputBaseFilename=ConnectMedia_Setup_v2.2
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
ArchitecturesInstallIn64BitMode=x64

[Languages]
Name: "brazilianportuguese"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked
Name: "autostarticon"; Description: "Iniciar o Connect Media automaticamente ao ligar o Windows"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
; Copia toda a estrutura preparada da pasta Dist_Instalador_ConnectMedia
Source: "Dist_Instalador_ConnectMedia\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "wscript.exe"; Parameters: """{app}\{#MyAppExeName}"""; WorkingDir: "{app}"; Comment: "Gerenciador de Mídias e Monitor do YouTube"
Name: "{autodesktop}\{#MyAppName}"; Filename: "wscript.exe"; Parameters: """{app}\{#MyAppExeName}"""; WorkingDir: "{app}"; Comment: "Gerenciador de Mídias e Monitor do YouTube"; Tasks: desktopicon
Name: "{autostartup}\{#MyAppName}"; Filename: "wscript.exe"; Parameters: """{app}\{#MyAppExeName}"""; WorkingDir: "{app}"; Comment: "Gerenciador de Mídias e Monitor do YouTube"; Tasks: autostarticon

[Run]
; Executa o instalador auxiliar para checar Node.js, Firebird 5.0 (32-bit) e criar banco de dados
Filename: "{cmd}"; Parameters: "/c ""{app}\instalar.bat"""; WorkingDir: "{app}"; Description: "Executar assistente de inicialização e dependências (Node.js, Firebird, DB)"; Flags: postinstall skipifsilent
Filename: "{#MyAppURL}"; Description: "Abrir o Connect Media no navegador ({#MyAppURL})"; Flags: postinstall shellexec skipifsilent unchecked
