# Run this script in PowerShell as Administrator to generate self-signed certificates for local HTTPS testing
# It will generate 'server.key' and 'server.cert' in the current directory.

$certName = "localhost"
$cert = New-SelfSignedCertificate -CertStoreLocation Cert:\LocalMachine\My -DnsName $certName -KeyAlgorithm RSA -KeyLength 2048 -NotAfter (Get-Date).AddYears(1)

$pwd = ConvertTo-SecureString -String "password123" -Force -AsPlainText
$pfxPath = "$pwd\cert.pfx"
Export-PfxCertificate -Cert $cert -FilePath "cert.pfx" -Password $pwd

Write-Host "Certificate generated successfully."
Write-Host "Please extract the key and cert from cert.pfx using OpenSSL, or use a tool like mkcert for easier local development."
Write-Host "For a simpler approach without OpenSSL, install 'mkcert':"
Write-Host "1. choco install mkcert"
Write-Host "2. mkcert -install"
Write-Host "3. mkcert -key-file server.key -cert-file server.cert localhost"
