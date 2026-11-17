$destino = Join-Path $PSScriptRoot 'INICIAR_DIARIO.bat'
$desktop = [Environment]::GetFolderPath('Desktop')
$atalho = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $desktop 'D_Trading Local.lnk'))
$atalho.TargetPath = $destino
$atalho.WorkingDirectory = $PSScriptRoot
$atalho.Description = 'Diario de Trade local - sem nuvem'
$atalho.IconLocation = "$env:SystemRoot\System32\shell32.dll,21"
$atalho.Save()
Write-Output 'Atalho D_Trading Local criado na Area de Trabalho.'
