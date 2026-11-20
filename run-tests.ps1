$node = "node-portable\node-v20.18.1-win-x64\node.exe"
& $node tests/storage.test.js
Write-Host "EXIT_CODE=$LASTEXITCODE"
