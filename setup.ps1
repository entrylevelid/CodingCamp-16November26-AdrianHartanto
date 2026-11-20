$nodeBin = "node-portable\node-v20.18.1-win-x64"
$npm = "$nodeBin\npm.cmd"
& $npm install fast-check --save-dev
Write-Host "NPM_INSTALL_DONE"
