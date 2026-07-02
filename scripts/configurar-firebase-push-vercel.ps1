param(
  [Parameter(Mandatory = $true)]
  [string]$ServiceAccountJson
)

$ErrorActionPreference = 'Stop'

$resolvedPath = Resolve-Path -LiteralPath $ServiceAccountJson
$json = Get-Content -LiteralPath $resolvedPath -Raw
$dados = $json | ConvertFrom-Json

if (-not $dados.project_id -or -not $dados.client_email -or -not $dados.private_key) {
  throw "Este arquivo nao e uma conta de servico do Firebase. Baixe em Configuracoes do projeto > Contas de servico > Gerar nova chave privada."
}

$base64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($json))
npx vercel env add FIREBASE_SERVICE_ACCOUNT_BASE64 production --force --sensitive --value $base64 --yes

Write-Host "Variavel FIREBASE_SERVICE_ACCOUNT_BASE64 configurada no Vercel."
Write-Host "Agora publique novamente com: npx vercel --prod --yes"
